# Yank semantic search evals: plan

Goal: one harness that answers "is model/strategy B better than A for Yank users, and at what cost?" for local embedders, local decision models (Laya), cloud decision models (Jev), and frontier LLMs, without re-deriving the setup each time.

Update (2026-10-16): the eval-only change defaults to BGE and MiniLM, using existing production model support. Gemma adapters, embedding dependency upgrades, and model-selection UI changes are excluded. Recall@50 now divides by the total relevant count, with regression tests for more than 50 relevant clips and the rank cutoff. Full-search and pool aggregates use different query subsets, so align those subsets before attributing a quality delta to fusion or boosts. See `src-tauri/examples/bench/README.md` for run instructions and known limits.

## 1. Where things stand (updated 2026-10-11, branch `chore/semantic-evals`)

| What | Where | Status |
|---|---|---|
| Rust eval, end to end through `commands::search_core` (the same function the `search_semantic` command calls), per local model + Jev; stage-1 pools (`commands::vector_pool`, `commands::bm25_pool`) scored separately | `src-tauri/examples/eval_semantic.rs` | Done |
| Metrics: Hit@1, Hit@10, MRR@10, nDCG@10, Recall@50, Hit@1 per query kind, latency p50/p95, index ms/item | same | Done (P@5/P@10 removed) |
| Dataset: 1,845 clips (about 1.5k noise) + 559 queries tagged `kw/para/short/vague/time/cat`; the only dataset (old built-in 136/56 set removed from the eval) | `src-tauri/examples/bench/dataset.py` → `dataset.json` (`legacy.json` is its first layer) | Done |
| Answer keys for filter queries ("phone numbers", "emails", "addresses", "...yesterday") derived from item metadata in `dataset.py` (`FILTERS`) | same | Done ("phone numbers" 6 → 117 relevant) |
| Python exploration (17-embedder sweep, fusion sweeps, Laya server) and its result JSON | `chore/re-ranking` only | Not brought over: it measured a different pipeline |
| Unit tests for `query_time` / `query_intent` / `color_intent` | 13 / 13 / 15 tests | Keep as tests, not evals |

### Gaps still open

1. **No error bars.** In `experiments.json`, "cosine only 0.796" vs "+0.02 BM25 0.792" is a 0.4pt gap on 553 queries. A rough unpaired uncertainty estimate is larger than that gap; deciding between them needs a paired comparison. Existing aggregates do not establish a winner.
2. **No dev/test split.** 17 models plus fusion and doc-text sweeps were all tuned on the same 559 queries, so the reported scores are not held-out estimates.
3. **Ground truth is still hand-picked for content queries.** Filter queries are fixed. Content queries can still have unlabelled correct answers; needs the pooling audit in 2.4.5.
4. **No no-answer queries.** Nothing measures "returns junk confidently".
5. **LLM strategies are not reproducible.** Jev runs on the production default `jev-latest` (a floating alias), no response cache, no repeat runs, no cost tracking.
6. **Author bias.** Targets and queries were constructed together, and legacy clips carry labels that can echo the query words. This can favor lexical matching; real-data validation is still needed.

Decision (2026-10-11): the clock is **not** pinned. Time queries resolve against the current machine's clock and local timezone (`Local::now()`), the same as the app. The eval prints the clock and offset it ran with, and results for time queries can differ on another machine, in another timezone or across a DST change.

## 2. Methodology

### 2.1 Evaluate the production code path (done)

```rust
pub async fn search_core(db: &Arc<Db>, cfg: &EmbedConfig, local: &LocalState,
                         model_cache_dir: PathBuf, query: &str, limit: usize)
    -> Result<SearchResponse, String>
```

The Tauri command is now a thin wrapper around it, and the eval calls it directly. A "strategy" is an `EmbedConfig` value. Indexing goes through `embed_queue::pending_docs` + `embed_queue::store`, the same functions the embed queue uses. No trait is needed until a third reranker exists.

### 2.2 Evaluate stages separately, then together

Yank is a two-stage pipeline: candidate generation (BM25 / embedder / hybrid), then an optional rerank (Jev Choice, Laya, frontier LLM, cross-encoder).

| Stage | Question | Metric |
|---|---|---|
| Stage 1 (embedders, fusion) | Is the right clip in the shortlist at all? | **Recall@N** (N = shortlist size, e.g. 30/50), Hit@1, MRR@10 |
| Stage 2 (rerankers) on an **oracle pool** (stage-1 top-N with the gold clip injected if missing) | How good is the reranker by itself? | Hit@1, MRR@10 |
| Stage 2 on the real pool | What do users actually get? | Hit@1, MRR@10 |
| End to end via `search_core` | Same, plus the boosts and filters | Hit@1, Hit@8 (palette viewport), MRR@10, nDCG@10 for multi-relevant queries |

