#!/bin/bash
# Bootstraps the local Python environment, installs offline inference and retrieval
# dependencies, pulls Phi-3 Mini, and installs frontend packages.
# Optimised for Linux Mint (Debian/Ubuntu base).

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─── Colour helpers ───────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[CLB]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

info "Setting up Cognitive Load Balancer on Linux Mint..."

# ─── 1. System dependencies ───────────────────────────────────────────────────
info "Checking system packages..."

MISSING_PKGS=()
for pkg in python3 python3-venv python3-pip curl; do
    dpkg -s "$pkg" &>/dev/null || MISSING_PKGS+=("$pkg")
done

# Node.js: check for version 18+
if command -v node &>/dev/null; then
    NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
    if [ "$NODE_MAJOR" -lt 18 ]; then
        warn "Node.js $NODE_MAJOR found but 18+ required. Will install via NodeSource."
        NEED_NODE=true
    fi
else
    NEED_NODE=true
fi

if [ ${#MISSING_PKGS[@]} -gt 0 ] || [ "${NEED_NODE:-false}" = true ]; then
    warn "Installing missing system packages. You may be prompted for your password."
    sudo apt-get update -qq

    if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
        sudo apt-get install -y "${MISSING_PKGS[@]}"
    fi

    if [ "${NEED_NODE:-false}" = true ]; then
        info "Installing Node.js 20 LTS via NodeSource..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
fi

# ─── 2. Ollama ────────────────────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
    info "Ollama not found. Installing..."
    curl -fsSL https://ollama.com/install.sh | sh
else
    info "Ollama already installed: $(ollama --version 2>/dev/null || echo 'version unknown')"
fi

# Ensure the ollama service is running
if ! pgrep -x ollama &>/dev/null; then
    info "Starting Ollama service in background..."
    ollama serve &>/dev/null &
    sleep 3   # give the server a moment to bind
fi

# ─── 3. Python virtual environment ───────────────────────────────────────────
cd "$ROOT_DIR/backend"

if [ -d ".venv" ]; then
    VENV_DIR=".venv"
    info "Reusing existing venv at backend/.venv"
elif [ -d "venv" ]; then
    VENV_DIR="venv"
    info "Reusing existing venv at backend/venv"
else
    VENV_DIR=".venv"
    info "Creating virtual environment at backend/$VENV_DIR ..."
    python3 -m venv "$VENV_DIR"
fi

ACTIVATE_HINT="$VENV_DIR/bin/activate"
# shellcheck source=/dev/null
source "$ACTIVATE_HINT"

PY_IN_VENV="$VENV_DIR/bin/python"
[ -x "$PY_IN_VENV" ] || error "Could not find Python inside $VENV_DIR"

# ─── 4. Python packages ───────────────────────────────────────────────────────
info "Upgrading pip..."
"$PY_IN_VENV" -m ensurepip --upgrade
"$PY_IN_VENV" -m pip install --upgrade pip --quiet

info "Installing Python dependencies from requirements.txt ..."
"$PY_IN_VENV" -m pip install -r requirements.txt

# ─── 5. Phi-3 Mini model ──────────────────────────────────────────────────────
info "Pulling Phi-3 Mini (~2.3 GB) — this will take a while on first run..."
ollama pull phi3:mini

# ─── 6. Frontend packages ─────────────────────────────────────────────────────
info "Installing frontend npm packages..."
cd "$ROOT_DIR/frontend"
npm install

# ─── 7. Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Open two terminals and run:"
echo ""
echo -e "  ${YELLOW}Terminal 1 (backend):${NC}"
echo "    cd $ROOT_DIR/backend"
echo "    source $ACTIVATE_HINT"
echo "    uvicorn main:app --reload"
echo ""
echo -e "  ${YELLOW}Terminal 2 (frontend):${NC}"
echo "    cd $ROOT_DIR/frontend"
echo "    npm run dev"
echo ""
echo "  App → http://localhost:5173"
echo ""
