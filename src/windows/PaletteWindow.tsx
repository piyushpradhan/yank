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
    invoke<boolean>('get_plain_text_only')
      .then((enabled) => setTweaks((prev) => ({ ...prev, plainTextOnly: enabled })))
      .catch(() => {});
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
        semanticAvailable={semanticAvailable}
        semanticOffMessage={semanticOffMessage}
        anthropicEnabled={anthropicEnabled}
      />
    </Box>
  );
}
