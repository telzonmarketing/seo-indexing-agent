from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List

from app.database import get_db
from app.models.task import Task, TaskStatus, TaskPriority, TaskCategory
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    client_id: str
    website_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    category: Optional[TaskCategory] = None
    priority: TaskPriority = TaskPriority.medium
    assigned_to: Optional[str] = None
    page_url: Optional[str] = None
    tags: List[str] = []


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assigned_to: Optional[str] = None
    tags: Optional[List[str]] = None


@router.get("")
async def list_tasks(
    client_id: Optional[str] = Query(None),
    website_id: Optional[str] = Query(None),
    status: Optional[TaskStatus] = Query(None),
    priority: Optional[TaskPriority] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Task)
    if client_id:
        query = query.where(Task.client_id == client_id)
    if website_id:
        query = query.where(Task.website_id == website_id)
    if status:
        query = query.where(Task.status == status)
    if priority:
        query = query.where(Task.priority == priority)

    query = query.offset(skip).limit(limit).order_by(Task.created_at.desc())
    result = await db.execute(query)
    return [_serialize(t) for t in result.scalars().all()]


@router.post("", status_code=201)
async def create_task(
    data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    task = Task(**data.model_dump())
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return _serialize(task)


@router.patch("/{task_id}")
async def update_task(
    task_id: str,
    data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(task, field, value)

    if data.status == TaskStatus.done and not task.completed_at:
        from datetime import datetime, timezone
        task.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(task)
    return _serialize(task)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()


def _serialize(task: Task) -> dict:
    return {
        "id": str(task.id),
        "client_id": str(task.client_id),
        "website_id": str(task.website_id) if task.website_id else None,
        "title": task.title,
        "description": task.description,
        "category": task.category,
        "priority": task.priority,
        "status": task.status,
        "assigned_to": task.assigned_to,
        "ai_generated": task.ai_generated,
        "ai_reasoning": task.ai_reasoning,
        "estimated_impact": task.estimated_impact,
        "page_url": task.page_url,
        "tags": task.tags or [],
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }
