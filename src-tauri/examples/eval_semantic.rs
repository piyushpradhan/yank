//! Evaluation harness for Yank semantic search — runs the real pipeline.
//!
//!   cd src-tauri && cargo run --release --example eval_semantic
//!
//! Env (all optional):
//!   TYPESAFE_API_KEY  enables the Jev strategies (also read from ../.env)
//!   LAYA_URL          enables the Laya strategy (e.g. http://127.0.0.1:8765/v1/systemone)
//!   ONLY              comma list of strategies to run (bm25,before,local,jev,laya)
//!
//! Corpus: `examples/bench/dataset.json` (1,845 clips, 559 labelled queries;
//! see `bench/dataset.py`). Items are seeded into a fresh SQLite DB with the
//! app's own schema, embedded with the app's own `embed_queue::run_batch`, and
//! every query goes through `commands::search` — the exact function behind the
//! `search_semantic` command. The pre-change pipeline ("before": BM25 top-50
//! re-ranked by one Jev noul per candidate) is reproduced below as the
//! baseline. Results: `examples/bench/results_rust.json`.

use std::collections::{BTreeMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use yank_lib::commands::search;
use yank_lib::db::{self, Db};
use yank_lib::embed::{self, EmbedConfig, Provider};
use yank_lib::{embed_queue, query_intent, query_time};

#[tokio::main(flavor = "multi_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let data: Value = serde_json::from_str(&std::fs::read_to_string(
        root.join("examples/bench/dataset.json"),
    )?)?;
    let items = data["items"].as_array().unwrap();
    let queries = data["queries"].as_array().unwrap();

    let work = std::env::temp_dir().join("yank_eval");
    std::fs::create_dir_all(&work)?;
    embed::init(work.join("models"));
    let db_path = work.join("eval.db");
    let _ = std::fs::remove_file(&db_path);
    let conn = db::open(&db_path)?;

    // ---- seed ---------------------------------------------------------------
    let now_ms = chrono::Utc::now().timestamp_millis();
    let mut ids = Vec::with_capacity(items.len());
    for it in items {
        let created = now_ms - it["days_ago"].as_i64().unwrap() * 86_400_000;
        let content = it["content"].as_str().unwrap();
        let preview: String = content.chars().take(60).collect();
        conn.execute(
            "INSERT INTO items (content, category, label, preview, source, pinned, deleted, created_at, last_used_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6, ?6)",
            params![content, it["category"].as_str(), it["label"].as_str(), preview, it["source"].as_str(), created],
        )?;
        ids.push(conn.last_insert_rowid());
    }
    let db = Arc::new(Db(Mutex::new(conn)));

    // ---- embed with the app's queue --------------------------------------
    let t = Instant::now();
    let mut n = 0;
    loop {
        match embed_queue::run_batch(&db)? {
            0 => break,
            k => n += k,
        }
    }
    let embed_ms = t.elapsed().as_secs_f64() * 1000.0;
    eprintln!(
        "embedded {n} clips in {:.1}s ({:.1} ms/clip)",
        embed_ms / 1000.0,
        embed_ms / n.max(1) as f64
    );

    // SCALE=20000: pad history with filler clips (random unit vectors, so
    // they never outrank real matches) to measure search latency at size.
    if let Ok(scale) = std::env::var("SCALE").map(|s| s.parse::<usize>().unwrap_or(0)) {
        let conn = db.0.lock().unwrap();
        let mut seed = 42u64;
        let mut rnd = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            (seed as f32 / u64::MAX as f32) - 0.5
        };
        for i in items.len()..scale {
            let v = embed::normalize((0..768).map(|_| rnd()).collect());
            conn.execute(
                "INSERT INTO items (content, category, preview, pinned, deleted, created_at, last_used_at, embedding, embedding_model)
                 VALUES (?1, 'text', ?1, 0, 0, ?2, ?2, ?3, ?4)",
                params![format!("filler clip {i}"), now_ms - (i as i64 % 365) * 86_400_000, embed::to_bytes(&v), embed::MODEL_ID],
            )?;
        }
        eprintln!("padded history to {scale} clips");
    }

    // ---- strategies ----------------------------------------------------------
    let key = std::env::var("TYPESAFE_API_KEY")
        .ok()
        .or_else(|| {
            std::fs::read_to_string(root.join("../.env"))
                .ok()?
                .lines()
                .find_map(|l| {
                    l.strip_prefix("TYPESAFE_API_KEY=")
                        .map(|v| v.trim().trim_matches('"').to_string())
                })
        })
        .unwrap_or_default();
    let laya_url = std::env::var("LAYA_URL").unwrap_or_default();
    let only: Option<HashSet<String>> = std::env::var("ONLY")
        .ok()
        .map(|s| s.split(',').map(str::to_string).collect());
    let want = |s: &str| only.as_ref().map_or(true, |o| o.contains(s));
    let cfg = |p: Provider| EmbedConfig {
        provider: p,
        typesafe_api_key: key.clone(),
        laya_url: laya_url.clone(),
        ..EmbedConfig::default()
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let mut strategies: Vec<&str> = Vec::new();
    for s in ["bm25", "before", "local", "jev", "laya"] {
        let enabled = match s {
            "before" | "jev" => !key.is_empty(),
            "laya" => !laya_url.is_empty(),
            _ => true,
        };
        if enabled && want(s) {
            strategies.push(s);
        }
    }
    eprintln!("strategies: {strategies:?} over {} queries", queries.len());

    let mut rows: Vec<Value> = Vec::new();
    for (qi, q) in queries.iter().enumerate() {
        let text = q["q"].as_str().unwrap();
        let relevant: HashSet<i64> = q["relevant"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| ids[v.as_u64().unwrap() as usize])
            .collect();
        let mut row = json!({ "q": text, "kind": q["kind"], "orig56": qi < 56 });
        for s in &strategies {
            let t = Instant::now();
            let ranked: Vec<i64> = match *s {
                "bm25" => before(&db, text, None).await,
                "before" => before(&db, text, Some((&client, key.as_str()))).await,
                p => {
                    let prov = match p {
                        "local" => Provider::Local,
                        "jev" => Provider::Jev,
                        _ => Provider::Laya,
                    };
                    search(db.clone(), &cfg(prov), text, 50)
                        .await?
                        .items
                        .iter()
                        .map(|i| i.id.parse().unwrap())
                        .collect()
                }
            };
            let ms = t.elapsed().as_secs_f64() * 1000.0;
            let rank = ranked
                .iter()
                .position(|id| relevant.contains(id))
                .map(|r| r + 1);
            row[*s] = json!({ "rank": rank, "ms": ms });
        }
        if qi % 50 == 0 {
            eprintln!("  {qi}/{}", queries.len());
        }
        rows.push(row);
    }

    // ---- summary -------------------------------------------------------------
    let mut summary = BTreeMap::new();
    for s in &strategies {
        let mut groups: BTreeMap<String, Vec<&Value>> = BTreeMap::new();
        for r in &rows {
            groups.entry("all".into()).or_default().push(r);
            groups
                .entry(r["kind"].as_str().unwrap().into())
                .or_default()
                .push(r);
            if r["orig56"].as_bool().unwrap() {
                groups.entry("orig56".into()).or_default().push(r);
            }
        }
        let mut per = BTreeMap::new();
        for (g, rs) in groups {
            let ranks: Vec<Option<u64>> = rs.iter().map(|r| r[*s]["rank"].as_u64()).collect();
            let n = ranks.len() as f64;
            let at =
                |k: u64| ranks.iter().filter(|r| r.map_or(false, |x| x <= k)).count() as f64 / n;
            let mrr = ranks
                .iter()
                .map(|r| r.map_or(0.0, |x| 1.0 / x as f64))
                .sum::<f64>()
                / n;
            per.insert(
                g,
                json!({ "n": n, "p1": at(1), "r5": at(5), "r10": at(10), "mrr": mrr }),
            );
        }
        let mut ms: Vec<f64> = rows.iter().map(|r| r[*s]["ms"].as_f64().unwrap()).collect();
        ms.sort_by(|a, b| a.total_cmp(b));
        let pct = |p: f64| ms[((ms.len() - 1) as f64 * p) as usize];
        let all = &per["all"];
        eprintln!(
            "{s:<8} P@1 {:.3}  MRR {:.3}  R@10 {:.3}  para P@1 {:.3}  latency p50 {:.0}ms p90 {:.0}ms",
            all["p1"].as_f64().unwrap(), all["mrr"].as_f64().unwrap(), all["r10"].as_f64().unwrap(),
            per["para"]["p1"].as_f64().unwrap(), pct(0.5), pct(0.9)
        );
        summary.insert(
            s.to_string(),
            json!({ "metrics": per, "p50_ms": pct(0.5), "p90_ms": pct(0.9) }),
        );
    }
    let out = json!({
        "n_items": items.len(), "n_queries": queries.len(),
        "embed_ms_per_clip": embed_ms / n.max(1) as f64,
        "summary": summary, "rows": rows,
    });
    let path = root.join("examples/bench/results_rust.json");
    std::fs::write(&path, serde_json::to_string_pretty(&out)?)?;
    eprintln!("wrote {}", path.display());
    Ok(())
}

