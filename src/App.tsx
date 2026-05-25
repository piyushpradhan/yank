import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, useTheme } from 'ember-design-system';
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
    <div className="relative h-full w-full overflow-hidden bg-canvas font-sans text-fg">
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
        <div
          className="fixed left-1/2 top-2 z-[300] inline-flex h-6 -translate-x-1/2 items-center gap-2 rounded-full border bg-accent-soft px-3 font-mono text-[10.5px] tabular-nums text-accent-ink shadow-ember-sm"
          style={{
            borderColor: 'color-mix(in oklab, var(--accent-ember-500) 24%, transparent)',
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-accent"
            style={{ animation: 'backfillPulse 1.2s ease-in-out infinite' }}
            aria-hidden
          />
          Embedding {app.backfill.remaining} item
          {app.backfill.remaining === 1 ? '' : 's'}…
        </div>
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

      <div className="fixed right-[150px] top-2 z-[200] flex gap-1.5">
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
      </div>

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
        <div
          onClick={() => setKeymapOpen(false)}
          className="fixed inset-0 z-[700] grid place-items-center bg-black/45"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-[420px] w-[820px] overflow-hidden rounded-xl border border-border shadow-ember-md"
          >
            <KeyboardMap />
          </div>
        </div>
      )}

      {app.toast && <Toast t={t} toast={app.toast} />}
    </div>
  );
}

export default App;
