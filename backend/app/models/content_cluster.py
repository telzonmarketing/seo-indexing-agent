from sqlalchemy import Column, String, Text, DateTime, Integer, JSON, Boolean, ForeignKey, Enum as SAEnum, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class ClusterStatus(str, enum.Enum):
    planned = "planned"
    in_progress = "in_progress"
    complete = "complete"
    needs_update = "needs_update"


class ContentCluster(Base):
    __tablename__ = "content_clusters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id"))

    topic = Column(String(500), nullable=False)
    pillar_keyword = Column(String(300))
    pillar_url = Column(String(2000))
    description = Column(Text)

    cluster_pages = Column(JSON, default=list)        # list of {url, keyword, status}
    supporting_keywords = Column(JSON, default=list)  # all supporting KWs
    semantic_entities = Column(JSON, default=list)    # NLP entities to cover
    content_gaps = Column(JSON, default=list)         # pages that should exist but don't
    internal_links_map = Column(JSON, default=dict)   # suggested internal linking

    topical_authority_score = Column(Integer, default=0)   # 0-100
    coverage_score = Column(Integer, default=0)            # 0-100 how complete the cluster is
    estimated_traffic = Column(Integer, default=0)
    status = Column(SAEnum(ClusterStatus), default=ClusterStatus.planned)

    ai_analysis = Column(JSON, default=dict)
    ai_recommendations = Column(JSON, default=list)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="content_clusters")
