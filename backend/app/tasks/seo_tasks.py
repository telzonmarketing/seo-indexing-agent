"""
Celery tasks for SEO crawling, AI analysis, and reporting.
"""
import asyncio
from datetime import datetime, timezone
from celery import current_task
from app.tasks.celery_app import celery


def _run_async(coro):
    """Run async code in sync Celery task."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery.task(bind=True, name="app.tasks.seo_tasks.run_crawl_task", max_retries=2)
def run_crawl_task(self, crawl_id: str, website_id: str, max_pages: int = 200, include_ai: bool = True):
    return _run_async(_run_crawl(self, crawl_id, website_id, max_pages, include_ai))


async def _run_crawl(task, crawl_id: str, website_id: str, max_pages: int, include_ai: bool):
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.crawl import Crawl, CrawlStatus, Page, SEOIssue
    from app.models.website import Website
    from app.crawler.engine import CrawlEngine
    from app.crawler.analyzers import build_issue_list

    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        crawl = await db.scalar(select(Crawl).where(Crawl.id == crawl_id))
        website = await db.scalar(select(Website).where(Website.id == website_id))

        if not crawl or not website:
            return {"error": "Crawl or website not found"}

        crawl.status = CrawlStatus.running
        await db.commit()

        try:
            engine_crawler = CrawlEngine(
                base_url=website.url,
                max_pages=max_pages,
                delay_ms=300,
            )
            result = await engine_crawler.crawl()

            # Compute summary stats
            pages = result.pages
            issues_list = build_issue_list(pages, website_id, crawl_id)

            critical_count = sum(1 for i in issues_list if str(i.get("severity", "")) == "critical")
            high_count = sum(1 for i in issues_list if str(i.get("severity", "")) == "high")
            avg_load = int(sum(p.load_time_ms or 0 for p in pages) / max(len(pages), 1))

            summary = {
                "pages_crawled": len(pages),
                "total_issues": len(issues_list),
                "critical_issues": critical_count,
                "high_issues": high_count,
                "avg_load_time_ms": avg_load,
                "noindex_pages": sum(1 for p in pages if p.has_noindex),
                "missing_titles": sum(1 for p in pages if not p.title),
                "missing_h1": sum(1 for p in pages if not p.h1),
                "thin_content_pages": sum(1 for p in pages if p.word_count < 300),
                "pages_with_schema": sum(1 for p in pages if p.has_schema),
            }

            # Calculate SEO score
            seo_score = max(0, 100 - critical_count * 15 - high_count * 5 - (len(issues_list) - critical_count - high_count) * 1)
            seo_score = min(100, seo_score)

            # Save pages to DB
            for page_data in pages[:500]:
                page = Page(
                    crawl_id=crawl_id,
                    url=page_data.url,
                    status_code=page_data.status_code,
                    title=page_data.title,
                    meta_description=page_data.meta_description,
                    h1=page_data.h1,
                    canonical_url=page_data.canonical_url,
                    is_indexable=page_data.is_indexable,
                    has_noindex=page_data.has_noindex,
                    has_schema=page_data.has_schema,
                    schema_types=page_data.schema_types,
                    word_count=page_data.word_count,
                    internal_links_count=page_data.internal_links_count,
                    external_links_count=page_data.external_links_count,
                    images_count=page_data.images_count,
                    images_missing_alt=page_data.images_missing_alt,
                    load_time_ms=page_data.load_time_ms,
                    page_size_bytes=page_data.page_size_bytes,
                    headings=page_data.headings,
                    content_hash=page_data.content_hash,
                    og_tags=page_data.og_tags,
                )
                db.add(page)

            # Save issues
            for issue_data in issues_list:
                issue = SEOIssue(**issue_data)
                db.add(issue)

            # AI analysis
            ai_audit = {}
            if include_ai:
                crawl_data_for_ai = {
                    "domain": website.domain,
                    "pages": [
                        {
                            "url": p.url,
                            "word_count": p.word_count,
                            "title": p.title,
                            "has_schema": p.has_schema,
                            "meta_description": p.meta_description,
                            "internal_links_count": p.internal_links_count,
                        }
                        for p in pages[:30]
                    ],
                    "issues": [
                        {"severity": str(i.get("severity", "")), "title": i.get("title", ""), "page_url": i.get("page_url", "")}
                        for i in issues_list[:50]
                    ],
                    "summary": summary,
                }

                from app.agents.technical_seo_agent import TechnicalSEOAgent
                from app.agents.content_agent import ContentAgent, InternalLinkingAgent
                from app.agents.reporting_agent import ReportingAgent

                technical_agent = TechnicalSEOAgent()
                content_agent = ContentAgent()
                linking_agent = InternalLinkingAgent()

                technical_analysis, content_analysis, linking_analysis = await asyncio.gather(
                    technical_agent.analyze(crawl_data_for_ai),
                    content_agent.analyze(crawl_data_for_ai),
                    linking_agent.analyze(crawl_data_for_ai),
                )

                reporting_agent = ReportingAgent()
                full_report = await reporting_agent.generate_audit_report({
                    "domain": website.domain,
                    "technical_analysis": technical_analysis,
                    "content_analysis": content_analysis,
                    "linking_analysis": linking_analysis,
                    "crawl_summary": summary,
                })

                ai_audit = {
                    "technical": technical_analysis,
                    "content": content_analysis,
                    "linking": linking_analysis,
                    "report": full_report,
                }

                # Update website scores
                website.technical_score = technical_analysis.get("technical_score", seo_score)
                website.content_score = content_analysis.get("content_score", 50)

                # Create AI tasks
                from app.models.task import Task, TaskPriority, TaskCategory
                from app.models.client import Client

                client_result = await db.execute(select(Client).where(Client.id == website.client_id))
                client = client_result.scalar_one_or_none()

                if client:
                    all_tasks = (
                        technical_analysis.get("tasks", []) +
                        content_analysis.get("content_recommendations", [])[:5]
                    )
                    for t in all_tasks[:10]:
                        priority_str = t.get("priority", "medium")
                        try:
                            priority = TaskPriority(priority_str)
                        except ValueError:
                            priority = TaskPriority.medium

                        ai_task = Task(
                            client_id=str(client.id),
                            website_id=website_id,
                            crawl_id=crawl_id,
                            title=t.get("title", "SEO Task"),
                            description=t.get("description", ""),
                            priority=priority,
                            ai_generated=True,
                            ai_reasoning=t.get("description", ""),
                            estimated_impact=t.get("estimated_impact", 50),
                            category=TaskCategory.technical_seo,
                        )
                        db.add(ai_task)

            # Update crawl record
            crawl.status = CrawlStatus.completed
            crawl.pages_crawled = len(pages)
            crawl.pages_found = result.total_urls_found
            crawl.issues_found = len(issues_list)
            crawl.seo_score = seo_score
            crawl.summary = summary
            crawl.ai_audit = ai_audit
            crawl.completed_at = datetime.now(timezone.utc)

            website.last_crawled_at = datetime.now(timezone.utc)
            website.technical_score = seo_score

            await db.commit()
            return {"status": "completed", "pages": len(pages), "issues": len(issues_list), "score": seo_score}

        except Exception as e:
            crawl.status = CrawlStatus.failed
            crawl.error_message = str(e)
            await db.commit()
            raise


@celery.task(name="app.tasks.seo_tasks.generate_report_task")
def generate_report_task(client_id: str, website_id: str, crawl_id: str, report_type: str):
    return _run_async(_generate_report(client_id, website_id, crawl_id, report_type))


async def _generate_report(client_id, website_id, crawl_id, report_type):
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.crawl import Crawl
    from app.models.report import Report, ReportType
    from app.models.website import Website
    from app.agents.reporting_agent import ReportingAgent

    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        crawl = await db.scalar(select(Crawl).where(Crawl.id == crawl_id)) if crawl_id else None
        website = await db.scalar(select(Website).where(Website.id == website_id)) if website_id else None

        agent = ReportingAgent()
        report_data = await agent.generate_audit_report({
            "domain": website.domain if website else "unknown",
            "technical_analysis": crawl.ai_audit.get("technical", {}) if crawl else {},
            "content_analysis": crawl.ai_audit.get("content", {}) if crawl else {},
            "linking_analysis": crawl.ai_audit.get("linking", {}) if crawl else {},
            "crawl_summary": crawl.summary if crawl else {},
        })

        try:
            rtype = ReportType(report_type)
        except ValueError:
            rtype = ReportType.seo_audit

        report = Report(
            client_id=client_id,
            website_id=website_id,
            crawl_id=crawl_id,
            type=rtype,
            title=report_data.get("title", f"SEO Report"),
            summary=report_data.get("executive_summary", ""),
            content=report_data,
            ai_insights=report_data.get("priority_actions", []),
            recommendations=report_data.get("priority_actions", []),
            scores=report_data.get("score_breakdown", {}),
        )
        db.add(report)
        await db.commit()
        return {"report_id": str(report.id)}


@celery.task(name="app.tasks.seo_tasks.schedule_due_crawls")
def schedule_due_crawls():
    """Check for websites due for a crawl and queue them."""
    return _run_async(_check_due_crawls())


async def _check_due_crawls():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from datetime import timedelta
    from app.config import settings
    from app.models.website import Website

    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        result = await db.execute(select(Website).where(Website.is_active == True))
        websites = result.scalars().all()
        queued = 0
        for website in websites:
            if not website.last_crawled_at:
                due = True
            else:
                due_at = website.last_crawled_at + timedelta(hours=website.crawl_frequency_hours)
                due = now >= due_at

            if due:
                from app.models.crawl import Crawl, CrawlStatus
                crawl = Crawl(
                    website_id=str(website.id),
                    status=CrawlStatus.pending,
                    crawl_config={"max_pages": 200, "deep": False, "include_ai_audit": True},
                )
                db.add(crawl)
                await db.commit()
                await db.refresh(crawl)
                run_crawl_task.delay(str(crawl.id), str(website.id), 200, True)
                queued += 1
        return {"queued": queued}
