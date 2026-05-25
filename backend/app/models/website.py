from sqlalchemy import Column, String, Text, DateTime, Integer, JSON, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class IntegrationType(str, enum.Enum):
    gsc = "gsc"
    ga4 = "ga4"
    wordpress = "wordpress"
    shopify = "shopify"
    cloudflare = "cloudflare"
    github = "github"
    ftp = "ftp"
    pagespeed = "pagespeed"


class CMSType(str, enum.Enum):
    wordpress = "wordpress"
    shopify = "shopify"
    nextjs = "nextjs"
    react = "react"
    php = "php"
    laravel = "laravel"
    wix = "wix"
    webflow = "webflow"
    custom_html = "custom_html"
    static = "static"
    unknown = "unknown"


class BotExecutionMode(str, enum.Enum):
    fully_automated = "fully_automated"       # GitHub + server access
    partial_automation = "partial_automation"  # WordPress API / WP access
    recommendation_only = "recommendation_only"  # URL only


class VerificationMethod(str, enum.Enum):
    html_file = "html_file"
    dns_txt = "dns_txt"
    meta_tag = "meta_tag"
    gsc = "gsc"
    none = "none"


class Website(Base):
    __tablename__ = "websites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    domain = Column(String(255), nullable=False)
    url = Column(String(500), nullable=False)
    sitemap_url = Column(String(500))

    # CMS / Detection
    platform = Column(String(100))                              # human-readable
    cms_type = Column(SAEnum(CMSType, native_enum=False), default=CMSType.unknown)
    framework_detected = Column(String(100))
    hosting_provider = Column(String(100))
    cdn_detected = Column(String(100))
    php_version = Column(String(20))
    server_software = Column(String(100))

    # Detection results
    has_sitemap = Column(Boolean, default=False)
    has_robots_txt = Column(Boolean, default=False)
    has_schema = Column(Boolean, default=False)
    has_analytics = Column(Boolean, default=False)
    has_tag_manager = Column(Boolean, default=False)
    has_ssl = Column(Boolean, default=False)
    detection_data = Column(JSON, default=dict)                 # full detection snapshot

    # Bot execution mode
    bot_mode = Column(SAEnum(BotExecutionMode, native_enum=False), default=BotExecutionMode.recommendation_only)

    # Verification
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String(100))
    verification_method = Column(SAEnum(VerificationMethod, native_enum=False), default=VerificationMethod.none)
    verified_at = Column(DateTime(timezone=True))

    # Scores
    technical_score = Column(Integer, default=0)
    content_score = Column(Integer, default=0)
    authority_score = Column(Integer, default=0)
    ai_visibility_score = Column(Integer, default=0)
    aeo_score = Column(Integer, default=0)        # Answer Engine Optimization score

    # Crawl settings
    last_crawled_at = Column(DateTime(timezone=True))
    crawl_frequency_hours = Column(Integer, default=168)  # weekly default

    # Onboarding progress
    onboarding_step = Column(Integer, default=1)           # 1-6
    onboarding_complete = Column(Boolean, default=False)

    # Soft delete
    deleted_at = Column(DateTime(timezone=True))

    settings = Column(JSON, default=dict)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="websites")
    integrations = relationship("Integration", back_populates="website", cascade="all, delete-orphan")
    crawls = relationship("Crawl", back_populates="website", cascade="all, delete-orphan")
    rankings = relationship("KeywordRanking", back_populates="website", cascade="all, delete-orphan")
    automation_rules = relationship("AutomationRule", back_populates="website", cascade="all, delete-orphan")


class Integration(Base):
    __tablename__ = "integrations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id"), nullable=False)
    type = Column(SAEnum(IntegrationType, native_enum=False), nullable=False)
    is_connected = Column(Boolean, default=False)
    credentials = Column(JSON, default=dict)   # encrypted in prod
    config = Column(JSON, default=dict)        # property IDs, view IDs etc.
    last_synced_at = Column(DateTime(timezone=True))
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    website = relationship("Website", back_populates="integrations")
