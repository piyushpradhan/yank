import { useEffect, useMemo, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Box, useTheme } from 'ember-design-system';
import { Palette } from './Palette';
import { useAppState } from '../hooks/useAppState';
import { isSemanticAvailable, useSettings } from '../hooks/useSettings';
import { buildTheme } from '../lib/theme';
import type { ThemeMode, Tweaks } from '../lib/types';

const DEFAULT_TWEAKS: Tweaks = {
  theme: 'dark',
  density: 'comfy',
  categoryDisplay: 'chip',
  showLabels: true,
  previewMode: 'split',
};

export function PaletteWindow() {
  const [tweaks, setTweaks] = useState<Tweaks>(DEFAULT_TWEAKS);
  const [translucent, setTranslucent] = useState(false);
  const app = useAppState();
  const { settings } = useSettings();
  const { setTheme } = useTheme();

  // Mode-switching is gated on config only — runtime failures surface through
  // `semanticOffMessage` (banner / empty state / toast) but never lock the user
  // out of retrying semantic mode.
  const semanticAvailable = isSemanticAvailable(settings);
  const semanticOffMessage = !semanticAvailable
    ? settings.provider === 'disabled'
      ? 'Semantic search is turned off.'
      : 'Semantic search is unavailable — finish configuring your provider.'
    : app.providerHealth.status === 'error'
      ? `Semantic search is unavailable — ${app.providerHealth.error ?? 'provider error'}.`
      : null;
  const anthropicEnabled = settings.anthropic_api_key.trim().length > 0;

  const t = useMemo(() => buildTheme(tweaks.theme, tweaks.density), [tweaks.theme, tweaks.density]);

  useEffect(() => {
    invoke<string>('get_theme')
      .then((theme) => {
        setTweaks((prev) => ({ ...prev, theme: theme as ThemeMode }));
      })
      .catch(() => {});
  }, []);

  // Translucency (Linux only): mirror the persisted setting onto <html> so the
  // CSS can switch the palette surface between opaque and frosted-glass. The
  // Rust side flips the webview background colour live on toggle.
  useEffect(() => {
    invoke<boolean>('get_translucent')
      .then((on) => {
        setTranslucent(on);
        document.documentElement.setAttribute('data-translucent', on ? 'true' : 'false');
      })
      .catch(() => {
        document.documentElement.setAttribute('data-translucent', 'false');
      });
    const unlisten = listen<boolean>('translucent-changed', (event) => {
      setTranslucent(event.payload);
      document.documentElement.setAttribute('data-translucent', event.payload ? 'true' : 'false');
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    setTheme(tweaks.theme);
  }, [tweaks.theme, setTheme]);

  useEffect(() => {
    const unlisten = listen<string>('theme-changed', (event) => {
      setTweaks((prev) => ({ ...prev, theme: event.payload as ThemeMode }));
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, []);

  const close = () => {
    getCurrentWindow()
      .hide()
      .catch(() => {});
  };

  return (
    <Box fullHeight fullWidth overflow="hidden" bg="transparent">
      <Palette
        t={t}
        showLabels={tweaks.showLabels}
        categoryMode={tweaks.categoryDisplay}
        app={app}
        onClose={close}
        translucent={translucent}
        semanticAvailable={semanticAvailable}
        semanticOffMessage={semanticOffMessage}
        anthropicEnabled={anthropicEnabled}
      />
    </Box>
  );
}
