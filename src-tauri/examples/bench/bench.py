"""Exploration bench for Yank semantic search (Python mirror of the Rust path).

Loads dataset.json, then scores retrieval strategies:
  first stage : BM25 (FTS5, mirrors commands.rs::bm25_pool) and dense embeddings (fastembed)
  re-rankers  : TypeSafe Jev (HTTP), Laya (local MLX), local cross-encoders (fastembed)

All model outputs are cached under cache/ so re-running a strategy is free.
Queries of kind `time` / `cat` are skipped here — they take the deterministic SQL
path in production and are covered by the Rust harness.
"""

import hashlib
import json
import os
import re
import sqlite3
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
CACHE = HERE / "cache"
CACHE.mkdir(exist_ok=True)

D = json.loads((HERE / "dataset.json").read_text())
ITEMS = D["items"]
QUERIES = [q for q in D["queries"] if q["kind"] not in ("time", "cat")]
N = len(ITEMS)

# ---------------------------------------------------------------- query intent (port of query_intent.rs)
RE_CAT = re.compile(
    r"(?i)\b(phone\s+numbers?|phones?|email\s+addresses?|emails?|hex\s+codes?|colou?rs?|urls?|links?|websites?|code\s+snippets?|snippets?|code|file\s+paths?|paths?|files?|street\s+addresses?|addresses?|numbers?|screenshots?|pictures?|images?)\b")
RE_FILL = re.compile(r"(?i)\b(?:that\s+)?(?:the\s+ones?\s+)?i\s+(?:copied|yanked|saved|had|wrote|made|took|want(?:ed)?|need(?:ed)?|kept|grabbed)\b")
CATMAP = {}
for _cat, _forms in {
    "phone": "phone|phones|phone number|phone numbers", "email": "email|emails|email address|email addresses",
    "color": "color|colors|colour|colours|hex code|hex codes", "url": "url|urls|link|links|website|websites",
    "code": "code|snippet|snippets|code snippet|code snippets", "path": "path|paths|file|files|file path|file paths",
    "address": "address|addresses|street address|street addresses", "number": "number|numbers",
    "image": "image|images|picture|pictures|screenshot|screenshots",
}.items():
    CATMAP.update(dict.fromkeys(_forms.split("|"), _cat))


def intent(q):
    cat = None
    m = RE_CAT.search(q)
    if m:
        cat = CATMAP.get(" ".join(m.group(0).lower().split()), "text")
        q = q[: m.start()] + " " + q[m.end():]
    q = RE_FILL.sub(" ", q)
    return " ".join(q.split()), cat


# ---------------------------------------------------------------- candidate text (mirror of commands.rs::candidate_text)
def cand_text(it, with_source=True, max_chars=500):
    parts = []
    if it.get("label"):
        parts.append(it["label"])
    body = it["content"].strip()[:max_chars]
    if body:
        parts.append(body)
    if with_source and it.get("source"):
        parts.append(f"(from {it['source']})")
    return "\n".join(parts)


# ---------------------------------------------------------------- BM25 (FTS5)
_db = sqlite3.connect(":memory:", check_same_thread=False)
_db.executescript("""
CREATE TABLE items (id INTEGER PRIMARY KEY, content TEXT, category TEXT, label TEXT, source TEXT);
CREATE VIRTUAL TABLE items_fts USING fts5(label, content, source, category, content='items', content_rowid='id', tokenize='porter unicode61');
""")
for i, it in enumerate(ITEMS):
    _db.execute("INSERT INTO items VALUES (?,?,?,?,?)", (i, it["content"], it["category"], it["label"], it["source"]))
    _db.execute("INSERT INTO items_fts(rowid,label,content,source,category) VALUES (?,?,?,?,?)",
                (i, it["label"], it["content"], it["source"], it["category"]))


import threading
_dblock = threading.Lock()


def _fts(match, limit):
    try:
        with _dblock:
            return [r[0] for r in _db.execute(
            "SELECT rowid FROM items_fts WHERE items_fts MATCH ? ORDER BY bm25(items_fts) LIMIT ?", (match, limit))]
    except sqlite3.OperationalError:
        return []


