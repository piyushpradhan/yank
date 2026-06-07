import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Box, Stack, useTheme } from 'ember-design-system';
import { AIPanel } from './components/AIPanel';
import { KeyboardMap } from './components/KeyboardMap';
import { TitleBar } from './components/TitleBar';
import { Toast } from './components/Toast';
import { TweaksPanel } from './components/TweaksPanel';
import { UpdateBanner } from './components/UpdateBanner';
import { WelcomeModal } from './components/WelcomeModal';
import { useAppState } from './hooks/useAppState';
import { isSemanticAvailable, useSettings } from './hooks/useSettings';
import { useUpdater } from './hooks/useUpdater';
import { DEFAULT_SHORTCUT, type ShortcutConfig } from './lib/shortcut';
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
  const [shortcut, setShortcut] = useState<ShortcutConfig | null>(null);
  // null = still loading; true = already dismissed; false = show welcome.
  const [hintDismissed, setHintDismissed] = useState<boolean | null>(null);
  const app = useAppState();
  const { settings, save: saveSettings } = useSettings();
  const updater = useUpdater();
  const { setTheme } = useTheme();

  // Mirror Tweaks → ember CSS-var theme. data-theme drives all token colors.
  useEffect(() => {
    setTheme(tweaks.theme);
    invoke('set_theme', { theme: tweaks.theme }).catch(() => {});
  }, [tweaks.theme, setTheme]);

  const t = useMemo(() => buildTheme(tweaks.theme, tweaks.density), [tweaks.theme, tweaks.density]);

  // `semanticAvailable` gates mode-switching (Tab) — driven by config only so a
  // transient runtime error can never lock the user out of retrying.
  // `semanticOffMessage` is informational and *also* reflects runtime errors.
  const semanticAvailable = isSemanticAvailable(settings);
  const semanticOffMessage = !semanticAvailable
    ? settings.provider === 'disabled'
      ? 'Semantic search is turned off. Using fuzzy matching only.'
      : 'Semantic search is unavailable — finish configuring your provider in AI settings.'
    : app.providerHealth.status === 'error'
      ? `Semantic search is unavailable — ${app.providerHealth.error ?? 'provider error'}.`
      : null;
  const anthropicEnabled = settings.anthropic_api_key.trim().length > 0;

  useEffect(() => {
    void invoke<boolean>('get_autostart')
      .then((enabled) => setTweaks((prev) => ({ ...prev, autostart: enabled })))
      .catch(() => {});
    void invoke<boolean>('get_plain_text_only')
      .then((enabled) => setTweaks((prev) => ({ ...prev, plainTextOnly: enabled })))
      .catch(() => {});
    void invoke<ShortcutConfig>('get_shortcut')
      .then((sc) => setShortcut(sc))
      .catch(() => setShortcut(DEFAULT_SHORTCUT));
    void invoke<boolean>('get_hint_dismissed')
      .then((v) => setHintDismissed(v))
      .catch(() => setHintDismissed(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?') {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        )
          return;
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
          backfill={app.backfill}
        />
        <Box grow={1} style={{ minHeight: 0, position: 'relative' }}>
          <Library
            t={t}
            showLabels={tweaks.showLabels}
            categoryMode={tweaks.categoryDisplay}
            previewMode={tweaks.previewMode}
            app={app}
            semanticAvailable={semanticAvailable}
            semanticOffMessage={semanticOffMessage}
            anthropicEnabled={anthropicEnabled}
            aiActive={settings.provider !== 'disabled'}
            onOpenAI={() => setAiOpen(true)}
          />
        </Box>
      </Stack>

      {aiOpen && (
        <AIPanel
          settings={settings}
          onChange={(next) => {
            void saveSettings(next);
            app.resetProviderHealth();
          }}
          onClose={() => setAiOpen(false)}
        />
      )}

      {tweaksOpen && (
        <TweaksPanel
          tweaks={tweaks}
          onChange={setTweaks}
          shortcut={shortcut}
          onShortcutChange={setShortcut}
          updater={updater}
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
          style={{
            inset: 0,
            zIndex: 700,
            placeItems: 'center',
            padding: 16,
            background: 'rgba(0,0,0,0.45)',
          }}
        >
          <Box
            onClick={(e) => e.stopPropagation()}
            overflow="hidden"
            radius="lg"
            border
            shadow="md"
            style={{
              width: 'min(820px, 100%)',
              height: 'min(420px, 100%)',
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
            <KeyboardMap shortcut={shortcut} />
          </Box>
        </Box>
      )}

      {hintDismissed === false && (
        <WelcomeModal shortcut={shortcut} onDismiss={() => setHintDismissed(true)} />
      )}

      {app.toast && <Toast t={t} toast={app.toast} />}

      <UpdateBanner
        status={updater.status}
        onRestart={() => void updater.restart()}
        onDismiss={updater.dismiss}
      />
    </Box>
  );
}

export default App;