This is the lesson from the Jev experiment: a reranker can't fix a shortlist that never contained the target. Reporting "Hit@1 given gold in pool" next to Recall@N shows which stage to invest in.

P@5 and P@10 are gone. Primary metric: **Hit@1** (users paste the top hit). Secondary: MRR@10. Stage-1 metric: Recall@N.

### 2.3 Operational metrics count as quality

Report these for every strategy:
- query latency p50/p95 at 2k, 20k and 100k clips (`SCALE=` support is on `chore/re-ranking`, not in the current harness)
- indexing throughput (clips/s), model size on disk, peak RSS, cold-start time
- cost per 1k queries (cloud), and tokens per query
- **data leaves device: yes/no.** This is a product constraint for a clipboard manager, not a footnote.

Then plot quality vs latency vs size/cost and pick from the Pareto frontier within a budget. Example budget for the local default: ≤300 MB, ≤30 ms p95 at 20k clips.

### 2.4 Dataset

1. ~~**Promote** `dataset.py` + `dataset.json` from `chore/re-ranking`~~ (done, `examples/bench/`). Still to do: add a `version` field and bump it on every change.
2. **Split** into dev (about 70%, tune freely) and test (about 30%, run only for ship decisions), stratified by slice tag. Rotate in fresh test queries when the test set has been looked at too often.
3. **Slices** to report separately (averages hide regressions): `kw, para, short, vague, time, cat, code, typo, no_label, near_dup, no_answer`.
   - `typo`: generated perturbations of existing queries (swap/drop characters, lowercase).
   - `no_label`: the same clips with Haiku labels stripped. Most users don't run the labeller.
   - `near_dup`: hard negatives, e.g. two flight confirmations or two phone numbers for different people.
   - `no_answer`: queries with no relevant clip. Use them to measure false confidence and to set a "no good match" threshold.
4. **Synthetic queries:** generate with an LLM from a *different family than the models under test* (avoids self-preference), steer toward real query style (2–4 words, lowercase, sloppy), then hand-review. This is Chroma's generative benchmarking recipe.
5. **Audit ground truth (TREC pooling):** after each new strategy, pool its unjudged top-5 results, have an LLM judge label them for relevance, hand-verify a sample, and add confirmed hits to the qrels. Without this, better models look worse.
6. **Grow by error analysis, not brainstorming.** Every bad search you hit in real use becomes a case.

### 2.5 The real-data set (the only representative one)

A synthetic corpus is a proxy. Yank is local-first, so there are no query logs to mine. Two options:
- **Personal dogfood set:** 50–150 queries you actually typed against your own clipboard DB, with gold IDs. Store it outside the repo and never commit it (it contains secrets). Run it with `DATASET=~/yank-private/eval.json`; the loader already exists.
- **Implicit judgments:** Yank already knows when a search is followed by a paste. Logging `(query, rank of the pasted clip)` locally gives free relevance labels. Use it for your own build only, or as opt-in export later. It also tells you whether the synthetic set's ranking of models matches reality (Chroma's representativeness check).

### 2.6 Comparing two runs

- Each run writes `runs/<strategy>@<model>@<dataset_version>.jsonl` with one line per query: ranked IDs, scores, latency, tokens, cost, slice.
- `compare.py a.jsonl b.jsonl` prints a per-slice delta with **paired bootstrap 95% CI** (resample queries) plus the list of queries that flipped win/loss. Use `ranx` (it has paired tests built in) instead of hand-rolled stats.
- Ship rule: the test-set CI on Hit@1 excludes 0, no slice drops by more than its CI, and operational budgets hold.
- Rough noise floor: n=560 at about 80% gives an unpaired CI of about ±3.3pt. Paired comparisons are much tighter, so always compare paired, per query.

### 2.7 Specifics for decision models and LLM rerankers

- **Pin exact model versions.** Never `*-latest` in an eval, or numbers change under you.
- **Treat the prompt as part of the model.** Eval the (model, prompt, pool size) tuple and rerun on any prompt change.
- **Cache responses** keyed by `hash(model, prompt, candidate ids)` under `$TMPDIR/yank_eval/cache`. Reruns become free and reproducible; bust the cache on purpose.
- **Nondeterminism:** run k=3 times. Report mean ± spread and the **flip rate** (share of queries whose top-1 changes between runs).
- **Position bias:** shuffle candidate order between runs. A big gap means the reranker reads order, not content.
- **Calibration** (Jev/Laya output probabilities): plot a reliability diagram on dev, then choose the "no match" threshold on `no_answer` queries.
- **Pool-size sweep:** N = 10/30/50 against cost and latency. More candidates raise recall but cost more and dilute attention.
- **Frontier LLMs** as reranker or query rewriter: use the same harness slot as Jev. Record tokens, $ and the "leaves device" flag.

### 2.8 Automation

