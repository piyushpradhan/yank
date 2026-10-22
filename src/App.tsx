import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Box, Stack, useTheme } from 'ember-design-system';
import { KeyboardMap } from './components/KeyboardMap';
import { TitleBar } from './components/TitleBar';
import { Toast } from './components/Toast';
import { SettingsWindow, type SettingsPage } from './components/SettingsWindow';
import { UpdateBanner } from './components/UpdateBanner';
import { WelcomeModal } from './components/WelcomeModal';
import { PrivacyPanel } from './components/PrivacyPanel';
import { useTelemetryPreferences } from './hooks/useTelemetryPreferences';
import { trackFeature } from './lib/telemetry';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('appearance');
  const [keymapOpen, setKeymapOpen] = useState(false);
  const [shortcut, setShortcut] = useState<ShortcutConfig | null>(null);
  // null = still loading; true = already dismissed; false = show welcome.
  const [hintDismissed, setHintDismissed] = useState<boolean | null>(null);
  const app = useAppState('library');
  const telemetry = useTelemetryPreferences();
  const { settings, save: saveSettings } = useSettings();
  const updater = useUpdater();
  const { setTheme } = useTheme();
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = (page: SettingsPage = 'appearance') => {
    setSettingsPage(page);
    setSettingsOpen(true);
  };

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
      : 'Semantic search is unavailable — finish configuring your provider in Settings → AI features.'
    : app.providerHealth.status === 'error'
      ? `Semantic search is unavailable — ${app.providerHealth.error ?? 'provider error'}.`
      : null;
  const anthropicEnabled = settings.anthropic_api_key.trim().length > 0;

  useEffect(() => {
    void invoke<boolean>('get_autostart')
      .then((enabled) => setTweaks((prev) => ({ ...prev, autostart: enabled })))
      .catch(() => {});
    void invoke<boolean>('get_minimized_on_start')
      .then((minimized) => setTweaks((prev) => ({ ...prev, minimizedOnStart: minimized })))
      .catch(() => {});
    void invoke<boolean>('get_translucent')
      .then((translucent) => setTweaks((prev) => ({ ...prev, translucent })))
      .catch(() => {});
    void invoke<boolean>('get_palette_semantic_default')
      .then((on) => setTweaks((prev) => ({ ...prev, paletteSemanticDefault: on })))
      .catch(() => {});
    void invoke<ShortcutConfig>('get_shortcut')
      .then((sc) => setShortcut(sc))
      .catch(() => setShortcut(DEFAULT_SHORTCUT));
    void invoke<boolean>('get_hint_dismissed')
      .then((v) => setHintDismissed(v))
      .catch(() => setHintDismissed(true));
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
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
          onOpenSettings={() => {
            trackFeature('library', 'settings');
            if (settingsOpen) closeSettings();
            else openSettings('appearance');
          }}
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
            searchProvider={settings.provider}
            initialMode={tweaks.paletteSemanticDefault && semanticAvailable ? 'semantic' : 'fuzzy'}
            semanticOffMessage={semanticOffMessage}
            anthropicEnabled={anthropicEnabled}
            aiActive={settings.provider !== 'disabled'}
            onOpenAI={() => {
              trackFeature('library', 'ai_settings');
              openSettings('ai');
            }}
          />
        </Box>
      </Stack>

      {settingsOpen && (
        <SettingsWindow
          initialPage={settingsPage}
          tweaks={tweaks}
          onChange={setTweaks}
          shortcut={shortcut}
          onShortcutChange={setShortcut}
          updater={updater}
          settings={settings}
          onAIChange={(next) => {
            if (next.provider !== settings.provider) trackFeature('library', 'provider_changed');
            void saveSettings(next);
            app.resetProviderHealth();
          }}
          onClose={closeSettings}
          onAfterClear={() => {
            void app.refresh();
            app.showToast('History cleared', 'delete');
          }}
          telemetry={{
            preferences: telemetry.preferences,
            saving: telemetry.saving,
            error: telemetry.error,
            choose: telemetry.choose,
            retry: telemetry.retry,
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
        <WelcomeModal
          shortcut={shortcut}
          onDismiss={(autostartEnabled) => {
            // Mirror the autostart choice into local tweaks state so the
            // Tweaks panel reflects what the OS just got told, without a
            // round-trip to get_autostart.
            setTweaks((prev) => ({ ...prev, autostart: autostartEnabled }));
            setHintDismissed(true);
          }}
        />
      )}

      {hintDismissed === true && telemetry.preferences?.prompt_handled === false && (
        <PrivacyPanel
          consent={!telemetry.preferences?.prompt_handled}
          preferences={telemetry.preferences}
          saving={telemetry.saving}
          error={telemetry.error}
          onChoose={telemetry.choose}
          onRetry={telemetry.retry}
          onClose={() => {}}
        />
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
