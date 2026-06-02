use std::sync::RwLock;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FeatureInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub available: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseConfig {
    pub is_premium: bool,
}

impl Default for LicenseConfig {
    fn default() -> Self {
        Self { is_premium: false }
    }
}

pub struct LicenseState {
    config: RwLock<LicenseConfig>,
    features: Vec<FeatureInfo>,
}

impl LicenseState {
    pub fn new() -> Self {
        Self {
            config: RwLock::new(LicenseConfig::default()),
            features: all_features_map(),
        }
    }

    fn is_feature_available(&self, feature_id: &str) -> bool {
        let config = self.config.read().unwrap();
        if config.is_premium {
            return true;
        }
        self.features
            .iter()
            .any(|f| f.id == feature_id && f.available)
    }
}

fn all_features_map() -> Vec<FeatureInfo> {
    vec![
        FeatureInfo {
            id: "semantic_search".into(),
            name: "Semantic Search".into(),
            description: "AI-powered search that understands meaning, not just keywords.".into(),
            available: false,
        },
        FeatureInfo {
            id: "ai_labeling".into(),
            name: "AI Labeling".into(),
            description: "Auto-generated one-line summaries for every clip.".into(),
            available: false,
        },
        FeatureInfo {
            id: "image_capture".into(),
            name: "Image Capture".into(),
            description: "Capture and preview screenshots and images from your clipboard.".into(),
            available: false,
        },
        FeatureInfo {
            id: "cloud_embeddings".into(),
            name: "Cloud Embeddings".into(),
            description: "Use OpenAI or Ollama for embedding instead of the local model.".into(),
            available: false,
        },
        FeatureInfo {
            id: "palette".into(),
            name: "Quick Palette".into(),
            description: "Raycast-style floating search bar accessible from anywhere.".into(),
            available: true,
        },
        FeatureInfo {
            id: "pin_items".into(),
            name: "Pin Items".into(),
            description: "Keep important clips at the top of your history.".into(),
            available: true,
        },
        FeatureInfo {
            id: "rename_items".into(),
            name: "Rename Items".into(),
            description: "Edit clip labels to stay organized.".into(),
            available: true,
        },
        FeatureInfo {
            id: "theme_customization".into(),
            name: "Theme Customization".into(),
            description: "Adjust density, preview mode, and category display style.".into(),
            available: true,
        },
    ]
}

#[tauri::command]
pub fn list_features(state: tauri::State<'_, LicenseState>) -> Vec<FeatureInfo> {
    let config = state.config.read().unwrap();
    let premium = config.is_premium;
    state
        .features
        .iter()
        .map(|f| FeatureInfo {
            available: premium || f.available,
            ..f.clone()
        })
        .collect()
}

#[tauri::command]
pub fn is_feature_available(
    feature_id: String,
    state: tauri::State<'_, LicenseState>,
) -> bool {
    state.is_feature_available(&feature_id)
}

#[tauri::command]
pub fn get_license_state(state: tauri::State<'_, LicenseState>) -> LicenseConfig {
    state.config.read().unwrap().clone()
}

#[tauri::command]
pub fn set_license_premium(
    premium: bool,
    state: tauri::State<'_, LicenseState>,
) -> Result<(), String> {
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    config.is_premium = premium;
    Ok(())
}
