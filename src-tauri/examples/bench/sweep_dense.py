"""Dense-only retrieval sweep across fastembed models (full corpus cosine)."""
import sys
import time

import numpy as np

import bench as b

MODELS = sys.argv[1:] or [
    "minishlab/potion-retrieval-32M", "sentence-transformers/all-MiniLM-L6-v2", "BAAI/bge-small-en-v1.5",
    "snowflake/snowflake-arctic-embed-xs", "snowflake/snowflake-arctic-embed-s", "jinaai/jina-embeddings-v2-small-en",
    "BAAI/bge-base-en-v1.5", "snowflake/snowflake-arctic-embed-m", "nomic-ai/nomic-embed-text-v1.5", "thenlper/gte-base",
    "google/embeddinggemma-300m", "mixedbread-ai/mxbai-embed-large-v1", "BAAI/bge-large-en-v1.5", "Qwen/Qwen3-Embedding-0.6B",
]
qtexts = [b.intent(q["q"])[0] or q["q"] for q in b.QUERIES]
for m in MODELS:
    try:
        t = time.time()
        D = b.doc_matrix(m)
        Q = b.query_vecs(m, qtexts)
        idx = {q["q"]: i for i, q in enumerate(b.QUERIES)}
        S = Q @ D.T
        res, _ = b.evaluate(lambda q: list(np.argsort(-S[idx[q["q"]]])[:50]))
        ms = b.time_query_embed(m, "the plane I'm taking to the west coast")
        b.show(f"dense {m.split('/')[-1]} ({ms:.1f}ms/q)", res)
    except Exception as e:
        print(m, "FAILED", repr(e)[:200], flush=True)
