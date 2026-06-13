#!/usr/bin/env bash
# KDP Upload Automation — Local Startup Script

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

# ── Locate project root ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: cannot find package.json in $SCRIPT_DIR${NC}"
  echo "Make sure you're running this from inside the unzipped project folder."
  exit 1
fi

echo -e "  Project root: ${BOLD}$SCRIPT_DIR${NC}"
echo ""

# ── Step 1: Check Node.js ──────────────────────────────────────────────────────
echo -e "${BLUE}[1/5]${NC} Checking Node.js..."
if ! command -v node &>/dev/null; then
  echo -e "${RED}Node.js is not installed.${NC}"
  echo "Install it from https://nodejs.org (download the LTS version), then re-run this script."
  exit 1
fi
NODE_VER=$(node --version)
echo -e "${GREEN}      ✓ Node.js ${NODE_VER}${NC}"

# ── Step 2: Install pnpm if needed ────────────────────────────────────────────
echo -e "${BLUE}[2/5]${NC} Checking pnpm..."
if ! command -v pnpm &>/dev/null; then
  echo "  pnpm not found — installing..."
  npm install -g pnpm
  if ! command -v pnpm &>/dev/null; then
    echo -e "${RED}Failed to install pnpm. Try running: npm install -g pnpm${NC}"
    exit 1
  fi
fi
PNPM_VER=$(pnpm --version)
echo -e "${GREEN}      ✓ pnpm ${PNPM_VER}${NC}"

echo "  Installing workspace dependencies (this takes ~30 seconds the first time)..."
if ! pnpm install --ignore-scripts; then
  echo -e "${RED}pnpm install failed — see errors above.${NC}"
  exit 1
fi
echo -e "${GREEN}      ✓ Dependencies installed${NC}"

# ── Step 3: Create .env if missing ────────────────────────────────────────────
ENV_FILE="artifacts/api-server/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo -e "${YELLOW}First-time setup — I need two things from you:${NC}"
  echo ""

  echo -e "${BOLD}  1. Your Database URL${NC}"
  echo "     Open your Replit project in the browser"
  echo "     → click 'Secrets' in the left sidebar"
  echo "     → copy the value of DATABASE_URL"
  echo ""
  printf "     Paste DATABASE_URL: "
  read -r DB_URL

  echo ""
  echo -e "${BOLD}  2. Your Anthropic API Key${NC}"
  echo "     Get one at: https://console.anthropic.com/keys"
  echo ""
  printf "     Paste API key (sk-ant-...): "
  read -rs AI_KEY
  echo ""

  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

  mkdir -p "$(dirname "$ENV_FILE")"
  cat >"$ENV_FILE" <<EOF
DATABASE_URL=${DB_URL}
AI_INTEGRATIONS_ANTHROPIC_BASE_URL=https://api.anthropic.com
AI_INTEGRATIONS_ANTHROPIC_API_KEY=${AI_KEY}
SESSION_SECRET=${SESSION_SECRET}
CDP_ENDPOINT=http://localhost:9222
PORT=8080
EOF

  echo -e "${GREEN}      ✓ .env saved${NC}"
else
  echo -e "${GREEN}      ✓ .env already exists${NC}"
fi

# ── Step 4: Push DB schema ─────────────────────────────────────────────────────
echo ""
echo "  Syncing database schema..."
if pnpm --filter @workspace/db run push 2>&1; then
  echo -e "${GREEN}      ✓ Database schema up to date${NC}"
else
  echo -e "${YELLOW}      ⚠ DB push had warnings (may be fine if schema already exists)${NC}"
fi

# ── Step 5: Launch Chrome with remote debugging ────────────────────────────────
echo ""
echo -e "${BLUE}[3/5]${NC} Starting Chrome..."
CDP_PORT=9222

if curl -s --max-time 1 "http://localhost:${CDP_PORT}/json/version" >/dev/null 2>&1; then
  echo -e "${GREEN}      ✓ Chrome already running on port ${CDP_PORT}${NC}"
else
  open -a "Google Chrome" --args \
    --remote-debugging-port="${CDP_PORT}" \
    --user-data-dir="${HOME}/chrome-kdp-profile" \
    --no-first-run \
    --disable-first-run-ui 2>/dev/null || {
      echo -e "${RED}Could not launch Google Chrome.${NC}"
      echo "Make sure Google Chrome is installed in /Applications."
    }
  sleep 3
  echo -e "${GREEN}      ✓ Chrome launched${NC}"
fi

# ── Step 6: Open required tabs ─────────────────────────────────────────────────
echo -e "${BLUE}[4/5]${NC} Opening KDP tabs in Chrome..."
sleep 1

EXISTING=$(curl -s --max-time 2 "http://localhost:${CDP_PORT}/json" 2>/dev/null || echo "[]")

if echo "$EXISTING" | grep -q "kdp.amazon.com"; then
  echo -e "${GREEN}      ✓ KDP tab already open${NC}"
else
  curl -s --max-time 3 "http://localhost:${CDP_PORT}/json/new?https://kdp.amazon.com/en_US/bookshelf" >/dev/null 2>&1 || true
  echo -e "${GREEN}      ✓ Opened Amazon KDP tab${NC}"
fi

if echo "$EXISTING" | grep -q "scripturemadesimple.replit.app"; then
  echo -e "${GREEN}      ✓ Study Guides tab already open${NC}"
else
  curl -s --max-time 3 "http://localhost:${CDP_PORT}/json/new?https://scripturemadesimple.replit.app/my-studies" >/dev/null 2>&1 || true
  echo -e "${GREEN}      ✓ Opened Study Guides tab${NC}"
fi

# ── All set ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Everything is ready!${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}Action needed:${NC} Log in to Amazon KDP in the Chrome"
echo -e "  window that just opened."
echo ""
echo -e "  Dashboard will open at → ${BOLD}http://localhost:3000${NC}"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop everything."
echo ""

echo -e "${BLUE}[5/5]${NC} Starting servers..."

# Open dashboard after servers have a moment to start
(sleep 6 && open "http://localhost:3000" 2>/dev/null) &

# Start API server in background, frontend in foreground
pnpm --filter @workspace/api-server run dev &
API_PID=$!

pnpm --filter @workspace/kdp-uploader run dev

wait "$API_PID" 2>/dev/null || true
