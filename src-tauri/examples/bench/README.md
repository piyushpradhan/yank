# Semantic search evals

Run the evaluation from `src-tauri`:

```sh
cargo run --release --example eval_semantic
```

The default local models are BGE Small EN v1.5 and All-MiniLM-L6-v2, both supported by the existing production embedder. Their first run downloads model files. This change does not add model support or upgrade embedding dependencies.

To evaluate one model or use a private dataset:

```sh
LOCAL_MODELS=bge-small-en-v1.5 cargo run --release --example eval_semantic
DATASET=/absolute/path/to/private.json cargo run --release --example eval_semantic
```

Setting `TYPESAFE_API_KEY` adds the production Jev provider. Without a key, it is skipped. Jev sends candidate text to the configured cloud service. Its current model alias is not pinned, and cloud cost tracking and response caching remain planned.

## What gets measured

The app and evaluator call `commands::search_core`. This includes query parsing and ranking adjustments. Indexing calls `embed_queue::pending_docs` and `embed_queue::store`, so document preparation follows production code too.

Full-search results are scored on every query. BM25 and vector pools are scored separately on queries with nonempty semantic residue, so their aggregates are not directly comparable to full-search aggregates without aligning query subsets.

Metrics: Hit@1, Hit@10, MRR@10, binary-relevance nDCG@10, Recall@50, and Hit@1 by query kind. Recall@50 divides retrieved relevant items by the total number of relevant items, including when more than 50 are relevant. Search latency reports p50/p95 after model warm-up; indexing reports milliseconds per clip. Cold start is not included in search latency.

Reports are written to `$TMPDIR/yank_eval/eval_report.html` and `eval_results.json` (the OS temporary directory is used when `TMPDIR` is unset). These fixed paths are overwritten on each run; run evaluations sequentially and copy reports elsewhere when comparing runs.

## Dataset and expected results

`dataset.py` generates `dataset.json` with a fixed random seed:

* 136 legacy clips.
* 209 authored target clips.
* 1,500 generated background clips.
* 559 queries: 218 keyword, 287 paraphrase, 37 short, 11 vague, 3 time, and 3 category.

Regenerate from this directory with `python3 dataset.py`. `legacy.json` is input to that generator, not a separate benchmark entry point.

Each query's `relevant` array contains zero-based indices into `items`. Authored content queries point to their intended clip; five category/date queries derive every matching index from metadata through `FILTERS`. Those indices become database row IDs when the evaluator seeds its temporary database.

Time queries resolve against the machine's local clock and timezone, which the report records. The corpus is deterministic, but time-query behavior can vary by timezone or across a DST transition.

## Current limits

This is a development dataset, without a held-out test split or confidence intervals. Content judgments have not been exhaustively audited: for example, the broad recipe query can have valid results beyond its current answer key. There are no no-answer queries. Generated background clips and authored queries have not been validated against actual clipboard searches.

## Verification

```sh
cargo test --lib
cargo test --example eval_semantic
```
