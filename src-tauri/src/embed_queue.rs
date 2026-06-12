use std::sync::{
    mpsc::{self, Sender},
    Arc, Mutex, OnceLock,
};
use std::time::Duration;

use rusqlite::params;
use tauri::{AppHandle, Emitter, Manager};

use crate::color_names;
use crate::db::Db;
use crate::embed::{self, EmbedConfig, EmbedTask, Provider};
use crate::local_embed::{self, LocalState};
use crate::settings::SettingsState;

/// Upper bound on characters we embed per item. Modern embedding models
/// truncate internally, but shipping less text to the network keeps
/// latency and cost predictable while still capturing the gist.
const MAX_DOC_CHARS: usize = 2000;

static TX: OnceLock<Mutex<Option<Sender<()>>>> = OnceLock::new();

pub fn kick(app: &AppHandle) {
    let _ = app;
    if let Some(lock) = TX.get() {
        if let Some(tx) = lock.lock().unwrap().as_ref() {
            let _ = tx.send(());
        }
    }
}

pub fn spawn(app: AppHandle) {
    let (tx, rx) = mpsc::channel::<()>();
    TX.set(Mutex::new(Some(tx))).ok();

    let handle = app.clone();
    std::thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("embed queue runtime");
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("reqwest client");

        loop {
            // Wait for a signal, but also periodically retry.
            let _ = rx.recv_timeout(Duration::from_secs(30));

            let cfg = snapshot_config(&handle);
            if !cfg.is_active() {
                continue;
            }

            let pending = load_pending(&handle, &cfg.model_id(), 32);
            if pending.is_empty() {
                continue;
            }

            for (id, text) in pending {
                let result = runtime.block_on(async {
                    if matches!(cfg.provider, Provider::Local) {
                        let state = handle.state::<LocalState>();
                        local_embed::embed_local(
                            state.inner(),
                            local_embed::cache_dir(&handle),
                            &cfg.local_model,
                            &text,
                            EmbedTask::Document,
                        )
                        .await
                    } else {
                        embed::embed(&cfg, &client, &text, EmbedTask::Document).await
                    }
                });
                match result {
                    Ok(embedding) => {
                        store_embedding(&handle, id, &embedding, &cfg.model_id());
                        let _ = handle.emit("clip-embedded", id);
                    }
                    Err(err) => {
                        eprintln!("[embed] failed for id={id}: {err}");
                        break;
                    }
                }
            }
        }
    });

    // Initial kick to backfill on startup.
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(500));
        kick(&app);
    });
}

fn snapshot_config(app: &AppHandle) -> EmbedConfig {
    let state = app.state::<SettingsState>();
    let cfg = state.0.read().unwrap().clone();
    cfg
}

fn load_pending(app: &AppHandle, model_id: &str, limit: i64) -> Vec<(i64, String)> {
    let db = app.state::<Arc<Db>>().inner().clone();
    let conn = db.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, category, COALESCE(label, ''), COALESCE(source, ''), content
             FROM items
             WHERE deleted = 0
               AND (embedding IS NULL OR embedding_model IS NULL OR embedding_model != ?1)
             ORDER BY last_used_at DESC
             LIMIT ?2",
        )
        .expect("prepare");
    stmt.query_map(params![model_id, limit], |r| {
        let id: i64 = r.get(0)?;
        let category: String = r.get(1)?;
        let label: String = r.get(2)?;
        let source: String = r.get(3)?;
        let content: String = r.get(4)?;
        Ok((id, build_doc_text(&category, &label, &source, &content)))
    })
    .expect("query")
    .filter_map(|r| r.ok())
    .collect()
}

/// Compose the document text we embed. BGE-small attends most strongly
/// to the first ~64 tokens, so the AI label (high-signal, human-readable
/// summary) leads the input and is repeated once just above the body.
/// Source app and category come next so queries like "the slack link"
/// can hit on source even when the raw content is a bare URL. The body
/// is truncated to `MAX_DOC_CHARS` — long clips (log dumps, JSON blobs)
/// stay within a reasonable budget while preserving the head.
fn build_doc_text(category: &str, label: &str, source: &str, content: &str) -> String {
    let trimmed = content.trim();
    let body: String = trimmed.chars().take(MAX_DOC_CHARS).collect();
    let label_t = label.trim();
    let source_t = source.trim();

    let mut parts: Vec<String> = Vec::with_capacity(6);
    if !label_t.is_empty() {
        parts.push(label_t.to_string());
    }
    parts.push(format!("[{}]", category));
    if !source_t.is_empty() {
        parts.push(format!("(from {})", source_t));
    }
    if !label_t.is_empty() {
        parts.push(label_t.to_string());
    }
    // Colour enrichment: for colour clips, append the nearest named colours
    // so the embedding vector encodes human-readable colour semantics. A
    // query like "orange" can then match a clip containing "#ff6b35".
    let enriched = if category == "color" {
        color_names::enrich_color_text(trimmed)
    } else {
        String::new()
    };
    if enriched.is_empty() {
        parts.push(body);
    } else {
        parts.push(format!("{body} {enriched}"));
    }
    parts.join("\n")
}

