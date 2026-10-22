import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Box,
  Button,
  Card,
  IconButton,
  Inline,
  Kbd,
  Overline,
  Stack,
  Switch,
  Text,
} from 'ember-design-system';
import {
  LuArrowUpRight,
  LuCommand,
  LuInfo,
  LuMoon,
  LuMonitor,
  LuPalette,
  LuSearch,
  LuShieldCheck,
  LuSparkles,
  LuSun,
  LuX,
  LuZap,
} from 'react-icons/lu';
import { AIPanel } from './AIPanel';
import { PrivacyPanel } from './PrivacyPanel';
import { captureUsageReporter } from '../lib/telemetry';
import { getKeyIcon } from '../lib/keyIcons';
import type { Updater } from '../hooks/useUpdater';
import { IS_LINUX } from '../lib/platform';
import {
  DEFAULT_SHORTCUT,
  hasAnyModifier,
  modifierFromCode,
  modifiersFromEvent,
  tokensOf,
  type ShortcutConfig,
} from '../lib/shortcut';
import type { EmbedSettings } from '../hooks/useSettings';
import type { CategoryDisplay, Density, PlatformInfo, PreviewMode, Tweaks } from '../lib/types';
import type { TelemetryPreferences } from '../lib/telemetry';
import './SettingsWindow.css';

export type SettingsPage = 'appearance' | 'library' | 'shortcuts' | 'ai' | 'privacy' | 'startup' | 'about';

interface SettingsWindowProps {
  tweaks: Tweaks;
  onChange: (next: Tweaks) => void;
  shortcut: ShortcutConfig | null;
  onShortcutChange: (next: ShortcutConfig) => void;
  updater: Updater;
  settings: EmbedSettings;
  onAIChange: (next: EmbedSettings) => void;
  onClose: () => void;
  onAfterClear?: () => void;
  telemetry: {
    preferences: TelemetryPreferences | null;
    saving: boolean;
    error: string | null;
    choose: (enabled: boolean) => Promise<boolean>;
    retry?: () => Promise<boolean>;
  };
  initialPage: SettingsPage;
}

const DENSITIES: Density[] = ['comfy', 'compact'];
const DISPLAYS: CategoryDisplay[] = ['chip', 'icon', 'dot'];
const PREVIEWS: PreviewMode[] = ['split', 'inline'];

const PAGES: {
  id: SettingsPage;
  label: string;
  description: string;
  keywords: string;
  icon: typeof LuPalette;
}[] = [
  {
    id: 'appearance', label: 'Appearance', description: 'Change how Yank looks and feels.',
    keywords: 'theme light dark density compact comfy preview split inline translucent frosted glass', icon: LuPalette,
  },
  {
    id: 'library', label: 'Library', description: 'Control how your clips are displayed.',
    keywords: 'category badge chip icon dot labels clips list', icon: LuMonitor,
  },
  {
    id: 'shortcuts', label: 'Shortcuts', description: 'Get to your clipboard from anywhere.',
    keywords: 'keyboard hotkey palette command semantic search', icon: LuCommand,
  },
  {
    id: 'ai', label: 'AI features', description: 'Semantic search and optional intent labels.',
    keywords: 'provider model api key anthropic claude typesafe jev embeddings labels', icon: LuSparkles,
  },
  {
    id: 'privacy', label: 'Privacy & history', description: 'Choose what Yank captures and shares.',
    keywords: 'sensitive clipboard copy usage telemetry statistics clear history delete', icon: LuShieldCheck,
  },
  {
    id: 'startup', label: 'Startup', description: 'Decide how Yank starts.',
    keywords: 'launch login minimized open system boot', icon: LuZap,
  },
  {
    id: 'about', label: 'About Yank', description: 'Version, updates, and feedback.',
    keywords: 'version update feedback report bugs support', icon: LuInfo,
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box px={5} style={{ paddingBlock: 16, borderBottom: '1px solid var(--border-subtle)' }}>
      <Overline as="div" size={11} weight="semibold" tracking="wider" tone="secondary" style={{ marginBottom: 12 }}>
        {title}
      </Overline>
      <Stack gap={3}>{children}</Stack>
    </Box>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Inline justify="between" align="center" gap={3} style={{ minHeight: 36 }}>
      <Text size={14} tone="secondary">{label}</Text>
      <Inline gap={2} wrap justify="end">{children}</Inline>
    </Inline>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Box
      as="label"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        minHeight: 34, cursor: 'pointer', color: checked ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      <Text size={14} style={{ color: 'inherit' }}>{label}</Text>
      <Switch
        switchSize="sm"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        aria-label={label}
      />
    </Box>
  );
}

