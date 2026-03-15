# Cognitive Load Balancer (CLB)

An offline-first adaptive study system that estimates learner cognitive load from passive local signals and adjusts question difficulty in real time.

No cloud APIs are required for the core flow. Documents stay local, inference is local via Ollama, and session telemetry is stored in local SQLite.

## What CLB Does

Every cycle, CLB combines three passive signals:

- Typing rhythm (keystroke-derived load)
- Facial tension (face-derived load, optional)
- Response latency (answer timing)

The system computes a Composite Load Score from 0 to 100, maps it to a band, and generates the next question against local document context.

Flow:

Typing + Face + Latency
-> Composite Load Score
-> Band (FLOW / OPTIMAL / ELEVATED / OVERLOADED / CRISIS)
-> Local LLM question generation (phi3:mini via Ollama)
-> Repeat

## Tech Stack

Backend:

- Python 3.11+
- FastAPI
- SQLAlchemy + SQLite
- ChromaDB
- LlamaIndex chunking
- sentence-transformers all-MiniLM-L6-v2 embeddings
- Ollama (phi3:mini)

Frontend:

- React 18 + TypeScript + Vite
- Tailwind CSS
- Recharts

## Project Layout

Top-level:

- backend
- frontend
- scripts

Important backend modules:

- backend/main.py: app entrypoint, CORS, routers, websocket
- backend/core/load_aggregator.py: signal weighting + band mapping + broadcast
- backend/core/document_processor.py: PDF extraction, chunking, Chroma indexing
- backend/core/difficulty_controller.py: band configs + prompt construction
- backend/api: REST endpoints for document/session/question/answer/signal
- backend/db: SQLAlchemy models + database setup

Important frontend modules:

- frontend/src/pages/SetupPage.tsx: upload + session start
- frontend/src/pages/SessionPage.tsx: live adaptive study UI
- frontend/src/components/LoadGauge.tsx: live band/score gauge
- frontend/src/components/QuizPanel.tsx: question-answer loop
- frontend/src/context/LoadScoreContext.tsx: websocket load stream
- frontend/src/hooks/useKeystrokeAnalyzer.ts: typing signal collection

## Load Scoring Model

Signal weights:

- keystroke: 0.50
- facial: 0.35
- latency: 0.15

When a signal is unavailable, CLB renormalizes active weights so the score remains valid.

Band thresholds:

- 0 to 25: FLOW
- 26 to 50: OPTIMAL
- 51 to 75: ELEVATED
- 76 to 90: OVERLOADED
- 91 to 100: CRISIS

## Quick Start

### Option A: Automated Setup (recommended)

From repository root, run:

- Git Bash or WSL:
  - bash scripts/setup.sh

What setup does:

- Reuses backend/.venv or backend/venv if present
- Creates backend/.venv if missing
- Installs backend dependencies from backend/requirements.txt
- Pulls Ollama model phi3:mini
- Installs frontend dependencies

### Option B: Manual Setup (Windows PowerShell)

From repository root:

1. Backend environment and packages
   - cd backend
   - if (!(Test-Path .venv)) { python -m venv .venv }

- .\.venv\Scripts\Activate.ps1
- python -m ensurepip --upgrade
- python -m pip install --upgrade pip
- python -m pip install -r requirements.txt

2. Pull local model
   - ollama pull phi3:mini

3. Frontend packages

- cd ..\frontend
- npm install

## Run the App

Open two terminals from repository root.

Terminal 1 (backend):

- Git Bash:
  - cd backend
  - source .venv/Scripts/activate
  - uvicorn main:app --reload

- PowerShell:
  - cd backend
  - .\.venv\Scripts\Activate.ps1
  - uvicorn main:app --reload

Terminal 2 (frontend):

- cd frontend
- npm run dev

Open http://localhost:5173

## API Summary

Base URL: http://localhost:8000

Health:

- GET /health

WebSocket:

- ws://localhost:8000/ws/load/{session_id}

REST endpoints:

- POST /document/upload
  - multipart form-data
  - field: file (PDF)
  - returns: doc_id, chunk_count

- POST /session/start
  - body: user_id, doc_id, pomodoro_length
  - returns: session_id and session metadata

- GET /session/report?session_id=...
  - returns aggregate report, load series, band changes

- POST /signal/keystroke
  - body: session_id, ikiVariance, wpm, backspaceRate, rawScore

- POST /signal/face
  - body: session_id, ear, blinks_per_min, brow_distance, raw_score

- GET /question?session_id=...&topic=...
  - returns: question_id, question_text, band, hint

- POST /answer
  - body: session_id, question_id, answer_text, latency_ms
  - returns: correct, score, explanation

## Typical User Flow

1. Open setup page at frontend root route.
2. Upload a PDF.
3. Start session.
4. Session page opens and websocket begins live updates.
5. System fetches question and records latency on answer submission.
6. Report page shows accuracy, load history, and band transitions.

## Data Storage

Local paths created automatically:

- backend/data/clb.sqlite3
- backend/data/uploads
- backend/data/chroma

## Notes on Offline Behavior

- Question generation and answer grading use Ollama locally.
- If Ollama is unavailable or returns invalid JSON, backend fallback logic still returns usable responses.
- No cloud calls are required for the CLB loop.

## Troubleshooting

Python not found in setup script:

- Ensure Python 3.11+ is installed and available in PATH.
- If using an existing backend/.venv, setup script now reuses it.

Ollama warnings about no running instance:

- Start Ollama desktop app or daemon, then run:
  - ollama pull phi3:mini

Windows venv pip launcher errors:

- Use python module invocation:
  - python -m ensurepip --upgrade
  - python -m pip install --upgrade pip

Frontend cannot reach backend:

- Verify backend is running on port 8000.
- Verify frontend is running on port 5173.

## Current Scope

Implemented now:

- Keystroke signal collection and posting from frontend
- Composite load scoring and websocket updates
- Document upload and local indexing
- Adaptive question and answer loop
- Session reporting

Planned extension:

- Browser webcam capture path to actively post face signal frames/metrics to POST /signal/face

## License

Add your preferred license file for distribution.
