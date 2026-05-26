import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Box, Button, Card, IconButton, Inline, Kbd, Overline, Stack, Text } from 'ember-design-system';
import { LuX } from 'react-icons/lu';
import { getKeyIcon } from '../lib/keyIcons';
import type { CategoryDisplay, Density, PreviewMode, ThemeMode, Tweaks } from '../lib/types';

interface TweaksPanelProps {
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
    <Box px={4} py={3} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <Overline as="div" size={9.5} tracking="wider" style={{ marginBottom: 10 }}>
        {title}
      </Overline>
      <Stack gap={2}>{children}</Stack>
    </Box>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Inline justify="between" gap={3} style={{ minHeight: 28 }}>
      <Text size={12} tone="secondary">
        {label}
      </Text>
      <Inline gap={2} wrap justify="end">
        {children}
      </Inline>
    </Inline>
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

const RECORDING_IGNORE = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Fn',
  'FnLock',
]);

const MOD_CONTROL = 0x08;
const MOD_ALT = 0x01;
const MOD_SHIFT = 0x200;
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

export function TweaksPanel({ tweaks, onChange, onClose, onAfterClear }: TweaksPanelProps) {
  const set = <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => onChange({ ...tweaks, [k]: v });

  const [clearArmed, setClearArmed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const tweaksRef = useRef(tweaks);
  tweaksRef.current = tweaks;

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (RECORDING_IGNORE.has(code)) return;

      e.preventDefault();
      e.stopPropagation();

      let mods = 0;
      if (e.ctrlKey) mods |= MOD_CONTROL;
      if (e.altKey) mods |= MOD_ALT;
      if (e.shiftKey) mods |= MOD_SHIFT;
      if (e.metaKey) mods |= MOD_META;

      if (code === 'Escape' && mods === 0) {
        setRecording(false);
        setRecordError(null);
        return;
      }

      if (mods === 0) {
        setRecordError('Use at least one modifier key (Ctrl/Alt/Shift/Meta)');
        return;
      }

      const label = labelForShortcut(mods, code);
      invoke('set_shortcut', { sc: { modifiers: mods, key: code } })
        .then(() => {
          setRecordError(null);
          onChange({ ...tweaksRef.current, paletteShortcut: label });
        })
        .catch((err: unknown) => {
          setRecordError(String(err));
        })
        .finally(() => {
          setRecording(false);
        });
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, onChange]);

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
    <Card
      padding="none"
      className="fixed right-4 top-[52px] z-[600] w-80 overflow-hidden !rounded-xl !border-border shadow-ember-md"
      style={{ animation: 'tweaksIn 180ms var(--easing-standard)' }}
    >
      <Box
        position="relative"
        px={4}
        pt={3}
        pb={3}
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'linear-gradient(180deg, var(--accent-ember-50) 0%, transparent 100%)',
        }}
      >
        <Box
          position="absolute"
          bg="accent"
          style={{ top: 0, bottom: 0, left: 0, width: 3 }}
        />
        <Inline justify="between">
          <Stack gap={1}>
            <Overline as="div" size={9.5} tracking="widest" tone="accent-ink">
              Tweaks
            </Overline>
            <Text size={13.5} weight="semibold" tracking="tight">
              Make it yours
            </Text>
          </Stack>
          <IconButton
            aria-label="Close"
            icon={<LuX size={14} />}
            variant="ghost"
            size="sm"
            onClick={onClose}
          />
        </Inline>
      </Box>

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
          <Inline gap={0}>
            {(tweaks.paletteShortcut ?? 'Ctrl+Shift+Space').split('+').map((k, i) => (
              <Kbd key={i} size="sm">
                {getKeyIcon(k)}
              </Kbd>
            ))}
          </Inline>
          <Button
            size="sm"
            variant={recording ? 'primary' : 'secondary'}
            onClick={() => {
              if (recording) {
                setRecording(false);
                setRecordError(null);
              } else {
                setRecording(true);
                setRecordError(null);
              }
            }}
          >
            {recording ? 'Cancel' : 'Record'}
          </Button>
        </Row>
        {recordError && (
          <Text size={10.5} tone="danger" style={{ marginTop: 4 }}>
            {recordError}
          </Text>
        )}
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

      <Box px={4} py={3} style={{ background: 'color-mix(in oklab, var(--status-danger) 5%, transparent)' }}>
        <Overline as="div" size={9.5} tracking="wider" tone="danger" style={{ marginBottom: 8 }}>
          Danger zone
        </Overline>
        {!clearArmed ? (
          <Button fullWidth size="sm" variant="secondary" onClick={() => setClearArmed(true)}>
            Clear history (keeps pinned)
          </Button>
        ) : (
          <Inline gap={2}>
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
          </Inline>
        )}
        {clearError && (
          <Text as="div" role="alert" size={11} tone="danger" style={{ marginTop: 8 }}>
            {clearError}
          </Text>
        )}
      </Box>
    </Card>
  );
}
