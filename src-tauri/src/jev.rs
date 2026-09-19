//! TypeSafe Jev client — semantic re-ranking.
//!
//! Jev is a "System One" judgment model: it does not produce embeddings, it
//! answers typed questions with probabilities. We use it to re-rank a fast
//! BM25 shortlist: for each candidate we ask a single yes/no question
//! ("could this be the item the query is after?") and get back a `noul`
//! (0–1 probability of "yes"). Sorting the shortlist by `noul` is the search.
//!
//! All candidates travel in **one** HTTP request so a search is a single
//! round-trip, not N. The state carries the query plus the candidate list;
//! each question references its own candidate via a backticked path into
//! that state (e.g. `` `candidates.0.text` ``).

use serde::Deserialize;
use serde_json::json;

pub const ENDPOINT: &str = "https://api.typesafe.ai/v1/systemone";

/// Upper bound on candidates we hand Jev in one request. Keeps the request
/// body and latency bounded; the BM25 shortlist is already trimmed to this.
pub const MAX_CANDIDATES: usize = 50;

/// Score how well each candidate answers the query. Returns one `noul` per
/// candidate, in the same order, all from a single batched request.
pub async fn rerank(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    query: &str,
    candidates: &[(String, String)], // (id, text)
) -> Result<Vec<f32>, String> {
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    let mut cand_list = Vec::with_capacity(candidates.len());
    let mut questions = serde_json::Map::new();
    for (i, (_id, text)) in candidates.iter().enumerate() {
        cand_list.push(json!({ "id": candidates[i].0, "text": text }));
        questions.insert(
            format!("c{i}"),
            json!({
                "type": "noul",
                "instructions": format!(
                    "Could `candidates.{i}.text` be the specific clipboard item the user is looking for when they searched for `query`?"
                ),
                "criteria": {
                    "true": "The candidate is the exact item the query asks for: the same entity, value, link, file, or the specific information requested.",
                    "false": "The candidate is only on a similar topic, a different item of the same kind, or does not supply what the query asks for."
                }
            }),
        );
    }

    let body = json!({
        "state": {
            "query": query,
            "candidates": cand_list,
        },
        "model": model,
        "questions": questions,
    });

    let res = client
        .post(ENDPOINT)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("jev request failed: {e}"))?;

    if !res.status().is_success() {
        let s = res.status();
        let t = res.text().await.unwrap_or_default();
        return Err(format!("jev {s}: {t}"));
    }

    #[derive(Deserialize)]
    struct Answer {
        #[serde(default)]
        noul: f32,
    }
    #[derive(Deserialize)]
    struct Resp {
        answers: std::collections::HashMap<String, Answer>,
    }

    let resp: Resp = res.json().await.map_err(|e| format!("jev parse: {e}"))?;

    let mut out = Vec::with_capacity(candidates.len());
    for i in 0..candidates.len() {
        let noul = resp
            .answers
            .get(&format!("c{i}"))
            .map(|a| a.noul)
            .unwrap_or(0.0);
        out.push(noul);
    }
    Ok(out)
}

/// Probe the provider is reachable and the key works, using a single
/// trivial question. Used by the AI settings "Test connection" action.
pub async fn ping(client: &reqwest::Client, api_key: &str, model: &str) -> Result<(), String> {
    let res = client
        .post(ENDPOINT)
        .bearer_auth(api_key)
        .json(&json!({
            "state": "ping",
            "model": model,
            "questions": {
                "ok": { "type": "noul", "instructions": "Is this the word ping?" }
            }
        }))
        .send()
        .await
        .map_err(|e| format!("jev request failed: {e}"))?;
    if !res.status().is_success() {
        let s = res.status();
        let t = res.text().await.unwrap_or_default();
        return Err(format!("jev {s}: {t}"));
    }
    Ok(())
}
