"""
SEO Vector Memory — Qdrant-based semantic memory for the AI SEO Brain.

Stores SEO knowledge as vector embeddings for semantic search.
Uses Ollama's nomic-embed-text model for local embeddings (no paid APIs).
Falls back to keyword-based storage if embedding model unavailable.
"""
import os
import httpx
import asyncio
import uuid
from pathlib import Path
from typing import Optional

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter,
    FieldCondition, MatchValue, SearchRequest, ScoredPoint,
)

# ─── Config ─────────────────────────────────────────────────────────────────
QDRANT_PATH = os.environ.get("QDRANT_PATH", "/tmp/seo-os/qdrant")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = "nomic-embed-text"       # 274MB, 768-dim embeddings
EMBED_DIM = 768
COLLECTION_NAME = "seo_knowledge"

# ─── Qdrant Client (singleton) ───────────────────────────────────────────────
_qdrant: Optional[QdrantClient] = None


def get_qdrant() -> QdrantClient:
    global _qdrant
    if _qdrant is None:
        Path(QDRANT_PATH).mkdir(parents=True, exist_ok=True)
        _qdrant = QdrantClient(path=QDRANT_PATH)
        _ensure_collection(_qdrant)
    return _qdrant


def _ensure_collection(client: QdrantClient):
    """Create Qdrant collection if it doesn't exist."""
    collections = {c.name for c in client.get_collections().collections}
    if COLLECTION_NAME not in collections:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )
        print(f"✅ Created Qdrant collection '{COLLECTION_NAME}' (dim={EMBED_DIM})")
    else:
        print(f"✅ Qdrant collection '{COLLECTION_NAME}' ready")


async def get_embedding(text: str) -> Optional[list[float]]:
    """
    Generate embedding for text using Ollama's nomic-embed-text model.
    Returns 768-dim float vector or None if model unavailable.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/embed",
                json={"model": EMBED_MODEL, "input": text[:2000]},  # limit input
            )
            if resp.status_code == 200:
                data = resp.json()
                # Ollama returns {"embeddings": [[...]]}
                embeddings = data.get("embeddings", data.get("embedding", []))
                if embeddings:
                    emb = embeddings[0] if isinstance(embeddings[0], list) else embeddings
                    if len(emb) == EMBED_DIM:
                        return emb
                    # Wrong dimension — model might be different
                    print(f"⚠️  Embedding dim {len(emb)} != {EMBED_DIM}, skipping vector storage")
                    return None
    except Exception as e:
        print(f"Embedding error: {e}")
    return None


async def store_knowledge(
    text: str,
    metadata: dict,
    point_id: Optional[str] = None,
) -> Optional[str]:
    """
    Store a knowledge entry in Qdrant with its embedding.
    Returns the Qdrant point ID or None if embedding failed.

    metadata fields: source, category, source_url, article_id, tags
    """
    embedding = await get_embedding(text)
    if not embedding:
        return None

    pid = point_id or str(uuid.uuid4())
    try:
        client = get_qdrant()
        client.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                PointStruct(
                    id=pid,
                    vector=embedding,
                    payload={
                        "text": text[:1000],     # store truncated text in payload
                        "source": metadata.get("source", ""),
                        "category": metadata.get("category", ""),
                        "source_url": metadata.get("source_url", ""),
                        "article_id": str(metadata.get("article_id", "")),
                        "tags": metadata.get("tags", []),
                    },
                )
            ],
        )
        return pid
    except Exception as e:
        print(f"Qdrant store error: {e}")
        return None


async def search_knowledge(
    query: str,
    limit: int = 5,
    category: Optional[str] = None,
) -> list[dict]:
    """
    Semantic search over the SEO knowledge base.
    Returns top-k relevant knowledge entries.
    """
    embedding = await get_embedding(query)
    if not embedding:
        return []

    try:
        client = get_qdrant()

        filter_cond = None
        if category:
            filter_cond = Filter(
                must=[FieldCondition(key="category", match=MatchValue(value=category))]
            )

        results = client.search(
            collection_name=COLLECTION_NAME,
            query_vector=embedding,
            limit=limit,
            query_filter=filter_cond,
            with_payload=True,
        )

        return [
            {
                "text": r.payload.get("text", ""),
                "score": round(r.score, 3),
                "source": r.payload.get("source", ""),
                "category": r.payload.get("category", ""),
                "source_url": r.payload.get("source_url", ""),
                "tags": r.payload.get("tags", []),
            }
            for r in results
        ]
    except Exception as e:
        print(f"Qdrant search error: {e}")
        return []


def get_collection_stats() -> dict:
    """Return Qdrant collection statistics."""
    try:
        client = get_qdrant()
        info = client.get_collection(COLLECTION_NAME)

        # vectors_count can be stale for local storage — scroll to get real count
        try:
            scroll_result = client.scroll(
                collection_name=COLLECTION_NAME,
                limit=1,
                with_vectors=False,
                with_payload=False,
            )
            # Use count API for accurate total
            count_result = client.count(collection_name=COLLECTION_NAME, exact=True)
            total = count_result.count
        except Exception:
            total = info.vectors_count or 0

        return {
            "total_vectors": total,
            "indexed_vectors": info.indexed_vectors_count or total,
            "collection": COLLECTION_NAME,
            "dim": EMBED_DIM,
            "distance": "cosine",
            "status": "green",
        }
    except Exception as e:
        return {"total_vectors": 0, "error": str(e), "status": "red"}


async def check_embedding_model() -> dict:
    """Check if nomic-embed-text is available in Ollama."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            if resp.status_code == 200:
                models = [m["name"] for m in resp.json().get("models", [])]
                available = any("nomic-embed" in m for m in models)
                return {
                    "available": available,
                    "model": EMBED_MODEL,
                    "models": models,
                    "message": "Ready" if available else "Run: ollama pull nomic-embed-text",
                }
    except Exception as e:
        return {"available": False, "error": str(e)}
    return {"available": False}
