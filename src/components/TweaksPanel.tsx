import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Box, Button, Card, IconButton, Inline, Overline, Stack, Text } from 'ember-design-system';
import { LuMoon, LuSun, LuX } from 'react-icons/lu';
import type { CategoryDisplay, Density, PreviewMode, Tweaks } from '../lib/types';

interface TweaksPanelProps {
  tweaks: Tweaks;
  onChange: (next: Tweaks) => void;
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

export function TweaksPanel({ tweaks, onChange, onClose, onAfterClear }: TweaksPanelProps) {
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
        className="fixed right-3 top-[48px] z-[600] overflow-hidden !rounded-xl !border-border shadow-ember-md"
        style={{
          animation: 'tweaksIn 180ms var(--easing-standard)',
          width: 'min(320px, calc(100vw - 24px))',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
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
