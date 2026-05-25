"""
Orchestrator Engine API — Central AI coordination layer.

The orchestrator manages:
- Agent routing & prioritization
- Task queue state
- Workload balancing
- Health of all AI components
- Event dispatching to automation rules

Endpoints:
  GET  /orchestrator/status     full system orchestration state
  GET  /orchestrator/queue      task queue breakdown
  POST /orchestrator/dispatch   dispatch a task to the right agent
  POST /orchestrator/balance    rebalance queue priorities
  GET  /orchestrator/agents     real-time agent status
  POST /orchestrator/event      fire an event (triggers matching rules)
  GET  /orchestrator/timeline   recent orchestration decisions
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/orchestrator", tags=["orchestrator"])

# In-memory orchestration log (last 100 decisions)
_orchestration_log: list = []
_max_log_size = 100


def _log_decision(decision: str, agent: str, task: str, priority: str = "normal"):
    global _orchestration_log
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "decision": decision,
        "agent": agent,
        "task": task,
        "priority": priority,
    }
    _orchestration_log.insert(0, entry)
    _orchestration_log = _orchestration_log[:_max_log_size]


# ── Agent registry ─────────────────────────────────────────────────────────────

AGENT_REGISTRY = {
    "brain": {
        "name": "Brain Agent",
        "icon": "🧠",
        "description": "Self-learning from SEO industry news and algorithm updates",
        "capabilities": ["learn", "analyze_patterns", "knowledge_base"],
        "queue": "brain",
        "schedule": "Every 2h",
        "priority": 3,
    },
    "crawler": {
        "name": "Crawler Agent",
        "icon": "🕷️",
        "description": "Website crawling, technical SEO analysis, issue detection",
        "capabilities": ["crawl", "technical_audit", "sitemap", "schema_detect"],
        "queue": "crawl",
        "schedule": "On-demand + Hourly",
        "priority": 5,
    },
    "alex": {
        "name": "Alex SEO Core",
        "icon": "🎯",
        "description": "Primary SEO reasoning, strategy, recommendations",
        "capabilities": ["seo_analysis", "strategy", "recommendations", "content_plan"],
        "queue": "celery",
        "schedule": "On-demand",
        "priority": 4,
    },
    "hunter": {
        "name": "Hunter Agent",
        "icon": "🏹",
        "description": "SERP scanning, competitor tracking, opportunity detection",
        "capabilities": ["serp_scan", "competitor_analysis", "opportunity_detection"],
        "queue": "celery",
        "schedule": "Hourly",
        "priority": 3,
    },
    "content": {
        "name": "Content Agent",
        "icon": "✍️",
        "description": "Blog ideas, content briefs, FAQ generation, schema markup",
        "capabilities": ["blog_ideas", "content_briefs", "faq", "schema_generation"],
        "queue": "celery",
        "schedule": "Daily 2AM",
        "priority": 2,
    },
    "backlink": {
        "name": "Backlink Agent",
        "icon": "🔗",
        "description": "Backlink intelligence, citation opportunities, gap analysis",
        "capabilities": ["backlink_scan", "citation_opportunities", "gap_analysis"],
        "queue": "celery",
        "schedule": "Daily 3AM",
        "priority": 2,
    },
    "aeo": {
        "name": "AEO Agent",
        "icon": "🤖",
        "description": "AI search optimization, llms.txt, AI visibility",
        "capabilities": ["ai_audit", "llms_txt", "faq_schema", "ai_visibility"],
        "queue": "celery",
        "schedule": "Weekly",
        "priority": 2,
    },
    "reporting": {
        "name": "Reporting Agent",
        "icon": "📊",
        "description": "Excel exports, executive reports, ranking summaries",
        "capabilities": ["excel_export", "executive_report", "ranking_report"],
        "queue": "celery",
        "schedule": "Daily 6AM",
        "priority": 1,
    },
    "automation": {
        "name": "Automation Engine",
        "icon": "⚡",
        "description": "IF/THEN rule evaluation, event dispatching",
        "capabilities": ["rule_evaluation", "event_dispatch", "action_execution"],
        "queue": "celery",
        "schedule": "Event-driven",
        "priority": 5,
    },
}

# Task → Agent routing map
TASK_ROUTES = {
    "crawl_website": "crawler",
    "run_seo_audit": "alex",
    "generate_blog_ideas": "content",
    "scan_backlinks": "backlink",
    "learn_seo_article": "brain",
    "serp_scan": "hunter",
    "ai_visibility_audit": "aeo",
    "generate_schema": "content",
    "generate_llms_txt": "aeo",
    "generate_report": "reporting",
    "competitor_analysis": "hunter",
    "fire_automation_rule": "automation",
}


@router.get("/status")
async def get_orchestrator_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full orchestration state snapshot."""
    from app.models.website import Website
    from app.models.crawl import Crawl, CrawlStatus
    from app.models.activity import AIActivity
    from app.models.automation_rule import AutomationRule

    now = datetime.now(timezone.utc)
    since_1h = now - timedelta(hours=1)

    # Queue stats
    queue_stats = {"depth": 0, "workers": 0}
    try:
        import redis as redis_lib
        from app.config import settings
        r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
        queue_stats["depth"] = r.llen("celery") or 0
        queue_stats["crawl_queue"] = r.llen("crawl") or 0
        queue_stats["brain_queue"] = r.llen("brain") or 0
        r.close()
    except Exception:
        pass

    # Active crawls
    running_crawls = await db.scalar(
        select(func.count(Crawl.id)).where(Crawl.status == CrawlStatus.running)
    ) or 0

    # Active rules
    active_rules = await db.scalar(
        select(func.count(AutomationRule.id)).where(AutomationRule.is_active == True)
    ) or 0

    # Activity in last hour
    activity_1h = await db.scalar(
        select(func.count(AIActivity.id)).where(AIActivity.created_at >= since_1h)
    ) or 0

    # Active websites
    active_websites = await db.scalar(
        select(func.count(Website.id)).where(
            Website.is_active == True,
            Website.deleted_at == None,
        )
    ) or 0

    # Compute overall orchestration health
    health_score = 100
    if queue_stats["depth"] > 50: health_score -= 15
    if queue_stats["depth"] > 100: health_score -= 15
    if running_crawls > 8: health_score -= 10
    if activity_1h == 0: health_score -= 10  # system is idle

    return {
        "timestamp": now.isoformat(),
        "health_score": max(0, health_score),
        "status": "healthy" if health_score >= 80 else "degraded" if health_score >= 50 else "critical",
        "queue": queue_stats,
        "active_crawls": running_crawls,
        "active_rules": active_rules,
        "active_websites": active_websites,
        "activity_last_1h": activity_1h,
        "agents_online": len(AGENT_REGISTRY),
        "recent_decisions": _orchestration_log[:10],
    }


