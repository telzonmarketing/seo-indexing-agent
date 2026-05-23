from sqlalchemy import Column, String, Text, DateTime, Integer, JSON, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class ReportType(str, enum.Enum):
    seo_audit = "seo_audit"
    technical = "technical"
    content = "content"
    rankings = "rankings"
    competitor = "competitor"
    monthly = "monthly"


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id"))
    crawl_id = Column(UUID(as_uuid=True), ForeignKey("crawls.id"))
    type = Column(SAEnum(ReportType), nullable=False)
    title = Column(String(500), nullable=False)
    summary = Column(Text)
    content = Column(JSON, default=dict)  # full structured report data
    ai_insights = Column(JSON, default=list)
    recommendations = Column(JSON, default=list)
    scores = Column(JSON, default=dict)
    period_start = Column(DateTime(timezone=True))
    period_end = Column(DateTime(timezone=True))
    is_sent = Column(Boolean, default=False)
    sent_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="reports")
