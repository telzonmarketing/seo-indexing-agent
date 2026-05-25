"""
AI Activity Feed — Real-time record of what every AI agent is doing.
Every agent action is recorded here for the live feed dashboard.
"""
from sqlalchemy import Column, String, Text, DateTime, JSON, Boolean, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class ActivityType(str, enum.Enum):
    # Crawling
    crawling_pages = "crawling_pages"
    crawl_complete = "crawl_complete"
    page_indexed = "page_indexed"

    # Intelligence
    finding_keywords = "finding_keywords"
    analyzing_serps = "analyzing_serps"
    detecting_ai_visibility = "detecting_ai_visibility"
    ranking_change_detected = "ranking_change_detected"

    # Content
    generating_blog_ideas = "generating_blog_ideas"
    blog_idea_created = "blog_idea_created"
    content_gap_found = "content_gap_found"

    # Backlinks
    finding_backlink_opportunities = "finding_backlink_opportunities"
    backlink_opportunity_found = "backlink_opportunity_found"

    # Technical
    technical_issue_found = "technical_issue_found"
    schema_generated = "schema_generated"
    sitemap_updated = "sitemap_updated"
    llms_txt_generated = "llms_txt_generated"

    # Brain
    brain_learning = "brain_learning"
    brain_article_processed = "brain_article_processed"
    brain_knowledge_stored = "brain_knowledge_stored"
    algorithm_update_detected = "algorithm_update_detected"

    # Semantic
    analyzing_semantic_gaps = "analyzing_semantic_gaps"
    building_internal_links = "building_internal_links"
    entity_detected = "entity_detected"

    # System
    agent_started = "agent_started"
    agent_completed = "agent_completed"
    alert_created = "alert_created"
    report_generated = "report_generated"

    # Alex Brother
    serp_scanned = "serp_scanned"
    competitor_weakness_found = "competitor_weakness_found"
    easy_keyword_detected = "easy_keyword_detected"
    ai_search_opportunity = "ai_search_opportunity"
    website_deleted = "website_deleted"
    website_restored = "website_restored"
    system = "system"       # generic system event (legacy / fallback)


class ActivityLevel(str, enum.Enum):
    info = "info"
    success = "success"
    warning = "warning"
    discovery = "discovery"   # found something useful
    learning = "learning"     # brain activity


class AIActivity(Base):
    """Real-time AI activity event log — the heartbeat of the system."""
    __tablename__ = "ai_activities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Classification
    activity_type = Column(SAEnum(ActivityType, native_enum=False), nullable=False)
    level = Column(SAEnum(ActivityLevel, native_enum=False), default=ActivityLevel.info)
    agent = Column(String(100), nullable=False)         # which agent did this

    # Context
    message = Column(Text, nullable=False)              # human-readable description
    details = Column(JSON, default=dict)                # structured data

    # Scope
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=True)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id", ondelete="CASCADE"), nullable=True)
    client_name = Column(String(255))                   # denormalized for fast display
    website_domain = Column(String(255))                # denormalized

    # Metadata
    duration_ms = Column(Integer)                       # how long the action took
    is_milestone = Column(Boolean, default=False)       # highlight worthy events

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
