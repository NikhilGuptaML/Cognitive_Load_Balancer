#!/bin/bash
# This script bootstraps the local Python environment, installs the offline inference and retrieval dependencies, pulls the required Phi-3 Mini model, and then installs the frontend packages so the whole project can be started from two local terminals.

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

resolve_python_cmd() {
	if command -v python3 >/dev/null 2>&1; then
		echo "python3"
		return 0
	fi
	if command -v python >/dev/null 2>&1; then
		echo "python"
		return 0
	fi
	if command -v py >/dev/null 2>&1; then
		echo "py -3"
		return 0
	fi
	return 1
}

echo "Setting up Cognitive Load Balancer..."

cd "$ROOT_DIR/backend"

if [ -d ".venv" ]; then
	VENV_DIR=".venv"
elif [ -d "venv" ]; then
	VENV_DIR="venv"
else
	PY_CMD="$(resolve_python_cmd || true)"
	if [ -z "$PY_CMD" ]; then
		echo "No Python interpreter found in PATH (tried python3, python, py)."
		echo "Install Python 3.11+ or activate an existing virtual environment first."
		exit 1
	fi
	VENV_DIR=".venv"
	eval "$PY_CMD -m venv $VENV_DIR"
fi

if [ -f "$VENV_DIR/bin/activate" ]; then
	source "$VENV_DIR/bin/activate"
	ACTIVATE_HINT="$VENV_DIR/bin/activate"
elif [ -f "$VENV_DIR/Scripts/activate" ]; then
	source "$VENV_DIR/Scripts/activate"
	ACTIVATE_HINT="$VENV_DIR/Scripts/activate"
else
	echo "Could not find an activation script in $VENV_DIR"
	exit 1
fi

PY_IN_VENV=""
if command -v python >/dev/null 2>&1; then
	PY_IN_VENV="python"
elif [ -x "$VENV_DIR/bin/python" ]; then
	PY_IN_VENV="$VENV_DIR/bin/python"
elif [ -x "$VENV_DIR/Scripts/python.exe" ]; then
	PY_IN_VENV="$VENV_DIR/Scripts/python.exe"
else
	echo "Could not find a Python executable inside $VENV_DIR"
	exit 1
fi

# On Windows, pip launchers inside older venvs can point to a removed base install.
# ensurepip + python -m pip avoids that launcher-path failure mode.
"$PY_IN_VENV" -m ensurepip --upgrade
"$PY_IN_VENV" -m pip install --upgrade pip
"$PY_IN_VENV" -m pip install -r requirements.txt

echo "Pulling Phi-3 Mini (~2.3GB)..."
ollama pull phi3:mini

cd "$ROOT_DIR/frontend"
npm install

echo "Done. Run:"
echo "  Terminal 1: cd backend && source $ACTIVATE_HINT && uvicorn main:app --reload"
echo "  Terminal 2: cd frontend && npm run dev"