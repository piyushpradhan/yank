import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Box, Dot, Stack, Text, useTheme } from 'ember-design-system';
import { AIPanel } from './components/AIPanel';
import { KeyboardMap } from './components/KeyboardMap';
import { TitleBar } from './components/TitleBar';
import { Toast } from './components/Toast';
import { TweaksPanel } from './components/TweaksPanel';
import { useAppState } from './hooks/useAppState';
import { useFeature } from './hooks/useFeature';
import { isSemanticAvailable, useSettings } from './hooks/useSettings';
import { buildTheme } from './lib/theme';
import type { Tweaks } from './lib/types';
import { Library } from './windows/Library';

const DEFAULT_TWEAKS: Tweaks = {
  theme: 'dark',
  density: 'comfy',
  categoryDisplay: 'chip',
  showLabels: true,
  previewMode: 'split',
};

function App() {
  const [tweaks, setTweaks] = useState<Tweaks>(DEFAULT_TWEAKS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [keymapOpen, setKeymapOpen] = useState(false);
  const app = useAppState();
  const { settings, save: saveSettings } = useSettings();
  const { allowed: semanticFeatureAllowed } = useFeature("semantic_search");
  const { setTheme } = useTheme();

  // Mirror Tweaks → ember CSS-var theme. data-theme drives all token colors.
  useEffect(() => {
    setTheme(tweaks.theme);
    invoke('set_theme', { theme: tweaks.theme }).catch(() => {});
  }, [tweaks.theme, setTheme]);

  const t = useMemo(() => buildTheme(tweaks.theme, tweaks.density), [tweaks.theme, tweaks.density]);

  const semanticAvailable = isSemanticAvailable(settings) && semanticFeatureAllowed !== false;
  const anthropicEnabled = settings.anthropic_api_key.trim().length > 0;

  useEffect(() => {
    void invoke<boolean>('get_autostart')
      .then((enabled) => setTweaks((prev) => ({ ...prev, autostart: enabled })))
      .catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        setKeymapOpen((v) => !v);
      } else if (e.key === 'Escape') {
        if (keymapOpen) setKeymapOpen(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [keymapOpen]);

  return (
    <Box position="relative" fullHeight fullWidth overflow="hidden" bg="canvas">
      <Stack fullHeight fullWidth>
        <TitleBar
          aiActive={settings.provider !== 'disabled'}
          onOpenAI={() => setAiOpen(true)}
          onToggleTweaks={() => setTweaksOpen((v) => !v)}
        />
        <Box grow={1} style={{ minHeight: 0, position: 'relative' }}>
          <Library
            t={t}
            showLabels={tweaks.showLabels}
            categoryMode={tweaks.categoryDisplay}
            previewMode={tweaks.previewMode}
            app={app}
            semanticAvailable={semanticAvailable}
            anthropicEnabled={anthropicEnabled}
          />
        </Box>
      </Stack>

      {app.backfill && app.backfill.remaining > 0 && (
        <Box
          display="inline-flex"
          align="center"
          gap={2}
          px={3}
          radius="pill"
          bg="accent-soft"
          shadow="sm"
          position="fixed"
          style={{
            height: 24,
            top: 48,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 300,
            border: '1px solid color-mix(in oklab, var(--accent-ember-500) 24%, transparent)',
          }}
        >
          <Dot tone="accent" size="sm" pulse />
          <Text family="mono" size={10.5} tabularNums tone="accent-ink">
            Embedding {app.backfill.remaining} item
            {app.backfill.remaining === 1 ? '' : 's'}…
          </Text>
        </Box>
      )}

      {aiOpen && (
        <AIPanel
          t={t}
          settings={settings}
          onChange={(next) => void saveSettings(next)}
          onClose={() => setAiOpen(false)}
        />
      )}

      {tweaksOpen && (
        <TweaksPanel
          tweaks={tweaks}
          onChange={setTweaks}
          onClose={() => setTweaksOpen(false)}
          onAfterClear={() => {
            void app.refresh();
            app.showToast('History cleared', 'delete');
          }}
        />
      )}

      {keymapOpen && (
        <Box
          onClick={() => setKeymapOpen(false)}
          position="fixed"
          display="grid"
          style={{ inset: 0, zIndex: 700, placeItems: 'center', background: 'rgba(0,0,0,0.45)' }}
        >
          <Box
            onClick={(e) => e.stopPropagation()}
            overflow="hidden"
            radius="lg"
            border
            shadow="md"
            style={{ height: 420, width: 820 }}
          >
            <KeyboardMap />
          </Box>
        </Box>
      )}

      {app.toast && <Toast t={t} toast={app.toast} />}
    </Box>
  );
}

export default App;