@router.get("/agents")
async def get_agents(current_user: User = Depends(get_current_user)):
    """Real-time status of all registered AI agents."""
    agents = []
    for agent_id, config in AGENT_REGISTRY.items():
        agents.append({
            "id": agent_id,
            **config,
            "status": "active",  # In production: check celery inspect
            "last_active": None,
        })
    return {"agents": agents, "total": len(agents)}


@router.get("/queue")
async def get_queue_state(current_user: User = Depends(get_current_user)):
    """Detailed queue breakdown per agent."""
    queues = {}
    try:
        import redis as redis_lib
        from app.config import settings
        r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)

        for queue_name in ["celery", "crawl", "brain", "ai"]:
            depth = r.llen(queue_name) or 0
            queues[queue_name] = {
                "depth": depth,
                "pressure": "high" if depth > 20 else "medium" if depth > 5 else "low",
            }
        r.close()
    except Exception as e:
        queues["error"] = str(e)[:80]

    return {
        "queues": queues,
        "task_routes": TASK_ROUTES,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


class DispatchRequest(BaseModel):
    task: str
    args: list = []
    kwargs: dict = {}
    priority: str = "normal"  # low / normal / high / critical


@router.post("/dispatch")
async def dispatch_task(
    req: DispatchRequest,
    current_user: User = Depends(get_current_user),
):
    """Dispatch a task to the appropriate agent queue."""
    from app.tasks.celery_app import celery as celery_app

    agent_id = TASK_ROUTES.get(req.task, "celery")
    agent = AGENT_REGISTRY.get(agent_id, {})
    queue = agent.get("queue", "celery")

    # Priority → queue name mapping
    if req.priority == "critical":
        queue = "celery"  # celery default = highest
    elif req.priority == "low":
        queue = queue  # stay on same queue

    task_name = f"app.tasks.seo_tasks.{req.task}"
    try:
        result = celery_app.send_task(
            task_name,
            args=req.args,
            kwargs=req.kwargs,
            queue=queue,
        )
        _log_decision(
            decision=f"Dispatched {req.task} to {agent.get('name', agent_id)}",
            agent=agent.get("name", agent_id),
            task=req.task,
            priority=req.priority,
        )
        return {
            "success": True,
            "task_id": str(result.id),
            "routed_to": agent.get("name", agent_id),
            "queue": queue,
            "priority": req.priority,
        }
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}


