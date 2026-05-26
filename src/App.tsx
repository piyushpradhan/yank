import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Box, Button, Dot, Inline, Text, useTheme } from 'ember-design-system';
import { AIPanel } from './components/AIPanel';
import { KeyboardMap } from './components/KeyboardMap';
import { ShortcutHint } from './components/ShortcutHint';
import { Toast } from './components/Toast';
import { TweaksPanel } from './components/TweaksPanel';
import { useAppState } from './hooks/useAppState';
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

async function loadHintDismissed(): Promise<boolean> {
  try {
    return await invoke<boolean>('get_hint_dismissed');
  } catch {
    return false;
  }
}

async function loadShortcut(): Promise<{ modifiers: number; key: string } | null> {
  try {
    return await invoke<{ modifiers: number; key: string }>('get_shortcut');
  } catch {
    return null;
  }
}

async function saveHintDismissed(dismissed: boolean) {
  try {
    await invoke('set_hint_dismissed', { dismissed });
  } catch {
    // non-critical
  }
}

const MOD_CONTROL = 0x08;
const MOD_SHIFT = 0x200;
const MOD_ALT = 0x01;
const MOD_META = 0x40;

function labelForShortcut(modifiers: number, key: string): string {
  const parts: string[] = [];
  if (modifiers & MOD_CONTROL) parts.push('Ctrl');
  if (modifiers & MOD_ALT) parts.push('Alt');
  if (modifiers & MOD_SHIFT) parts.push('Shift');
  if (modifiers & MOD_META) parts.push('Meta');
  parts.push(key.startsWith('Key') ? key.slice(3) : key);
  return parts.join('+');
}

function App() {
  const [tweaks, setTweaks] = useState<Tweaks>(DEFAULT_TWEAKS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [keymapOpen, setKeymapOpen] = useState(false);
  const [hintDismissed, setHintDismissedState] = useState(false);
  const app = useAppState();
  const { settings, save: saveSettings } = useSettings();
  const { setTheme } = useTheme();

  // Mirror Tweaks → ember CSS-var theme. data-theme drives all token colors.
  useEffect(() => {
    setTheme(tweaks.theme);
    invoke('set_theme', { theme: tweaks.theme }).catch(() => {});
  }, [tweaks.theme, setTheme]);

  const t = useMemo(() => buildTheme(tweaks.theme, tweaks.density), [tweaks.theme, tweaks.density]);

  const semanticAvailable = isSemanticAvailable(settings);
  const anthropicEnabled = settings.anthropic_api_key.trim().length > 0;

  useEffect(() => {
    void loadHintDismissed().then(setHintDismissedState);
    void loadShortcut().then((sc) => {
      if (sc) {
        const label = labelForShortcut(sc.modifiers, sc.key);
        setTweaks((prev) => ({ ...prev, paletteShortcut: label }));
      }
    });
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
      <Library
        t={t}
        showLabels={tweaks.showLabels}
        categoryMode={tweaks.categoryDisplay}
        previewMode={tweaks.previewMode}
        app={app}
        semanticAvailable={semanticAvailable}
        anthropicEnabled={anthropicEnabled}
      />

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
            top: 8,
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

      {!hintDismissed && (
        <ShortcutHint
          keys={(tweaks.paletteShortcut ?? 'Ctrl+Shift+Space').split('+')}
          onDismiss={() => {
            setHintDismissedState(true);
            void saveHintDismissed(true);
          }}
        />
      )}

      <Inline position="fixed" style={{ right: 150, top: 8, zIndex: 200, gap: 6 }}>
        <Button
          size="sm"
          variant={settings.provider !== 'disabled' ? 'primary' : 'ghost'}
          onClick={() => setAiOpen(true)}
          title="Semantic search"
        >
          AI
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setTweaksOpen((v) => !v)}
          title="Tweaks"
        >
          Tweaks
        </Button>
      </Inline>

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
