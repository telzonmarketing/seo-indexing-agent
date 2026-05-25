.PHONY: help up down dev backend frontend worker setup-ollama db-reset logs prod-up prod-down prod-logs prod-update deploy-vps nginx-reload nginx-test subdomain-setup ssl missioncontrol pm2-start pm2-stop pm2-logs client-dirs

help:
	@echo ""
	@echo "  SEO OS — Commands"
	@echo "  ─────────────────────────────────────────────────────────"
	@echo "  Dev"
	@echo "  make up               Start all services (Docker)"
	@echo "  make down             Stop all services"
	@echo "  make dev              Run backend + frontend locally (no Docker)"
	@echo "  make backend          Run FastAPI backend only"
	@echo "  make frontend         Run Next.js frontend only"
	@echo "  make worker           Run Celery worker"
	@echo "  make logs             Tail all Docker logs"
	@echo ""
	@echo "  Setup"
	@echo "  make setup-env        Copy .env.example to .env"
	@echo "  make setup-ollama     Pull AI models via Ollama"
	@echo "  make create-admin     Create admin user"
	@echo "  make db-reset         Drop and recreate database"
	@echo "  make install          Install all dependencies"
	@echo ""
	@echo "  NGINX / Subdomains (run on VPS as root)"
	@echo "  make nginx-test       Test NGINX config"
	@echo "  make nginx-reload     Reload NGINX config"
	@echo "  make subdomain-setup  Install NGINX subdomain configs"
	@echo "  make ssl              Issue SSL certs for all subdomains"
	@echo "  make missioncontrol   Open Mission Control URL"
	@echo ""
	@echo "  PM2 (non-Docker)"
	@echo "  make pm2-start        Start all processes with PM2"
	@echo "  make pm2-stop         Stop all PM2 processes"
	@echo "  make pm2-logs         Tail PM2 logs"
	@echo ""
	@echo "  Production"
	@echo "  make prod-up          Start production Docker stack"
	@echo "  make prod-down        Stop production Docker stack"
	@echo "  make prod-update      Pull + rebuild + restart production"
	@echo "  make prod-backup      Backup production database"
	@echo "  make deploy-vps VPS=root@IP  Sync + deploy to VPS"
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

# ── NGINX / Subdomains ────────────────────────────────────────────────────────

nginx-test:
	nginx -t

nginx-reload:
	nginx -t && systemctl reload nginx
	@echo "✓ NGINX reloaded"

subdomain-setup:
	@echo "Installing NGINX subdomain configs..."
	@[ -d nginx/sites-available ] || (echo "Run from project root" && exit 1)
	@for conf in admin api missioncontrol dev staging status alex hunter brain aeo backlinks semantic crawler; do \
		cp nginx/sites-available/$$conf.conf /etc/nginx/sites-available/$$conf.conf 2>/dev/null || true; \
		ln -sf /etc/nginx/sites-available/$$conf.conf /etc/nginx/sites-enabled/ 2>/dev/null || true; \
	done
	nginx -t && systemctl reload nginx
	@echo "✓ All 13 subdomain configs installed and NGINX reloaded"

ssl:
	@echo "Issuing SSL certificates for all subdomains..."
	@echo "Make sure ALL DNS A records point to this server first."
	certbot --nginx \
		-d admin.telzonmarketing.in \
		-d api.telzonmarketing.in \
		-d missioncontrol.telzonmarketing.in \
		-d dev.telzonmarketing.in \
		-d staging.telzonmarketing.in \
		-d status.telzonmarketing.in \
		-d alex.telzonmarketing.in \
		-d hunter.telzonmarketing.in \
		-d brain.telzonmarketing.in \
		-d aeo.telzonmarketing.in \
		-d backlinks.telzonmarketing.in \
		-d semantic.telzonmarketing.in \
		-d crawler.telzonmarketing.in \
		--non-interactive --agree-tos --email rohitgolar@gmail.com --redirect
	@echo "✓ SSL certificates issued for 13 subdomains"

ssl-renew:
	certbot renew --dry-run && certbot renew
	@echo "✓ Certificates renewed"

missioncontrol:
	@echo "Mission Control: https://missioncontrol.telzonmarketing.in"
	@which open && open https://missioncontrol.telzonmarketing.in || true

# ── PM2 (non-Docker) ─────────────────────────────────────────────────────────

pm2-start:
	@mkdir -p logs
	pm2 start ecosystem.config.js --env production
	pm2 save
	@echo "✓ All services running via PM2"

pm2-stop:
	pm2 stop ecosystem.config.js

pm2-logs:
	pm2 logs

pm2-restart:
	pm2 restart ecosystem.config.js

# ── Client Directories ────────────────────────────────────────────────────────

client-dirs:
	@echo "Creating data directory structure..."
	mkdir -p /tmp/seo-os/clients
	mkdir -p /tmp/seo-os/archive
	@echo "✓ Base data dirs created at /tmp/seo-os"

# ── Production (Hostinger VPS) ────────────────────────────────────────────────

prod-up:
	docker compose -f docker-compose.production.yml up -d

prod-down:
	docker compose -f docker-compose.production.yml down

prod-logs:
	docker compose -f docker-compose.production.yml logs -f

prod-update:
	git pull
	docker compose -f docker-compose.production.yml build
	docker compose -f docker-compose.production.yml up -d --remove-orphans

prod-ps:
	docker compose -f docker-compose.production.yml ps

prod-backup:
	docker compose -f docker-compose.production.yml exec postgres \
		pg_dump -U seo seoos > backup_$(shell date +%Y%m%d_%H%M).sql
	@echo "✓ Backup saved"

# Push code to VPS (run on your Mac)
# Usage: make deploy-vps VPS=root@YOUR_IP
deploy-vps:
	@[ -n "$(VPS)" ] || (echo "Usage: make deploy-vps VPS=root@YOUR_IP" && exit 1)
	rsync -avz --progress \
		--exclude node_modules \
		--exclude .next \
		--exclude __pycache__ \
		--exclude '*.pyc' \
		--exclude .git \
		--exclude reports \
		. $(VPS):/opt/seoos/
	ssh $(VPS) "cd /opt/seoos && bash deploy/deploy.sh"