function Choice({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return <Button size="sm" variant={active ? 'primary' : 'secondary'} onClick={onClick}>{children}</Button>;
}

function ShortcutRecorder({ value, onChange }: {
  value: ShortcutConfig | null;
  onChange: (next: ShortcutConfig) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    let heldModifiers = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(false);
        setError(null);
        return;
      }
      const pressedModifier = modifierFromCode(event.code);
      if (pressedModifier) {
        heldModifiers |= pressedModifier;
        return;
      }
      const modifiers = modifiersFromEvent(event, heldModifiers);
      if (!hasAnyModifier(modifiers)) {
        setError('Needs at least one modifier (Ctrl, Shift, Alt, Super/Cmd)');
        return;
      }
      const next: ShortcutConfig = { modifiers, key: event.code };
      invoke('set_shortcut', { sc: next })
        .then(() => {
          onChange(next);
          setRecording(false);
          setError(null);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to register');
        });
    };
    const onKeyUp = (event: KeyboardEvent) => { heldModifiers &= ~modifierFromCode(event.code); };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [recording, onChange]);

  const tokens = tokensOf(value ?? DEFAULT_SHORTCUT);
  return (
    <Stack gap={1} align="end" style={{ minWidth: 0 }}>
      <Button size="sm" variant={recording ? 'primary' : 'secondary'} onClick={() => { setError(null); setRecording((current) => !current); }}>
        {recording ? <Text family="mono" size={12}>Press a combo… Esc to cancel</Text> : (
          <Inline gap={1} align="center">{tokens.map((token, index) => <Kbd key={index} size="sm">{getKeyIcon(token)}</Kbd>)}</Inline>
        )}
      </Button>
      {error && <Text size={12} tone="danger" style={{ textAlign: 'right', maxWidth: 260 }}>{error}</Text>}
    </Stack>
  );
}

