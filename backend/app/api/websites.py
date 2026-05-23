from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, HttpUrl
from typing import Optional
import tldextract

from app.database import get_db
from app.models.website import Website, Integration, IntegrationType
from app.models.client import Client
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/websites", tags=["websites"])


class WebsiteCreate(BaseModel):
    client_id: str
    url: str
    sitemap_url: Optional[str] = None
    platform: Optional[str] = None
    crawl_frequency_hours: int = 168


class WebsiteUpdate(BaseModel):
    sitemap_url: Optional[str] = None
    platform: Optional[str] = None
    crawl_frequency_hours: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("")
async def list_websites(
    client_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Website).options(selectinload(Website.integrations))
    if client_id:
        query = query.where(Website.client_id == client_id)
    result = await db.execute(query.order_by(Website.created_at.desc()))
    return [_serialize(w) for w in result.scalars().all()]


@router.post("", status_code=201)
async def create_website(
    data: WebsiteCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == data.client_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    url = str(data.url).rstrip("/")
    extracted = tldextract.extract(url)
    domain = f"{extracted.domain}.{extracted.suffix}"
    if extracted.subdomain and extracted.subdomain != "www":
        domain = f"{extracted.subdomain}.{domain}"

    website = Website(
        client_id=data.client_id,
        domain=domain,
        url=url,
        sitemap_url=data.sitemap_url,
        platform=data.platform,
        crawl_frequency_hours=data.crawl_frequency_hours,
    )
    db.add(website)
    await db.commit()
    await db.refresh(website)
    return _serialize(website)


@router.get("/{website_id}")
async def get_website(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Website)
        .options(selectinload(Website.integrations), selectinload(Website.crawls))
        .where(Website.id == website_id)
    )
    website = result.scalar_one_or_none()
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    return _serialize(website, detailed=True)


@router.patch("/{website_id}")
async def update_website(
    website_id: str,
    data: WebsiteUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Website).where(Website.id == website_id))
    website = result.scalar_one_or_none()
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(website, field, value)
    await db.commit()
    await db.refresh(website)
    return _serialize(website)


@router.post("/{website_id}/connect/{integration_type}")
async def connect_integration(
    website_id: str,
    integration_type: IntegrationType,
    credentials: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Website).where(Website.id == website_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Website not found")

    existing = await db.execute(
        select(Integration).where(
            Integration.website_id == website_id,
            Integration.type == integration_type,
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
            type=integration_type,
            credentials=credentials,
            is_connected=True,
        )
        db.add(integration)

    await db.commit()
    return {"status": "connected", "type": integration_type}


def _serialize(website: Website, detailed: bool = False) -> dict:
    data = {
        "id": str(website.id),
        "client_id": str(website.client_id),
        "domain": website.domain,
        "url": website.url,
        "sitemap_url": website.sitemap_url,
        "platform": website.platform,
        "is_verified": website.is_verified,
        "technical_score": website.technical_score,
        "content_score": website.content_score,
        "authority_score": website.authority_score,
        "ai_visibility_score": website.ai_visibility_score,
        "last_crawled_at": website.last_crawled_at.isoformat() if website.last_crawled_at else None,
        "crawl_frequency_hours": website.crawl_frequency_hours,
        "is_active": website.is_active,
        "integrations": [
            {"type": i.type, "is_connected": i.is_connected}
            for i in (website.integrations or [])
        ],
        "created_at": website.created_at.isoformat() if website.created_at else None,
    }
    if detailed and hasattr(website, "crawls"):
        data["recent_crawls"] = [
            {
                "id": str(c.id),
                "status": c.status,
                "pages_crawled": c.pages_crawled,
                "issues_found": c.issues_found,
                "seo_score": c.seo_score,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in (website.crawls or [])[-5:]
        ]
    return data
