import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/// `local`: on-device embeddings only. `jev` / `laya`: embeddings, then the
/// shortlist is re-ranked by TypeSafe Jev (cloud) or Laya (local MLX server).
export type EmbedProvider = "local" | "jev" | "laya" | "disabled";

export interface EmbedSettings {
  provider: EmbedProvider;
  typesafe_model: string;
  typesafe_api_key: string;
  laya_url: string;
  anthropic_api_key: string;
}

const DEFAULT: EmbedSettings = {
  provider: "local",
  typesafe_model: "jev-latest",
  typesafe_api_key: "",
  laya_url: "http://127.0.0.1:8765/v1/systemone",
  anthropic_api_key: "",
};

/// Mirror of the Rust-side `EmbedConfig::is_active` rule. Single source of
/// truth — both windows (Library, Palette) consume this so a future provider
/// addition only updates one place.
export function isSemanticAvailable(s: EmbedSettings): boolean {
  return s.provider !== "disabled";
}

export function useSettings() {
  const [settings, setSettings] = useState<EmbedSettings>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<EmbedSettings>("get_settings").then(
      (s) => {
        setSettings({ ...DEFAULT, ...s });
        setLoaded(true);
      },
      (err) => {
        console.error("get_settings failed", err);
        setLoaded(true);
      },
    );
  }, []);

  const save = useCallback(async (next: EmbedSettings) => {
    setSettings(next);
    try {
      await invoke("set_settings", { cfg: next });
    } catch (err) {
      console.error("set_settings failed", err);
    }
  }, []);

  return { settings, save, loaded };
}
