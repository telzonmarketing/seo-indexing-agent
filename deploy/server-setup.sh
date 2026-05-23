#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# SEO OS — Hostinger VPS Server Setup
# Run this ONCE on a fresh Hostinger VPS (Ubuntu 22.04 / 24.04)
# Usage: bash server-setup.sh
# ═══════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════"
echo "  SEO OS — Server Setup"
echo "═══════════════════════════════════════════"
echo ""

# ── 1. System update ─────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
log "System updated"

# ── 2. Install dependencies ───────────────────────────────────────
info "Installing required packages..."
apt-get install -y -qq \
  curl wget git unzip \
  nginx certbot python3-certbot-nginx \
  ufw htop
log "Packages installed"

# ── 3. Docker ─────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  usermod -aG docker "$USER" || true
  log "Docker installed"
else
  log "Docker already installed ($(docker --version))"
fi

# ── 4. Docker Compose v2 ──────────────────────────────────────────
if ! docker compose version &> /dev/null; then
  info "Installing Docker Compose v2..."
  mkdir -p /usr/local/lib/docker/cli-plugins
  COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
  curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  log "Docker Compose $(docker compose version --short) installed"
else
  log "Docker Compose already installed"
fi

# ── 5. Firewall ───────────────────────────────────────────────────
info "Configuring firewall..."
ufw --force reset > /dev/null
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"
ufw --force enable > /dev/null
log "Firewall configured (SSH, HTTP, HTTPS)"

# ── 6. Ollama ─────────────────────────────────────────────────────
if ! command -v ollama &> /dev/null; then
  info "Installing Ollama..."
  curl -fsSL https://ollama.ai/install.sh | sh
  systemctl enable ollama
  systemctl start ollama
  log "Ollama installed and running"
else
  log "Ollama already installed"
fi

# ── 7. App directory ──────────────────────────────────────────────
info "Setting up /opt/seoos directory..."
mkdir -p /opt/seoos
log "App directory: /opt/seoos"

# ── 8. Swap (important for AI on small VPS) ───────────────────────
if [ ! -f /swapfile ]; then
  RAM_GB=$(awk '/MemTotal/ {print int($2/1024/1024)}' /proc/meminfo)
  if [ "$RAM_GB" -le 4 ]; then
    SWAP_SIZE="4G"
  else
    SWAP_SIZE="2G"
  fi
  info "Creating ${SWAP_SIZE} swap file (helps with AI models on small RAM)..."
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  log "${SWAP_SIZE} swap created"
else
  log "Swap already configured"
fi

# ── Done ──────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo -e "  ${GREEN}Server setup complete!${NC}"
echo "═══════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Upload your project:  bash deploy.sh"
echo "  2. Or clone from GitHub: cd /opt/seoos && git clone <your-repo> ."
echo ""

RAM_GB=$(awk '/MemTotal/ {print int($2/1024/1024)}' /proc/meminfo)
echo "Your VPS has ~${RAM_GB}GB RAM"
if [ "$RAM_GB" -le 4 ]; then
  echo -e "${YELLOW}  → Use model: llama3.2:3b (lightweight)${NC}"
elif [ "$RAM_GB" -le 8 ]; then
  echo "  → Use model: deepseek-r1:8b (recommended)"
else
  echo "  → Use model: deepseek-r1:14b (powerful)"
fi
echo ""