fn store_embedding(app: &AppHandle, id: i64, vec: &[f32], model_id: &str) {
    let db = app.state::<Arc<Db>>().inner().clone();
    let conn = db.0.lock().unwrap();
    let bytes = embed::to_bytes(vec);
    let _ = conn.execute(
        "UPDATE items SET embedding = ?1, embedding_model = ?2 WHERE id = ?3",
        params![bytes, model_id, id],
    );
}

#[cfg(test)]
mod tests {
    use super::build_doc_text;

    #[test]
    fn color_enrichment_appends_named_colors() {
        let text = build_doc_text("color", "", "Chrome", "#ff0000");
        assert!(text.contains("red"), "expected 'red' in doc text, got: {text}");
    }

    #[test]
    fn color_enrichment_with_label_and_source() {
        let text = build_doc_text("color", "Red Hex Code", "Figma", "#ff6b35");
        assert!(text.contains("Red Hex Code"), "label missing");
        assert!(text.contains("[color]"), "category tag missing");
        assert!(text.contains("(from Figma)"), "source missing");
        assert!(text.contains("#ff6b35"), "content missing");
        assert!(
            text.contains("orange") || text.contains("coral") || text.contains("tomato"),
            "expected warm-color name in doc text, got: {text}"
        );
    }

    #[test]
    fn non_color_no_enrichment() {
        let text = build_doc_text("text", "", "", "hello world");
        assert!(!text.contains("red"), "non-color should not be enriched");
        assert!(text.contains("hello world"), "content should be present");
    }

    #[test]
    fn color_enrichment_rgb() {
        let text = build_doc_text("color", "", "", "rgb(0, 0, 128)");
        assert!(text.contains("navy"), "expected 'navy' in doc text, got: {text}");
    }

    #[test]
    fn color_enrichment_hsl() {
        let text = build_doc_text("color", "", "", "hsl(0, 100%, 50%)");
        assert!(text.contains("red"), "expected 'red' in doc text, got: {text}");
    }

    #[test]
    fn color_enrichment_unparseable_no_enrichment() {
        let text = build_doc_text("color", "", "", "not a valid color");
        assert!(!text.contains("red"), "unparseable color should not be enriched");
    }

    // -- Integration: full pipeline for colour clips with source attribution --

    #[test]
    fn full_pipeline_hex_from_chrome() {
        // Simulates a user copying #ff0000 from Chrome, then searching
        // "red hex from Chrome" or "the red one I copied".
        let text = build_doc_text("color", "Red Hex Code", "Google Chrome", "#ff0000");
        assert!(text.contains("Red Hex Code"), "label: {text}");
        assert!(text.contains("[color]"), "category tag: {text}");
        assert!(text.contains("(from Google Chrome)"), "source: {text}");
        assert!(text.contains("#ff0000"), "content: {text}");
        assert!(text.contains("red"), "enriched colour name: {text}");
    }

    #[test]
    fn full_pipeline_rgba_from_figma() {
        let text = build_doc_text("color", "Button Orange", "Figma", "rgba(255, 107, 53, 1.0)");
        assert!(text.contains("Button Orange"));
        assert!(text.contains("[color]"));
        assert!(text.contains("(from Figma)"));
        assert!(
            text.contains("orange")
                || text.contains("coral")
                || text.contains("tomato")
                || text.contains("darkorange"),
            "warm-colour name expected in: {text}"
        );
    }

    #[test]
    fn full_pipeline_hsl_from_vscode() {
        let text = build_doc_text("color", "", "Code", "hsl(240, 100%, 50%)");
        assert!(text.contains("[color]"), "category: {text}");
        assert!(text.contains("(from Code)"), "source: {text}");
        assert!(text.contains("blue"), "expected blue from hsl(240, 100%, 50%): {text}");
    }

    #[test]
    fn full_pipeline_named_color_from_notes() {
        let text = build_doc_text("color", "", "Notes", "crimson");
        assert!(text.contains("[color]"), "category: {text}");
        assert!(text.contains("(from Notes)"), "source: {text}");
        assert!(text.contains("crimson"), "content: {text}");
        // Exact named-colour matches return only that name (not nearby names).
    }

