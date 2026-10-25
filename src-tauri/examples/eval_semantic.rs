//! Evaluation harness for Yank's semantic search.
//!
//! Run with:
//!   cd src-tauri && cargo run --release --example eval_semantic
//!
//! Env:
//!   DATASET=path.json     corpus + labelled queries; default
//!                         `examples/bench/dataset.json` (built by `dataset.py`)
//!   LOCAL_MODELS=a,b      local models to evaluate (default: BGE + MiniLM)
//!   TYPESAFE_API_KEY=...  also evaluate the Jev provider
//!
//! Every query goes through `commands::search_core`, the function the
//! `search_semantic` command calls, so the numbers are what users get: date
//! and category parsing, RRF fusion, category/colour boosts, recency
//! tiebreak. The stage-1 pools (`commands::vector_pool`,
//! `commands::bm25_pool`) are also scored on their own, which shows whether a
//! miss comes from retrieval (target never in the pool) or from ranking.
//!
//! Clock: time queries ("yesterday", "4 days ago") resolve against this
//! machine's clock and local timezone, exactly as in the app. Clips are seeded
//! `days_ago * 24h` before now, so time-query results can differ on another
//! machine, in another timezone, or across a DST change.
//!
//! Metrics, averaged over queries: Hit@1, Hit@10, MRR@10, nDCG@10, Recall@50,
//! Hit@1 per query kind, query latency p50/p95. Writes
//! `$TMPDIR/yank_eval/eval_report.html` and `eval_results.json`.

