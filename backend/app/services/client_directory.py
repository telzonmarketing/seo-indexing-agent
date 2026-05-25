"""
Client Directory Manager — Creates and manages isolated per-client workspaces.

Structure:
/seo-os/clients/{client_id}/
    /website_data/{website_id}/crawl_data/, snapshots/, screenshots/, html/, page_speed/
    /seo_reports/technical/, semantic/, backlinks/, rankings/, ai_visibility/
    /automation/workflows/, cron_logs/, ai_tasks/
    /content/blog_ideas/, generated_content/, faq/, schema/
    /backlinks/opportunities/, submitted/, live_links/, toxic_links/
    /integrations/gsc/, ga4/, pagespeed/, cloudflare/
    /exports/excel/, csv/, pdf/
    config.json
"""
import os
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Use settings if available, fall back to env var for workers that import before app init
try:
    from app.config import settings
    BASE_DIR = Path(settings.SEO_OS_DATA_DIR)
except Exception:
    BASE_DIR = Path(os.environ.get("SEO_OS_DATA_DIR", "/tmp/seo-os"))


def client_dir(client_id: str) -> Path:
    return BASE_DIR / "clients" / client_id


def website_dir(client_id: str, website_id: str) -> Path:
    return client_dir(client_id) / "website_data" / website_id


DIRECTORY_TREE = [
    # Website data (per website — created dynamically)
    # Top-level client dirs:
    "seo_reports/technical",
    "seo_reports/semantic",
    "seo_reports/backlinks",
    "seo_reports/rankings",
    "seo_reports/ai_visibility",
    "automation/workflows",
    "automation/cron_logs",
    "automation/ai_tasks",
    "content/blog_ideas",
    "content/generated_content",
    "content/faq",
    "content/schema",
    "backlinks/opportunities",
    "backlinks/submitted",
    "backlinks/live_links",
    "backlinks/toxic_links",
    "integrations/gsc",
    "integrations/ga4",
    "integrations/pagespeed",
    "integrations/cloudflare",
    "integrations/github",
    "integrations/wordpress",
    "exports/excel",
    "exports/csv",
    "exports/pdf",
    "archive",
]

WEBSITE_SUBDIRS = [
    "crawl_data",
    "snapshots",
    "screenshots",
    "html",
    "page_speed",
]


def init_client_workspace(client_id: str, client_name: str, industry: str = "") -> dict:
    """Create isolated directory workspace for a new client."""
    root = client_dir(client_id)
    root.mkdir(parents=True, exist_ok=True)

    for subpath in DIRECTORY_TREE:
        (root / subpath).mkdir(parents=True, exist_ok=True)

    # Write config.json
    config = {
        "client_id": client_id,
        "client_name": client_name,
        "industry": industry,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "workspace_version": "2.0",
        "autonomous_mode": True,
        "directories": DIRECTORY_TREE,
    }
    (root / "config.json").write_text(json.dumps(config, indent=2))

    return {
        "workspace_root": str(root),
        "directories_created": len(DIRECTORY_TREE),
        "config": config,
    }