def bm25_pool(q, limit=50):
    terms = [re.sub(r"^[\W_]+|[\W_]+$", "", t) for t in q.split()]
    terms = [f'{t.replace(chr(34), chr(34) * 2)}*' for t in terms if t]
    if not terms:
        return []
    out = []
    if len(terms) >= 2:
        out += _fts(" ".join(terms), limit)
    for i in _fts(" OR ".join(terms), limit):
        if i not in out:
            out.append(i)
    return out[:limit]


# ---------------------------------------------------------------- dense
_emb_models = {}


def _embedder(name):
    if name not in _emb_models:
        from fastembed import TextEmbedding
        _emb_models[name] = TextEmbedding(name)
    return _emb_models[name]


QPREFIX = {
    "BAAI/bge-small-en-v1.5": "Represent this sentence for searching relevant passages: ",
    "BAAI/bge-base-en-v1.5": "Represent this sentence for searching relevant passages: ",
    "BAAI/bge-large-en-v1.5": "Represent this sentence for searching relevant passages: ",
    "snowflake/snowflake-arctic-embed-xs": "Represent this sentence for searching relevant passages: ",
    "snowflake/snowflake-arctic-embed-s": "Represent this sentence for searching relevant passages: ",
    "snowflake/snowflake-arctic-embed-m": "Represent this sentence for searching relevant passages: ",
    "nomic-ai/nomic-embed-text-v1.5": "search_query: ",
    "mixedbread-ai/mxbai-embed-large-v1": "Represent this sentence for searching relevant passages: ",
    "google/embeddinggemma-300m": "task: search result | query: ",
    "Qwen/Qwen3-Embedding-0.6B": "Instruct: Given a search query, retrieve the clipboard item the user is looking for\nQuery: ",
}
DPREFIX = {"nomic-ai/nomic-embed-text-v1.5": "search_document: ", "google/embeddinggemma-300m": "title: none | text: "}


def _norm(m):
    m = np.asarray(m, dtype=np.float32)
    return m / np.maximum(np.linalg.norm(m, axis=-1, keepdims=True), 1e-9)


def doc_matrix(model, text_fn=lambda it: cand_text(it, with_source=False)):
    key = hashlib.sha1((model + "|" + "\n".join(text_fn(it) for it in ITEMS)).encode()).hexdigest()[:12]
    p = CACHE / f"docs_{model.replace('/', '_')}_{key}.npy"
    if p.exists():
        return np.load(p)
    pre = DPREFIX.get(model, "")
    m = _norm(list(_embedder(model).embed([pre + text_fn(it) for it in ITEMS], batch_size=64)))
    np.save(p, m)
    return m


def query_vecs(model, texts):
    key = hashlib.sha1((model + "|" + "\n".join(texts)).encode()).hexdigest()[:12]
    p = CACHE / f"q_{model.replace('/', '_')}_{key}.npy"
    if p.exists():
        return np.load(p)
    pre = QPREFIX.get(model, "")
    m = _norm(list(_embedder(model).embed([pre + t for t in texts])))
    np.save(p, m)
    return m


def time_query_embed(model, text, reps=20):
    e = _embedder(model)
    pre = QPREFIX.get(model, "")
    list(e.embed([pre + text]))
    t = time.perf_counter()
    for _ in range(reps):
        list(e.embed([pre + text]))
    return (time.perf_counter() - t) / reps * 1000


# ---------------------------------------------------------------- cross-encoder rerankers (fastembed)
_ce = {}


def ce_scores(model, q, ids, text_fn=cand_text):
    key = hashlib.sha1(f"{model}|{q}|{ids}".encode()).hexdigest()
    p = CACHE / "ce" / f"{key}.json"
    if p.exists():
        return json.loads(p.read_text())
    if model not in _ce:
        from fastembed.rerank.cross_encoder import TextCrossEncoder
        _ce[model] = TextCrossEncoder(model)
    s = [float(x) for x in _ce[model].rerank(q, [text_fn(ITEMS[i]) for i in ids], batch_size=64)]
    p.parent.mkdir(exist_ok=True)
    p.write_text(json.dumps(s))
    return s


# ---------------------------------------------------------------- Jev
def _jev_key():
    k = os.environ.get("TYPESAFE_API_KEY")
    if not k:
        env = HERE.parents[2] / ".env"
        for line in env.read_text().splitlines() if env.exists() else []:
            if line.startswith("TYPESAFE_API_KEY="):
                k = line.split("=", 1)[1].strip().strip('"')
    return k