function SettingsSection({
  id,
  active,
  pageRef,
  children,
}: {
  id: SettingsPage;
  active: boolean;
  pageRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return <div ref={pageRef} className="settings-page" aria-hidden={!active} style={{ display: active ? (id === 'about' ? 'flex' : 'block') : 'none' }} data-settings-page={id}>{children}</div>;
}

export function SettingsWindow({
  tweaks,
  onChange,
  shortcut,
  onShortcutChange,
  updater,
  settings,
  onAIChange,
  onClose,
  onAfterClear,
  telemetry,
  initialPage,
}: SettingsWindowProps) {
  const [page, setPage] = useState<SettingsPage>(initialPage);
  const [query, setQuery] = useState('');
  const [clearArmed, setClearArmed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [wayland, setWayland] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => onChange({ ...tweaks, [key]: value });

  useEffect(() => {
    invoke<PlatformInfo>('platform_info').then((info) => setWayland(info.wayland)).catch(() => {});
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
        )].filter((element) => element.getClientRects().length > 0);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const clear = async () => {
    const report = captureUsageReporter();
    setClearing(true);
    setClearError(null);
    try {
      await invoke('clear_history');
      report({ name: 'feature_used', surface: 'library', feature: 'clear_history', category: null });
      onAfterClear?.();
      setClearArmed(false);
    } catch (err: unknown) {
      setClearError(err instanceof Error ? err.message : typeof err === 'string' ? err : 'Clear failed');
    } finally {
      setClearing(false);
    }
  };

  const visiblePages = PAGES.filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(query.trim().toLowerCase()));
  const updateLabel = (() => {
    switch (updater.status.kind) {
      case 'idle': return 'Check for updates';
      case 'checking': return 'Checking…';
      case 'downloading': return `Downloading ${updater.status.version}…`;
      case 'ready': return `Restart to install ${updater.status.version}`;
      case 'uptodate': return "You're up to date";
      case 'error': return 'Check failed — try again';
    }
  })();
  const updateDescription = (() => {
    switch (updater.status.kind) {
      case 'idle': return 'Check whether a newer version is available.';
      case 'checking': return 'Looking for updates…';
      case 'downloading': return `Downloading version ${updater.status.version}…`;
      case 'ready': return `Version ${updater.status.version} is ready to install.`;
      case 'uptodate': return "You're using the latest version.";
      case 'error': return 'Yank could not check for updates.';
    }
  })();

  const appearance = (
    <>
      <Section title="Appearance">
        <Row label="Theme">
          <Choice active={tweaks.theme === 'light'} onClick={() => set('theme', 'light')}><LuSun size={13} />Light</Choice>
          <Choice active={tweaks.theme === 'dark'} onClick={() => set('theme', 'dark')}><LuMoon size={13} />Dark</Choice>
        </Row>
        <Row label="Density">
          {DENSITIES.map((density) => <Choice key={density} active={tweaks.density === density} onClick={() => set('density', density)}>{density}</Choice>)}
        </Row>
        <Row label="Preview layout">
          {PREVIEWS.map((mode) => <Choice key={mode} active={tweaks.previewMode === mode} onClick={() => set('previewMode', mode)}>{mode}</Choice>)}
        </Row>
      </Section>
      {IS_LINUX && (
        <Section title="Palette">
          <ToggleRow label="Frosted glass" checked={!!tweaks.translucent} onChange={(next) => { onChange({ ...tweaks, translucent: next }); void invoke('set_translucent', { translucent: next }); }} />
          <Text size={12} tone="secondary" leading={1.55}>Blur the desktop behind the palette. May leave ghost rows on some WebKitGTK builds; off by default for reliability.</Text>
        </Section>
      )}
    </>
  );

  return (
    <>
      <div className="settings-window-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="settings-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-window-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="settings-sidebar" aria-label="Settings categories">
          <Text as="h2" id="settings-window-title" size={17} weight="semibold" tracking="tight">Settings</Text>
          <label className="settings-search">
            <LuSearch size={13} aria-hidden="true" />
            <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Find a category…" aria-label="Find a settings category" />
          </label>
          <nav className="settings-navigation">
            {visiblePages.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" className={`settings-nav-item${page === id ? ' active' : ''}`} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}>
                <Icon size={14} strokeWidth={1.7} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
            {visiblePages.length === 0 && <Text size={12} tone="tertiary" style={{ padding: 10 }}>No categories found.</Text>}
          </nav>
          <div className="settings-sidebar-bottom">
            <Text size={12} tone="tertiary">Yank {updater.currentVersion ? `v${updater.currentVersion}` : ''}</Text>
          </div>
        </aside>

        <main className="settings-main">
          <header className="settings-main-header">
            <div><h2>{PAGES.find((item) => item.id === page)?.label}</h2><p>{PAGES.find((item) => item.id === page)?.description}</p></div>
            <IconButton aria-label="Close settings" title="Close settings" icon={<LuX size={15} />} variant="ghost" size="sm" onClick={onClose} />
          </header>

          <SettingsSection id="appearance" active={page === 'appearance'}>{appearance}</SettingsSection>
          <SettingsSection id="library" active={page === 'library'}>
            <Section title="Library display">
              <Row label="Category badge">
                {DISPLAYS.map((display) => <Choice key={display} active={tweaks.categoryDisplay === display} onClick={() => set('categoryDisplay', display)}>{display}</Choice>)}
              </Row>
              <ToggleRow label="Show labels" checked={tweaks.showLabels} onChange={(next) => set('showLabels', next)} />
              <Text size={12} tone="tertiary" leading={1.55}>Show an AI label when available, otherwise a content preview.</Text>
            </Section>
          </SettingsSection>
          <SettingsSection id="shortcuts" active={page === 'shortcuts'}>
            <Section title="Palette">
              <Row label="Open palette"><ShortcutRecorder value={shortcut} onChange={onShortcutChange} /></Row>
              <ToggleRow label="Start in semantic search" checked={!!tweaks.paletteSemanticDefault} onChange={(next) => { onChange({ ...tweaks, paletteSemanticDefault: next }); void invoke('set_palette_semantic_default', { enabled: next }); }} />
              <Text size={12} tone="tertiary" leading={1.55}>Use your configured search provider when opening the palette.</Text>
              {wayland && <Text size={12} tone="secondary" leading={1.55}>Wayland: global shortcuts aren’t supported by your compositor. Bind a keyboard shortcut in system settings to run <Text as="b">yank --palette</Text> instead.</Text>}
            </Section>
          </SettingsSection>
          <SettingsSection id="ai" active={page === 'ai'}>
            <AIPanel embedded settings={settings} onChange={onAIChange} onClose={onClose} />
          </SettingsSection>
          <SettingsSection id="privacy" active={page === 'privacy'}>
            <div className="settings-page-scroll">
              <div className="settings-privacy-panel">
                <PrivacyPanel
                  inline
                  consent={false}
                  preferences={telemetry.preferences}
                  saving={telemetry.saving}
                  error={telemetry.error}
                  onChoose={telemetry.choose}
                  onRetry={telemetry.retry}
                  onClose={onClose}
                />
              </div>
              <Section title="History">
                <Card padding="md" style={{ borderColor: 'color-mix(in oklab, var(--status-danger) 30%, var(--border-subtle))' }}>
                  <Stack gap={3}>
                    <Stack gap={1}>
                      <Text size={14} weight="medium">Clear clipboard history</Text>
                      <Text size={12} tone="secondary">Permanently delete unpinned clips. Pinned clips are kept.</Text>
                    </Stack>
                    {!clearArmed ? <Button variant="secondary" size="sm" onClick={() => setClearArmed(true)}>Clear history…</Button> : (
                      <Inline gap={2}>
                        <Button variant="ghost" size="sm" disabled={clearing} onClick={() => setClearArmed(false)}>Cancel</Button>
                        <Button variant="danger" size="sm" loading={clearing} onClick={() => void clear()}>{clearing ? 'Clearing…' : 'Delete unpinned clips'}</Button>
                      </Inline>
                    )}
                    {clearError && <Text role="alert" size={12} tone="danger">{clearError}</Text>}
                  </Stack>
                </Card>
              </Section>
            </div>
          </SettingsSection>
          <SettingsSection id="startup" active={page === 'startup'}>
            <Section title="When Yank starts">
              <ToggleRow label="Launch at login" checked={!!tweaks.autostart} onChange={(next) => { onChange({ ...tweaks, autostart: next }); void invoke('set_autostart', { enabled: next }); }} />
              <ToggleRow label="Start minimized" checked={!!tweaks.minimizedOnStart} onChange={(next) => { onChange({ ...tweaks, minimizedOnStart: next }); void invoke('set_minimized_on_start', { minimized: next }); }} />
            </Section>
          </SettingsSection>
          <SettingsSection id="about" active={page === 'about'}>
            <div className="settings-about-layout">
              <div className="settings-about-primary">
                <div className="settings-about-brand">
                  <img src="/mark.png" alt="" aria-hidden="true" />
                  <div className="settings-about-brand-copy">
                    <h3>Yank</h3>
                    <p>Local-first clipboard history</p>
                  </div>
                  <span className="settings-about-version">v{updater.currentVersion ?? '—'}</span>
                </div>
                <div className="settings-about-update">
                  <div className="settings-about-update-copy">
                    <span className="settings-about-eyebrow">Software update</span>
                    <p>{updateDescription}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={updater.status.kind === 'ready' ? 'primary' : 'secondary'}
                    disabled={updater.status.kind === 'checking' || updater.status.kind === 'downloading'}
                    onClick={() => updater.status.kind === 'ready' ? void updater.restart() : void updater.check()}
                  >{updateLabel}</Button>
                </div>
                {updater.status.kind === 'error' && <Text role="alert" size={12} tone="danger">{updater.status.message}</Text>}
              </div>

              <div className="settings-about-support">
                <div>
                  <h3>Help shape Yank</h3>
                  <p>Share feedback, report a bug, or suggest an idea.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void openUrl('https://github.com/piyushpradhan/yank/issues').catch(() => {})}>
                  Send feedback <LuArrowUpRight size={13} />
                </Button>
              </div>
            </div>
          </SettingsSection>

          {page !== 'ai' && <footer className="settings-main-footer"><span>Changes apply immediately</span><span>⌘ F to find a category</span></footer>}
        </main>
      </div>
    </>
  );
}
