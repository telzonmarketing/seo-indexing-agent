from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import re
import uuid

from app.database import get_db
from app.models.client import Client
from app.models.website import Website
from app.models.task import Task
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/clients", tags=["clients"])


def slugify(name: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", name.lower())
    return re.sub(r"[\s_-]+", "-", slug).strip("-")


class ClientCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = []


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None


@router.get("")
async def list_clients(
    q: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Client).options(selectinload(Client.websites))
    if q:
        query = query.where(Client.name.ilike(f"%{q}%"))
    query = query.offset(skip).limit(limit).order_by(Client.created_at.desc())
    result = await db.execute(query)
    clients = result.scalars().all()
    return [_serialize_client(c) for c in clients]


@router.post("", status_code=201)
async def create_client(
    data: ClientCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    slug = slugify(data.name)
    # ensure unique slug
    existing = await db.execute(select(Client).where(Client.slug == slug))
    if existing.scalar_one_or_none():
        slug = f"{slug}-{str(uuid.uuid4())[:6]}"

    client = Client(slug=slug, **data.model_dump())
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return _serialize_client(client)


@router.get("/{client_id}")
async def get_client(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Client)
        .options(selectinload(Client.websites), selectinload(Client.tasks))
        .where(Client.id == client_id)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return _serialize_client(client, detailed=True)


@router.patch("/{client_id}")
async def update_client(
    client_id: str,
    data: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(client, field, value)

    await db.commit()
    await db.refresh(client)
    return _serialize_client(client)


@router.delete("/{client_id}", status_code=204)
async def delete_client(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.delete(client)
    await db.commit()


def _serialize_client(client: Client, detailed: bool = False) -> dict:
    data = {
        "id": str(client.id),
        "name": client.name,
        "slug": client.slug,
        "email": client.email,
        "phone": client.phone,
        "company": client.company,
        "industry": client.industry,
        "notes": client.notes,
        "tags": client.tags or [],
        "seo_health_score": client.seo_health_score,
        "is_active": client.is_active,
        "website_count": len(client.websites) if client.websites else 0,
        "created_at": client.created_at.isoformat() if client.created_at else None,
        "updated_at": client.updated_at.isoformat() if client.updated_at else None,
    }
    if detailed:
        data["websites"] = [
            {
                "id": str(w.id),
                "domain": w.domain,
                "url": w.url,
                "technical_score": w.technical_score,
                "is_verified": w.is_verified,
                "last_crawled_at": w.last_crawled_at.isoformat() if w.last_crawled_at else None,
            }
            for w in (client.websites or [])
        ]
    return data