def init_website_workspace(client_id: str, website_id: str, domain: str) -> dict:
    """Create per-website data directories inside client workspace."""
    root = website_dir(client_id, website_id)
    root.mkdir(parents=True, exist_ok=True)

    for subdir in WEBSITE_SUBDIRS:
        (root / subdir).mkdir(parents=True, exist_ok=True)

    meta = {
        "website_id": website_id,
        "domain": domain,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    (root / "meta.json").write_text(json.dumps(meta, indent=2))

    return {
        "website_root": str(root),
        "directories": WEBSITE_SUBDIRS,
    }


def get_workspace_info(client_id: str) -> dict:
    """Return workspace info and disk usage for a client."""
    root = client_dir(client_id)
    if not root.exists():
        return {"exists": False, "client_id": client_id}

    config_path = root / "config.json"
    config = json.loads(config_path.read_text()) if config_path.exists() else {}

    # Calculate disk usage
    total_bytes = sum(f.stat().st_size for f in root.rglob("*") if f.is_file())

    # Count files per section
    sections = {}
    for subpath in DIRECTORY_TREE[:6]:  # top sections
        section = subpath.split("/")[0]
        section_path = root / subpath
        if section_path.exists():
            count = sum(1 for _ in section_path.rglob("*") if _.is_file())
            sections[section] = sections.get(section, 0) + count

    # List website directories
    website_data_dir = root / "website_data"
    websites = [d.name for d in website_data_dir.iterdir() if d.is_dir()] if website_data_dir.exists() else []

    return {
        "exists": True,
        "client_id": client_id,
        "workspace_root": str(root),
        "config": config,
        "disk_usage_bytes": total_bytes,
        "disk_usage_mb": round(total_bytes / 1024 / 1024, 2),
        "website_workspaces": websites,
        "sections": sections,
    }


def save_crawl_data(client_id: str, website_id: str, crawl_id: str, data: dict):
    """Save raw crawl data to client workspace."""
    crawl_dir = website_dir(client_id, website_id) / "crawl_data"
    crawl_dir.mkdir(parents=True, exist_ok=True)
    out = crawl_dir / f"{crawl_id}.json"
    out.write_text(json.dumps(data, indent=2, default=str))
    return str(out)


def save_report(client_id: str, report_type: str, filename: str, content: bytes) -> str:
    """Save a generated report (Excel/PDF) to client workspace."""
    report_dir = client_dir(client_id) / "seo_reports" / report_type
    report_dir.mkdir(parents=True, exist_ok=True)
    out = report_dir / filename
    out.write_bytes(content)
    return str(out)


def save_excel_export(client_id: str, filename: str, content: bytes) -> str:
    """Save Excel export to client exports directory."""
    export_dir = client_dir(client_id) / "exports" / "excel"
    export_dir.mkdir(parents=True, exist_ok=True)
    out = export_dir / filename
    out.write_bytes(content)
    return str(out)


def save_blog_idea(client_id: str, idea: dict) -> str:
    """Save blog idea to client content directory."""
    blog_dir = client_dir(client_id) / "content" / "blog_ideas"
    blog_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{idea.get('id', 'idea')}_{datetime.now():%Y%m%d}.json"
    out = blog_dir / filename
    out.write_text(json.dumps(idea, indent=2, default=str))
    return str(out)


def save_schema_snippet(client_id: str, website_id: str, page_url: str, schema_json: dict) -> str:
    """Save AI-generated schema markup snippet."""
    schema_dir = client_dir(client_id) / "content" / "schema"
    schema_dir.mkdir(parents=True, exist_ok=True)
    safe_name = page_url.replace("https://", "").replace("/", "_").replace(".", "_")[:80]
    out = schema_dir / f"{safe_name}.json"
    out.write_text(json.dumps(schema_json, indent=2))
    return str(out)


def archive_client(client_id: str, reason: str = "deleted") -> dict:
    """Move client workspace to archive (soft delete step 1)."""
    root = client_dir(client_id)
    if not root.exists():
        return {"archived": False, "reason": "workspace not found"}

    archive_root = BASE_DIR / "archive" / client_id
    archive_root.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(str(root), str(archive_root), dirs_exist_ok=True)

    # Write archive manifest
    manifest = {
        "client_id": client_id,
        "archived_at": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "original_path": str(root),
        "archive_path": str(archive_root),
    }
    (archive_root / "archive_manifest.json").write_text(json.dumps(manifest, indent=2))

    return {"archived": True, "archive_path": str(archive_root), "manifest": manifest}


def permanent_delete_client(client_id: str) -> dict:
    """Permanently delete client workspace (after 30-day soft delete period)."""
    root = client_dir(client_id)
    deleted = False
    if root.exists():
        shutil.rmtree(str(root))
        deleted = True
    return {"permanently_deleted": deleted, "client_id": client_id}


def list_client_exports(client_id: str) -> list:
    """List all Excel exports for a client."""
    export_dir = client_dir(client_id) / "exports" / "excel"
    if not export_dir.exists():
        return []
    return [
        {
            "filename": f.name,
            "size_kb": round(f.stat().st_size / 1024, 1),
            "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
            "path": str(f),
        }
        for f in sorted(export_dir.glob("*.xlsx"), key=lambda x: x.stat().st_mtime, reverse=True)
    ]


def get_automation_log(client_id: str) -> list:
    """Read automation cron logs for a client."""
    log_dir = client_dir(client_id) / "automation" / "cron_logs"
    if not log_dir.exists():
        return []
    logs = []
    for f in sorted(log_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True)[:50]:
        try:
            logs.append(json.loads(f.read_text()))
        except Exception:
            pass
    return logs


def write_automation_log(client_id: str, task_name: str, result: dict):
    """Write an automation execution log entry."""
    log_dir = client_dir(client_id) / "automation" / "cron_logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    entry = {
        "task": task_name,
        "result": result,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    filename = f"{datetime.now():%Y%m%d_%H%M%S}_{task_name}.json"
    (log_dir / filename).write_text(json.dumps(entry, indent=2, default=str))
