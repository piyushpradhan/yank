//! System One re-ranker client (TypeSafe Jev, or a local Laya server).
//!
//! Jev and Laya are "System One" judgment models: they answer typed questions
//! with probabilities instead of generating text. Both speak the same HTTP
//! contract (`POST /v1/systemone`), so one client serves both; only the URL
//! and key differ (see `EmbedConfig::reranker`).
//!
//! We ask a single **Choice** question over the whole shortlist: "which of
//! these clipboard items is the one the user is looking for?". The returned
//! probability per item is the ranking. On the eval set this beat one Noul
//! per candidate (same accuracy, 3x fewer tokens) and is one round-trip.

use serde::Deserialize;
use serde_json::{json, Map, Value};

pub const ENDPOINT: &str = "https://api.typesafe.ai/v1/systemone";

/// One client for the app's lifetime: keep-alive saves the TLS handshake
/// (~100+ ms) on every search after the first.
fn client() -> &'static reqwest::Client {
    static C: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    C.get_or_init(reqwest::Client::new)
}

/// Probability (0–1) that each candidate is the one the query asks for, in
/// candidate order, from one request.
pub async fn rerank(
    url: &str,
    api_key: &str,
    model: &str,
    query: &str,
    candidates: &[String],
) -> Result<Vec<f32>, String> {
    if candidates.is_empty() {
        return Ok(Vec::new());
    }
    let mut items = Map::new();
    let mut options = Map::new();
    for (i, text) in candidates.iter().enumerate() {
        items.insert(format!("item{i}"), json!(text));
        options.insert(format!("item{i}"), Value::Null);
    }
    let body = json!({
        "state": { "search_query": query, "clipboard_items": items },
        "model": model,
        "questions": { "pick": {
            "type": "choice",
            "instructions": "Which of `clipboard_items` is the specific item the user is looking for with `search_query`?",
            "criteria": options,
        }},
    });

    #[derive(Deserialize)]
    struct Pick {
        probabilities: std::collections::HashMap<String, f32>,
    }
    #[derive(Deserialize)]
    struct Resp {
        answers: std::collections::HashMap<String, Pick>,
    }
    let resp: Resp = post(url, api_key, &body, 10).await?;
    let probs = resp.answers.get("pick").map(|p| &p.probabilities);
    Ok((0..candidates.len())
        .map(|i| {
            probs
                .and_then(|p| p.get(&format!("item{i}")).copied())
                .unwrap_or(0.0)
        })
        .collect())
}

async fn post<T: for<'de> Deserialize<'de>>(
    url: &str,
    api_key: &str,
    body: &Value,
    timeout_secs: u64,
) -> Result<T, String> {
    // One retry on rate-limit / transient server errors (TypeSafe's SDKs retry
    // by default; 429/5xx blips do happen), then give up so search falls back
    // to the local order.
    let mut attempt = 0;
    let res = loop {
        let mut req = client()
            .post(url)
            .timeout(std::time::Duration::from_secs(timeout_secs))
            .json(body);
        if !api_key.is_empty() {
            req = req.bearer_auth(api_key);
        }
        let res = req
            .send()
            .await
            .map_err(|e| format!("re-rank request failed: {e}"))?;
        let s = res.status();
        if attempt == 0 && (s.as_u16() == 429 || s.is_server_error()) {
            attempt += 1;
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            continue;
        }
        break res;
    };
    if !res.status().is_success() {
        let s = res.status();
        let t = res.text().await.unwrap_or_default();
        return Err(format!("re-ranker {s}: {t}"));
    }
    res.json().await.map_err(|e| format!("re-rank parse: {e}"))
}

/// Probe the re-ranker is reachable (and the key works) with one trivial
/// question. Used by the AI settings "Test connection" action.
pub async fn ping(url: &str, api_key: &str, model: &str) -> Result<(), String> {
    let body = json!({
        "state": "ping",
        "model": model,
        "questions": { "ok": { "type": "noul", "instructions": "Is this the word ping?" } }
    });
    post::<Value>(url, api_key, &body, 8).await.map(|_| ())
}
