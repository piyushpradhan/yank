"""Hybrid first stage + re-rankers. Usage: python exp.py <dense-model> [stage...]"""
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np

import bench as b

MODEL = sys.argv[1] if len(sys.argv) > 1 else "BAAI/bge-small-en-v1.5"
STAGES = set(sys.argv[2:]) or {"first"}
if MODEL.startswith("gemma:"):
    _, _v, _d = MODEL.split(":")
    MODEL = b.register_gemma(_v, None if _d == "768" else int(_d))

QI = {q["q"]: i for i, q in enumerate(b.QUERIES)}
SEM = [b.intent(q["q"]) for q in b.QUERIES]
DOCS = b.doc_matrix(MODEL)
QV = b.query_vecs(MODEL, [s or q["q"] for (s, _), q in zip(SEM, b.QUERIES)])
COS = QV @ DOCS.T  # (nq, N)
DAYS = np.array([it["days_ago"] for it in b.ITEMS], dtype=np.float32)
CATS = np.array([it["category"] for it in b.ITEMS])


def residue(q):
    s, _ = SEM[QI[q["q"]]]
    return s or q["q"]


def bm25_norm(q, limit=50):
    """BM25 hits as a rank-decayed [0,1] signal (AND-form hits rank first, like prod)."""
    ids = b.bm25_pool(residue(q), limit)
    v = np.zeros(b.N, dtype=np.float32)
    for r, i in enumerate(ids):
        v[i] = 1.0 / (1.0 + r / 5.0)
    return v


def first_scores(q, w_bm25=0.0, w_cat=0.0, w_rec=0.0):
    qi = QI[q["q"]]
    s = COS[qi].copy()
    if w_bm25:
        s += w_bm25 * bm25_norm(q)
    _, cat = SEM[qi]
    if cat and w_cat:
        s += w_cat * (CATS == cat)
    if w_rec:
        s += w_rec * np.exp(-DAYS / 14)
    return s


def rrf(q, k=60):
    qi = QI[q["q"]]
    d = np.argsort(-COS[qi])[:100]
    bm = b.bm25_pool(residue(q), 100)
    sc = {}
    for r, i in enumerate(d):
        sc[i] = sc.get(i, 0) + 1 / (k + r)
    for r, i in enumerate(bm):
        sc[i] = sc.get(i, 0) + 1 / (k + r)
    return sorted(sc, key=lambda i: -sc[i])


def top(s, k=50):
    return list(np.argsort(-s)[:k])


if "first" in STAGES:
    b.show(f"dense {MODEL.split('/')[-1]}", b.evaluate(lambda q: top(first_scores(q)))[0])
    b.show("RRF(dense, bm25) k=60", b.evaluate(rrf)[0])
    for w in (0.02, 0.05, 0.1, 0.15, 0.2, 0.3):
        b.show(f"cos + {w}*bm25", b.evaluate(lambda q: top(first_scores(q, w_bm25=w)))[0])
    for wc in (0.02, 0.05):
        b.show(f"cos + 0.1*bm25 + {wc}*cat", b.evaluate(lambda q: top(first_scores(q, 0.1, wc)))[0])
    for wr in (0.005, 0.02):
        b.show(f"cos + 0.1*bm25 + 0.02cat + {wr}rec", b.evaluate(lambda q: top(first_scores(q, 0.1, 0.02, wr)))[0])


def pool(q, k=30):
    return top(first_scores(q, w_bm25=0.05), k)


def fused(q, scores, ids, alpha):
    """Final = alpha * z(reranker) + (1-alpha) * z(first stage) over the pool."""
    fs = first_scores(q, w_bm25=0.05)[ids]
    r = np.asarray(scores, dtype=np.float32)
    z = lambda x: (x - x.mean()) / (x.std() + 1e-6)
    f = alpha * z(r) + (1 - alpha) * z(fs)
    return [ids[i] for i in np.argsort(-f)]


