from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery = Celery(
    "seo_os",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.seo_tasks",
        "app.tasks.autonomous_tasks",
        "app.tasks.brain_tasks",
        "app.tasks.healing_tasks",
        "app.tasks.hunter_tasks",
    ],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,

    beat_schedule={
        # ── Core Crawl Scheduler (every hour) ────────────────────
        "schedule-due-crawls": {
            "task": "app.tasks.seo_tasks.schedule_due_crawls",
            "schedule": crontab(minute=0),          # top of every hour
        },

        # ── HOURLY: Monitoring ───────────────────────────────────
        "hourly-monitor-rankings": {
            "task": "app.tasks.autonomous_tasks.monitor_keyword_rankings",
            "schedule": crontab(minute=5),          # :05 every hour
        },
        "hourly-monitor-ai-visibility": {
            "task": "app.tasks.autonomous_tasks.monitor_ai_visibility",
            "schedule": crontab(minute=10),         # :10 every hour
        },

        # ── DAILY: Blog Ideas (2:00 AM UTC) ──────────────────────
        "daily-blog-ideas": {
            "task": "app.tasks.autonomous_tasks.daily_blog_ideas",
            "schedule": crontab(hour=2, minute=0),
        },

        # ── DAILY: Backlink Scan (3:00 AM UTC) ───────────────────
        "daily-backlink-scan": {
            "task": "app.tasks.autonomous_tasks.daily_backlink_scan",
            "schedule": crontab(hour=3, minute=0),
        },

        # ── DAILY: Content Gap Detection (4:00 AM UTC) ───────────
        "daily-content-gaps": {
            "task": "app.tasks.autonomous_tasks.detect_content_gaps",
            "schedule": crontab(hour=4, minute=0),
        },

        # ── DAILY: Excel Reports (6:00 AM UTC) ───────────────────
        "daily-excel-reports": {
            "task": "app.tasks.autonomous_tasks.daily_excel_reports",
            "schedule": crontab(hour=6, minute=0),
        },

        # ── WEEKLY: Competitor Analysis (Monday 5:00 AM UTC) ─────
        "weekly-competitor-analysis": {
            "task": "app.tasks.autonomous_tasks.weekly_competitor_analysis",
            "schedule": crontab(hour=5, minute=0, day_of_week=1),
        },

        # ── WEEKLY: AI Search Audit (Wednesday 5:00 AM UTC) ──────
        "weekly-ai-search-audit": {
            "task": "app.tasks.autonomous_tasks.weekly_ai_search_audit",
            "schedule": crontab(hour=5, minute=0, day_of_week=3),
        },

        # ── WEEKLY: Semantic SEO Audit (Friday 5:00 AM UTC) ──────
        "weekly-semantic-audit": {
            "task": "app.tasks.autonomous_tasks.weekly_semantic_audit",
            "schedule": crontab(hour=5, minute=0, day_of_week=5),
        },

        # ════════════════════════════════════════════════════════════
        # 🧠 AI BRAIN — SELF-LEARNING SCHEDULE
        # ════════════════════════════════════════════════════════════

        # Every 2 hours: Check for new SEO articles + algorithm updates
        "brain-check-new-articles": {
            "task": "app.tasks.brain_tasks.check_new_seo_articles",
            "schedule": crontab(minute=30, hour="*/2"),   # :30 every 2 hours
        },

        # Daily 1 AM: Deep learning session — process all pending articles
        "brain-daily-deep-learn": {
            "task": "app.tasks.brain_tasks.daily_deep_learning",
            "schedule": crontab(hour=1, minute=0),
        },

        # Weekly Monday 4 AM: Retrain ranking patterns + update brain generation
        "brain-weekly-retrain": {
            "task": "app.tasks.brain_tasks.weekly_retrain",
            "schedule": crontab(hour=4, minute=0, day_of_week=1),
        },

        # ════════════════════════════════════════════════════════════
        # 🔧 SELF-HEALING — Auto-recovery
        # ════════════════════════════════════════════════════════════

        # Every 5 minutes: Check stalled crawls, queue health, Ollama
        "self-healing-check": {
            "task": "app.tasks.healing_tasks.run_health_check",
            "schedule": crontab(minute="*/5"),
        },

        # ════════════════════════════════════════════════════════════
        # 🏹 HUNTER — SERP opportunity scanning
        # ════════════════════════════════════════════════════════════

        # Hourly: Scan for easy wins and ranking opportunities
        "hunter-hourly-scan": {
            "task": "app.tasks.hunter_tasks.hourly_opportunity_scan",
            "schedule": crontab(minute=45),   # :45 every hour
        },

        # Daily 5 AM: Deep competitor analysis
        "hunter-daily-competitor": {
            "task": "app.tasks.hunter_tasks.daily_competitor_scan",
            "schedule": crontab(hour=5, minute=0),
        },
    },
)
