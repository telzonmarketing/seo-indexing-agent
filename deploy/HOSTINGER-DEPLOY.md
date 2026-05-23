# Hostinger VPS Deployment Guide

Full step-by-step guide to deploy SEO OS on a Hostinger VPS.

---

## Prerequisites

- Hostinger VPS (KVM1 or higher)
- SSH access to your VPS
- Your code on GitHub (or you'll upload via SCP)

---

## Step 1 — SSH into your VPS

```bash
ssh root@YOUR_VPS_IP
```

Get your VPS IP from: **hpanel.hostinger.com → VPS → Manage → Overview**

---

## Step 2 — Run server setup (one time only)

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/deploy/server-setup.sh | bash
```

Or if you've already uploaded the project:

```bash
bash /opt/seoos/deploy/server-setup.sh
```

This installs: Docker, Nginx, Certbot, Ollama, configures firewall, creates swap.

---

## Step 3 — Upload your project

### Option A — From GitHub (recommended)

```bash
cd /opt/seoos
git clone https://github.com/YOUR_USER/seo-indexing-agent.git .
```

### Option B — From your Mac via SCP

```bash
# Run this on your Mac (not the VPS):
rsync -avz \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude '__pycache__' \
  /Users/rohit/Desktop/code/seo-indexing-agent/ \
  root@YOUR_VPS_IP:/opt/seoos/
```

---

## Step 4 — Configure environment

```bash
cd /opt/seoos

# Copy env template
cp backend/.env.example backend/.env

# Edit it
nano backend/.env
```

**Minimum required settings to change:**

```env
SECRET_KEY=your-random-64-char-string-here

# Keep these as-is for Docker networking:
DATABASE_URL=postgresql+asyncpg://seo:seopass@postgres:5432/seoos
REDIS_URL=redis://redis:6379/0
OLLAMA_HOST=http://host.docker.internal:11434

# Set model based on your RAM:
# 4GB VPS  → llama3.2:3b
# 8GB VPS  → deepseek-r1:8b
# 16GB VPS → deepseek-r1:14b
OLLAMA_MODEL=deepseek-r1:8b
```

**Generate a secure SECRET_KEY:**
```bash
openssl rand -hex 32
```

---

## Step 5 — Deploy

### Without a domain (IP access):
```bash
cd /opt/seoos
bash deploy/deploy.sh
```

### With a domain:
```bash
# First, point your domain's A record to your VPS IP
# Then wait ~5 min for DNS, then run:
bash deploy/deploy.sh --domain yourdomain.com
```

---

## Step 6 — Access your SEO OS

| URL | What |
|-----|------|
| `http://YOUR_IP` | Dashboard (no domain) |
| `https://yourdomain.com` | Dashboard (with domain + SSL) |
| `https://yourdomain.com/docs` | API documentation |

**Default login:**
- Email: `admin@agency.com`
- Password: `changeme123!`

**Change your password immediately after first login.**

---

## Domain Setup (Hostinger DNS)

1. Go to **hpanel.hostinger.com → Domains → DNS Zone**
2. Add/edit the **A record**:
   - Name: `@`
   - Points to: `YOUR_VPS_IP`
   - TTL: 3600
3. Add a **CNAME** for www:
   - Name: `www`
   - Points to: `yourdomain.com`
4. Wait 5-30 minutes for DNS propagation
5. Run `bash deploy/deploy.sh --domain yourdomain.com`

---

## Updating the App

After pushing code changes:

```bash
ssh root@YOUR_VPS_IP
bash /opt/seoos/deploy/update.sh
```

---

## Useful Commands

```bash
# Check service status
docker compose -f /opt/seoos/docker-compose.production.yml ps

# View live logs
docker compose -f /opt/seoos/docker-compose.production.yml logs -f api
docker compose -f /opt/seoos/docker-compose.production.yml logs -f worker

# Restart a service
docker compose -f /opt/seoos/docker-compose.production.yml restart api

# Stop everything
docker compose -f /opt/seoos/docker-compose.production.yml down

# Database backup
docker compose -f /opt/seoos/docker-compose.production.yml exec postgres \
  pg_dump -U seo seoos > backup_$(date +%Y%m%d).sql

# Check Ollama models
ollama list

# Pull a different model
ollama pull qwen2.5:7b
```

---

## VPS RAM Guide

| Plan | RAM | Recommended AI Model | Max Clients |
|------|-----|---------------------|-------------|
| KVM1 | 4GB | `llama3.2:3b` | ~5-10 |
| KVM2 | 8GB | `deepseek-r1:8b` | ~20-30 |
| KVM4 | 16GB | `deepseek-r1:14b` | ~50+ |
| KVM8 | 32GB | `deepseek-r1:32b` | Unlimited |

---

## Troubleshooting

**Services not starting:**
```bash
docker compose -f /opt/seoos/docker-compose.production.yml logs postgres
docker compose -f /opt/seoos/docker-compose.production.yml logs api
```

**Ollama not responding:**
```bash
systemctl status ollama
systemctl restart ollama
curl http://localhost:11434/api/tags
```

**Out of disk space:**
```bash
df -h
docker system prune -f   # remove unused images/containers
```

**SSL certificate renewal (auto, but manual if needed):**
```bash
certbot renew --dry-run
certbot renew
```

**Check nginx config:**
```bash
nginx -t
systemctl status nginx
```
