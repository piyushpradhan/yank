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
}

export interface LicenseConfig {
  isPremium: boolean;
}

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