def run_reranker(name, score_fn, k=30, alphas=(1.0, 0.8, 0.6), workers=1):
    ids_of = {q["q"]: pool(q, k) for q in b.QUERIES}
    with ThreadPoolExecutor(workers) as ex:
        sc = dict(zip([q["q"] for q in b.QUERIES], ex.map(lambda q: score_fn(q, ids_of[q["q"]]), b.QUERIES)))
    for a in alphas:
        b.show(f"{name} k={k} a={a}", b.evaluate(lambda q: fused(q, sc[q["q"]], ids_of[q["q"]], a))[0])
    return sc


if "pool" in STAGES:
    for k in (10, 20, 30, 50):
        m = b.evaluate(lambda q: pool(q, k), k_recall=(k, 50))[0]["all"]
        print(f"pool k={k}: recall {m[f'r@{k}']:.3f}")

for ce in [s[3:] for s in STAGES if s.startswith("ce:")]:
    run_reranker(f"CE {ce.split('/')[-1]}", lambda q, ids: b.ce_scores(ce, residue(q), ids))


def laya_fmt_pair(q, t):
    return ({"search_query": q, "clipboard_item": t},
            {"type": "noul", "instructions": "Is `clipboard_item` the item the user is looking for with `search_query`?",
             "criteria": {"true": b.NOUL_TRUE, "false": b.NOUL_FALSE}})


def laya_fmt_item(q, t):
    return (t, {"type": "noul", "instructions": f'Is this the clipboard item the user wants when they search for "{q}"?',
                "criteria": {"true": "Yes: it is the exact item or holds the specific information the search asks for.",
                             "false": "No: it is a different item, only loosely related, or unrelated."}})


for fmt in [s[5:] for s in STAGES if s.startswith("laya:")]:
    repo, f = fmt.split("@")
    run_reranker(f"Laya {repo.split('/')[-1]} {f}", lambda q, ids: b.laya_scores(residue(q), ids, globals()[f], repo))

if "jev" in STAGES:
    run_reranker("Jev shared-state", lambda q, ids: b.jev_shared_state(residue(q), ids)[0], workers=8)
if "jev_inline" in STAGES:
    run_reranker("Jev inline", lambda q, ids: b.jev_inline(residue(q), ids)[0], workers=8)
if "jev_choice" in STAGES:
    run_reranker("Jev choice", lambda q, ids: b.jev_choice(residue(q), ids)[0], workers=8)
for s in STAGES:
    if s.startswith("jev_choice@"):
        run_reranker("Jev choice", lambda q, ids: b.jev_choice(residue(q), ids)[0], k=int(s.split("@")[1]), alphas=(1.0, 0.8), workers=8)


def fused_logp(q, logp, ids, alpha, w_bm25=0.02):
    fs = first_scores(q, w_bm25=w_bm25)[ids]
    r = np.asarray(logp, dtype=np.float32)
    z = lambda x: (x - x.mean()) / (x.std() + 1e-6)
    f = alpha * z(r) + (1 - alpha) * z(fs)
    return [ids[i] for i in np.argsort(-f)]


if "fuse_grid" in STAGES:
    A = (1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3)
    for k in (20, 30, 50):
        ids_of = {q["q"]: top(first_scores(q, w_bm25=0.02), k) for q in b.QUERIES}
        jev = {q["q"]: np.log(np.maximum(b.jev_choice(residue(q), ids_of[q["q"]])[0], 1e-6)) for q in b.QUERIES}
        print(f"-- k={k}  stage1-only P@1 {b.evaluate(lambda q: ids_of[q['q']])[0]['all']['p1']:.3f}")
        for a in A:
            b.show(f"Jev choice logp k={k} a={a}", b.evaluate(lambda q: fused_logp(q, jev[q['q']], ids_of[q['q']], a))[0])
        if k <= 30:
            laya = {q["q"]: b.laya_scores(residue(q), ids_of[q["q"]], laya_fmt_pair) for q in b.QUERIES}
            for a in A:
                b.show(f"Laya pair k={k} a={a}", b.evaluate(lambda q: fused_logp(q, laya[q['q']], ids_of[q['q']], a))[0])
