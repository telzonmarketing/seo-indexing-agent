from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.database import get_db
from app.core.deps import get_current_user
from app.models.content_cluster import ContentCluster, ClusterStatus
from app.models.user import User

router = APIRouter(prefix="/content-clusters", tags=["content-clusters"])


@router.get("")
async def list_clusters(
    client_id: Optional[str] = None,
    website_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(ContentCluster).order_by(ContentCluster.topical_authority_score.desc(), ContentCluster.created_at.desc())
    if client_id:
        q = q.where(ContentCluster.client_id == client_id)
    if website_id:
        q = q.where(ContentCluster.website_id == website_id)
    if status:
        q = q.where(ContentCluster.status == status)

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    result = await db.execute(q.limit(limit).offset(offset))
    clusters = result.scalars().all()

    return {"total": total, "clusters": [_serialize(c) for c in clusters]}


@router.get("/{cluster_id}")
async def get_cluster(
    cluster_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cluster = await db.scalar(select(ContentCluster).where(ContentCluster.id == cluster_id))
    if not cluster:
        raise HTTPException(404, "Content cluster not found")
    return _serialize(cluster)


@router.post("/generate")
async def generate_cluster(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a content cluster plan for a topic using AI."""
    from app.agents.semantic_seo_agent import SemanticSEOAgent
    agent = SemanticSEOAgent()
    cluster_plan = await agent.build_content_cluster({
        "topic": body.get("topic", ""),
        "domain": body.get("domain", ""),
        "industry": body.get("industry", ""),
    })

    cluster = ContentCluster(
        client_id=body.get("client_id"),
        website_id=body.get("website_id"),
        topic=body.get("topic", ""),
        pillar_keyword=cluster_plan.get("pillar_page", {}).get("target_keyword", ""),
        cluster_pages=cluster_plan.get("cluster_pages", []),
        supporting_keywords=[p.get("target_keyword", "") for p in cluster_plan.get("cluster_pages", [])],
        semantic_entities=cluster_plan.get("semantic_entities", []),
        estimated_traffic=cluster_plan.get("estimated_traffic", 0),
        ai_analysis=cluster_plan,
        ai_recommendations=cluster_plan.get("cluster_pages", []),
    )
    db.add(cluster)
    await db.commit()
    await db.refresh(cluster)
    return _serialize(cluster)


@router.patch("/{cluster_id}/status")
async def update_cluster_status(
    cluster_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cluster = await db.scalar(select(ContentCluster).where(ContentCluster.id == cluster_id))
    if not cluster:
        raise HTTPException(404, "Cluster not found")
    try:
        cluster.status = ClusterStatus(body.get("status"))
    except ValueError:
        raise HTTPException(400, "Invalid status")
    await db.commit()
    return _serialize(cluster)


@router.delete("/{cluster_id}")
async def delete_cluster(
    cluster_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cluster = await db.scalar(select(ContentCluster).where(ContentCluster.id == cluster_id))
    if not cluster:
        raise HTTPException(404, "Cluster not found")
    await db.delete(cluster)
    await db.commit()
    return {"message": "Deleted"}


def _serialize(c: ContentCluster) -> dict:
    return {
        "id": str(c.id),
        "client_id": str(c.client_id),
        "website_id": str(c.website_id) if c.website_id else None,
        "topic": c.topic,
        "pillar_keyword": c.pillar_keyword,
        "pillar_url": c.pillar_url,
        "description": c.description,
        "cluster_pages": c.cluster_pages or [],
        "supporting_keywords": c.supporting_keywords or [],
        "semantic_entities": c.semantic_entities or [],
        "content_gaps": c.content_gaps or [],
        "topical_authority_score": c.topical_authority_score,
        "coverage_score": c.coverage_score,
        "estimated_traffic": c.estimated_traffic,
        "status": str(c.status),
        "ai_analysis": c.ai_analysis or {},
        "ai_recommendations": c.ai_recommendations or [],
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
