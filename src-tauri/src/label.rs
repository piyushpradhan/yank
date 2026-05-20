//! Anthropic Claude Haiku client for one-line "intent" labels on clipboard
//! items. Called from `label_queue.rs` on a background worker.
//!
//! Design notes:
//! - We deliberately keep the prompt short and the max_tokens tiny. Labels
//!   should read like a filename, not a sentence.
//! - The client trims and sanitises the response because models occasionally
//!   return wrapped quotes or a trailing period despite the instruction.
//! - Errors bubble up as strings; the queue decides whether to retry.

use serde::Deserialize;
use serde_json::json;

const MODEL: &str = "claude-haiku-4-5";
const ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";
const MAX_CONTENT_CHARS: usize = 1500;
const MAX_LABEL_CHARS: usize = 80;

const SYSTEM_PROMPT: &str = "You label clipboard items for a clipboard productivity app. \
Given a category and the raw copied text, return ONE short phrase (4–8 words) that describes what \
the clip is or is about. Be specific — include the key noun or action. \
Use Title Case. No quotes. No trailing punctuation. No prefixes like 'Label:' or 'A:'. \
Return only the phrase.";

pub async fn generate_label(
    client: &reqwest::Client,
    api_key: &str,
    category: &str,
    content: &str,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("anthropic key not set".into());
    }

    let snippet: String = content.chars().take(MAX_CONTENT_CHARS).collect();
    let user_msg = format!("Category: {category}\nContent:\n{snippet}");

    let body = json!({
        "model": MODEL,
        "max_tokens": 40,
        "system": SYSTEM_PROMPT,
        "messages": [{ "role": "user", "content": user_msg }],
    });

    let res = client
        .post(ENDPOINT)
        .header("x-api-key", api_key)
        .header("anthropic-version", API_VERSION)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("anthropic request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("anthropic {status}: {body}"));
    }

    #[derive(Deserialize)]
    struct Resp {
        content: Vec<Block>,
    }
    #[derive(Deserialize)]
    struct Block {
        #[serde(rename = "type")]
        kind: String,
        text: Option<String>,
    }

    let parsed: Resp = res
        .json()
        .await
        .map_err(|e| format!("anthropic parse failed: {e}"))?;

    let text = parsed
        .content
        .into_iter()
        .find(|b| b.kind == "text")
        .and_then(|b| b.text)
        .ok_or_else(|| "anthropic empty response".to_string())?;

    Ok(sanitise(&text))
}

/// Strip common failure modes: wrapped quotes, a trailing period, leading
/// "Label:" prefix the model occasionally emits despite instructions.
fn sanitise(raw: &str) -> String {
    let mut s = raw.trim().to_string();

    for prefix in ["Label:", "label:", "A:", "Answer:"] {
        if let Some(rest) = s.strip_prefix(prefix) {
            s = rest.trim().to_string();
        }
    }

    s = s
        .trim_matches(|c: char| matches!(c, '"' | '\'' | '`'))
        .trim_end_matches(|c: char| matches!(c, '.' | ';' | ':' | ','))
        .to_string();

    s.chars().take(MAX_LABEL_CHARS).collect()
}

#[cfg(test)]
mod tests {
    use super::sanitise;

    #[test]
    fn strips_quotes_and_trailing_period() {
        assert_eq!(sanitise("\"Stripe Webhook Debug.\""), "Stripe Webhook Debug");
    }

    #[test]
    fn strips_label_prefix() {
        assert_eq!(sanitise("Label: React useEffect Cleanup"), "React useEffect Cleanup");
    }

    #[test]
    fn caps_length() {
        let long = "a".repeat(200);
        assert_eq!(sanitise(&long).len(), 80);
    }
}
