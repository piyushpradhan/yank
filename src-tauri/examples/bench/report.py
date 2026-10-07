"""Builds report.html from the Rust eval results + experiments.json.

    python report.py   # reads results_rust*.json, writes report.html
"""
import datetime
import json
from pathlib import Path

HERE = Path(__file__).parent
main = json.loads((HERE / "results_rust_nolaya.json").read_text())
laya_p = HERE / "results_rust_laya.json"
if laya_p.exists():  # Laya runs separately (needs scripts/laya_server.py up)
    laya = json.loads(laya_p.read_text())
    main["summary"]["laya"] = laya["summary"]["laya"]
    for r, lr in zip(main["rows"], laya["rows"]):
        assert r["q"] == lr["q"]
        r["laya"] = lr["laya"]

rows = main["rows"]
ds = json.loads((HERE / "dataset.json").read_text())


def recall(strategy, kind=None):
    rs = [r for r in rows if kind is None or r["kind"] == kind]
    return sum(r[strategy]["rank"] is not None for r in rs) / len(rs)


recall_rows = [
    {"name": "BM25 top 50 (what Jev re-ranked before)", **{k: recall("bm25", kk) for k, kk in (("all", None), ("para", "para"), ("kw", "kw"))}},
    {"name": "EmbeddingGemma top 50 (what Jev re-ranks now)", "shipped": True,
     **{k: recall("local", kk) for k, kk in (("all", None), ("para", "para"), ("kw", "kw"))}},
]

# Examples: paraphrase / vague queries the old pipeline missed and the new one ranks first.
qmap = {q["q"]: q for q in ds["queries"]}
picked = []
for r in rows:
    if r["kind"] in ("para", "vague") and r["jev"]["rank"] == 1 and (r["before"]["rank"] or 99) > 3:
        q = qmap[r["q"]]
        picked.append({"q": r["q"], "target": ds["items"][q["relevant"][0]]["content"][:90],
                       "before": f"#{r['before']['rank']}" if r["before"]["rank"] else None, "after": "#1"})
step = max(1, len(picked) // 10)
examples = picked[::step][:10]

S = main["summary"]
n_para = S["jev"]["metrics"]["para"]["n"]
method = [
    f"Corpus: {main['n_items']:,} clips. 136 clips and 56 queries come from the original eval written before this work (the “Orig. 56” column is that subset, an out-of-sample check); the rest are new hand-written clips (dev commands, links, notes, contacts, travel, money) plus ~1,500 generated clipboard noise items (hashes, log lines, chat replies, random URLs/phones/emails) that no query targets.",
    f"Queries: {main['n_queries']} labelled with the clip(s) they should find, in the styles people type: keyword ({S['jev']['metrics']['kw']['n']}), paraphrase with no shared words ({n_para}), short 1–3 word ({S['jev']['metrics']['short']['n']}), vague recall ({S['jev']['metrics']['vague']['n']}), plus date- and category-only queries.",
    "Every “After” number comes from <code>cargo run --release --example eval_semantic</code>, which seeds a SQLite DB with the app schema, embeds with the app's own queue, and calls <code>commands::search</code>, the function behind the palette. “Before” reproduces the removed BM25 → Jev-noul code path request for request.",
    "Knobs chosen on this same set: the embedding model, what text gets embedded, the BM25 weight (0.02), the shortlist size, and the Laya blend (0.5). Only a handful of settings, but still tuned in-sample; the Orig. 56 subset tracks the full set closely, which suggests it isn't overfit.",
    "The clips and queries were written by Claude, not sampled from real usage. Real histories are messier (long logs, duplicates, other languages). Treat absolute numbers as indicative; the gaps between pipelines are large enough to hold.",
    "Latency was measured on an Apple M5 with other benchmark jobs running, so it reads high. Jev latency is dominated by the network round-trip and is flat from 10 to 50 candidates. With history padded to 20,000 clips, on-device search stays at 18 ms p50 (in-memory vector index).",
    "Laya numbers use <code>scripts/laya_server.py</code> (laya-mlx, float16) on the same machine.",
]

data = {
    "date": datetime.date.today().isoformat(),
    "n_items": main["n_items"], "n_queries": main["n_queries"],
    "summary": S, "recall": recall_rows, "examples": examples,
    "experiments": json.loads((HERE / "experiments.json").read_text()),
    "method": method,
    "cost_note": "Tokens are TypeSafe input tokens per search (output is free) at $0.042 per million. The old request carried 50 yes/no questions, each repeating its own instructions and criteria; one Choice question states them once.",
}
html = (HERE / "report_template.html").read_text().replace("/*DATA*/null", json.dumps(data, ensure_ascii=False))
(HERE / "report.html").write_text(html)
print("wrote report.html", {k: round(v["metrics"]["all"]["p1"], 3) for k, v in S.items()})
