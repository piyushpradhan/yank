import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type EmbedProvider = "jev" | "disabled";

export interface EmbedSettings {
  provider: EmbedProvider;
  typesafe_model: string;
  typesafe_api_key: string;
  anthropic_api_key: string;
}

const DEFAULT: EmbedSettings = {
  provider: "jev",
  typesafe_model: "jev-latest",
  typesafe_api_key: "",
  anthropic_api_key: "",
};

/// Mirror of the Rust-side `EmbedConfig::is_active` rule. Single source of
/// truth — both windows (Library, Palette) consume this so a future provider
/// addition only updates one place.
export function isSemanticAvailable(s: EmbedSettings): boolean {
  switch (s.provider) {
    case "disabled":
      return false;
    case "jev":
      return s.typesafe_api_key.trim().length > 0;
  }
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
