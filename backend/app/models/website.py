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


class Website(Base):
    __tablename__ = "websites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    domain = Column(String(255), nullable=False)
    url = Column(String(500), nullable=False)
    sitemap_url = Column(String(500))
    platform = Column(String(100))  # wordpress, shopify, next.js, etc.
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String(100))
    technical_score = Column(Integer, default=0)
    content_score = Column(Integer, default=0)
    authority_score = Column(Integer, default=0)
    ai_visibility_score = Column(Integer, default=0)
    last_crawled_at = Column(DateTime(timezone=True))
    crawl_frequency_hours = Column(Integer, default=168)  # weekly default
    settings = Column(JSON, default=dict)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="websites")
    integrations = relationship("Integration", back_populates="website", cascade="all, delete-orphan")
    crawls = relationship("Crawl", back_populates="website", cascade="all, delete-orphan")
    rankings = relationship("KeywordRanking", back_populates="website", cascade="all, delete-orphan")


class Integration(Base):
    __tablename__ = "integrations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id"), nullable=False)
    type = Column(SAEnum(IntegrationType), nullable=False)
    is_connected = Column(Boolean, default=False)
    credentials = Column(JSON, default=dict)  # encrypted in prod
    config = Column(JSON, default=dict)       # property IDs, view IDs etc.
    last_synced_at = Column(DateTime(timezone=True))
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    website = relationship("Website", back_populates="integrations")
