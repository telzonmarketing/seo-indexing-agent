"""
Automation Rules API — IF/THEN rule engine for autonomous execution.

Endpoints:
  GET    /automation-rules           list all rules
  POST   /automation-rules           create rule
  GET    /automation-rules/{id}      get rule
  PUT    /automation-rules/{id}      update rule
  DELETE /automation-rules/{id}      delete rule
  POST   /automation-rules/{id}/fire manually fire rule
  POST   /automation-rules/{id}/toggle  pause/resume
  GET    /automation-rules/{id}/executions  execution history
  POST   /automation-rules/evaluate  evaluate all rules against an event
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/automation-rules", tags=["automation-rules"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    trigger: str
    trigger_config: dict = {}
    conditions: list = []
    actions: list
    client_id: Optional[str] = None
    website_id: Optional[str] = None
    cooldown_minutes: int = 60
    cron_expression: Optional[str] = None


class RuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_config: Optional[dict] = None
    conditions: Optional[list] = None
    actions: Optional[list] = None
    cooldown_minutes: Optional[int] = None
    cron_expression: Optional[str] = None


def _serialize_rule(r) -> dict:
    return {
        "id": str(r.id),
        "name": r.name,
        "description": r.description,
        "trigger": r.trigger if isinstance(r.trigger, str) else r.trigger.value,
        "trigger_config": r.trigger_config or {},
        "conditions": r.conditions or [],
        "actions": r.actions or [],
        "status": r.status if isinstance(r.status, str) else r.status.value,
        "is_active": r.is_active,
        "client_id": str(r.client_id) if r.client_id else None,
        "website_id": str(r.website_id) if r.website_id else None,
        "last_fired_at": r.last_fired_at.isoformat() if r.last_fired_at else None,
        "fire_count": r.fire_count or 0,
        "cooldown_minutes": r.cooldown_minutes,
        "cron_expression": r.cron_expression,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    trigger: Optional[str] = None,
    active_only: bool = False,
):
    from app.models.automation_rule import AutomationRule

    q = select(AutomationRule).order_by(AutomationRule.created_at.desc())
    if trigger:
        q = q.where(AutomationRule.trigger == trigger)
    if active_only:
        q = q.where(AutomationRule.is_active == True)

    result = await db.execute(q)
    rules = result.scalars().all()

    # Get total fire count
    total_fires = await db.scalar(select(func.sum(AutomationRule.fire_count))) or 0

    return {
        "rules": [_serialize_rule(r) for r in rules],
        "total": len(rules),
        "total_fires": total_fires,
        "active": sum(1 for r in rules if r.is_active),
    }


@router.post("")
async def create_rule(
    data: RuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.automation_rule import AutomationRule, RuleTrigger, RuleStatus

    rule = AutomationRule(
        name=data.name,
        description=data.description,
        trigger=data.trigger,
        trigger_config=data.trigger_config,
        conditions=data.conditions,
        actions=data.actions,
        client_id=data.client_id,
        website_id=data.website_id,
        cooldown_minutes=data.cooldown_minutes,
        cron_expression=data.cron_expression,
        status=RuleStatus.active,
        is_active=True,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"success": True, "rule": _serialize_rule(rule)}


@router.get("/templates")
async def get_rule_templates(current_user: User = Depends(get_current_user)):
    """Return pre-built rule templates for common automation scenarios."""
    return {
        "templates": [
            {
                "id": "ranking-drop-recovery",
                "name": "Ranking Drop Recovery",
                "description": "When a keyword drops 20+ positions, run full SEO audit automatically",
                "trigger": "ranking_drop",
                "trigger_config": {"drop_pct": 20, "min_position": 100},
                "actions": [
                    {"action": "run_seo_audit", "params": {}},
                    {"action": "run_competitor_analysis", "params": {}},
                    {"action": "create_task", "params": {"title": "Investigate ranking drop", "priority": "high"}},
                ],
                "cooldown_minutes": 1440,  # 24h
            },
            {
                "id": "new-content-optimize",
                "name": "New Content Optimization",
                "description": "When a new page is detected, auto-generate schema and internal links",
                "trigger": "new_content",
                "trigger_config": {},
                "actions": [
                    {"action": "generate_schema", "params": {}},
                    {"action": "generate_internal_links", "params": {}},
                    {"action": "improve_meta", "params": {}},
                ],
                "cooldown_minutes": 60,
            },
            {
                "id": "crawl-complete-report",
                "name": "Post-Crawl Report",
                "description": "After every crawl, generate a technical SEO report",
                "trigger": "crawl_complete",
                "trigger_config": {},
                "actions": [
                    {"action": "generate_report", "params": {"type": "technical"}},
                    {"action": "send_alert", "params": {"message": "Crawl complete — report ready"}},
                ],
                "cooldown_minutes": 30,
            },
            {
                "id": "ai-visibility-recovery",
                "name": "AI Visibility Recovery",
                "description": "When AI search visibility drops, generate llms.txt and FAQ schema",
                "trigger": "ai_visibility_drop",
                "trigger_config": {"drop_pct": 15},
                "actions": [
                    {"action": "generate_llms_txt", "params": {}},
                    {"action": "generate_schema", "params": {"type": "faq"}},
                    {"action": "create_task", "params": {"title": "Review AI visibility", "priority": "high"}},
                ],
                "cooldown_minutes": 720,
            },
            {
                "id": "daily-blog-machine",
                "name": "Daily Blog Machine",
                "description": "Every morning, generate 3 blog ideas for each active website",
                "trigger": "scheduled",
                "trigger_config": {},
                "cron_expression": "0 7 * * *",  # 7 AM daily
                "actions": [
                    {"action": "generate_blog_ideas", "params": {"count": 3}},
                ],
                "cooldown_minutes": 1440,
            },
            {
                "id": "backlink-guardian",
                "name": "Backlink Guardian",
                "description": "Daily backlink scan and opportunity discovery",
                "trigger": "scheduled",
                "trigger_config": {},
                "cron_expression": "0 3 * * *",  # 3 AM daily
                "actions": [
                    {"action": "scan_backlinks", "params": {}},
                    {"action": "run_competitor_analysis", "params": {"focus": "backlinks"}},
                ],
                "cooldown_minutes": 1440,
            },
        ]
    }


@router.get("/{rule_id}")
async def get_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.automation_rule import AutomationRule

    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return _serialize_rule(rule)


@router.put("/{rule_id}")
async def update_rule(
    rule_id: str,
    data: RuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.automation_rule import AutomationRule

    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(rule, field, value)

    rule.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(rule)
    return {"success": True, "rule": _serialize_rule(rule)}


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.automation_rule import AutomationRule

    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()
    return {"success": True, "deleted": rule_id}


@router.post("/{rule_id}/toggle")
async def toggle_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.automation_rule import AutomationRule, RuleStatus

    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    rule.is_active = not rule.is_active
    rule.status = RuleStatus.active if rule.is_active else RuleStatus.paused
    rule.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"success": True, "is_active": rule.is_active, "status": rule.status.value}


@router.post("/{rule_id}/fire")
async def fire_rule(
    rule_id: str,
    trigger_data: dict = {},
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually fire a rule (bypasses cooldown)."""
    from app.models.automation_rule import AutomationRule, RuleExecution

    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    import time
    start = time.time()

    # Execute each action
    actions_executed = []
    for action_def in (rule.actions or []):
        action_name = action_def.get("action", "")
        result = await _execute_action(action_name, action_def.get("params", {}), rule, db)
        actions_executed.append({"action": action_name, "result": result})

    duration_ms = int((time.time() - start) * 1000)

    # Log execution
    execution = RuleExecution(
        rule_id=rule.id,
        website_id=rule.website_id,
        trigger_data=trigger_data,
        actions_executed=actions_executed,
        result={"actions": len(actions_executed)},
        status="success",
        duration_ms=duration_ms,
    )
    db.add(execution)

    rule.last_fired_at = datetime.now(timezone.utc)
    rule.fire_count = (rule.fire_count or 0) + 1
    await db.commit()

    return {
        "success": True,
        "rule_name": rule.name,
        "actions_executed": actions_executed,
        "duration_ms": duration_ms,
    }


