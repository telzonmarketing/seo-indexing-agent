.PHONY: help up down dev backend frontend worker setup-ollama db-reset logs

help:
	@echo ""
	@echo "  SEO OS — Commands"
	@echo "  ─────────────────────────────────────────"
	@echo "  make up           Start all services (Docker)"
	@echo "  make down         Stop all services"
	@echo "  make dev          Run backend + frontend locally (no Docker)"
	@echo "  make backend      Run FastAPI backend only"
	@echo "  make frontend     Run Next.js frontend only"
	@echo "  make worker       Run Celery worker"
	@echo "  make setup-ollama Pull AI models via Ollama"
	@echo "  make db-reset     Drop and recreate database"
	@echo "  make logs         Tail all Docker logs"
	@echo ""

# ── Docker ────────────────────────────────────────────────────────────────────

up:
	docker compose up -d
	@echo ""
	@echo "  ✓ SEO OS running:"
	@echo "    Frontend: http://localhost:3000"
	@echo "    API:      http://localhost:8000"
	@echo "    API Docs: http://localhost:8000/docs"
	@echo ""

down:
	docker compose down

logs:
	docker compose logs -f

# ── Local Dev (no Docker) ─────────────────────────────────────────────────────

dev:
	@echo "Starting backend + frontend..."
	@make backend & make frontend

backend:
	cd backend && uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

worker:
	cd backend && celery -A app.tasks.celery_app.celery worker --loglevel=info --concurrency=2

beat:
	cd backend && celery -A app.tasks.celery_app.celery beat --loglevel=info

# ── Setup ─────────────────────────────────────────────────────────────────────

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

setup-ollama:
	@echo "Pulling AI models (this takes a few minutes)..."
	ollama pull deepseek-r1:8b
	ollama pull nomic-embed-text
	@echo "✓ Models ready"

setup-env:
	cp backend/.env.example backend/.env
	cp frontend/.env.local.example frontend/.env.local
	@echo "✓ .env files created — edit backend/.env before starting"

create-admin:
	@echo "Creating admin user..."
	cd backend && python -c "\
import asyncio; \
from app.database import AsyncSessionLocal; \
from app.models.user import User, UserRole; \
from app.core.security import hash_password; \
async def main(): \
    async with AsyncSessionLocal() as db: \
        u = User(email='admin@agency.com', name='Admin', hashed_password=hash_password('changeme'), role=UserRole.admin); \
        db.add(u); await db.commit(); print('✓ Admin created: admin@agency.com / changeme'); \
asyncio.run(main())"

db-reset:
	docker compose exec postgres psql -U seo -c "DROP DATABASE IF EXISTS seoos;"
	docker compose exec postgres psql -U seo -c "CREATE DATABASE seoos;"
	@echo "✓ Database reset"
