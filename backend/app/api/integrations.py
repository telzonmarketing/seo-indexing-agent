"""
Google OAuth 2.0 Integration — GSC & GA4
-----------------------------------------
Routes:
  GET  /api/integrations/google/connect          → returns auth URL for frontend redirect
  GET  /api/integrations/google/callback          → exchanges code, stores tokens, redirects to FE
  POST /api/integrations/google/{website_id}/refresh → refreshes access token
  GET  /api/integrations/{website_id}             → list integrations for a website
  DELETE /api/integrations/{website_id}/{type}    → disconnect an integration
"""
import secrets
import json
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode, urljoin

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.website import Website, Integration, IntegrationType

router = APIRouter(prefix="/integrations", tags=["integrations"])

# ── OAuth constants ──────────────────────────────────────────────────────────
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"

SCOPE_MAP = {
    "gsc": [
        "https://www.googleapis.com/auth/webmasters.readonly",
        "https://www.googleapis.com/auth/webmasters",
    ],
    "ga4": [
        "https://www.googleapis.com/auth/analytics.readonly",
    ],
    "gsc+ga4": [
        "https://www.googleapis.com/auth/webmasters.readonly",
        "https://www.googleapis.com/auth/webmasters",
        "https://www.googleapis.com/auth/analytics.readonly",
    ],
}

# ── Simple in-process state store (single server / dev) ─────────────────────
# In production with multiple workers, use Redis with TTL.
_oauth_states: dict[str, dict] = {}


