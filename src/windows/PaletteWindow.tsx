import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTheme } from "ember-design-system";
import { Palette } from "./Palette";
import { useAppState } from "../hooks/useAppState";
import { isSemanticAvailable, useSettings } from "../hooks/useSettings";
import { buildTheme } from "../lib/theme";
import type { ThemeMode, Tweaks } from "../lib/types";

const DEFAULT_TWEAKS: Tweaks = {
  theme: "dark",
  density: "comfy",
  categoryDisplay: "chip",
  showLabels: true,
  previewMode: "split",
};

export function PaletteWindow() {
  const [tweaks, setTweaks] = useState<Tweaks>(DEFAULT_TWEAKS);
  const app = useAppState();
  const { settings } = useSettings();
  const { setTheme } = useTheme();

  const semanticAvailable = isSemanticAvailable(settings);

  const t = useMemo(
    () => buildTheme(tweaks.theme, tweaks.density),
    [tweaks.theme, tweaks.density],
  );

  useEffect(() => {
    invoke<string>("get_theme")
      .then((theme) => {
        setTweaks((prev) => ({ ...prev, theme: theme as ThemeMode }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setTheme(tweaks.theme);
  }, [tweaks.theme, setTheme]);

  useEffect(() => {
    const unlisten = listen<string>("theme-changed", (event) => {
      setTweaks((prev) => ({ ...prev, theme: event.payload as ThemeMode }));
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const unlisten = listen("palette-shown", () => {
      const input = document.querySelector<HTMLInputElement>("input");
      input?.focus();
      input?.select();
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, []);

  const close = () => {
    getCurrentWindow().hide().catch(() => {});
  };

  return (
    <div className="h-full w-full overflow-hidden bg-transparent font-sans text-fg">
      <Palette
        t={t}
        showLabels={tweaks.showLabels}
        categoryMode={tweaks.categoryDisplay}
        app={app}
        onClose={close}
        semanticAvailable={semanticAvailable}
      />
    </div>
  );
}