    #[test]
    fn full_pipeline_short_hex_from_terminal() {
        let text = build_doc_text("color", "Background", "Terminal", "#fff");
        assert!(text.contains("[color]"));
        assert!(text.contains("(from Terminal)"));
        assert!(text.contains("white"), "#fff should map to white: {text}");
    }

    #[test]
    fn non_color_clips_are_unaffected() {
        // URLs, text snippets, code — must stay exactly as before.
        let url = build_doc_text("url", "GitHub PR", "Chrome", "https://github.com/anomalyco/yank/pull/42");
        assert!(url.contains("GitHub PR"));
        assert!(url.contains("[url]"));
        assert!(url.contains("(from Chrome)"));
        assert!(!url.contains(" red "), "URL doc text should never be colour-enriched");
        assert!(!url.contains(" blue "));

        let text = build_doc_text("text", "", "Notes", "hello world");
        assert!(text.contains("hello world"));
        assert!(text.contains("[text]"));
        assert!(!text.contains(" red "));

        let code = build_doc_text("code", "React Hook", "VSCode", "const [count, setCount] = useState(0)");
        assert!(code.contains("useState"));
        assert!(!code.contains(" red "));
    }

    #[test]
    fn enrichment_idempotent_for_unparseable_colors() {
        // Even if categorised as "color", unparseable values don't break anything.
        let text = build_doc_text("color", "", "", "something weird");
        assert!(text.contains("something weird"));
        assert!(!text.contains("weird red"), "unparseable content should not add random names");
    }

    #[test]
    fn source_attribution_present_when_label_missing() {
        // When no AI label exists, source + category + colour names still provide
        // enough signal for "orange color from Figma" style queries.
        let text = build_doc_text("color", "", "Figma", "#ffa500");
        assert!(text.contains("[color]"), "category: {text}");
        assert!(text.contains("(from Figma)"), "source: {text}");
        assert!(text.contains("orange"), "colour name: {text}");
        assert!(!text.contains("Red Hex Code"), "no spurious text: {text}");
    }

    #[test]
    fn all_color_formats_roundtrip_to_correct_names() {
        let cases: &[(&str, &[&str])] = &[
            ("#ff0000", &["red"]),
            ("#00ff00", &["lime"]),
            ("#0000ff", &["blue"]),
            ("#ffff00", &["yellow"]),
            ("#ff00ff", &["fuchsia", "magenta"]),
            ("#00ffff", &["aqua", "cyan"]),
            ("#000000", &["black"]),
            ("#ffffff", &["white"]),
            ("#ffa500", &["orange"]),
            ("#800080", &["purple"]),
            ("#008000", &["green"]),
            ("#ffc0cb", &["pink"]),
            ("rgb(255, 0, 0)", &["red"]),
            ("rgb(0, 128, 0)", &["green"]),
            ("hsl(240, 100%, 50%)", &["blue"]),
            ("hsl(60, 100%, 50%)", &["yellow"]),
        ];
        for (content, expected_names) in cases {
            let text = build_doc_text("color", "", "Figma", content);
            let matched = expected_names.iter().any(|n| text.contains(n));
            assert!(
                matched,
                "content '{content}' should enrich with one of {:?}, got: {text}",
                expected_names
            );
        }
    }

    #[test]
    fn demo_color_search_enrichment() {
        // This test prints the full embedding text for real-world scenarios,
        // showing exactly what the embedding model sees when a user searches.
        let scenarios: &[(&str, &str, &str, &str)] = &[
            // (category, label, source, content)
            ("color", "Red Button", "Figma", "#ff0000"),
            ("color", "Brand Orange", "Figma", "rgba(255, 107, 53, 1.0)"),
            ("color", "Navy Text", "Chrome", "hsl(240, 100%, 25%)"),
            ("color", "", "Chrome", "#00ff00"),
            ("color", "Dark Mode BG", "Terminal", "#1a1a2e"),
            ("text", "Meeting notes", "Notes", "discuss the orange hex from Figma"),
            ("url", "GitHub PR", "Chrome", "https://github.com/anomalyco/yank/pull/42"),
        ];

        println!("\n======== COLOUR SEMANTIC SEARCH — EMBEDDING TEXT ========\n");
        for (cat, label, source, content) in scenarios {
            let text = build_doc_text(cat, label, source, content);
            println!("--- content: {content}");
            println!("    label:   {label}");
            println!("    source:  {source}");
            println!("    DOC TEXT:");
            for line in text.lines() {
                println!("      {line}");
            }
            println!();
        }
        println!("==========================================================\n");
    }
}