def systemone(body, url="https://api.typesafe.ai/v1/systemone"):
    """Cached POST. Returns (json, latency_ms or None if cached)."""
    import requests
    key = hashlib.sha1((url + json.dumps(body, sort_keys=True)).encode()).hexdigest()
    p = CACHE / "jev" / f"{key}.json"
    if p.exists():
        return json.loads(p.read_text()), None
    for attempt in range(6):
        t = time.perf_counter()
        r = requests.post(url, json=body, headers={"Authorization": f"Bearer {_jev_key()}"}, timeout=60)
        ms = (time.perf_counter() - t) * 1000
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(1.5 * (attempt + 1))
            continue
        r.raise_for_status()
        out = r.json()
        out["_latency_ms"] = ms
        p.parent.mkdir(exist_ok=True)
        p.write_text(json.dumps(out))
        return out, ms
    r.raise_for_status()


NOUL_TRUE = "The candidate is the exact item the query asks for: the same entity, value, link, file, or the specific information requested."
NOUL_FALSE = "The candidate is only on a similar topic, a different item of the same kind, or does not supply what the query asks for."


def jev_shared_state(q, ids, model="jev-latest"):
    """Production today: every candidate in one state, one noul per candidate."""
    body = {"state": {"query": q, "candidates": [{"id": str(i), "text": cand_text(ITEMS[i])} for i in ids]},
            "model": model,
            "questions": {f"c{k}": {"type": "noul",
                                    "instructions": f"Could `candidates.{k}.text` be the specific clipboard item the user is looking for when they searched for `query`?",
                                    "criteria": {"true": NOUL_TRUE, "false": NOUL_FALSE}} for k in range(len(ids))}}
    r, ms = systemone(body)
    return [r["answers"].get(f"c{k}", {}).get("noul", 0.0) for k in range(len(ids))], r


# ---------------------------------------------------------------- metrics
def evaluate(rank_fn, queries=None, k_recall=(10, 50)):
    """rank_fn(query_dict) -> ranked list of item ids. Returns metrics by kind + per-query ranks."""
    queries = queries or QUERIES
    rows = []
    for q in queries:
        ranked = rank_fn(q)
        rel = set(q["relevant"])
        r = next((i + 1 for i, x in enumerate(ranked) if x in rel), None)
        rows.append({"q": q["q"], "kind": q["kind"], "rank": r,
                     **{f"r@{k}": int(any(x in rel for x in ranked[:k])) for k in k_recall}})
    return summarize(rows), rows


def summarize(rows):
    out = {}
    groups = {"all": rows}
    for r in rows:
        groups.setdefault(r["kind"], []).append(r)
    for g, rs in groups.items():
        n = len(rs)
        out[g] = {"n": n,
                  "p1": sum(r["rank"] == 1 for r in rs) / n,
                  "mrr": sum(1 / r["rank"] for r in rs if r["rank"]) / n,
                  **{k: sum(r[k] for r in rs) / n for k in rs[0] if k.startswith("r@")}}
    return out


def show(name, m):
    a = m["all"]
    kinds = " ".join(f"{k}:{v['p1']:.2f}" for k, v in m.items() if k != "all")
    print(f"{name:<44} P@1 {a['p1']:.3f}  MRR {a['mrr']:.3f}  R@10 {a['r@10']:.3f}  R@50 {a['r@50']:.3f} | {kinds}", flush=True)


# ---------------------------------------------------------------- Laya (local MLX, same typed-question contract as Jev)
_laya = {}


def laya_agent(repo="aac6fef/laya-mlx"):
    if repo not in _laya:
        from laya_mlx import Agent
        _laya[repo] = Agent(repo, dtype="float16", batch_size=32, cache_prompts=True)
    return _laya[repo]


def laya_noul_logits(pairs, repo="aac6fef/laya-mlx", batch=32):
    """pairs: [(state, noul_question_dict)] -> list of logit(true) - logit(false). One forward per batch."""
    from laya_mlx.agent import collate_items
    a = laya_agent(repo)
    items = []
    for state, qd in pairs:
        its, _ = a.prepare(state, {"x": qd})
        items += its
    out = []
    for s in range(0, len(items), batch):
        chunk = items[s:s + batch]
        logits, _act = a.forward(collate_items(chunk, a.tok.pad_token_id, max_length=a.cfg.get("max_len", 512)))
        logits = np.asarray(logits, dtype=np.float32)
        out += [float(logits[r, 1] - logits[r, 0]) for r in range(len(chunk))]
    return out


