# SEO OS — AI SEO Operating System

Internal agency SEO platform. AI-agent driven. Self-hosted. Low-cost.

---

## Quick Start (5 minutes)

```bash
# 1. Set up environment files
make setup-env

# 2. Edit backend/.env (set SECRET_KEY at minimum)
nano backend/.env

# 3. Start everything
make up

# 4. Pull AI models (run once)
make setup-ollama

# 5. Create your admin account
make create-admin
```

**Access:**
- Dashboard: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Login: admin@agency.com / changeme

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SEO OS Platform                       │
├─────────────┬───────────────┬───────────────────────────┤
│  Next.js    │   FastAPI     │   Celery Workers           │
│  Frontend   │   Backend     │   (Background Tasks)       │
│  :3000      │   :8000       │                            │
├─────────────┴───────────────┴───────────────────────────┤
│  PostgreSQL  │  Redis  │  Qdrant  │  Ollama              │
│  (main DB)   │  (cache/│  (vector │  (local AI)          │
│              │  queue) │  search) │  :11434              │
└─────────────┴─────────┴──────────┴──────────────────────┘
```

---

## Folder Structure

```
seo-indexing-agent/
├── backend/                    FastAPI Python backend
│   ├── app/
│   │   ├── main.py             FastAPI app entry point
│   │   ├── config.py           Settings (Pydantic)
│   │   ├── database.py         SQLAlchemy async engine
│   │   ├── models/             Database models
│   │   │   ├── client.py       Client companies
│   │   │   ├── website.py      Websites + integrations
│   │   │   ├── crawl.py        Crawls, pages, SEO issues
│   │   │   ├── task.py         Tasks (AI + manual)
│   │   │   ├── report.py       SEO reports
│   │   │   ├── user.py         Team members
│   │   │   └── ranking.py      Keyword rankings
│   │   ├── api/                REST API routes
│   │   │   ├── auth.py         JWT auth
│   │   │   ├── clients.py      Client CRUD
│   │   │   ├── websites.py     Website management
│   │   │   ├── crawls.py       Crawl management
│   │   │   ├── tasks.py        Task management
│   │   │   ├── reports.py      Report generation
│   │   │   └── dashboard.py    Dashboard aggregates
│   │   ├── agents/             AI agent system
│   │   │   ├── base_agent.py   Ollama wrapper
│   │   │   ├── technical_seo_agent.py
│   │   │   ├── content_agent.py
│   │   │   ├── reporting_agent.py
│   │   │   └── (internal linking, competitor — extend here)
│   │   ├── crawler/            SEO crawler
│   │   │   ├── engine.py       httpx async crawler
│   │   │   └── analyzers.py    Page SEO analysis
│   │   ├── tasks/              Celery task queue
│   │   │   ├── celery_app.py   Celery config
│   │   │   └── seo_tasks.py    Crawl + report tasks
│   │   └── core/               Auth + deps
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                   Next.js 15 frontend
│   ├── app/
│   │   ├── (app)/              Auth-protected routes
│   │   │   ├── dashboard/      Main dashboard
│   │   │   ├── clients/        Client management
│   │   │   ├── websites/       Website details
│   │   │   ├── crawls/         Crawl history
│   │   │   ├── tasks/          Kanban task board
│   │   │   ├── reports/        SEO reports
│   │   │   ├── rankings/       Keyword rankings
│   │   │   └── settings/       App settings
│   │   ├── login/              Login page
│   │   └── providers.tsx       React Query + Toaster
│   ├── components/
│   │   ├── layout/             Sidebar, Header
│   │   ├── dashboard/          Score cards, issue lists
│   │   └── ui/                 Button, Card, Badge, etc.
│   ├── lib/
│   │   ├── api.ts              Axios API client
│   │   ├── store.ts            Zustand auth store
│   │   └── utils.ts            Helpers + formatters
│   └── Dockerfile
│
├── docker-compose.yml          Full stack docker setup
├── Makefile                    Dev commands
└── SEO-OS.md                   This file
```

---

## AI Agent System

Each agent wraps Ollama with structured prompts. Falls back gracefully if Ollama is offline.

| Agent | Role | Input | Output |
|-------|------|-------|--------|
| `TechnicalSEOAgent` | Analyzes technical issues | Crawl data + issues | Score, recommendations, tasks |
| `ContentAgent` | Content quality analysis | Page content data | Gaps, briefs, FAQ suggestions |
| `InternalLinkingAgent` | Link structure analysis | Page link graph | Orphan pages, linking suggestions |
| `ReportingAgent` | Executive report writer | All agent outputs | Full audit report |

**To add a new agent:** extend `BaseAgent` in `backend/app/agents/`.

---

## Crawler

- **Engine:** `httpx` async + `BeautifulSoup`
- **Concurrency:** 5 parallel requests (configurable)
- **Detects:**
  - Missing/duplicate titles, H1s, descriptions
  - noindex pages, missing canonicals
  - Schema markup (JSON-LD)
  - Thin content (<300 words)
  - Slow pages (>3s load)
  - Missing alt text
  - Internal link orphans
  - Broken links

---

## Workflow

```
Add Client → Add Website → Connect GSC/GA4 → Run Crawl
     ↓
