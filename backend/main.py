"""This module creates the FastAPI application, wires in every route, ensures the SQLite schema exists on startup, and maintains the real-time WebSocket loop that streams current load snapshots to the frontend every two seconds."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from api.answer import router as answer_router
from api.document import router as document_router
from api.question import router as question_router
from api.reviews import router as reviews_router
from api.session import router as session_router
from api.signal import router as signal_router
from core.load_aggregator import load_aggregator
from db.database import Base, engine


# FIXED: Support configurable frontend origins while keeping sensible local defaults.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]

app = FastAPI(title="Cognitive Load Balancer", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(document_router)
app.include_router(session_router)
app.include_router(question_router)
app.include_router(answer_router)
app.include_router(signal_router)
app.include_router(reviews_router)


@app.on_event("startup")
async def startup_event() -> None:
    Base.metadata.create_all(bind=engine)
    _migrate_fsrs_columns()
    for relative in ["data", "data/uploads", "data/chroma"]:
        Path(__file__).resolve().parent.joinpath(relative).mkdir(parents=True, exist_ok=True)


def _migrate_fsrs_columns() -> None:
    """Add FSRS columns to existing questions table if missing (ALTER TABLE is a no-op for new DBs)."""
    import sqlite3
    db_path = Path(__file__).resolve().parent / "data" / "clb.sqlite3"
    if not db_path.exists():
        return
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    # Get existing column names
    cursor.execute("PRAGMA table_info(questions)")
    existing = {row[1] for row in cursor.fetchall()}
    migrations = [
        ("next_review_at", "INTEGER"),
        ("review_stability", "REAL DEFAULT 1.0"),
        ("review_difficulty", "REAL DEFAULT 5.0"),
        ("review_count", "INTEGER DEFAULT 0"),
    ]
    for col_name, col_type in migrations:
        if col_name not in existing:
            cursor.execute(f"ALTER TABLE questions ADD COLUMN {col_name} {col_type}")
    conn.commit()
    conn.close()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.websocket("/ws/load/{session_id}")
async def load_socket(websocket: WebSocket, session_id: str) -> None:
    await load_aggregator.register(session_id, websocket)
    try:
        while True:
            await load_aggregator.broadcast_snapshot(session_id)
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        await load_aggregator.unregister(session_id, websocket)
    except Exception:
        await load_aggregator.unregister(session_id, websocket)
        # FIXED: Guard against close() failing on an already-broken socket.
        try:
            await websocket.close()
        except Exception:
            pass