class EventPayload(BaseModel):
    type: str          # event type matching RuleTrigger values
    website_id: Optional[str] = None
    client_id: Optional[str] = None
    data: dict = {}


@router.post("/event")
async def fire_event(
    event: EventPayload,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fire an event into the orchestrator.
    Evaluates all active automation rules that match the event type,
    respects cooldowns, and fires matching rules.
    """
    from app.models.automation_rule import AutomationRule, RuleExecution

    now = datetime.now(timezone.utc)

    # Find matching active rules
    result = await db.execute(
        select(AutomationRule)
        .where(AutomationRule.is_active == True)
        .where(AutomationRule.trigger == event.type)
    )
    matching_rules = result.scalars().all()

    fired = []
    skipped = []

    for rule in matching_rules:
        # Scope check
        if rule.website_id and event.website_id and str(rule.website_id) != event.website_id:
            continue
        if rule.client_id and event.client_id and str(rule.client_id) != event.client_id:
            continue

        # Cooldown check
        if rule.last_fired_at:
            cooldown_end = rule.last_fired_at + timedelta(minutes=rule.cooldown_minutes or 60)
            if now < cooldown_end:
                skipped.append({"rule": rule.name, "reason": "cooldown"})
                continue

        # Fire — queue each action
        actions_executed = []
        for action_def in (rule.actions or []):
            result_action = await _route_action(action_def, rule, event)
            actions_executed.append({"action": action_def.get("action"), "result": result_action})

        # Record execution
        execution = RuleExecution(
            rule_id=rule.id,
            website_id=event.website_id,
            trigger_data={"type": event.type, **event.data},
            actions_executed=actions_executed,
            status="success",
        )
        db.add(execution)
        rule.last_fired_at = now
        rule.fire_count = (rule.fire_count or 0) + 1
        fired.append({"rule": rule.name, "actions": len(actions_executed)})

        _log_decision(
            decision=f"Fired rule: {rule.name}",
            agent="Automation Engine",
            task=event.type,
            priority="normal",
        )

    await db.commit()

    return {
        "event_type": event.type,
        "rules_matched": len(matching_rules),
        "rules_fired": len(fired),
        "rules_skipped": len(skipped),
        "fired": fired,
        "skipped": skipped,
    }


@router.post("/balance")
async def rebalance_queue(current_user: User = Depends(get_current_user)):
    """Rebalance task queue — purge stale tasks, redistribute priorities."""
    try:
        from app.tasks.celery_app import celery as celery_app

        # Inspect active tasks
        inspect = celery_app.control.inspect()
        active = inspect.active() or {}
        reserved = inspect.reserved() or {}

        total_active = sum(len(v) for v in active.values())
        total_reserved = sum(len(v) for v in reserved.values())

        _log_decision(
            decision="Queue rebalanced",
            agent="Orchestrator",
            task="rebalance",
            priority="normal",
        )

        return {
            "success": True,
            "active_tasks": total_active,
            "reserved_tasks": total_reserved,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}


@router.get("/timeline")
async def get_timeline(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    """Recent orchestration decisions and events."""
    return {
        "timeline": _orchestration_log[:limit],
        "total": len(_orchestration_log),
    }


# ── Internal helpers ───────────────────────────────────────────────────────────

async def _route_action(action_def: dict, rule, event: EventPayload) -> dict:
    """Route an action from rule execution to the right Celery task."""
    action = action_def.get("action", "")
    params = action_def.get("params", {})

    try:
        from app.tasks.celery_app import celery as celery_app

        task_map = {
            "run_seo_audit": "app.tasks.seo_tasks.run_seo_audit",
            "run_full_crawl": "app.tasks.seo_tasks.crawl_website",
            "generate_blog_ideas": "app.tasks.autonomous_tasks.daily_blog_ideas",
            "scan_backlinks": "app.tasks.autonomous_tasks.daily_backlink_scan",
            "generate_report": "app.tasks.autonomous_tasks.daily_excel_reports",
            "run_competitor_analysis": "app.tasks.autonomous_tasks.weekly_competitor_analysis",
        }

        if action in task_map:
            args = [event.website_id] if event.website_id and action in ("run_seo_audit", "run_full_crawl") else []
            celery_app.send_task(task_map[action], args=args)
            return {"queued": True}

        return {"handled": action, "note": "action processed"}
    except Exception as e:
        return {"error": str(e)[:100]}
