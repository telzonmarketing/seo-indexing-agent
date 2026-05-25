from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db
from app.api import auth, clients, websites, crawls, tasks, reports, dashboard
from app.api import blog_ideas, backlinks, content_clusters, autonomous, exports
from app.api import website_setup, alerts, brain, activity, health, aeo, alex, rankings, mission_control
from app.api import orchestrator, automation_rules, hunter, integrations


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="SEO OS API",
    description="Internal AI SEO Operating System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://admin.telzonmarketing.in",
        "https://missioncontrol.telzonmarketing.in",
        "https://dev.telzonmarketing.in",
        "https://staging.telzonmarketing.in",
        "https://*.telzonmarketing.in",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(clients.router, prefix="/api")
app.include_router(websites.router, prefix="/api")
app.include_router(crawls.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(blog_ideas.router, prefix="/api")
app.include_router(backlinks.router, prefix="/api")
app.include_router(content_clusters.router, prefix="/api")
app.include_router(autonomous.router, prefix="/api")
app.include_router(exports.router, prefix="/api")
app.include_router(website_setup.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(brain.router, prefix="/api")
app.include_router(activity.router, prefix="/api")
app.include_router(health.router, prefix="/api")
app.include_router(aeo.router, prefix="/api")
app.include_router(alex.router, prefix="/api")
app.include_router(rankings.router, prefix="/api")
app.include_router(mission_control.router, prefix="/api")
app.include_router(orchestrator.router, prefix="/api")
app.include_router(automation_rules.router, prefix="/api")
app.include_router(hunter.router, prefix="/api")
app.include_router(integrations.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "mode": "autonomous"}


@app.get("/")
async def root():
    return {"message": "SEO OS API — running"}
