from sqlalchemy import Column, String, Text, DateTime, Integer, JSON, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class AlertType(str, enum.Enum):
    traffic_drop = "traffic_drop"
    ranking_drop = "ranking_drop"
    broken_page = "broken_page"
    schema_error = "schema_error"
    server_error = "server_error"
    lost_backlink = "lost_backlink"
    deindexed = "deindexed"
    new_crawl_error = "new_crawl_error"
    score_drop = "score_drop"
    competitor_change = "competitor_change"
    new_backlink = "new_backlink"
    ranking_gain = "ranking_gain"


class AlertSeverity(str, enum.Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    info = "info"


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"))
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id"))

    type = Column(SAEnum(AlertType), nullable=False)
    severity = Column(SAEnum(AlertSeverity), default=AlertSeverity.medium)
    title = Column(String(500), nullable=False)
    message = Column(Text)
    data = Column(JSON, default=dict)           # extra context (old vs new value)
    page_url = Column(String(2000))
    is_read = Column(Boolean, default=False)
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
