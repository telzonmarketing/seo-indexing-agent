from sqlalchemy import Column, String, Text, DateTime, Integer, JSON, Boolean, ForeignKey, Enum as SAEnum, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class BlogIdeaStatus(str, enum.Enum):
    idea = "idea"
    brief = "brief"
    writing = "writing"
    review = "review"
    published = "published"
    rejected = "rejected"


class BlogIdeaIntent(str, enum.Enum):
    informational = "informational"
    transactional = "transactional"
    navigational = "navigational"
    comparison = "comparison"
    local = "local"
    faq = "faq"
    ai_friendly = "ai_friendly"


class BlogIdea(Base):
    __tablename__ = "blog_ideas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id"))

    title = Column(String(500), nullable=False)
    slug_idea = Column(String(600))
    description = Column(Text)
    target_keyword = Column(String(300))
    secondary_keywords = Column(JSON, default=list)
    search_volume = Column(Integer, default=0)
    keyword_difficulty = Column(Integer, default=0)
    estimated_traffic = Column(Integer, default=0)
    search_intent = Column(SAEnum(BlogIdeaIntent), default=BlogIdeaIntent.informational)

    source = Column(String(100))  # google_trends, paa, reddit, quora, competitor, etc.
    source_url = Column(String(2000))
    ai_reasoning = Column(Text)
    content_brief = Column(JSON, default=dict)
    suggested_outline = Column(JSON, default=list)
    suggested_faqs = Column(JSON, default=list)
    ai_search_angle = Column(Text)

    status = Column(SAEnum(BlogIdeaStatus), default=BlogIdeaStatus.idea)
    priority_score = Column(Integer, default=50)  # 0-100
    is_seasonal = Column(Boolean, default=False)
    is_ai_friendly = Column(Boolean, default=False)
    competitor_covers = Column(Boolean, default=False)
    content_gap = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="blog_ideas")
