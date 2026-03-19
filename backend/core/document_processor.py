"""This module extracts PDF text locally, chunks it with token overlap, embeds the chunks offline, and stores them in a persistent Chroma collection so question generation can use session-relevant context without any cloud dependency."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chromadb
import fitz
from llama_index.core.node_parser import TokenTextSplitter
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


BASE_DIR = Path(__file__).resolve().parents[1]
CHROMA_DIR = BASE_DIR / "data" / "chroma"
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

EMBED_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_embedding_model: SentenceTransformer | None = None


def get_embedding_model() -> SentenceTransformer:
    global _embedding_model
    if _embedding_model is None:
        logger.info("Loading embedding model '%s' (first time, may take a moment)...", EMBED_MODEL_NAME)
        _embedding_model = SentenceTransformer(EMBED_MODEL_NAME)
        logger.info("Embedding model loaded successfully.")
    return _embedding_model


def _sanitize_collection_name(raw_name: str) -> str:
    safe = "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in raw_name)
    return safe[:63] or "clb_default"


def _extract_text(file_path: str | Path) -> str:
    document = fitz.open(file_path)
    pages: list[str] = []
    try:
        for page in document:
            pages.append(page.get_text("text"))
    finally:
        document.close()
    return "\n".join(pages)


@dataclass
class DocumentIndex:
    collection_name: str
    chroma_path: str
    chunk_count: int


def index_document(file_path: str | Path, session_id: str) -> DocumentIndex:
    logger.info("index_document START – file=%s, session=%s", file_path, session_id)

    logger.info("Extracting text from PDF...")
    source_text = _extract_text(file_path).strip()
    if not source_text:
        raise ValueError("The uploaded document did not contain extractable text.")
    logger.info("Extracted %d characters of text.", len(source_text))

    logger.info("Chunking text...")
    splitter = TokenTextSplitter(chunk_size=512, chunk_overlap=50)
    chunks = [chunk.strip() for chunk in splitter.split_text(source_text) if chunk.strip()]
    if not chunks:
        raise ValueError("Document chunking produced no usable text segments.")
    logger.info("Produced %d chunks.", len(chunks))

    collection_name = _sanitize_collection_name(f"session_{session_id}")
    logger.info("Creating Chroma collection '%s'...", collection_name)
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    try:
        client.delete_collection(collection_name)
    except Exception:
        pass
    collection = client.create_collection(name=collection_name)

    logger.info("Loading embedding model...")
    model = get_embedding_model()
    logger.info("Encoding %d chunks...", len(chunks))
    embeddings = model.encode(chunks, normalize_embeddings=True).tolist()
    logger.info("Embedding complete. Storing in Chroma...")
    ids = [f"{collection_name}_{index}" for index in range(len(chunks))]
    metadata = [{"chunk": index} for index in range(len(chunks))]
    collection.add(ids=ids, documents=chunks, embeddings=embeddings, metadatas=metadata)

    logger.info("index_document DONE – %d chunks indexed.", len(chunks))
    return DocumentIndex(collection_name=collection_name, chroma_path=str(CHROMA_DIR), chunk_count=len(chunks))


def retrieve_context(index: DocumentIndex | str, topic: str, k: int = 3) -> list[str]:
    collection_name = index.collection_name if isinstance(index, DocumentIndex) else index
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    try:
        collection = client.get_collection(collection_name)
    except Exception as exc:
        raise LookupError(f"Chroma collection '{collection_name}' was not found.") from exc

    query_text = topic.strip() or "core concepts"
    query_embedding = get_embedding_model().encode([query_text], normalize_embeddings=True).tolist()[0]
    result: dict[str, Any] = collection.query(query_embeddings=[query_embedding], n_results=k)
    documents = result.get("documents", [[]])
    return [chunk for chunk in documents[0] if chunk][:k]


def get_all_chunks(index_name: str) -> list[str]:
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    try:
        collection = client.get_collection(index_name)
    except Exception as exc:
        raise LookupError(f"Chroma collection '{index_name}' was not found.") from exc
    result = collection.get(include=["documents", "metadatas"])
    
    docs_with_idx = [(meta["chunk"], doc) for meta, doc in zip(result["metadatas"], result["documents"])]
    docs_with_idx.sort(key=lambda x: x[0])
    return [doc for _, doc in docs_with_idx]
