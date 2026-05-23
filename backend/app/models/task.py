from sqlalchemy import Column, String, Text, DateTime, Integer, JSON, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class TaskStatus(str, enum.Enum):
    backlog = "backlog"
    todo = "todo"
    in_progress = "in_progress"
    review = "review"
    done = "done"


class TaskPriority(str, enum.Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class TaskCategory(str, enum.Enum):
    technical_seo = "technical_seo"
    content = "content"
    internal_linking = "internal_linking"
    schema = "schema"
    performance = "performance"
    ai_search = "ai_search"
    competitor = "competitor"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id"))
    crawl_id = Column(UUID(as_uuid=True), ForeignKey("crawls.id"))
    title = Column(String(500), nullable=False)
    description = Column(Text)
    category = Column(SAEnum(TaskCategory))
    priority = Column(SAEnum(TaskPriority), default=TaskPriority.medium)
    status = Column(SAEnum(TaskStatus), default=TaskStatus.backlog)
    assigned_to = Column(String(255))  # team member email
    ai_generated = Column(Boolean, default=False)
    ai_reasoning = Column(Text)
    estimated_impact = Column(Integer, default=0)  # 0-100
    page_url = Column(String(2000))
    due_date = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    tags = Column(JSON, default=list)
    extra_data = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="tasks")