def _make_state(website_id: str, scope: str, user_id: str) -> str:
    """Generate a cryptographically random state token tied to session data."""
    token = secrets.token_urlsafe(32)
    _oauth_states[token] = {
        "website_id": website_id,
        "scope": scope,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return token


def _consume_state(token: str) -> dict | None:
    """Consume and validate a state token (one-time use)."""
    data = _oauth_states.pop(token, None)
    if not data:
        return None
    # Expire after 10 minutes
    created = datetime.fromisoformat(data["created_at"])
    if datetime.now(timezone.utc) - created > timedelta(minutes=10):
        return None
    return data


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/google/connect")
async def google_connect(
    website_id: str = Query(..., description="Website UUID"),
    scope: str = Query("gsc", description="gsc | ga4 | gsc+ga4"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Step 1 — generate an OAuth consent URL and return it to the frontend.
    The frontend should redirect the user's browser to auth_url.
    """
    from app.config import settings

    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured (GOOGLE_CLIENT_ID missing)")

    website = await db.get(Website, website_id)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")

    scopes = SCOPE_MAP.get(scope)
    if not scopes:
        raise HTTPException(status_code=400, detail=f"Unknown scope '{scope}'. Use: gsc, ga4, gsc+ga4")

    state = _make_state(website_id, scope, str(current_user.id))

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(scopes),
        "state": state,
        "access_type": "offline",   # get refresh token
        "prompt": "consent",        # always show consent to get refresh token
    }

    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return {
        "auth_url": auth_url,
        "state": state,
        "scope": scope,
        "website_id": website_id,
        "expires_in_seconds": 600,
    }


@router.get("/google/callback")
async def google_callback(
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 2 — Google redirects here with a code.
    Exchanges code for tokens, stores them, redirects to frontend.
    This endpoint is NOT auth-protected (Google calls it directly).
    """
    from app.config import settings

    # ── Error from Google ────────────────────────────────────────────
    if error:
        redirect_url = f"{_fe_base()}/settings?integration_error={error}"
        return RedirectResponse(redirect_url)

    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    # ── Validate state ───────────────────────────────────────────────
    state_data = _consume_state(state)
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    website_id = state_data["website_id"]
    scope_key = state_data["scope"]

    # ── Exchange code for tokens ─────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(GOOGLE_TOKEN_URL, data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            })
            resp.raise_for_status()
            token_data = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Google token exchange failed: {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Google token exchange failed: {str(e)[:200]}")

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)

    credentials = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat(),
        "scope": scope_key,
        "token_type": token_data.get("token_type", "Bearer"),
    }

    # ── Determine integration type(s) to save ───────────────────────
    types_to_save = []
    if "gsc" in scope_key:
        types_to_save.append(IntegrationType.gsc)
    if "ga4" in scope_key:
        types_to_save.append(IntegrationType.ga4)

    # ── Upsert integrations ──────────────────────────────────────────
    for itype in types_to_save:
        existing = await db.execute(
            select(Integration).where(
                Integration.website_id == website_id,
                Integration.type == itype,
            )
        )
        integration = existing.scalar_one_or_none()
        if integration:
            integration.credentials = credentials
            integration.is_connected = True
            integration.error_message = None
        else:
            integration = Integration(
                website_id=website_id,
                type=itype,
                credentials=credentials,
                is_connected=True,
            )
            db.add(integration)

    await db.commit()

    # ── Redirect to frontend success page ───────────────────────────
    redirect_url = f"{_fe_base()}/websites/{website_id}?integration_connected={scope_key}"
    return RedirectResponse(redirect_url)


@router.post("/google/{website_id}/refresh")
async def refresh_google_token(
    website_id: str,
    integration_type: str = Query("gsc", description="gsc | ga4"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Refresh an expired Google OAuth access token using the stored refresh token.
    Call this before any GSC/GA4 API request if the access_token has expired.
    """
    from app.config import settings

    itype = IntegrationType(integration_type)
    result = await db.execute(
        select(Integration).where(
            Integration.website_id == website_id,
            Integration.type == itype,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration or not integration.is_connected:
        raise HTTPException(status_code=404, detail="Integration not connected")

    refresh_token = (integration.credentials or {}).get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=400, detail="No refresh token stored — please reconnect")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(GOOGLE_TOKEN_URL, data={
                "refresh_token": refresh_token,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "grant_type": "refresh_token",
            })
            resp.raise_for_status()
            token_data = resp.json()
    except httpx.HTTPStatusError as e:
        integration.is_connected = False
        integration.error_message = f"Token refresh failed: {e.response.text[:200]}"
        await db.commit()
        raise HTTPException(status_code=502, detail=f"Token refresh failed: {e.response.text[:200]}")

    expires_in = token_data.get("expires_in", 3600)
    creds = dict(integration.credentials or {})
    creds["access_token"] = token_data["access_token"]
    creds["expires_at"] = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()
    # Google may issue a new refresh token
    if "refresh_token" in token_data:
        creds["refresh_token"] = token_data["refresh_token"]

    integration.credentials = creds
    integration.is_connected = True
    integration.error_message = None
    await db.commit()

    return {
        "refreshed": True,
        "expires_at": creds["expires_at"],
        "integration_type": integration_type,
    }


@router.get("/{website_id}")
async def list_integrations(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all integrations for a website (credentials redacted)."""
    result = await db.execute(
        select(Integration).where(Integration.website_id == website_id)
    )
    integrations = result.scalars().all()
    return {
        "integrations": [
            {
                "id": str(i.id),
                "type": i.type.value if hasattr(i.type, "value") else str(i.type),
                "is_connected": i.is_connected,
                "error_message": i.error_message,
                "has_refresh_token": bool((i.credentials or {}).get("refresh_token")),
                "expires_at": (i.credentials or {}).get("expires_at"),
                "scope": (i.credentials or {}).get("scope"),
            }
            for i in integrations
        ]
    }


@router.delete("/{website_id}/{integration_type}")
async def disconnect_integration(
    website_id: str,
    integration_type: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disconnect (and optionally revoke) a Google integration."""
    from app.config import settings

    itype = IntegrationType(integration_type)
    result = await db.execute(
        select(Integration).where(
            Integration.website_id == website_id,
            Integration.type == itype,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    # Best-effort revoke with Google
    access_token = (integration.credentials or {}).get("access_token")
    if access_token:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(GOOGLE_REVOKE_URL, params={"token": access_token})
        except Exception:
            pass

    integration.is_connected = False
    integration.credentials = {}
    integration.error_message = "Disconnected by user"
    await db.commit()

    return {"disconnected": True, "type": integration_type}


# ── Helper ───────────────────────────────────────────────────────────────────

def _fe_base() -> str:
    """Frontend base URL — reads from settings or falls back to localhost."""
    try:
        from app.config import settings
        # In prod, the admin domain serves the frontend
        domain = getattr(settings, "ADMIN_DOMAIN", "") or ""
        if domain and domain != "admin.telzonmarketing.in":
            return f"https://{domain}"
    except Exception:
        pass
    return "http://localhost:3000"
