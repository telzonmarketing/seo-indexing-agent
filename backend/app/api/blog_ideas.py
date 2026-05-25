from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
import uuid

from app.database import get_db
from app.core.deps import get_current_user
from app.models.blog_idea import BlogIdea, BlogIdeaStatus
from app.models.user import User

router = APIRouter(prefix="/blog-ideas", tags=["blog-ideas"])


@router.get("")
async def list_blog_ideas(
    client_id: Optional[str] = None,
    website_id: Optional[str] = None,
    status: Optional[str] = None,
    search_intent: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(BlogIdea).order_by(BlogIdea.priority_score.desc(), BlogIdea.created_at.desc())
    if client_id:
        q = q.where(BlogIdea.client_id == client_id)
    if website_id:
        q = q.where(BlogIdea.website_id == website_id)
    if status:
        q = q.where(BlogIdea.status == status)
    if search_intent:
        q = q.where(BlogIdea.search_intent == search_intent)

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    result = await db.execute(q.limit(limit).offset(offset))
    ideas = result.scalars().all()

    return {
        "total": total,
        "ideas": [_serialize(i) for i in ideas],
    }


@router.get("/{idea_id}")
async def get_blog_idea(
    idea_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    idea = await db.scalar(select(BlogIdea).where(BlogIdea.id == idea_id))
    if not idea:
        raise HTTPException(404, "Blog idea not found")
    return _serialize(idea)


@router.patch("/{idea_id}/status")
async def update_idea_status(
    idea_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    idea = await db.scalar(select(BlogIdea).where(BlogIdea.id == idea_id))
    if not idea:
        raise HTTPException(404, "Blog idea not found")

    if "status" in body:
        try:
            idea.status = BlogIdeaStatus(body["status"])
        except ValueError:
            raise HTTPException(400, f"Invalid status: {body['status']}")

    await db.commit()
    return _serialize(idea)


@router.post("/{idea_id}/generate-brief")
async def generate_content_brief(
    idea_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a full SEO content brief for this idea using AI."""
    idea = await db.scalar(select(BlogIdea).where(BlogIdea.id == idea_id))
    if not idea:
        raise HTTPException(404, "Blog idea not found")

    from app.agents.blog_idea_agent import BlogIdeaAgent
    agent = BlogIdeaAgent()
    brief = await agent.generate_content_brief({
        "title": idea.title,
        "target_keyword": idea.target_keyword,
        "search_intent": str(idea.search_intent or "informational"),
    })

    idea.content_brief = brief
    idea.status = BlogIdeaStatus.brief
    await db.commit()
    return {"brief": brief, "idea": _serialize(idea)}


@router.post("/generate")
async def trigger_idea_generation(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually trigger blog idea generation for a client/website."""
    from app.tasks.autonomous_tasks import daily_blog_ideas
    task = daily_blog_ideas.delay()
    return {"task_id": task.id, "message": "Blog idea generation started"}


@router.delete("/{idea_id}")
async def delete_blog_idea(
    idea_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    idea = await db.scalar(select(BlogIdea).where(BlogIdea.id == idea_id))
    if not idea:
        raise HTTPException(404, "Blog idea not found")
    await db.delete(idea)
    await db.commit()
    return {"message": "Deleted"}


def _serialize(idea: BlogIdea) -> dict:
    return {
        "id": str(idea.id),
        "client_id": str(idea.client_id),
        "website_id": str(idea.website_id) if idea.website_id else None,
        "title": idea.title,
        "target_keyword": idea.target_keyword,
        "secondary_keywords": idea.secondary_keywords or [],
        "search_intent": str(idea.search_intent) if idea.search_intent else None,
        "source": idea.source,
        "ai_reasoning": idea.ai_reasoning,
        "content_brief": idea.content_brief or {},
        "suggested_outline": idea.suggested_outline or [],
        "suggested_faqs": idea.suggested_faqs or [],
        "status": str(idea.status),
        "priority_score": idea.priority_score,
        "is_ai_friendly": idea.is_ai_friendly,
        "is_seasonal": idea.is_seasonal,
        "content_gap": idea.content_gap,
        "created_at": idea.created_at.isoformat() if idea.created_at else None,
    }
