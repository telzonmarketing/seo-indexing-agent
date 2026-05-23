from sqlalchemy import Column, String, DateTime, Integer, Float, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime, timezone
from app.database import Base


class KeywordRanking(Base):
    __tablename__ = "keyword_rankings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id"), nullable=False)
    keyword = Column(String(500), nullable=False)
    page_url = Column(String(2000))
    position = Column(Float)
    previous_position = Column(Float)
    clicks = Column(Integer, default=0)
    impressions = Column(Integer, default=0)
    ctr = Column(Float, default=0.0)
    is_tracked = Column(Boolean, default=False)
    source = Column(String(50), default="gsc")  # gsc | manual
    recorded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    website = relationship("Website", back_populates="rankings")