def laya_scores(q, ids, fmt, repo="aac6fef/laya-mlx", text_fn=cand_text):
    key = hashlib.sha1(f"{repo}|{fmt.__name__}|{q}|{ids}|{[text_fn(ITEMS[i]) for i in ids]}".encode()).hexdigest()
    p = CACHE / "laya" / f"{key}.json"
    if p.exists():
        return json.loads(p.read_text())
    s = laya_noul_logits([fmt(q, text_fn(ITEMS[i])) for i in ids], repo)
    p.parent.mkdir(exist_ok=True)
    p.write_text(json.dumps(s))
    return s


def jev_inline(q, ids, model="jev-latest"):
    """Each question carries its own candidate in `instructions`; state is only the query."""
    body = {"state": {"search_query": q},
            "model": model,
            "questions": {f"c{k}": {"type": "noul",
                                    "instructions": {"clipboard_item": cand_text(ITEMS[i]),
                                                     "question": "Is `clipboard_item` the specific item the user is looking for with `search_query`?"},
                                    "criteria": {"true": NOUL_TRUE.replace("candidate", "clipboard item"),
                                                 "false": NOUL_FALSE.replace("candidate", "clipboard item")}}
                          for k, i in enumerate(ids)}}
    r, ms = systemone(body)
    return [r["answers"].get(f"c{k}", {}).get("noul", 0.0) for k in range(len(ids))], r


def jev_choice(q, ids, model="jev-latest"):
    """One Choice over the whole pool (semantic_find cookbook shape)."""
    body = {"state": {"search_query": q, "clipboard_items": {f"item{k}": cand_text(ITEMS[i]) for k, i in enumerate(ids)}},
            "model": model,
            "questions": {"pick": {"type": "choice",
                                   "instructions": "Which of `clipboard_items` is the specific item the user is looking for with `search_query`?",
                                   "criteria": {f"item{k}": None for k in range(len(ids))}}}}
    r, ms = systemone(body)
    p = r["answers"]["pick"]["probabilities"]
    return [p.get(f"item{k}", 0.0) for k in range(len(ids))], r


# ---------------------------------------------------------------- EmbeddingGemma ONNX variants (fastembed-rs ships Q and Q4)
class GemmaOnnx:
    """Raw onnxruntime runner for onnx-community/embeddinggemma-300m-ONNX (model outputs `sentence_embedding`)."""

    def __init__(self, variant="model_quantized", dims=None):
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download
        from tokenizers import Tokenizer
        repo = "onnx-community/embeddinggemma-300m-ONNX"
        ld = CACHE / "gemma"  # real files: ORT refuses external data behind HF-cache symlinks
        path = hf_hub_download(repo, f"onnx/{variant}.onnx", local_dir=ld)
        hf_hub_download(repo, f"onnx/{variant}.onnx_data", local_dir=ld)
        self.tok = Tokenizer.from_file(hf_hub_download(repo, "tokenizer.json", local_dir=ld))
        self.tok.enable_truncation(512)
        self.sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        self.dims = dims

    def embed(self, texts, batch_size=32):
        for s in range(0, len(texts), batch_size):
            enc = self.tok.encode_batch(list(texts[s:s + batch_size]))
            L = max(len(e.ids) for e in enc)
            ids = np.array([e.ids + [0] * (L - len(e.ids)) for e in enc], dtype=np.int64)
            mask = np.array([[1] * len(e.ids) + [0] * (L - len(e.ids)) for e in enc], dtype=np.int64)
            out = self.sess.run(["sentence_embedding"], {"input_ids": ids, "attention_mask": mask})[0]
            if self.dims:
                out = out[:, : self.dims]
            yield from out


def register_gemma(variant, dims=None):
    name = f"gemma:{variant}:{dims or 768}"
    if name not in _emb_models:
        _emb_models[name] = GemmaOnnx(variant, dims)
        QPREFIX[name] = QPREFIX["google/embeddinggemma-300m"]
        DPREFIX[name] = DPREFIX["google/embeddinggemma-300m"]
    return name