use std::collections::{BTreeMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use chrono::Local;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use yank_lib::commands::{self, ClipItem};
use yank_lib::db::{self, Db};
use yank_lib::embed::{EmbedConfig, EmbedTask, Provider};
use yank_lib::embed_queue;
use yank_lib::local_embed::{self, LocalState};
use yank_lib::model_store;
use yank_lib::query_intent;
use yank_lib::query_time;

/// Results requested per query. Wider than the palette so Recall@50 can tell
/// whether the target made the list at all; top-10 metrics are unaffected.
const LIMIT: usize = 50;

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct Item {
    content: String,
    category: String,
    label: Option<String>,
    source: String,
    days_ago: i64,
}

#[derive(Deserialize)]
struct Query {
    q: String,
    relevant: Vec<usize>,
    #[serde(default)]
    kind: String,
}

#[derive(Deserialize)]
struct Dataset {
    items: Vec<Item>,
    queries: Vec<Query>,
}

fn load_dataset() -> Result<Dataset, Box<dyn std::error::Error>> {
    let path = std::env::var("DATASET").unwrap_or_else(|_| {
        concat!(env!("CARGO_MANIFEST_DIR"), "/examples/bench/dataset.json").into()
    });
    Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

#[derive(Serialize, Default)]
struct Metrics {
    name: String,
    hit_at_1: f64,
    hit_at_10: f64,
    mrr_at_10: f64,
    ndcg_at_10: f64,
    recall_at_50: f64,
    hit_at_1_by_kind: BTreeMap<String, f64>,
    p50_ms: Option<f64>,
    p95_ms: Option<f64>,
    /// One-off cost of embedding the corpus (local models only).
    index_ms_per_item: Option<f64>,
    /// Rank of the first relevant result per query (1-based, within `LIMIT`).
    #[serde(skip)]
    ranks: Vec<Option<usize>>,
    #[serde(skip)]
    latencies: Vec<f64>,
    #[serde(skip)]
    kinds: BTreeMap<String, (f64, f64)>,
}

impl Metrics {
    fn new(name: impl Into<String>) -> Self {
        Self { name: name.into(), ..Default::default() }
    }

    fn add(&mut self, results: &[i64], relevant: &HashSet<i64>, kind: &str, latency_ms: Option<f64>) {
        let rank = results.iter().position(|id| relevant.contains(id)).map(|i| i + 1);
        let hit1 = if rank == Some(1) { 1.0 } else { 0.0 };
        self.hit_at_1 += hit1;
        if let Some(r) = rank.filter(|&r| r <= 10) {
            self.hit_at_10 += 1.0;
            self.mrr_at_10 += 1.0 / r as f64;
        }
        // Binary-relevance nDCG: multi-answer queries ("phone numbers") get
        // credit for every relevant clip in the top 10, not just the first.
        let gain = |i: usize| 1.0 / (i as f64 + 2.0).log2();
        let dcg: f64 = (0..results.len().min(10)).filter(|&i| relevant.contains(&results[i])).map(gain).sum();
        let idcg: f64 = (0..relevant.len().min(10)).map(gain).sum();
        if idcg > 0.0 {
            self.ndcg_at_10 += dcg / idcg;
        }
        let found = results.iter().take(50).filter(|id| relevant.contains(id)).count();
        self.recall_at_50 += found as f64 / relevant.len().max(1) as f64;
        let k = self.kinds.entry(kind.to_string()).or_default();
        k.0 += hit1;
        k.1 += 1.0;
        self.latencies.extend(latency_ms);
        self.ranks.push(rank);
    }

    fn finish(&mut self) {
        let n = self.ranks.len().max(1) as f64;
        for m in [
            &mut self.hit_at_1,
            &mut self.hit_at_10,
            &mut self.mrr_at_10,
            &mut self.ndcg_at_10,
            &mut self.recall_at_50,
        ] {
            *m /= n;
        }
        self.hit_at_1_by_kind = self.kinds.iter().map(|(k, (h, n))| (k.clone(), h / n)).collect();
        let l = &mut self.latencies;
        l.sort_by(f64::total_cmp);
        let pct = |p: f64| l.get(((l.len().max(1) - 1) as f64 * p).round() as usize).copied();
        self.p50_ms = pct(0.5);
        self.p95_ms = pct(0.95);
    }
}

fn ids(items: &[ClipItem]) -> Vec<i64> {
    items.iter().map(|i| i.id.parse().unwrap_or_default()).collect()
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct QueryRow {
    q: String,
    kind: String,
    residue: String,
    ranks: Vec<Option<usize>>,
}

#[derive(Serialize)]
struct Report {
    n_items: usize,
    n_queries: usize,
    clock: String,
    /// End to end through `commands::search_core`.
    strategies: Vec<Metrics>,
    /// Stage-1 candidate pools, scored on queries that have a semantic residue.
    stages: Vec<Metrics>,
    queries: Vec<QueryRow>,
}

/// One labelled query, with the residue and date window production derives
/// from it (used only to score the stage-1 pools).
struct Case {
    q: String,
    kind: String,
    residue: String,
    time: Option<(i64, i64)>,
    relevant: HashSet<i64>,
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let work_dir = std::env::temp_dir().join("yank_eval");
    std::fs::create_dir_all(&work_dir)?;
    let db_path = work_dir.join("eval.db");
    let _ = std::fs::remove_file(&db_path);
    let db = Arc::new(Db(Mutex::new(db::open(&db_path)?)));

    let api_key = std::env::var("TYPESAFE_API_KEY").unwrap_or_default();
    if api_key.trim().is_empty() {
        eprintln!("TYPESAFE_API_KEY not set — skipping Jev.");
    }
    let local_models: Vec<String> = std::env::var("LOCAL_MODELS")
        .unwrap_or_else(|_| "bge-small-en-v1.5,all-minilm-l6-v2".into())
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let data = load_dataset()?;
    let now = Local::now();
    let clock = format!(
        "{} (time queries use this machine's clock and local timezone)",
        now.format("%Y-%m-%d %H:%M %:z")
    );
    eprintln!("clock: {clock}");
    eprintln!("seeding {} items...", data.items.len());

    let mut item_ids: Vec<i64> = Vec::with_capacity(data.items.len());
    {
        let conn = db.conn();
        for it in &data.items {
            let created = now.timestamp_millis() - it.days_ago * 86_400_000;
            let preview: String = it.content.chars().take(60).collect();
            conn.execute(
                "INSERT INTO items (content, category, label, preview, source, pinned, deleted, created_at, last_used_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6, ?6)",
                params![it.content, it.category, it.label, preview, it.source, created],
            )?;
            item_ids.push(conn.last_insert_rowid());
        }
    }

    let cases: Vec<Case> = data
        .queries
        .iter()
        .map(|q| {
            let pt = query_time::parse(now, &q.q);
            Case {
                q: q.q.clone(),
                kind: q.kind.clone(),
                residue: query_intent::parse(&pt.semantic).semantic.trim().to_string(),
                time: pt.time.map(|t| (t.from_ms, t.to_ms)),
                relevant: q.relevant.iter().map(|&i| item_ids[i]).collect(),
            }
        })
        .collect();
    let ranked: Vec<&Case> = cases.iter().filter(|c| !c.residue.is_empty()).collect();

    let mut strategies: Vec<Metrics> = Vec::new();
    let mut stages: Vec<Metrics> = Vec::new();

    let mut bm25 = Metrics::new("BM25 pool");
    for c in &ranked {
        let pool = commands::bm25_pool(&db.conn(), &c.residue, LIMIT, c.time).unwrap_or_default();
        bm25.add(&ids(&pool), &c.relevant, &c.kind, None);
    }
    stages.push(bm25);

    let state = LocalState::new();
    let cache_dir = work_dir.join("models");
    for model in &local_models {
        let cfg = EmbedConfig {
            provider: Provider::Local,
            local_model: model.clone(),
            ..Default::default()
        };
        let model_id = cfg.model_id();

        // First run downloads the model (the app does this in the
        // background); the warm-up then loads it. Both untimed.
        eprintln!("[{model}] loading...");
        model_store::download_blocking(&cache_dir, model)?;
        local_embed::embed_local(&state, cache_dir.clone(), model, "warm up", EmbedTask::Query).await?;

        eprintln!("[{model}] embedding {} items...", data.items.len());
        let t = Instant::now();
        let docs = embed_queue::pending_docs(&db.conn(), &model_id, i64::MAX);
        for (id, text) in &docs {
            let v = local_embed::embed_local(&state, cache_dir.clone(), model, text, EmbedTask::Document).await?;
            embed_queue::store(&db.conn(), *id, &v, &model_id);
        }
        let index_ms = ms(t) / docs.len().max(1) as f64;

        let mut e2e = Metrics::new(format!("{model} (local)"));
        e2e.index_ms_per_item = Some(index_ms);
        for c in &cases {
            let t = Instant::now();
            let resp = commands::search_core(&db, &cfg, &state, cache_dir.clone(), &c.q, LIMIT).await?;
            e2e.add(&ids(&resp.items), &c.relevant, &c.kind, Some(ms(t)));
        }
        strategies.push(e2e);

        let mut vec_m = Metrics::new(format!("{model} vector pool"));
        for c in &ranked {
            let q_vec =
                local_embed::embed_local(&state, cache_dir.clone(), model, &c.residue, EmbedTask::Query).await?;
            let pool = commands::vector_pool(&db.conn(), &q_vec, &model_id, c.time)?;
            vec_m.add(&ids(&pool), &c.relevant, &c.kind, None);
        }
        stages.push(vec_m);
        state.invalidate();
    }

    if !api_key.trim().is_empty() {
        let cfg = EmbedConfig {
            provider: Provider::Jev,
            typesafe_api_key: api_key.clone(),
            ..Default::default()
        };
        eprintln!("[jev] {} queries via {}...", cases.len(), cfg.typesafe_model);
        let mut jev_m = Metrics::new(format!("{} (Jev)", cfg.typesafe_model));
        for c in &cases {
            let t = Instant::now();
            let resp = commands::search_core(&db, &cfg, &state, cache_dir.clone(), &c.q, LIMIT).await?;
            jev_m.add(&ids(&resp.items), &c.relevant, &c.kind, Some(ms(t)));
        }
        strategies.push(jev_m);
    }

    for m in strategies.iter_mut().chain(stages.iter_mut()) {
        m.finish();
    }
    print_tables(&strategies, &stages, ranked.len());

    let queries: Vec<QueryRow> = cases
        .iter()
        .enumerate()
        .map(|(i, c)| QueryRow {
            q: c.q.clone(),
            kind: c.kind.clone(),
            residue: c.residue.clone(),
            ranks: strategies.iter().map(|s| s.ranks[i]).collect(),
        })
        .collect();
    let report = Report {
        n_items: data.items.len(),
        n_queries: cases.len(),
        clock,
        strategies,
        stages,
        queries,
    };
    std::fs::write(work_dir.join("eval_results.json"), serde_json::to_string_pretty(&report)?)?;
    let report_path = work_dir.join("eval_report.html");
    std::fs::write(&report_path, render_html(&report)?)?;
    eprintln!("\nHTML report: {}", report_path.display());
    eprintln!("JSON results: {}", work_dir.join("eval_results.json").display());
    Ok(())
}

fn fmt_ms(v: Option<f64>) -> String {
    v.map_or("-".into(), |m| format!("{m:.1}"))
}

fn print_tables(strategies: &[Metrics], stages: &[Metrics], n_ranked: usize) {
    let header = || {
        eprintln!(
            "{:<32} {:>6} {:>7} {:>7} {:>8} {:>6} {:>8} {:>8} {:>9}",
            "", "Hit@1", "Hit@10", "MRR@10", "nDCG@10", "R@50", "p50 ms", "p95 ms", "ms/index"
        )
    };
    let row = |m: &Metrics| {
        eprintln!(
            "{:<32} {:>6.3} {:>7.3} {:>7.3} {:>8.3} {:>6.3} {:>8} {:>8} {:>9}",
            m.name,
            m.hit_at_1,
            m.hit_at_10,
            m.mrr_at_10,
            m.ndcg_at_10,
            m.recall_at_50,
            fmt_ms(m.p50_ms),
            fmt_ms(m.p95_ms),
            fmt_ms(m.index_ms_per_item),
        )
    };
    eprintln!("\nEnd to end (commands::search_core)");
    header();
    strategies.iter().for_each(row);

    eprintln!("\nHit@1 by query kind");
    let kinds: Vec<&String> = strategies.first().map_or(Vec::new(), |m| m.hit_at_1_by_kind.keys().collect());
    eprintln!("{:<32} {}", "", kinds.iter().map(|k| format!("{k:>7}")).collect::<String>());
    for m in strategies {
        let cells: String = kinds.iter().map(|k| format!("{:>7.3}", m.hit_at_1_by_kind[*k])).collect();
        eprintln!("{:<32} {cells}", m.name);
    }

    eprintln!("\nStage-1 pools ({n_ranked} queries with a semantic residue)");
    header();
    stages.iter().for_each(row);
}

fn render_html(report: &Report) -> Result<String, Box<dyn std::error::Error>> {
    let data_json = serde_json::to_string(report)?;
    let rank_cell = |r: Option<usize>| -> String {
        match r {
            None => r#"<td class="rank-miss">—</td>"#.to_string(),
            Some(v) if v <= 3 => format!(r#"<td class="rank-good">{v}</td>"#),
            Some(v) => format!(r#"<td class="rank-bad">{v}</td>"#),
        }
    };
    let head: String = report
        .strategies
        .iter()
        .map(|s| format!("<th>{}</th>", html_escape(&s.name)))
        .collect();
    let mut rows = String::new();
    for q in &report.queries {
        rows.push_str(&format!(
            "<tr><td><code>{}</code></td><td>{}</td><td><code>{}</code></td>{}</tr>",
            html_escape(&q.q),
            html_escape(&q.kind),
            html_escape(&q.residue),
            q.ranks.iter().map(|&r| rank_cell(r)).collect::<String>(),
        ));
    }
    let metric_rows = |ms_: &[Metrics]| -> String {
        ms_.iter()
            .map(|s| {
                format!(
                    "<tr><td>{}</td><td>{:.3}</td><td>{:.3}</td><td>{:.3}</td><td>{:.3}</td><td>{:.3}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                    html_escape(&s.name),
                    s.hit_at_1,
                    s.hit_at_10,
                    s.mrr_at_10,
                    s.ndcg_at_10,
                    s.recall_at_50,
                    fmt_ms(s.p50_ms),
                    fmt_ms(s.p95_ms),
                    fmt_ms(s.index_ms_per_item),
                )
            })
            .collect()
    };
    let kinds: Vec<&String> = report
        .strategies
        .first()
        .map_or(Vec::new(), |m| m.hit_at_1_by_kind.keys().collect());
    let kind_head: String = kinds.iter().map(|k| format!("<th>{}</th>", html_escape(k))).collect();
    let kind_rows: String = report
        .strategies
        .iter()
        .map(|s| {
            let cells: String = kinds.iter().map(|k| format!("<td>{:.3}</td>", s.hit_at_1_by_kind[*k])).collect();
            format!("<tr><td>{}</td>{cells}</tr>", html_escape(&s.name))
        })
        .collect();
    let metric_head = "<th></th><th>Hit@1</th><th>Hit@10</th><th>MRR@10</th><th>nDCG@10</th><th>Recall@50</th><th>p50 ms</th><th>p95 ms</th><th>ms/item indexed</th>";
    Ok(format!(
        r##"<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>Yank · Semantic Search Evaluation</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  :root {{ --fg:#1a1a1a; --muted:#666; --border:#e6e6e6; }}
  body {{ font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; padding: 32px; max-width: 1200px; margin: 0 auto; color: var(--fg); background: white; }}
  h1 {{ margin: 0 0 4px; font-size: 22px; }}
  .sub {{ color: var(--muted); margin-bottom: 28px; }}
  h2 {{ margin-top: 36px; font-size: 15px; border-bottom: 1px solid var(--border); padding-bottom: 6px; letter-spacing: .02em; text-transform: uppercase; color: #444; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12.5px; }}
  th, td {{ padding: 6px 10px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }}
  th {{ background: #f4f4f4; font-weight: 600; color: #333; }}
  td.rank-good {{ color: #0a7e3f; font-weight: 700; text-align: center; }}
  td.rank-bad {{ color: #c33; text-align: center; }}
  td.rank-miss {{ color: #aaa; text-align: center; }}
  code {{ background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 12px; font-family: "SF Mono", ui-monospace, monospace; }}
  .legend {{ font-size: 12px; color: var(--muted); margin: 8px 0 16px; }}
</style></head>
<body>
<h1>Yank · Semantic Search Evaluation</h1>
<p class="sub">{n_items} items seeded · {n_queries} queries · clock {clock}</p>

<h2>End to end (commands::search_core)</h2>
<table><thead><tr>{metric_head}</tr></thead><tbody>{summary}</tbody></table>
<canvas id="chart" height="120"></canvas>
<p class="legend">Hit@k = a relevant clip in the top k · MRR@10 = mean 1/rank of the first relevant clip (0 past rank 10) · nDCG@10 = credit for every relevant clip in the top 10, weighted by position · Recall@50 = share of relevant clips (capped at 50) returned at all.</p>

<h2>Hit@1 by query kind</h2>
<table><thead><tr><th></th>{kind_head}</tr></thead><tbody>{kind_rows}</tbody></table>

<h2>Stage-1 pools</h2>
<p class="legend">Candidate pools before fusion, on queries with a semantic residue. A target missing here can't be fixed by ranking.</p>
<table><thead><tr>{metric_head}</tr></thead><tbody>{stage_rows}</tbody></table>

<h2>Per-query rank of first relevant result</h2>
<p class="legend"><span style="color:#0a7e3f;font-weight:700">green</span> = top 3 · <span style="color:#c33">red</span> = ranked 4–50 · — = not returned</p>
<table>
<thead><tr><th>query</th><th>kind</th><th>residue</th>{head}</tr></thead>
<tbody>{rows}</tbody>
</table>

<script>
const D = {data_json};
const palette = ['#4e79a7', '#59a14f', '#b6992d', '#e15759', '#76b7b2', '#FF6B35', '#bcbcbc'];
new Chart(document.getElementById('chart'), {{
  type: 'bar',
  data: {{
    labels: ['Hit@1', 'Hit@10', 'MRR@10', 'nDCG@10', 'Recall@50'],
    datasets: D.strategies.map((s, i) => ({{ label: s.name, data: [s.hit_at_1, s.hit_at_10, s.mrr_at_10, s.ndcg_at_10, s.recall_at_50], backgroundColor: palette[i % palette.length] }})),
  }},
  options: {{
    responsive: true,
    scales: {{ y: {{ min: 0, max: 1, ticks: {{ stepSize: 0.2 }} }} }},
    plugins: {{ legend: {{ position: 'bottom' }} }}
  }}
}});
</script>
</body></html>
"##,
        n_items = report.n_items,
        n_queries = report.n_queries,
        clock = html_escape(&report.clock),
        metric_head = metric_head,
        summary = metric_rows(&report.strategies),
        kind_head = kind_head,
        kind_rows = kind_rows,
        stage_rows = metric_rows(&report.stages),
        head = head,
        rows = rows,
        data_json = data_json,
    ))
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recall_uses_all_relevant_items_even_when_more_than_fifty_exist() {
        let relevant: HashSet<i64> = (1..=117).collect();
        let results: Vec<i64> = (1..=50).collect();
        let mut metrics = Metrics::new("phone filter");
        metrics.add(&results, &relevant, "cat", None);
        metrics.finish();

        assert!((metrics.recall_at_50 - 50.0 / 117.0).abs() < 1e-12);
        assert_eq!(metrics.hit_at_1, 1.0);
        assert_eq!(metrics.ndcg_at_10, 1.0);
    }

    #[test]
    fn recall_does_not_count_a_relevant_item_after_rank_fifty() {
        let relevant = HashSet::from([51]);
        let results: Vec<i64> = (1..=60).collect();
        let mut metrics = Metrics::new("outside cutoff");
        metrics.add(&results, &relevant, "kw", None);
        metrics.finish();

        assert_eq!(metrics.recall_at_50, 0.0);
        assert_eq!(metrics.hit_at_10, 0.0);
    }
}
