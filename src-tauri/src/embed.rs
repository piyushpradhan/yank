use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    /// Bundled ONNX embedding model running entirely on the user's machine.
    /// Default — no API key, no network, works offline after first download.
    Local,
    Openai,
    Ollama,
    Disabled,
}

/// Whether we are embedding a stored document or an active query.
/// Nomic-family models expect different task prefixes per role; other
/// providers ignore this.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmbedTask {
    Document,
    Query,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedConfig {
    pub provider: Provider,
    #[serde(default = "default_local_model")]
    pub local_model: String,
    pub openai_api_key: String,
    pub openai_model: String,
    pub ollama_url: String,
    pub ollama_model: String,
    pub anthropic_api_key: String,
}

fn default_local_model() -> String {
    "bge-small-en-v1.5".into()
}

impl Default for EmbedConfig {
    fn default() -> Self {
        Self {
            provider: Provider::Local,
            local_model: default_local_model(),
            openai_api_key: String::new(),
            openai_model: "text-embedding-3-small".into(),
            ollama_url: "http://localhost:11434".into(),
            ollama_model: "nomic-embed-text".into(),
            anthropic_api_key: String::new(),
        }
    }
}

impl EmbedConfig {
    pub fn is_active(&self) -> bool {
        match self.provider {
            Provider::Disabled => false,
            // Local is always active — the model loads (or downloads) on demand.
            Provider::Local => true,
            Provider::Openai => !self.openai_api_key.trim().is_empty(),
            Provider::Ollama => !self.ollama_url.trim().is_empty(),
        }
    }

    pub fn model_id(&self) -> String {
        // Bump the suffix whenever the document input format or prefix
        // scheme changes so old embeddings are re-generated.
        const FMT: &str = "v3";
        match self.provider {
            Provider::Disabled => "disabled".into(),
            Provider::Local => format!("local:{}:{FMT}", self.local_model),
            Provider::Openai => format!("openai:{}:{FMT}", self.openai_model),
            Provider::Ollama => format!("ollama:{}:{FMT}", self.ollama_model),
        }
    }
}

pub async fn embed(
    cfg: &EmbedConfig,
    client: &reqwest::Client,
    text: &str,
    task: EmbedTask,
) -> Result<Vec<f32>, String> {
    match cfg.provider {
        Provider::Disabled => Err("embedding disabled".into()),
        // Local is dispatched through `local_embed::embed_local` because it
        // needs the held ONNX model and the app data dir — kept out of this
        // path so the network providers stay zero-state.
        Provider::Local => Err("local embedding handled separately".into()),
        Provider::Openai => embed_openai(cfg, client, text).await,
        Provider::Ollama => embed_ollama(cfg, client, text, task).await,
    }
}

/// Nomic-family models use explicit task prefixes. For other models the
/// prefix is a no-op — the raw text is returned.
fn apply_nomic_prefix(model: &str, text: &str, task: EmbedTask) -> String {
    let is_nomic = model.to_lowercase().contains("nomic");
    if !is_nomic {
        return text.to_string();
    }
    match task {
        EmbedTask::Document => format!("search_document: {text}"),
        EmbedTask::Query => format!("search_query: {text}"),
    }
}

async fn embed_openai(
    cfg: &EmbedConfig,
    client: &reqwest::Client,
    text: &str,
) -> Result<Vec<f32>, String> {
    #[derive(Deserialize)]
    struct Resp {
        data: Vec<Item>,
    }
    #[derive(Deserialize)]
    struct Item {
        embedding: Vec<f32>,
    }

    let body = json!({ "input": text, "model": cfg.openai_model });
    let res = client
        .post("https://api.openai.com/v1/embeddings")
        .bearer_auth(&cfg.openai_api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("openai request failed: {e}"))?;
    if !res.status().is_success() {
        let s = res.status();
        let t = res.text().await.unwrap_or_default();
        return Err(format!("openai {s}: {t}"));
    }
    let json: Resp = res.json().await.map_err(|e| format!("openai parse: {e}"))?;
    let v = json
        .data
        .into_iter()
        .next()
        .ok_or_else(|| "openai empty data".to_string())?
        .embedding;
    Ok(normalize(v))
}

async fn embed_ollama(
    cfg: &EmbedConfig,
    client: &reqwest::Client,
    text: &str,
    task: EmbedTask,
) -> Result<Vec<f32>, String> {
    #[derive(Deserialize)]
    struct Resp {
        embedding: Vec<f32>,
    }
    let base = cfg.ollama_url.trim_end_matches('/');
    let prompt = apply_nomic_prefix(&cfg.ollama_model, text, task);
    let body = json!({ "model": cfg.ollama_model, "prompt": prompt });
    let res = client
        .post(format!("{base}/api/embeddings"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("ollama request failed: {e}"))?;
    if !res.status().is_success() {
        let s = res.status();
        let t = res.text().await.unwrap_or_default();
        return Err(format!("ollama {s}: {t}"));
    }
    let json: Resp = res.json().await.map_err(|e| format!("ollama parse: {e}"))?;
    Ok(normalize(json.embedding))
}

/// L2-normalize so cosine = dot product.
pub fn normalize(mut v: Vec<f32>) -> Vec<f32> {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in &mut v {
            *x /= norm;
        }
    }
    v
}

pub fn to_bytes(v: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 4);
    for x in v {
        out.extend_from_slice(&x.to_le_bytes());
    }
    out
}

pub fn from_bytes(b: &[u8]) -> Vec<f32> {
    let mut out = Vec::with_capacity(b.len() / 4);
    for chunk in b.chunks_exact(4) {
        let arr = [chunk[0], chunk[1], chunk[2], chunk[3]];
        out.push(f32::from_le_bytes(arr));
    }
    out
}

/// Dot product of two L2-normalized vectors = cosine similarity.
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let n = a.len().min(b.len());
    let mut s = 0.0f32;
    for i in 0..n {
        s += a[i] * b[i];
    }
    s
}
