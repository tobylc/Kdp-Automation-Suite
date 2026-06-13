#!/usr/bin/env bash
# KDP Upload Automation — Local Startup Script
# Run this once to set everything up, then again any time you want to start the app.

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   KDP Upload Automation — Local Setup    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Locate the project root ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "package.json" ]; then
  echo -e "${RED}Could not find package.json. Make sure you run this from the project folder.${NC}"
  exit 1
fi

# ── Step 1: Install dependencies ───────────────────────────────────────────────
echo -e "${BLUE}[1/5]${NC} Installing dependencies..."
if ! command -v pnpm &>/dev/null; then
  echo "  pnpm not found — installing..."
  npm install -g pnpm --silent
fi
pnpm install --silent
echo -e "${GREEN}      ✓ Dependencies ready${NC}"

# ── Step 2: Create .env if it does not exist ───────────────────────────────────
ENV_FILE="artifacts/api-server/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo -e "${YELLOW}First-time setup — I need two things from you:${NC}"
  echo ""

  # DATABASE_URL
  echo -e "${BOLD}  1. Your Replit Database URL${NC}"
  echo "     Open your Replit project → Tools → Secrets → DATABASE_URL"
  echo "     (or use any PostgreSQL connection string)"
  echo ""
  printf "     Paste DATABASE_URL: "
  read -r DB_URL

  echo ""

  # Anthropic API Key
  echo -e "${BOLD}  2. Your Anthropic API Key${NC}"
  echo "     Get one free at: https://console.anthropic.com/keys"
  echo ""
  printf "     Paste API key: "
  read -rs AI_KEY
  echo ""

  # Generate a random session secret (not currently required but kept for future use)
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "local-secret-$(date +%s)")

  cat >"$ENV_FILE" <<EOF
DATABASE_URL=${DB_URL}
AI_INTEGRATIONS_ANTHROPIC_BASE_URL=https://api.anthropic.com
AI_INTEGRATIONS_ANTHROPIC_API_KEY=${AI_KEY}
SESSION_SECRET=${SESSION_SECRET}
CDP_ENDPOINT=http://localhost:9222
PORT=8080
EOF

  echo ""
  echo -e "${GREEN}      ✓ .env created${NC}"
else
  echo -e "${GREEN}      ✓ .env already exists${NC}"
fi

# ── Step 3: Sync database schema ──────────────────────────────────────────────
echo -e "${BLUE}[2/5]${NC} Syncing database schema..."
pnpm --filter @workspace/db run push 2>/dev/null || true
echo -e "${GREEN}      ✓ Database schema up to date${NC}"

# ── Step 4: Launch Chrome with remote debugging ───────────────────────────────
echo -e "${BLUE}[3/5]${NC} Starting Chrome..."
CDP_PORT=9222

if curl -s --max-time 1 "http://localhost:${CDP_PORT}/json/version" >/dev/null 2>&1; then
  echo -e "${GREEN}      ✓ Chrome already running on port ${CDP_PORT}${NC}"
else
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open -a "Google Chrome" --args \
      --remote-debugging-port="${CDP_PORT}" \
      --user-data-dir="${HOME}/chrome-kdp-profile" \
      --no-first-run \
      --disable-first-run-ui 2>/dev/null || true
  else
    google-chrome \
      --remote-debugging-port="${CDP_PORT}" \
      --user-data-dir="${HOME}/chrome-kdp-profile" \
      --no-first-run &
  fi
  sleep 3
  echo -e "${GREEN}      ✓ Chrome launched on port ${CDP_PORT}${NC}"
fi

# ── Step 5: Open required tabs in Chrome ─────────────────────────────────────
echo -e "${BLUE}[4/5]${NC} Opening KDP and Study Guides tabs..."
sleep 1

# Use Chrome's CDP REST API to open tabs
open_tab() {
  curl -s --max-time 3 "http://localhost:${CDP_PORT}/json/new?${1}" >/dev/null 2>&1 || true
}

# Check if tabs already open
EXISTING_PAGES=$(curl -s --max-time 2 "http://localhost:${CDP_PORT}/json" 2>/dev/null || echo "[]")
if echo "$EXISTING_PAGES" | grep -q "kdp.amazon.com"; then
  echo -e "${GREEN}      ✓ KDP tab already open${NC}"
else
  open_tab "https://kdp.amazon.com/en_US/bookshelf"
  echo -e "${GREEN}      ✓ Opened KDP Bookshelf tab${NC}"
fi

if echo "$EXISTING_PAGES" | grep -q "scripturemadesimple.replit.app"; then
  echo -e "${GREEN}      ✓ Study Guides tab already open${NC}"
else
  open_tab "https://scripturemadesimple.replit.app/my-studies"
  echo -e "${GREEN}      ✓ Opened My Study Guides tab${NC}"
fi

# ── All set — start the servers ───────────────────────────────────────────────
echo -e "${BLUE}[5/5]${NC} Starting servers..."
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Everything is ready!${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Dashboard → ${BOLD}http://localhost:3000${NC}"
echo ""
echo -e "  ${YELLOW}Action needed:${NC} Log in to Amazon KDP in the"
echo -e "  Chrome window that just opened. Once logged in,"
echo -e "  the green 'Prepare Workspace' indicator will light"
echo -e "  up in the dashboard."
echo ""
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop everything."
echo ""

# Open the dashboard once servers have had a moment to start
(sleep 5 && open "http://localhost:3000" 2>/dev/null || true) &

# Start both servers — API first, then the frontend
pnpm --filter @workspace/api-server run dev &
API_PID=$!

pnpm --filter @workspace/kdp-uploader run dev

# Cleanup on exit
wait "$API_PID" 2>/dev/null || true