- **CI gate (no API keys):** BM25 + default local model on dev, model cached in CI. Fail if Hit@1 or Recall@N drops below the committed baseline minus the noise floor. Run on changes to `commands.rs`, `embed*.rs`, `local_embed.rs`, `query_*.rs`.
- **Cloud/LLM strategies:** run manually, or on a weekly schedule with keys. Never on PRs.

## 3. Phases

1. **Foundation:** ~~promote the dataset; extract `search_core`; switch to Hit@k/Recall@N/MRR@10/nDCG@10; derive filter-query answer keys~~ (done). Left: dev/test split; JSONL runs; `compare.py` using ranx.
2. **Isolation:** oracle-pool reranker eval; operational metrics at scale; qrel pooling audit; `typo/no_label/near_dup/no_answer` slices.
3. **Reality check:** personal dogfood set; local paste-after-search logging; check that synthetic rankings match real ones.
4. **LLM hardening + CI:** response cache, k-repeats, shuffle test, calibration, CI gate.

## 4. General principles

1. **Look at failures before metrics.** Read 50 misses, tag why each failed, count the tags. Most wins come from fixing a category (doc text, labels, date parsing), not from swapping models.
2. **Every eval should drive a decision** ("switch the default embedder?"). If no decision hangs on a number, don't build it.
3. **Representativeness beats size.** MTEB/BEIR are generic and probably in the training data. Use them only to shortlist candidates, then decide on your own data.
4. **Regression evals** (must stay near 100%, CI gate) differ from **capability evals** (hard cases, low scores expected, track the trend).
5. **Report error bars.** Without CIs, a 1pt "win" is a coin flip. Compare paired.
6. **Goodhart:** anything you tune on stops measuring generalization. Keep a locked test set.
7. **Measure the whole system and each component.** Component wins can vanish end to end, and the other way round.
8. **Reproducibility:** pin seeds, model versions and dataset version; record the clock/timezone a run used (Yank's eval prints it); cache API calls.
9. **Latency, size, cost and privacy are metrics**, not afterthoughts.
10. **Use LLM-as-judge only where there's no ground truth** (qrel audit, open-ended answers). Validate the judge against your own labels first (agreement, TPR/TNR). Criteria drift as you read outputs, so expect to revise the rubric.

## 5. Resources

Similar products and domains:
- Cursor, "Improving agent with semantic search": own embedder, offline Context Bench run across models, plus online A/B. https://cursor.com/en-US/blog/semsearch
- Chroma, "Generative Benchmarking": generating representative queries from your own corpus. https://research.trychroma.com/generative-benchmarking
- Jason Liu × Kelly Hong, "Stop trusting MTEB rankings". https://jxnl.co/writing/2025/09/11/stop-trusting-mteb-rankings-kelly-hong-chroma/
- Jason Liu, "Systematically improving RAG": recall-first, synthetic questions. https://jxnl.co/writing/2024/05/22/systematically-improving-your-rag/
- Personal search evaluation (closest academic match to a clipboard manager): Kelly et al., ECIR 2012 https://doras.dcu.ie/16883 and the Evaluating Personal Search workshop https://www.cs.nuim.ie/~lkelly/iCLIPS/EPS2011/

Eval practice:
- Anthropic, "Demystifying evals for AI agents": tasks/graders/harness, capability vs regression, pass@k. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Anthropic, "A statistical approach to model evaluations": error bars, paired tests, power. https://www.anthropic.com/research/statistical-approach-to-model-evals (paper: https://arxiv.org/abs/2411.00640)
- Hamel Husain: "Your AI product needs evals" https://hamel.dev/blog/posts/evals/, "Field guide" https://hamel.dev/blog/posts/field-guide/, "LLM-as-judge" https://hamel.dev/blog/posts/llm-judge/
- Eugene Yan, "Task-specific LLM evals that do & don't work". https://eugeneyan.com/writing/evals/
- Shankar et al., "Who Validates the Validators?" (criteria drift). https://arxiv.org/abs/2404.12272
- Zheng et al., "Judging LLM-as-a-Judge" (position and self-preference bias). https://arxiv.org/abs/2306.05685

IR and retrieval:
- BEIR https://arxiv.org/abs/2104.08663 · MTEB https://arxiv.org/abs/2210.07316 · leaderboard https://huggingface.co/spaces/mteb/leaderboard
- Thomas et al., "LLMs can accurately predict searcher preferences" (LLM relevance labels, Bing). https://arxiv.org/abs/2309.10621
- UMBRELA (open LLM relevance assessor). https://arxiv.org/abs/2406.06519
- Liu et al., "Lost in the Middle" (position effects in long candidate lists). https://arxiv.org/abs/2307.03172
- Smucker, Allan & Carterette, "A comparison of statistical significance tests for IR evaluation" (CIKM 2007)
- ranx (IR metrics + paired significance tests in Python). https://github.com/AmenRa/ranx
