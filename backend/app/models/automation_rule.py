"""
Automation Rule Model — IF/THEN autonomous rule engine.

A rule has:
  - trigger:    what event fires it (ranking_drop, crawl_complete, new_content, etc.)
  - conditions: thresholds/filters (e.g. drop_pct > 20)
  - actions:    what to execute (run_audit, generate_schema, send_alert, etc.)
  - scope:      which websites/clients it applies to (None = all)
"""
from sqlalchemy import Column, String, Text, DateTime, Integer, JSON, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class RuleTrigger(str, enum.Enum):
    ranking_drop = "ranking_drop"           # keyword dropped by X positions
    ranking_gain = "ranking_gain"           # keyword improved by X positions
    crawl_complete = "crawl_complete"       # a crawl finished
    crawl_error = "crawl_error"             # a crawl failed
    new_content = "new_content"             # new page detected
    content_decay = "content_decay"         # traffic drop on a page
    seo_issue_detected = "seo_issue_detected"  # new tech SEO issue
    backlink_lost = "backlink_lost"         # lost a backlink
    backlink_gained = "backlink_gained"     # new backlink
    competitor_move = "competitor_move"     # competitor ranking change
    ai_visibility_drop = "ai_visibility_drop"  # AI search visibility fell
    scheduled = "scheduled"                 # time-based trigger (cron)
    manual = "manual"                       # manual execution


class RuleAction(str, enum.Enum):
    run_seo_audit = "run_seo_audit"
    run_full_crawl = "run_full_crawl"
    generate_schema = "generate_schema"
    generate_blog_ideas = "generate_blog_ideas"
    generate_internal_links = "generate_internal_links"
    improve_meta = "improve_meta"
    scan_backlinks = "scan_backlinks"
    run_competitor_analysis = "run_competitor_analysis"
    send_alert = "send_alert"
    create_task = "create_task"
    notify_slack = "notify_slack"
    generate_report = "generate_report"
    update_sitemap = "update_sitemap"
    generate_llms_txt = "generate_llms_txt"


class RuleStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    error = "error"


class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # Trigger
    trigger = Column(SAEnum(RuleTrigger), nullable=False)
    trigger_config = Column(JSON, default={})  # e.g. {"drop_pct": 20, "min_position": 50}

    # Conditions (additional filters)
    conditions = Column(JSON, default=[])  # list of {field, operator, value}

    # Actions
    actions = Column(JSON, nullable=False)  # list of {action, params}

    # Scope
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=True)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id", ondelete="CASCADE"), nullable=True)

    # Status
    status = Column(SAEnum(RuleStatus), default=RuleStatus.active)
    is_active = Column(Boolean, default=True)

    # Execution tracking
    last_fired_at = Column(DateTime(timezone=True), nullable=True)
    fire_count = Column(Integer, default=0)
    last_error = Column(Text, nullable=True)

    # Cooldown (avoid firing too frequently)
    cooldown_minutes = Column(Integer, default=60)

    # Schedule (only for trigger=scheduled)
    cron_expression = Column(String(100), nullable=True)  # e.g. "0 2 * * *"

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="automation_rules", lazy="selectin")
    website = relationship("Website", back_populates="automation_rules", lazy="selectin")
    executions = relationship("RuleExecution", back_populates="rule", lazy="noload",
                              cascade="all, delete-orphan")


class RuleExecution(Base):
    """Log of each time a rule fired."""
    __tablename__ = "rule_executions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id = Column(UUID(as_uuid=True), ForeignKey("automation_rules.id", ondelete="CASCADE"),
                     nullable=False)
    website_id = Column(UUID(as_uuid=True), ForeignKey("websites.id", ondelete="SET NULL"),
                        nullable=True)

    trigger_data = Column(JSON, default={})   # what data triggered the rule
    actions_executed = Column(JSON, default=[])  # which actions ran
    result = Column(JSON, default={})          # outcomes
    status = Column(String(20), default="success")  # success / error / partial
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)

    executed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    rule = relationship("AutomationRule", back_populates="executions")
