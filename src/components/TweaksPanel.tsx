import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Box, Button, Card, IconButton, Inline, Kbd, Overline, Stack, Text } from 'ember-design-system';
import { LuMoon, LuSun, LuX } from 'react-icons/lu';
import { getKeyIcon } from '../lib/keyIcons';
import {
  DEFAULT_SHORTCUT,
  hasAnyModifier,
  isModifierCode,
  modifiersFromEvent,
  tokensOf,
  type ShortcutConfig,
} from '../lib/shortcut';
import type { CategoryDisplay, Density, PreviewMode, Tweaks } from '../lib/types';

interface TweaksPanelProps {
  tweaks: Tweaks;
  onChange: (next: Tweaks) => void;
  shortcut: ShortcutConfig | null;
  onShortcutChange: (next: ShortcutConfig) => void;
  onClose: () => void;
  onAfterClear?: () => void;
}

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

function ShortcutRecorder({
  value,
  onChange,
}: {
  value: ShortcutConfig | null;
  onChange: (next: ShortcutConfig) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(false);
        setError(null);
        return;
      }
      if (isModifierCode(e.code)) return;
      const modifiers = modifiersFromEvent(e);
      if (!hasAnyModifier(modifiers)) {
        setError('Needs at least one modifier (Ctrl, Shift, Alt, Cmd)');
        return;
      }
      const next: ShortcutConfig = { modifiers, key: e.code };
      invoke('set_shortcut', { sc: next })
        .then(() => {
          onChange(next);
          setRecording(false);
          setError(null);
        })
        .catch((err: unknown) => {
          const msg =
            err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to register';
          setError(msg);
        });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, onChange]);

  const tokens = tokensOf(value ?? DEFAULT_SHORTCUT);

  return (
    <Stack gap={1} align="end" style={{ minWidth: 0 }}>
      <Button
        size="sm"
        variant={recording ? 'primary' : 'ghost'}
        onClick={() => {
          setError(null);
          setRecording((r) => !r);
        }}
      >
        {recording ? (
          <Text family="mono" size={11}>
            Press a combo… Esc to cancel
          </Text>
        ) : (
          <Inline gap={1} align="center">
            {tokens.map((tok, i) => (
              <Kbd key={i} size="sm">
                {getKeyIcon(tok)}
              </Kbd>
            ))}
          </Inline>
        )}
      </Button>
      {error && (
        <Text size={10.5} tone="danger" style={{ textAlign: 'right', maxWidth: 220 }}>
          {error}
        </Text>
      )}
    </Stack>
  );
}

export function TweaksPanel({
  tweaks,
  onChange,
  shortcut,
  onShortcutChange,
  onClose,
  onAfterClear,
}: TweaksPanelProps) {
  const set = <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => onChange({ ...tweaks, [k]: v });

  const [clearArmed, setClearArmed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
    <>
      <Box
        position="fixed"
        onClick={onClose}
        style={{ inset: 0, zIndex: 599, background: 'transparent' }}
        aria-hidden
      />
      <Card
        padding="none"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 48,
          right: 12,
          zIndex: 600,
          animation: 'tweaksIn 180ms var(--easing-standard)',
          width: 'min(320px, calc(100vw - 24px))',
          maxHeight: 'calc(100vh - 64px)',
          overflowX: 'hidden',
          overflowY: 'auto',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-md)',
        }}
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
          <Chip active={tweaks.theme === 'light'} onClick={() => set('theme', 'light')}>
            <LuSun size={13} style={{ marginRight: 4 }} />
            light
          </Chip>
          <Chip active={tweaks.theme === 'dark'} onClick={() => set('theme', 'dark')}>
            <LuMoon size={13} style={{ marginRight: 4 }} />
            dark
          </Chip>
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
            onClick={() => {
              const next = !(tweaks.plainTextOnly ?? false);
              set('plainTextOnly', next);
              void invoke('set_plain_text_only', { enabled: next });
            }}
          >
            {(tweaks.plainTextOnly ?? false) ? 'always' : 'auto'}
          </Chip>
        </Row>
      </Section>

      <Section title="Global shortcut">
        <Row label="Open palette">
          <ShortcutRecorder value={shortcut} onChange={onShortcutChange} />
        </Row>
      </Section>

      <Section title="System">
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
    </>
  );
}
