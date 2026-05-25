"""
SEO Brain Knowledge Models — stores learned SEO knowledge from articles/research.
"""
from sqlalchemy import Column, String, Text, DateTime, Integer, JSON, Boolean, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import Enum as SAEnum
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class ArticleStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    processed = "processed"
    failed = "failed"
    skipped = "skipped"


class KnowledgeCategory(str, enum.Enum):
    technical_seo = "technical_seo"
    semantic_seo = "semantic_seo"
    aeo = "aeo"                         # Answer Engine Optimization
    ranking = "ranking"
    backlink = "backlink"
    content = "content"
    algorithm = "algorithm"
    competitor = "competitor"
    ai_search = "ai_search"
    schema = "schema"
    core_web_vitals = "core_web_vitals"
    local_seo = "local_seo"
    entity_seo = "entity_seo"


class SEOArticle(Base):
    """Tracks every scraped SEO article and its processing status."""
    __tablename__ = "seo_articles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    url = Column(String(2000), unique=True, nullable=False, index=True)
    title = Column(String(500))
    source = Column(String(100), index=True)        # "moz", "ahrefs", "google", etc.
    source_url = Column(String(2000))               # RSS feed URL

    # Content
    content_text = Column(Text)                     # raw extracted article text
    content_length = Column(Integer, default=0)

    # AI Extraction Results
    summary = Column(Text)
    key_insights = Column(JSON, default=list)        # top SEO insights
    ranking_factors = Column(JSON, default=list)     # ranking signals found
    seo_techniques = Column(JSON, default=list)      # actionable techniques
    ai_search_insights = Column(JSON, default=list)  # AEO/GEO insights
    entities = Column(JSON, default=list)            # SEO entities/concepts
    categories = Column(JSON, default=list)          # KnowledgeCategory values
    sentiment = Column(String(20))                   # positive/neutral/update

    # Vector storage
    vector_id = Column(String(200))                  # Qdrant point ID

    # Status
    status = Column(SAEnum(ArticleStatus, native_enum=False), default=ArticleStatus.pending)
    published_at = Column(DateTime(timezone=True))
    scraped_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    processed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    error_message = Column(Text)


class SEOKnowledgeEntry(Base):
    """Individual knowledge entries extracted from articles — searchable by semantic query."""
    __tablename__ = "seo_knowledge_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content = Column(Text, nullable=False)              # the actual knowledge/insight text
    category = Column(SAEnum(KnowledgeCategory, native_enum=False), index=True)
    source_url = Column(String(2000))
    source_name = Column(String(100))
    article_id = Column(UUID(as_uuid=True))             # FK to seo_articles

    # Metadata
    tags = Column(JSON, default=list)                   # topic tags
    confidence = Column(Integer, default=80)            # 0-100, how confident
    relevance_year = Column(Integer)                    # when this knowledge applies

    # Usage tracking
    vector_id = Column(String(200))                     # Qdrant point ID
    usage_count = Column(Integer, default=0)            # how many times used in recs
    effectiveness_score = Column(Integer, default=50)   # 0-100

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BrainLearningSession(Base):
    """Logs every autonomous learning session (every 2h/daily/weekly run)."""
    __tablename__ = "brain_learning_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_type = Column(String(50))                  # "hourly_check", "daily_learn", "weekly_retrain"

    # Stats
    sources_checked = Column(Integer, default=0)
    articles_found = Column(Integer, default=0)
    articles_new = Column(Integer, default=0)          # not seen before
    articles_processed = Column(Integer, default=0)
    knowledge_extracted = Column(Integer, default=0)   # new knowledge entries

    # Highlights
    top_topics = Column(JSON, default=list)            # top topics learned this session
    new_algorithm_updates = Column(JSON, default=list) # any algo updates detected
    new_ai_search_insights = Column(JSON, default=list)

    # Status
    status = Column(String(20), default="running")
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True))
    duration_seconds = Column(Integer)
    error = Column(Text)


class SEOBrainState(Base):
    """Singleton table storing the brain's current knowledge state/stats."""
    __tablename__ = "seo_brain_state"

    id = Column(Integer, primary_key=True, default=1)

    # Knowledge counts
    total_articles_learned = Column(Integer, default=0)
    total_knowledge_entries = Column(Integer, default=0)
    total_learning_sessions = Column(Integer, default=0)

    # Knowledge by category (JSON dict)
    knowledge_by_category = Column(JSON, default=dict)

    # Latest learning info
    last_learning_at = Column(DateTime(timezone=True))
    last_article_title = Column(String(500))
    last_algorithm_update = Column(String(500))

    # Brain version / generation
    brain_generation = Column(Integer, default=1)
    intelligence_score = Column(Integer, default=10)  # grows as more is learned

    # Sources status
    sources_health = Column(JSON, default=dict)        # per-source last check time

    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
