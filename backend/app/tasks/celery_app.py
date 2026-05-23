from celery import Celery
from app.config import settings

celery = Celery(
    "seo_os",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.seo_tasks"],
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
        "weekly-crawl-check": {
            "task": "app.tasks.seo_tasks.schedule_due_crawls",
            "schedule": 3600.0,  # every hour, check for due crawls
        },
    },
)
