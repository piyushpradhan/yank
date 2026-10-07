# Semantic search bench

Evidence behind the search pipeline in `src/embed.rs` / `commands::search`.
Results: `report.html` (open in a browser).

| File | What |
|---|---|
| `dataset.py` → `dataset.json` | 1,845 clips + 559 labelled queries (`legacy.json` = the original 136/56 set) |
| `../eval_semantic.rs` | **The proof.** Seeds a DB, embeds with the app's queue, runs every query through `commands::search`, plus the old BM25→Jev path as baseline |
| `bench.py`, `exp.py`, `sweep_*.py` | Python exploration: embedding models, document text, fusion weights, re-rank question shapes, Laya |
| `experiments.json` | Numbers from the Python runs used in the report |
| `report.py` | Builds `report.html` from `results_rust_*.json` + `experiments.json` |

Reproduce:

```sh
# Rust eval (downloads EmbeddingGemma 4-bit once, ~200 MB). TYPESAFE_API_KEY
# (or ../../../.env) enables the Jev + "before" strategies.
cd src-tauri
ONLY=bm25,before,local,jev cargo run --release --example eval_semantic
cp examples/bench/results_rust.json examples/bench/results_rust_nolaya.json

# Laya: start the local server, then run just that strategy.
uv run --with laya-mlx ../scripts/laya_server.py &
LAYA_URL=http://127.0.0.1:8765/v1/systemone ONLY=laya cargo run --release --example eval_semantic
cp examples/bench/results_rust.json examples/bench/results_rust_laya.json

# Latency at 20k clips
SCALE=20000 ONLY=local cargo run --release --example eval_semantic

python3 examples/bench/report.py
```

Python bench: `uv venv .venv && uv pip install fastembed numpy requests laya-mlx`, then e.g.
`.venv/bin/python exp.py gemma:model_q4:768 first pool jev_choice`.
