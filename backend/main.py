"""This module creates the FastAPI application, wires in every route, ensures the SQLite schema exists on startup, and maintains the real-time WebSocket loop that streams current load snapshots to the frontend every two seconds."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from api.answer import router as answer_router
from api.document import router as document_router
from api.question import router as question_router
from api.session import router as session_router
from api.signal import router as signal_router
from core.load_aggregator import load_aggregator
from db.database import Base, engine


app = FastAPI(title="Cognitive Load Balancer", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(document_router)
app.include_router(session_router)
app.include_router(question_router)
app.include_router(answer_router)
app.include_router(signal_router)


@app.on_event("startup")
async def startup_event() -> None:
    Base.metadata.create_all(bind=engine)
    for relative in ["data", "data/uploads", "data/chroma"]:
        Path(__file__).resolve().parent.joinpath(relative).mkdir(parents=True, exist_ok=True)


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
        await websocket.close()