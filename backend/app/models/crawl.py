from sqlalchemy import Column, String, Text, DateTime, Integer, Float, JSON, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class CrawlStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class IssueType(str, enum.Enum):
    missing_title = "missing_title"
    duplicate_title = "duplicate_title"
    missing_description = "missing_description"
    missing_h1 = "missing_h1"
    missing_canonical = "missing_canonical"
    noindex = "noindex"
    broken_link = "broken_link"
    redirect_chain = "redirect_chain"
    missing_schema = "missing_schema"
    slow_page = "slow_page"
    thin_content = "thin_content"
    duplicate_content = "duplicate_content"
    missing_alt_text = "missing_alt_text"
    internal_link_issue = "internal_link_issue"
    mobile_issue = "mobile_issue"
    core_web_vitals = "core_web_vitals"


class IssueSeverity(str, enum.Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    info = "info"


class Crawl(Base):
    __tablename__ = "crawls"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id"), nullable=False)
    status = Column(SAEnum(CrawlStatus), default=CrawlStatus.pending)
    pages_found = Column(Integer, default=0)
    pages_crawled = Column(Integer, default=0)
    issues_found = Column(Integer, default=0)
    seo_score = Column(Integer, default=0)
    crawl_config = Column(JSON, default=dict)
    summary = Column(JSON, default=dict)
    ai_audit = Column(JSON, default=dict)
    celery_task_id = Column(String(255))
    error_message = Column(Text)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    website = relationship("Website", back_populates="crawls")
    pages = relationship("Page", back_populates="crawl", cascade="all, delete-orphan")
    issues = relationship("SEOIssue", back_populates="crawl", cascade="all, delete-orphan")


class Page(Base):
    __tablename__ = "pages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    crawl_id = Column(UUID(as_uuid=True), ForeignKey("crawls.id"), nullable=False)
    url = Column(String(2000), nullable=False)
    status_code = Column(Integer)
    title = Column(String(600))
    meta_description = Column(Text)
    h1 = Column(String(600))
    canonical_url = Column(String(2000))
    is_indexable = Column(Boolean, default=True)
    has_noindex = Column(Boolean, default=False)
    has_schema = Column(Boolean, default=False)
    schema_types = Column(JSON, default=list)
    word_count = Column(Integer, default=0)
    internal_links_count = Column(Integer, default=0)
    external_links_count = Column(Integer, default=0)
    broken_links = Column(JSON, default=list)
    images_count = Column(Integer, default=0)
    images_missing_alt = Column(Integer, default=0)
    load_time_ms = Column(Integer)
    page_size_bytes = Column(Integer)
    headings = Column(JSON, default=dict)
    content_hash = Column(String(64))
    og_tags = Column(JSON, default=dict)
    extra_data = Column(JSON, default=dict)
    crawled_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    crawl = relationship("Crawl", back_populates="pages")


class SEOIssue(Base):
    __tablename__ = "seo_issues"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    crawl_id = Column(UUID(as_uuid=True), ForeignKey("crawls.id"), nullable=False)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id"), nullable=False)
    page_url = Column(String(2000))
    issue_type = Column(SAEnum(IssueType), nullable=False)
    severity = Column(SAEnum(IssueSeverity), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    recommendation = Column(Text)
    impact_score = Column(Integer, default=0)  # 0-100
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime(timezone=True))
    extra_data = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    crawl = relationship("Crawl", back_populates="issues")
