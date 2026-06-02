import { invoke } from "@tauri-apps/api/core";

export type FeatureId =
  | "semantic_search"
  | "ai_labeling"
  | "image_capture"
  | "cloud_embeddings"
  | "palette"
  | "pin_items"
  | "rename_items"
  | "theme_customization";

export interface FeatureInfo {
  id: FeatureId;
  name: string;
  description: string;
  available: boolean;
  lockedMessage: string;
}

export interface LicenseConfig {
  isPremium: boolean;
}

const PREMIUM_MSG = "Upgrade to Yank Pro to unlock this feature.";

export const FEATURE_META: Record<FeatureId, Pick<FeatureInfo, "name" | "description" | "lockedMessage">> = {
  semantic_search: {
    name: "Semantic Search",
    description: "AI-powered search that understands meaning, not just keywords.",
    lockedMessage: PREMIUM_MSG,
  },
  ai_labeling: {
    name: "AI Labeling",
    description: "Auto-generated one-line summaries for every clip.",
    lockedMessage: PREMIUM_MSG,
  },
  image_capture: {
    name: "Image Capture",
    description: "Capture and preview screenshots and images from your clipboard.",
    lockedMessage: PREMIUM_MSG,
  },
  cloud_embeddings: {
    name: "Cloud Embeddings",
    description: "Use OpenAI or Ollama for embedding instead of the local model.",
    lockedMessage: PREMIUM_MSG,
  },
  palette: {
    name: "Quick Palette",
    description: "Raycast-style floating search bar accessible from anywhere.",
    lockedMessage: "",
  },
  pin_items: {
    name: "Pin Items",
    description: "Keep important clips at the top of your history.",
    lockedMessage: "",
  },
  rename_items: {
    name: "Rename Items",
    description: "Edit clip labels to stay organized.",
    lockedMessage: "",
  },
  theme_customization: {
    name: "Theme Customization",
    description: "Adjust density, preview mode, and category display style.",
    lockedMessage: "",
  },
};

export function isFeatureAvailable(featureId: FeatureId): Promise<boolean> {
  return invoke<boolean>("is_feature_available", { featureId });
}

export function listFeatures(): Promise<FeatureInfo[]> {
  return invoke<FeatureInfo[]>("list_features");
}

export function getLicenseState(): Promise<LicenseConfig> {
  return invoke<LicenseConfig>("get_license_state");
}

let cachedFeatures: Map<FeatureId, boolean> | null = null;

export async function prefetchFeatures(): Promise<void> {
  if (cachedFeatures) return;
  const features = await listFeatures();
  cachedFeatures = new Map();
  for (const f of features) {
    cachedFeatures.set(f.id, f.available);
  }
}

export function getCachedAccess(featureId: FeatureId): boolean {
  return cachedFeatures?.get(featureId) ?? true;
}

export function invalidateFeatureCache(): void {
  cachedFeatures = null;
}