AI Agents analyze crawl data (Ollama)
     ↓
Technical + Content + Linking scores generated
     ↓
AI tasks auto-created in task board
     ↓
Team reviews → marks done → tracks progress
     ↓
AI generates client report
```

---

## Local AI Setup

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull models (choose based on your hardware)
ollama pull deepseek-r1:8b      # ~5GB — recommended
ollama pull qwen2.5:7b          # ~4.5GB — alternative
ollama pull llama3.2:3b         # ~2GB — lighter option
ollama pull nomic-embed-text    # ~270MB — embeddings
```

**RAM requirements:**
- 8GB RAM → `llama3.2:3b` or `qwen2.5:3b`
- 16GB RAM → `deepseek-r1:8b` or `qwen2.5:7b`
- 32GB RAM → `deepseek-r1:14b` or larger

---

## Google Search Console Integration

1. Create OAuth credentials at console.cloud.google.com
2. Enable Search Console API
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `backend/.env`
4. Connect each website through the website detail page → Integrations

---

## Adding Your First Client

1. Open http://localhost:3000
2. Login with admin@agency.com / changeme
3. Go to Clients → New Client
4. Add client name, email, industry
5. Go to client page → Add Website (enter URL)
6. Click "Crawl" on the website
7. Wait ~2-5 minutes
8. View SEO score, issues, AI recommendations, and auto-generated tasks

---

## Environment Variables

```env
# backend/.env
SECRET_KEY=generate-with-openssl-rand-hex-32
DATABASE_URL=postgresql+asyncpg://seo:seopass@postgres:5432/seoos
REDIS_URL=redis://redis:6379/0
OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=deepseek-r1:8b
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

---

## Extending the System

**Add a new AI agent:**
```python
# backend/app/agents/competitor_agent.py
from app.agents.base_agent import BaseAgent

class CompetitorAgent(BaseAgent):
    name = "CompetitorAgent"
    
    async def analyze(self, data: dict) -> dict:
        prompt = f"Analyze competitors for {data['domain']}..."
        response = await self._call_llm(prompt, json_mode=True)
        return self._parse_json_response(response)
```

**Add a new API route:**
```python
# backend/app/api/rankings.py — then register in main.py
```

**Add a new frontend page:**
```
frontend/app/(app)/competitors/page.tsx
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS, ShadCN UI |
| Backend | FastAPI, Python 3.12, SQLAlchemy async |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 + Celery |
| Vector DB | Qdrant |
| Local AI | Ollama (DeepSeek, Qwen, Llama) |
| Crawler | httpx + BeautifulSoup |
| Auth | JWT (python-jose) |

---

## Cost Estimate (self-hosted)

| Component | Cost |
|-----------|------|
| VPS (4 CPU, 16GB RAM) | ~$40/mo |
| AI (Ollama local) | $0 |
| PostgreSQL | $0 (self-hosted) |
| Redis + Qdrant | $0 (self-hosted) |
| **Total** | **~$40/mo for unlimited clients** |