// ---------------------------------------------------------------------------
// The pre-change pipeline (baseline): BM25 top-50, then — with a key — one
// Jev noul per candidate in a single shared-state request, plus the old soft
// boosts. `jev = None` gives the plain BM25 ordering.
// ---------------------------------------------------------------------------

async fn before(db: &Arc<Db>, query: &str, jev: Option<(&reqwest::Client, &str)>) -> Vec<i64> {
    let parsed = query_time::parse(chrono::Local::now(), query.trim());
    let window = parsed.time.as_ref().map(|t| (t.from_ms, t.to_ms));
    let intent = query_intent::parse(&parsed.semantic);
    let sem = intent.semantic.trim().to_string();
    let (from, to) = window.unwrap_or((i64::MIN, i64::MAX));
    let conn_rows = |sql: &str,
                     p: &[&dyn rusqlite::ToSql]|
     -> Vec<(i64, String, String, String, String, i64)> {
        let conn = db.0.lock().unwrap();
        let mut st = conn.prepare(sql).unwrap();
        st.query_map(p, |r| {
            Ok((
                r.get(0)?,
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                r.get(2)?,
                r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                r.get(4)?,
                r.get(5)?,
            ))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    };
    if sem.is_empty() {
        return conn_rows(
            "SELECT id, label, content, source, category, created_at FROM items WHERE deleted = 0
             AND created_at BETWEEN ?1 AND ?2 AND (?3 IS NULL OR category = ?3) ORDER BY created_at DESC LIMIT 50",
            &[&from, &to, &intent.category],
        ).into_iter().map(|r| r.0).collect();
    }
    let pool = {
        let conn = db.0.lock().unwrap();
        bm25(&conn, &sem, 50, from, to)
    };
    let mut rows = Vec::new();
    for id in &pool {
        rows.extend(conn_rows(
            "SELECT id, label, content, source, category, created_at FROM items WHERE id = ?1",
            &[id],
        ));
    }
    let Some((client, key)) = jev else {
        return pool;
    };
    let cands: Vec<Value> = rows
        .iter()
        .enumerate()
        .map(|(i, r)| {
            let mut parts = vec![];
            if !r.1.is_empty() {
                parts.push(r.1.clone());
            }
            parts.push(r.2.trim().chars().take(500).collect());
            if !r.3.is_empty() {
                parts.push(format!("(from {})", r.3));
            }
            json!({ "id": i.to_string(), "text": parts.join("\n") })
        })
        .collect();
    let questions: serde_json::Map<String, Value> = (0..rows.len()).map(|i| (format!("c{i}"), json!({
        "type": "noul",
        "instructions": format!("Could `candidates.{i}.text` be the specific clipboard item the user is looking for when they searched for `query`?"),
        "criteria": {
            "true": "The candidate is the exact item the query asks for: the same entity, value, link, file, or the specific information requested.",
            "false": "The candidate is only on a similar topic, a different item of the same kind, or does not supply what the query asks for."
        }
    }))).collect();
    let body = json!({ "state": { "query": sem, "candidates": cands }, "model": "jev-latest", "questions": questions });
    let resp: Value = match client
        .post(yank_lib::jev::ENDPOINT)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r.json().await.unwrap_or(Value::Null),
        Err(_) => Value::Null,
    };
    let now = chrono::Utc::now().timestamp_millis();
    let mut scored: Vec<(f64, i64)> = rows
        .iter()
        .enumerate()
        .map(|(i, r)| {
            let mut s = resp["answers"][format!("c{i}")]["noul"]
                .as_f64()
                .unwrap_or(0.0);
            if intent.category == Some(r.4.as_str()) {
                s += 0.05;
            }
            if window.is_none() {
                s += 0.005 * (-((now - r.5) as f64 / 86_400_000.0) / 14.0).exp();
            }
            (s, r.0)
        })
        .collect();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0));
    scored.into_iter().map(|(_, id)| id).collect()
}

/// Old `commands::bm25_pool`: AND-form prefix query first, OR-form to top up.
fn bm25(conn: &Connection, query: &str, limit: usize, from: i64, to: i64) -> Vec<i64> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|t| t.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|t| !t.is_empty())
        .map(|t| format!("{}*", t.replace('"', "\"\"")))
        .collect();
    let fetch = |q: &str| -> Vec<i64> {
        let Ok(mut st) = conn.prepare(
            "SELECT i.id FROM items_fts JOIN items i ON i.id = items_fts.rowid
             WHERE items_fts MATCH ?1 AND i.deleted = 0 AND i.created_at BETWEEN ?2 AND ?3
             ORDER BY bm25(items_fts) LIMIT ?4",
        ) else {
            return vec![];
        };
        st.query_map(params![q, from, to, limit as i64], |r| r.get(0))
            .map(|it| it.filter_map(|r| r.ok()).collect())
            .unwrap_or_default()
    };
    let mut out: Vec<i64> = Vec::new();
    if terms.len() >= 2 {
        out.extend(fetch(&terms.join(" ")));
    }
    for id in fetch(&terms.join(" OR ")) {
        if !out.contains(&id) {
            out.push(id);
        }
    }
    out.truncate(limit);
    out
}
