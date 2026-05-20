import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, IconButton } from 'ember-design-system';
import { LuX } from 'react-icons/lu';
import type { CategoryDisplay, Density, PreviewMode, Theme, ThemeMode, Tweaks } from '../lib/types';

interface TweaksPanelProps {
  t: Theme;
  tweaks: Tweaks;
  onChange: (next: Tweaks) => void;
  onClose: () => void;
  onAfterClear?: () => void;
}

const THEME_MODES: ThemeMode[] = ['light', 'dark'];
const DENSITIES: Density[] = ['comfy', 'compact'];
const DISPLAYS: CategoryDisplay[] = ['chip', 'icon', 'dot'];
const PREVIEWS: PreviewMode[] = ['split', 'inline'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border-subtle px-4 py-3">
      <div className="mb-2.5 font-mono text-[9.5px] font-semibold uppercase leading-none tracking-[1.4px] text-fg-faint">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <span className="font-sans text-xs leading-none text-fg-muted">{label}</span>
      <div className="flex flex-wrap items-center justify-end gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button size="sm" variant={active ? 'primary' : 'ghost'} onClick={onClick}>
      {children}
    </Button>
  );
}

export function TweaksPanel({ tweaks, onChange, onClose, onAfterClear }: TweaksPanelProps) {
  const set = <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => onChange({ ...tweaks, [k]: v });

  const [clearArmed, setClearArmed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const clear = async () => {
    setClearing(true);
    setClearError(null);
    try {
      await invoke('clear_history');
      onAfterClear?.();
      setClearArmed(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'clear failed';
      setClearError(msg);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      className="fixed right-4 top-[52px] z-[600] w-80 overflow-hidden rounded-xl border border-border bg-surface font-sans text-[13px] text-fg shadow-ember-md"
      style={{ animation: 'tweaksIn 180ms var(--easing-standard)' }}
    >
      <style>{`
        @keyframes tweaksIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>

      <div
        className="relative border-b border-border-subtle px-4 pb-3 pt-3.5"
        style={{
          background: 'linear-gradient(180deg, var(--accent-ember-50) 0%, transparent 100%)',
        }}
      >
        <div className="absolute bottom-0 left-0 top-0 w-[3px] bg-accent" />
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[2px] text-accent-ink">
              Tweaks
            </div>
            <div className="mt-0.5 text-[13.5px] font-semibold tracking-[-0.2px] text-fg">
              Make it yours
            </div>
          </div>
          <IconButton
            aria-label="Close"
            icon={<LuX size={14} />}
            variant="ghost"
            size="sm"
            onClick={onClose}
          />
        </div>
      </div>

      <Section title="Appearance">
        <Row label="Theme">
          {THEME_MODES.map((m) => (
            <Chip key={m} active={tweaks.theme === m} onClick={() => set('theme', m)}>
              {m}
            </Chip>
          ))}
        </Row>
        <Row label="Density">
          {DENSITIES.map((d) => (
            <Chip key={d} active={tweaks.density === d} onClick={() => set('density', d)}>
              {d}
            </Chip>
          ))}
        </Row>
        <Row label="Preview">
          {PREVIEWS.map((p) => (
            <Chip key={p} active={tweaks.previewMode === p} onClick={() => set('previewMode', p)}>
              {p}
            </Chip>
          ))}
        </Row>
      </Section>

      <Section title="Library">
        <Row label="Category badge">
          {DISPLAYS.map((d) => (
            <Chip
              key={d}
              active={tweaks.categoryDisplay === d}
              onClick={() => set('categoryDisplay', d)}
            >
              {d}
            </Chip>
          ))}
        </Row>
        <Row label="Show labels">
          <Chip active={tweaks.showLabels} onClick={() => set('showLabels', true)}>
            on
          </Chip>
          <Chip active={!tweaks.showLabels} onClick={() => set('showLabels', false)}>
            off
          </Chip>
        </Row>
        <Row label="Plain text only">
          <Chip
            active={tweaks.plainTextOnly ?? false}
            onClick={() => set('plainTextOnly', !(tweaks.plainTextOnly ?? false))}
          >
            {(tweaks.plainTextOnly ?? false) ? 'always' : 'auto'}
          </Chip>
        </Row>
      </Section>

      <Section title="System">
        <Row label="Palette shortcut">
          <span
            className="inline-flex h-[22px] items-center rounded border border-border-subtle px-2 font-mono text-[10.5px] leading-none tabular-nums text-fg-muted"
            style={{ background: 'color-mix(in oklab, var(--text-primary) 6%, transparent)' }}
          >
            {tweaks.paletteShortcut ?? 'Ctrl+Shift+Space'}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const CTRL = 0x08;
              const SHIFT = 0x200;
              const switchingToCtrlSpace = tweaks.paletteShortcut === 'Ctrl+Shift+Space';
              const next: Tweaks = {
                ...tweaks,
                paletteShortcut: switchingToCtrlSpace ? 'Ctrl+Space' : 'Ctrl+Shift+Space',
              };
              onChange(next);
              void invoke('set_shortcut', {
                sc: {
                  modifiers: switchingToCtrlSpace ? CTRL : CTRL | SHIFT,
                  key: 'Space',
                },
              });
            }}
          >
            Rebind
          </Button>
        </Row>
        <Row label="Launch at login">
          <Chip
            active={!!tweaks.autostart}
            onClick={() => {
              const next = !tweaks.autostart;
              onChange({ ...tweaks, autostart: next });
              void invoke('set_autostart', { enabled: next });
            }}
          >
            {tweaks.autostart ? 'on' : 'off'}
          </Chip>
        </Row>
      </Section>

      <div
        className="px-4 py-3"
        style={{ background: 'color-mix(in oklab, var(--status-danger) 5%, transparent)' }}
      >
        <div className="mb-2 font-mono text-[9.5px] font-semibold uppercase tracking-[1.4px] text-danger">
          Danger zone
        </div>
        {!clearArmed ? (
          <Button fullWidth size="sm" variant="secondary" onClick={() => setClearArmed(true)}>
            Clear history (keeps pinned)
          </Button>
        ) : (
          <div className="flex gap-1.5">
            <Button
              fullWidth
              size="sm"
              variant="ghost"
              disabled={clearing}
              onClick={() => setClearArmed(false)}
            >
              Cancel
            </Button>
            <Button
              fullWidth
              size="sm"
              variant="danger"
              loading={clearing}
              onClick={() => void clear()}
            >
              {clearing ? 'Clearing…' : 'Confirm'}
            </Button>
          </div>
        )}
        {clearError && (
          <div role="alert" className="mt-2 text-[11px] text-danger">
            {clearError}
          </div>
        )}
      </div>
    </div>
  );
}
