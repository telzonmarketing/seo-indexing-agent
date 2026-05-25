"""
Autonomous SEO Tasks — 24/7 execution engine.

HOURLY:  monitor rankings, traffic, indexing, AI visibility, competitors
DAILY:   crawl websites, generate blog ideas, scan backlinks, content gaps,
         generate tasks, update sitemaps, generate Excel reports
WEEKLY:  full technical audit, semantic authority, competitor gap, AI search analysis
"""
import asyncio
from datetime import datetime, timezone, timedelta
from app.tasks.celery_app import celery


def _run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ═══════════════════════════════════════════════════════════════════
# HOURLY TASKS
# ═══════════════════════════════════════════════════════════════════

@celery.task(name="app.tasks.autonomous_tasks.monitor_keyword_rankings")
def monitor_keyword_rankings():
    """Hourly: Check for significant ranking changes."""
    return _run_async(_do_monitor_rankings())


async def _do_monitor_rankings():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select, func
    from app.config import settings
    from app.models.website import Website
    from app.models.ranking import KeywordRanking
    from app.services.activity_logger import log_activity

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    drops_detected = 0
    gains_detected = 0

    async with Session() as db:
        result = await db.execute(select(Website).where(Website.is_active == True, Website.deleted_at == None))
        websites = result.scalars().all()

        for website in websites:
            # Find keywords where previous_position is significantly worse than current
            kw_result = await db.execute(
                select(KeywordRanking).where(
                    KeywordRanking.website_id == website.id,
                    KeywordRanking.previous_position.isnot(None),
                )
            )
            keywords = kw_result.scalars().all()

            for kw in keywords:
                if kw.previous_position and kw.position:
                    drop = kw.position - kw.previous_position  # positive = dropped
                    if drop >= 10:
                        drops_detected += 1
                        # Fire orchestrator event → triggers automation rules
                        try:
                            from app.api.orchestrator import _log_decision
                            _log_decision(
                                decision=f"Ranking drop: '{kw.keyword}' dropped {drop} positions (#{kw.previous_position}→#{kw.position})",
                                agent="Monitor Agent",
                                task="ranking_drop",
                                priority="high" if drop >= 20 else "normal",
                            )
                        except Exception:
                            pass

                        # Log to activity feed for significant drops
                        if drop >= 20:
                            await log_activity(
                                db=db,
                                activity_type="alert",
                                level="warning",
                                agent="Monitor Agent",
                                message=f"📉 '{kw.keyword}' dropped {drop} positions (#{kw.previous_position}→#{kw.position}) on {website.domain}",
                                website_id=str(website.id),
                                website_domain=website.domain,
                                is_milestone=False,
                            )

                    elif kw.previous_position - kw.position >= 5:
                        gains_detected += 1
                        if kw.position <= 10 and kw.previous_position > 10:
                            # Milestone: entered top 10
                            await log_activity(
                                db=db,
                                activity_type="success",
                                level="success",
                                agent="Monitor Agent",
                                message=f"🚀 '{kw.keyword}' entered Top 10! Now #{ kw.position} on {website.domain}",
                                website_id=str(website.id),
                                website_domain=website.domain,
                                is_milestone=True,
                            )

        await db.commit()

    return {
        "status": "monitoring_complete",
        "websites_checked": len(websites),
        "drops_detected": drops_detected,
        "gains_detected": gains_detected,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@celery.task(name="app.tasks.autonomous_tasks.monitor_ai_visibility")
def monitor_ai_visibility():
    """Hourly: Track AI search visibility signals."""
    return _run_async(_do_monitor_ai_visibility())


async def _do_monitor_ai_visibility():
    """
    Hourly AI visibility health check.

    Signals checked per website:
      - ai_visibility_score < 30  → critical, fire orchestrator event
      - aeo_score == 0            → no AEO work done, nudge
      - has_schema == False       → missing structured data
      - llms.txt reachable        → quick HTTP probe (best-effort, 3 s timeout)
      - last crawl has FAQ schema → faq_schema flag
    """
    import httpx
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.website import Website
    from app.models.crawl import Crawl, CrawlStatus, Page
    from app.services.activity_logger import log_activity

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    critical_count = 0
    improved_count = 0
    checked = 0

    async with Session() as db:
        ws_result = await db.execute(
            select(Website).where(Website.is_active == True, Website.deleted_at == None)
        )
        websites = ws_result.scalars().all()

        for website in websites:
            checked += 1
            issues: list[str] = []

            # ── Signal 1: AI visibility score ────────────────────────────
            ai_score = website.ai_visibility_score or 0
            aeo_score = website.aeo_score or 0

            if ai_score > 0 and ai_score < 30:
                issues.append(f"ai_visibility_score={ai_score} (critical <30)")
                critical_count += 1

                try:
                    from app.api.orchestrator import _log_decision
                    _log_decision(
                        decision=f"AI visibility critical: {website.domain} score={ai_score}/100",
                        agent="AEO Monitor",
                        task="ai_visibility_drop",
                        priority="high",
                    )
                except Exception:
                    pass

                await log_activity(
                    db=db,
                    activity_type="alert",
                    level="warning",
                    agent="AEO Monitor",
                    message=f"⚠️ {website.domain} AI visibility score is critically low ({ai_score}/100). Run AEO audit.",
                    website_id=str(website.id),
                    website_domain=website.domain,
                    is_milestone=False,
                )

            elif ai_score >= 80 and aeo_score >= 70:
                improved_count += 1
                # Only milestone once — check if we already logged recently via last crawl
                # (no persistent flag; just log if score is great, fire at most 1/day via beat)

            # ── Signal 2: AEO score still at zero (no audit run yet) ─────
            if aeo_score == 0 and ai_score == 0:
                issues.append("no_aeo_audit")

            # ── Signal 3: Schema missing (from last completed crawl) ──────
            crawl_result = await db.execute(
                select(Crawl)
                .where(Crawl.website_id == website.id, Crawl.status == CrawlStatus.completed)
                .order_by(Crawl.completed_at.desc())
                .limit(1)
            )
            last_crawl = crawl_result.scalar_one_or_none()

            has_faq_schema = False
            schema_coverage = 0.0
            if last_crawl:
                pages_result = await db.execute(
                    select(Page).where(Page.crawl_id == last_crawl.id)
                )
                pages = pages_result.scalars().all()
                if pages:
                    schema_pages = sum(1 for p in pages if p.has_schema)
                    schema_coverage = schema_pages / len(pages)
                    has_faq_schema = any(
                        "FAQPage" in (p.schema_types or []) or "faq" in str(p.schema_types or "").lower()
                        for p in pages
                    )

            if schema_coverage < 0.2 and last_crawl:
                issues.append(f"schema_coverage={schema_coverage:.0%}")

            # ── Signal 4: llms.txt probe (best-effort) ───────────────────
            has_llms_txt = False
            try:
                domain = website.domain.lstrip("www.").rstrip("/")
                url = f"https://{domain}/llms.txt"
                async with httpx.AsyncClient(timeout=3.0, follow_redirects=True) as client:
                    resp = await client.get(url)
                    has_llms_txt = resp.status_code == 200 and len(resp.text) > 10
            except Exception:
                has_llms_txt = False  # probe failed → treat as missing, not critical

            # ── Composite AEO readiness nudge ────────────────────────────
            # If ≥ 3 signals missing and score is 0, log a single nudge
            if len(issues) >= 2 and ai_score == 0 and not has_llms_txt:
                try:
                    from app.api.orchestrator import _log_decision
                    _log_decision(
                        decision=f"AEO gaps: {website.domain} missing llms.txt + schema ({', '.join(issues[:2])})",
                        agent="AEO Monitor",
                        task="aeo_readiness",
                        priority="normal",
                    )
                except Exception:
                    pass

        await db.commit()

    return {
        "status": "ai_visibility_checked",
        "websites_checked": checked,
        "critical_count": critical_count,
        "improved_count": improved_count,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════
# DAILY TASKS
# ═══════════════════════════════════════════════════════════════════

@celery.task(name="app.tasks.autonomous_tasks.daily_blog_ideas")
def daily_blog_ideas():
    """Daily: Generate blog ideas for all active clients."""
    return _run_async(_do_daily_blog_ideas())


async def _do_daily_blog_ideas():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.client import Client
    from app.models.website import Website
    from app.models.blog_idea import BlogIdea, BlogIdeaIntent
    from app.agents.blog_idea_agent import BlogIdeaAgent

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    agent = BlogIdeaAgent()
    total_ideas = 0

    async with Session() as db:
        result = await db.execute(select(Client).where(Client.is_active == True))
        clients = result.scalars().all()

        for client in clients:
            ws_result = await db.execute(select(Website).where(Website.client_id == client.id, Website.is_active == True))
            websites = ws_result.scalars().all()

            for website in websites:
                try:
                    context = {
                        "domain": website.domain,
                        "industry": client.industry or "general",
                        "existing_topics": [],
                        "top_keywords": [],
                    }
                    result_data = await agent.generate_ideas(context)
                    ideas = result_data.get("ideas", [])

                    for idea_data in ideas[:10]:  # max 10 ideas per website per day
                        intent_str = idea_data.get("search_intent", "informational")
                        try:
                            intent = BlogIdeaIntent(intent_str)
                        except ValueError:
                            intent = BlogIdeaIntent.informational

                        idea = BlogIdea(
                            client_id=str(client.id),
                            website_id=str(website.id),
                            title=idea_data.get("title", "Blog Idea"),
                            target_keyword=idea_data.get("target_keyword", ""),
                            secondary_keywords=idea_data.get("secondary_keywords", []),
                            search_intent=intent,
                            source=idea_data.get("source", "ai_generated"),
                            ai_reasoning=idea_data.get("ai_reasoning", ""),
                            suggested_outline=idea_data.get("suggested_outline", []),
                            suggested_faqs=idea_data.get("suggested_faqs", []),
                            priority_score=idea_data.get("priority_score", 50),
                            is_ai_friendly=idea_data.get("is_ai_friendly", False),
                            is_seasonal=idea_data.get("is_seasonal", False),
                            content_gap=idea_data.get("content_gap", False),
                        )
                        db.add(idea)
                        total_ideas += 1

                    await db.commit()
                except Exception as e:
                    await db.rollback()
                    print(f"Blog idea generation failed for {website.domain}: {e}")

    return {"status": "daily_blog_ideas_complete", "ideas_generated": total_ideas, "timestamp": datetime.now(timezone.utc).isoformat()}


@celery.task(name="app.tasks.autonomous_tasks.daily_backlink_scan")
def daily_backlink_scan():
    """Daily: Scan and save backlink opportunities for all clients."""
    return _run_async(_do_daily_backlink_scan())


async def _do_daily_backlink_scan():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.client import Client
    from app.models.website import Website
    from app.models.backlink import BacklinkOpportunity, BacklinkType, BacklinkStatus
    from app.agents.backlink_agent import BacklinkAgent

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    agent = BacklinkAgent()
    total_opps = 0

    async with Session() as db:
        result = await db.execute(select(Client).where(Client.is_active == True))
        clients = result.scalars().all()

        for client in clients:
            ws_result = await db.execute(select(Website).where(Website.client_id == client.id, Website.is_active == True))
            websites = ws_result.scalars().all()

            for website in websites:
                try:
                    context = {
                        "domain": website.domain,
                        "industry": client.industry or "general",
                        "website_id": str(website.id),
                    }
                    result_data = await agent.find_opportunities(context)
                    opps = result_data.get("opportunities", [])

                    for opp_data in opps[:20]:
                        type_str = opp_data.get("type", "directory")
                        try:
                            btype = BacklinkType(type_str)
                        except ValueError:
                            btype = BacklinkType.directory

                        opp = BacklinkOpportunity(
                            client_id=str(client.id),
                            website_id=str(website.id),
                            source_domain=opp_data.get("source_domain", opp_data.get("platform", "")),
                            source_url=opp_data.get("source_url", ""),
                            platform=opp_data.get("platform", ""),
                            type=btype,
                            status=BacklinkStatus.opportunity,
                            domain_authority=opp_data.get("domain_authority", 0),
                            relevance_score=opp_data.get("relevance_score", 50),
                            is_dofollow=opp_data.get("is_dofollow", True),
                            notes=opp_data.get("notes", ""),
                            ai_reasoning=opp_data.get("ai_reasoning", ""),
                        )
                        db.add(opp)
                        total_opps += 1

                    await db.commit()
                except Exception as e:
                    await db.rollback()
                    print(f"Backlink scan failed for {website.domain}: {e}")

    return {"status": "daily_backlink_scan_complete", "opportunities_found": total_opps}


@celery.task(name="app.tasks.autonomous_tasks.daily_excel_reports")
def daily_excel_reports():
    """Daily: Generate Excel reports for all clients and save to disk."""
    return _run_async(_do_daily_excel_reports())


async def _do_daily_excel_reports():
    import os
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.client import Client
    from app.models.website import Website
    from app.models.crawl import Crawl, CrawlStatus, SEOIssue
    from app.models.task import Task
    from app.models.blog_idea import BlogIdea
    from app.models.backlink import BacklinkOpportunity
    from app.services.excel_exporter import generate_full_report

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    reports_dir = "/tmp/seo_os_reports"
    os.makedirs(reports_dir, exist_ok=True)

    async with Session() as db:
        result = await db.execute(select(Client).where(Client.is_active == True))
        clients = result.scalars().all()

        for client in clients:
            try:
                # Gather data
                ws_result = await db.execute(select(Website).where(Website.client_id == client.id))
                websites = ws_result.scalars().all()

                tasks_result = await db.execute(select(Task).where(Task.client_id == client.id))
                tasks = tasks_result.scalars().all()

                ideas_result = await db.execute(select(BlogIdea).where(BlogIdea.client_id == client.id))
                ideas = ideas_result.scalars().all()

                opps_result = await db.execute(select(BacklinkOpportunity).where(BacklinkOpportunity.client_id == client.id))
                opps = opps_result.scalars().all()

                # Get latest crawl issues
                issues = []
                for website in websites:
                    crawl_result = await db.execute(
                        select(Crawl)
                        .where(Crawl.website_id == website.id, Crawl.status == CrawlStatus.completed)
                        .order_by(Crawl.completed_at.desc())
                        .limit(1)
                    )
                    crawl = crawl_result.scalar_one_or_none()
                    if crawl:
                        iss_result = await db.execute(select(SEOIssue).where(SEOIssue.crawl_id == crawl.id))
                        issues.extend(iss_result.scalars().all())

                data = {
                    "domain": client.name,
                    "seo_score": client.seo_health_score,
                    "summary": {"pages_crawled": 0, "total_issues": len(issues), "critical_issues": sum(1 for i in issues if str(i.severity) == "critical")},
                    "issues": [{"issue_type": str(i.issue_type), "severity": str(i.severity), "page_url": i.page_url, "description": i.description, "impact_score": i.impact_score} for i in issues],
                    "tasks": [{"title": t.title, "category": str(t.category or ""), "priority": str(t.priority), "status": str(t.status), "description": t.description, "ai_generated": t.ai_generated, "estimated_impact": t.estimated_impact, "page_url": t.page_url} for t in tasks],
                    "ideas": [{"title": i.title, "target_keyword": i.target_keyword, "search_intent": str(i.search_intent or ""), "priority_score": i.priority_score, "source": i.source, "is_ai_friendly": i.is_ai_friendly, "is_seasonal": i.is_seasonal, "content_gap": i.content_gap, "ai_reasoning": i.ai_reasoning} for i in ideas],
                    "opportunities": [{"platform": o.platform, "type": str(o.type), "domain_authority": o.domain_authority, "relevance_score": o.relevance_score, "is_dofollow": o.is_dofollow, "source_url": o.source_url, "notes": o.notes, "status": str(o.status), "ai_reasoning": o.ai_reasoning} for o in opps],
                }

                excel_bytes = generate_full_report(data)
                filename = f"{reports_dir}/{client.slug}_seo_report_{datetime.now():%Y%m%d}.xlsx"
                with open(filename, "wb") as f:
                    f.write(excel_bytes)

            except Exception as e:
                print(f"Excel report failed for {client.name}: {e}")

    return {"status": "daily_excel_reports_complete", "reports_dir": reports_dir}


@celery.task(name="app.tasks.autonomous_tasks.detect_content_gaps")
def detect_content_gaps():
    """Daily: Detect content gaps using AI semantic analysis."""
    return _run_async(_do_detect_content_gaps())


async def _do_detect_content_gaps():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.client import Client
    from app.models.website import Website
    from app.models.crawl import Crawl, CrawlStatus, Page
    from app.agents.semantic_seo_agent import SemanticSEOAgent

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    agent = SemanticSEOAgent()
    processed = 0

    async with Session() as db:
        result = await db.execute(select(Client).where(Client.is_active == True))
        clients = result.scalars().all()

        for client in clients:
            ws_result = await db.execute(select(Website).where(Website.client_id == client.id, Website.is_active == True))
            websites = ws_result.scalars().all()

            for website in websites:
                crawl_result = await db.execute(
                    select(Crawl)
                    .where(Crawl.website_id == website.id, Crawl.status == CrawlStatus.completed)
                    .order_by(Crawl.completed_at.desc())
                    .limit(1)
                )
                crawl = crawl_result.scalar_one_or_none()
                if not crawl:
                    continue

                pages_result = await db.execute(select(Page).where(Page.crawl_id == crawl.id).limit(30))
                pages = pages_result.scalars().all()

                try:
                    context = {
                        "domain": website.domain,
                        "industry": client.industry or "general",
                        "pages": [{"url": p.url, "title": p.title or "", "word_count": p.word_count or 0, "has_schema": p.has_schema} for p in pages],
                    }
                    analysis = await agent.analyze(context)

                    # Store content clusters from the analysis
                    from app.models.content_cluster import ContentCluster, ClusterStatus
                    for cluster_data in analysis.get("topic_clusters", [])[:5]:
                        cluster = ContentCluster(
                            client_id=str(client.id),
                            website_id=str(website.id),
                            topic=cluster_data.get("topic", ""),
                            pillar_keyword=cluster_data.get("pillar_keyword", ""),
                            cluster_pages=cluster_data.get("existing_pages", []),
                            content_gaps=cluster_data.get("content_gaps", []),
                            topical_authority_score=analysis.get("topical_authority_score", 0),
                            coverage_score=cluster_data.get("coverage_score", 0),
                            ai_analysis=analysis,
                            ai_recommendations=analysis.get("tasks", []),
                        )
                        db.add(cluster)
                    await db.commit()
                    processed += 1
                except Exception as e:
                    await db.rollback()
                    print(f"Content gap detection failed for {website.domain}: {e}")

    return {"status": "content_gaps_detected", "websites_processed": processed}


# ═══════════════════════════════════════════════════════════════════
# WEEKLY TASKS
# ═══════════════════════════════════════════════════════════════════

@celery.task(name="app.tasks.autonomous_tasks.weekly_competitor_analysis")
def weekly_competitor_analysis():
    """Weekly: Full competitor gap analysis for all clients."""
    return _run_async(_do_weekly_competitor_analysis())


async def _do_weekly_competitor_analysis():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.client import Client
    from app.models.website import Website
    from app.models.task import Task, TaskPriority, TaskCategory
    from app.agents.competitor_agent import CompetitorAgent

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    agent = CompetitorAgent()
    processed = 0

    async with Session() as db:
        result = await db.execute(select(Client).where(Client.is_active == True))
        clients = result.scalars().all()

        for client in clients:
            ws_result = await db.execute(select(Website).where(Website.client_id == client.id, Website.is_active == True))
            websites = ws_result.scalars().all()

            for website in websites:
                try:
                    context = {
                        "domain": website.domain,
                        "industry": client.industry or "general",
                        "competitor_domains": [],  # In production: load from DB
                    }
                    analysis = await agent.analyze(context)

                    # Create tasks from competitor analysis
                    for task_data in analysis.get("tasks", [])[:5]:
                        priority_str = task_data.get("priority", "medium")
                        try:
                            priority = TaskPriority(priority_str)
                        except ValueError:
                            priority = TaskPriority.medium

                        task = Task(
                            client_id=str(client.id),
                            website_id=str(website.id),
                            title=task_data.get("title", "Competitor Analysis Task"),
                            description=task_data.get("description", ""),
                            priority=priority,
                            category=TaskCategory.competitor,
                            ai_generated=True,
                            ai_reasoning="Generated by weekly competitor analysis agent",
                            estimated_impact=task_data.get("estimated_impact", 60),
                        )
                        db.add(task)

                    await db.commit()
                    processed += 1
                except Exception as e:
                    await db.rollback()
                    print(f"Competitor analysis failed for {website.domain}: {e}")

    return {"status": "weekly_competitor_analysis_complete", "websites_processed": processed}


@celery.task(name="app.tasks.autonomous_tasks.weekly_ai_search_audit")
def weekly_ai_search_audit():
    """Weekly: AI search optimization audit for all websites."""
    return _run_async(_do_weekly_ai_search_audit())


async def _do_weekly_ai_search_audit():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.client import Client
    from app.models.website import Website
    from app.models.crawl import Crawl, CrawlStatus, Page
    from app.models.task import Task, TaskPriority, TaskCategory
    from app.agents.ai_search_agent import AISearchAgent

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    agent = AISearchAgent()
    processed = 0

    async with Session() as db:
        result = await db.execute(select(Client).where(Client.is_active == True))
        clients = result.scalars().all()

        for client in clients:
            ws_result = await db.execute(select(Website).where(Website.client_id == client.id, Website.is_active == True))
            websites = ws_result.scalars().all()

            for website in websites:
                crawl_result = await db.execute(
                    select(Crawl)
                    .where(Crawl.website_id == website.id, Crawl.status == CrawlStatus.completed)
                    .order_by(Crawl.completed_at.desc())
                    .limit(1)
                )
                crawl = crawl_result.scalar_one_or_none()
                if not crawl:
                    continue

                pages_result = await db.execute(select(Page).where(Page.crawl_id == crawl.id).limit(20))
                pages = pages_result.scalars().all()

                try:
                    context = {
                        "domain": website.domain,
                        "industry": client.industry or "general",
                        "pages": [{"url": p.url, "title": p.title or "", "has_schema": p.has_schema} for p in pages],
                    }
                    analysis = await agent.analyze(context)

                    # Update website AI score
                    website.ai_visibility_score = analysis.get("ai_visibility_score", 0)

                    # Create AI search tasks
                    for task_data in analysis.get("tasks", [])[:5]:
                        priority_str = task_data.get("priority", "medium")
                        try:
                            priority = TaskPriority(priority_str)
                        except ValueError:
                            priority = TaskPriority.medium

                        task = Task(
                            client_id=str(client.id),
                            website_id=str(website.id),
                            title=task_data.get("title", "AI Search Task"),
                            description=task_data.get("description", ""),
                            priority=priority,
                            category=TaskCategory.ai_search,
                            ai_generated=True,
                            ai_reasoning="Generated by weekly AI search optimization agent",
                            estimated_impact=task_data.get("estimated_impact", 70),
                        )
                        db.add(task)

                    await db.commit()
                    processed += 1
                except Exception as e:
                    await db.rollback()
                    print(f"AI search audit failed for {website.domain}: {e}")

    return {"status": "weekly_ai_search_audit_complete", "websites_processed": processed}


@celery.task(name="app.tasks.autonomous_tasks.weekly_semantic_audit")
def weekly_semantic_audit():
    """Weekly: Full semantic SEO and topical authority analysis."""
    return _run_async(_do_weekly_semantic_audit())


async def _do_weekly_semantic_audit():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.client import Client
    from app.models.website import Website
    from app.models.crawl import Crawl, CrawlStatus, Page
    from app.models.task import Task, TaskPriority, TaskCategory
    from app.agents.semantic_seo_agent import SemanticSEOAgent

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    agent = SemanticSEOAgent()
    processed = 0

    async with Session() as db:
        result = await db.execute(select(Client).where(Client.is_active == True))
        clients = result.scalars().all()

        for client in clients:
            ws_result = await db.execute(select(Website).where(Website.client_id == client.id, Website.is_active == True))
            websites = ws_result.scalars().all()

            for website in websites:
                crawl_result = await db.execute(
                    select(Crawl)
                    .where(Crawl.website_id == website.id, Crawl.status == CrawlStatus.completed)
                    .order_by(Crawl.completed_at.desc())
                    .limit(1)
                )
                crawl = crawl_result.scalar_one_or_none()
                if not crawl:
                    continue

                pages_result = await db.execute(select(Page).where(Page.crawl_id == crawl.id).limit(30))
                pages = pages_result.scalars().all()

                try:
                    context = {
                        "domain": website.domain,
                        "industry": client.industry or "general",
                        "pages": [{"url": p.url, "title": p.title or "", "word_count": p.word_count or 0, "has_schema": p.has_schema} for p in pages],
                    }
                    analysis = await agent.analyze(context)

                    for task_data in analysis.get("tasks", [])[:5]:
                        priority_str = task_data.get("priority", "medium")
                        try:
                            priority = TaskPriority(priority_str)
                        except ValueError:
                            priority = TaskPriority.medium

                        task = Task(
                            client_id=str(client.id),
                            website_id=str(website.id),
                            title=task_data.get("title", "Semantic SEO Task"),
                            description=task_data.get("description", ""),
                            priority=priority,
                            category=TaskCategory.content,
                            ai_generated=True,
                            ai_reasoning="Generated by weekly semantic SEO agent",
                            estimated_impact=task_data.get("estimated_impact", 65),
                        )
                        db.add(task)

                    await db.commit()
                    processed += 1
                except Exception as e:
                    await db.rollback()
                    print(f"Semantic audit failed for {website.domain}: {e}")

    return {"status": "weekly_semantic_audit_complete", "websites_processed": processed}