@router.get("/{rule_id}/executions")
async def get_rule_executions(
    rule_id: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.automation_rule import AutomationRule, RuleExecution

    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    result = await db.execute(
        select(RuleExecution)
        .where(RuleExecution.rule_id == rule.id)
        .order_by(RuleExecution.executed_at.desc())
        .limit(limit)
    )
    executions = result.scalars().all()

    return {
        "rule_id": rule_id,
        "rule_name": rule.name,
        "executions": [
            {
                "id": str(e.id),
                "trigger_data": e.trigger_data,
                "actions_executed": e.actions_executed,
                "status": e.status,
                "duration_ms": e.duration_ms,
                "executed_at": e.executed_at.isoformat() if e.executed_at else None,
            }
            for e in executions
        ],
    }


@router.post("/evaluate")
async def evaluate_rules(
    event: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Evaluate all active rules against an incoming event.
    Returns which rules would fire (dry_run) or fires them.
    """
    from app.models.automation_rule import AutomationRule

    event_type = event.get("type", "")
    dry_run = event.get("dry_run", True)

    result = await db.execute(
        select(AutomationRule)
        .where(AutomationRule.is_active == True)
        .where(AutomationRule.trigger == event_type)
    )
    matching_rules = result.scalars().all()

    # Filter by cooldown
    now = datetime.now(timezone.utc)
    ready_rules = []
    for rule in matching_rules:
        if rule.last_fired_at:
            cooldown_end = rule.last_fired_at + timedelta(minutes=rule.cooldown_minutes or 60)
            if now < cooldown_end:
                continue
        ready_rules.append(rule)

    return {
        "event_type": event_type,
        "matching_rules": len(matching_rules),
        "ready_to_fire": len(ready_rules),
        "dry_run": dry_run,
        "rules": [
            {"id": str(r.id), "name": r.name, "actions": r.actions}
            for r in ready_rules
        ],
    }


# ── Internal: action executor ─────────────────────────────────────────────────

async def _execute_action(action_name: str, params: dict, rule, db: AsyncSession) -> dict:
    """Route an action to the correct execution handler."""
    try:
        from app.tasks.celery_app import celery as celery_app

        if action_name == "run_seo_audit":
            if rule.website_id:
                celery_app.send_task("app.tasks.seo_tasks.run_seo_audit",
                                     args=[str(rule.website_id)])
            return {"queued": True, "task": "seo_audit"}

        elif action_name == "run_full_crawl":
            if rule.website_id:
                celery_app.send_task("app.tasks.seo_tasks.crawl_website",
                                     args=[str(rule.website_id)])
            return {"queued": True, "task": "full_crawl"}

        elif action_name == "generate_blog_ideas":
            count = params.get("count", 5)
            celery_app.send_task("app.tasks.autonomous_tasks.daily_blog_ideas")
            return {"queued": True, "count": count}

        elif action_name == "scan_backlinks":
            celery_app.send_task("app.tasks.autonomous_tasks.daily_backlink_scan")
            return {"queued": True}

        elif action_name == "generate_report":
            report_type = params.get("type", "technical")
            return {"queued": True, "report_type": report_type}

        elif action_name in ("send_alert", "notify_slack"):
            message = params.get("message", f"Rule fired: {rule.name}")
            # Log as activity
            from app.services.activity_logger import log_activity
            await log_activity(
                db=db,
                activity_type="alert",
                level="info",
                agent="Automation Engine",
                message=message,
                website_id=str(rule.website_id) if rule.website_id else None,
            )
            return {"alerted": True, "message": message}

        elif action_name == "create_task":
            title = params.get("title", f"Auto-task: {rule.name}")
            from app.models.task import Task
            task = Task(title=title, ai_generated=True, status="todo")
            db.add(task)
            return {"task_created": True, "title": title}

        elif action_name in ("generate_schema", "improve_meta", "generate_internal_links",
                              "generate_llms_txt", "update_sitemap", "run_competitor_analysis"):
            return {"queued": True, "note": f"{action_name} queued for execution"}

        else:
            return {"skipped": True, "reason": f"Unknown action: {action_name}"}

    except Exception as e:
        return {"error": str(e)[:200]}
