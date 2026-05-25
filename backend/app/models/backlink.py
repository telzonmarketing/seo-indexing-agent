from sqlalchemy import Column, String, Text, DateTime, Integer, JSON, Boolean, ForeignKey, Enum as SAEnum, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class BacklinkType(str, enum.Enum):
    directory = "directory"
    guest_post = "guest_post"
    forum = "forum"
    social = "social"
    competitor = "competitor"
    citation = "citation"
    profile = "profile"
    resource = "resource"


class BacklinkStatus(str, enum.Enum):
    opportunity = "opportunity"
    submitted = "submitted"
    pending = "pending"
    acquired = "acquired"
    rejected = "rejected"
    lost = "lost"


class BacklinkOpportunity(Base):
    __tablename__ = "backlink_opportunities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id"))

    source_domain = Column(String(500), nullable=False)
    source_url = Column(String(2000))
    target_url = Column(String(2000))
    anchor_text = Column(String(500))

    type = Column(SAEnum(BacklinkType), default=BacklinkType.directory)
    status = Column(SAEnum(BacklinkStatus), default=BacklinkStatus.opportunity)

    domain_authority = Column(Integer, default=0)   # 0-100
    page_authority = Column(Integer, default=0)
    spam_score = Column(Integer, default=0)
    relevance_score = Column(Integer, default=0)    # 0-100 AI-scored

    platform = Column(String(200))                  # JustDial, IndiaMart, Reddit, etc.
    category = Column(String(200))
    notes = Column(Text)
    submission_url = Column(String(2000))
    contact_email = Column(String(300))

    is_dofollow = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    ai_reasoning = Column(Text)

    acquired_at = Column(DateTime(timezone=True))
    submitted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="backlink_opportunities")
