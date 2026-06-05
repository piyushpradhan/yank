import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { Box, Dot, IconButton, Inline, Text } from 'ember-design-system';
import { LuChevronsDownUp, LuMinus, LuRefreshCw, LuSlidersHorizontal, LuSparkles, LuSquare, LuX } from 'react-icons/lu';
import { IS_MAC } from '../lib/platform';
import type { BackfillState } from '../hooks/useAppState';

interface TitleBarProps {
  aiActive: boolean;
  onOpenAI: () => void;
  onToggleTweaks: () => void;
  backfill: BackfillState | null;
}

const HEIGHT = 40;
const TRAFFIC_LIGHT_RESERVED = 84;

export function TitleBar({ aiActive, onOpenAI, onToggleTweaks, backfill }: TitleBarProps) {
  return (
    <Inline
      data-tauri-drag-region
      align="center"
      justify="between"
      shrink={0}
      position="relative"
      style={{
        height: HEIGHT,
        paddingLeft: IS_MAC ? TRAFFIC_LIGHT_RESERVED : 12,
        paddingRight: IS_MAC ? 12 : 0,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {IS_MAC && <MacTrafficLights />}

      <Inline gap={2} align="center" data-tauri-drag-region>
        <Box
          shrink={0}
          style={{
            width: 6,
            height: 6,
            borderRadius: 2,
            background: 'var(--accent-ember-500)',
          }}
        />
        <Text size={12.5} weight="semibold" tracking="tight">
          Yank
        </Text>
      </Inline>

      {backfill && backfill.remaining > 0 && <BackfillPill backfill={backfill} />}

      <Inline gap={2} align="center">
        <Box style={{ paddingRight: IS_MAC ? 0 : 8 }}>
          <Inline gap={2} align="center">
            <IconButton
              aria-label="AI settings"
              title="AI settings"
              icon={<LuSparkles size={14} />}
              variant={aiActive ? 'primary' : 'ghost'}
              size="sm"
              onClick={onOpenAI}
            />
            <IconButton
              aria-label="Tweaks"
              title="Tweaks"
              icon={<LuSlidersHorizontal size={14} />}
              variant="ghost"
              size="sm"
              onClick={onToggleTweaks}
            />
          </Inline>
        </Box>
        {!IS_MAC && <WindowsControls />}
      </Inline>
    </Inline>
  );
}

function BackfillPill({ backfill }: { backfill: BackfillState }) {
  const { remaining, total, stalled } = backfill;

  return (
    <Box
      display="inline-flex"
      align="center"
      gap={2}
      px={3}
      radius="pill"
      bg={stalled ? 'subtle' : 'accent-soft'}
      shadow="sm"
      position="absolute"
      style={{
        height: 22,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        border: stalled
          ? '1px solid color-mix(in oklab, var(--status-warning) 30%, transparent)'
          : '1px solid color-mix(in oklab, var(--accent-ember-500) 24%, transparent)',
        pointerEvents: 'auto',
        background: stalled
          ? 'color-mix(in oklab, var(--status-warning) 12%, transparent)'
          : undefined,
      }}
      aria-live="polite"
    >
      <Dot tone={stalled ? 'warning' : 'accent'} size="sm" pulse={!stalled} />
      <Text
        family="mono"
        size={10.5}
        tabularNums
        tone={stalled ? 'secondary' : 'accent-ink'}
      >
        {stalled
          ? `Embedding stalled (${remaining} left)`
          : `Embedding ${remaining}/${total}…`}
      </Text>
      {stalled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void invoke('retry_embed_backfill');
          }}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            marginLeft: 2,
          }}
        >
          <LuRefreshCw size={11} color="var(--status-warning)" />
        </button>
      )}
    </Box>
  );
}

function MacTrafficLights() {
  const [hover, setHover] = useState(false);

  const win = () => getCurrentWindow();
  const onClose = () => void win().close();
  const onMinimize = () => void win().minimize();
  const onZoom = () => void win().toggleMaximize();

  return (
    <Inline
      align="center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        left: 12,
        top: 0,
        bottom: 0,
        gap: 8,
      }}
    >
      <TrafficLight color="#FF5F57" hover={hover} onClick={onClose} aria-label="Close">
        <CloseGlyph />
      </TrafficLight>
      <TrafficLight color="#FEBC2E" hover={hover} onClick={onMinimize} aria-label="Minimize">
        <MinimizeGlyph />
      </TrafficLight>
      <TrafficLight color="#28C840" hover={hover} onClick={onZoom} aria-label="Zoom">
        <ZoomGlyph />
      </TrafficLight>
    </Inline>
  );
}

interface TrafficLightProps {
  color: string;
  hover: boolean;
  onClick: () => void;
  'aria-label': string;
  children: React.ReactNode;
}

function TrafficLight({ color, hover, onClick, 'aria-label': label, children }: TrafficLightProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        all: 'unset',
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: color,
        boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.18)',
        cursor: 'default',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(0,0,0,0.55)',
      }}
    >
      <span style={{ opacity: hover ? 1 : 0, lineHeight: 0, transition: 'opacity 80ms' }}>
        {children}
      </span>
    </button>
  );
}

function CloseGlyph() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" aria-hidden="true">
      <path d="M1 1 L5 5 M5 1 L1 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function MinimizeGlyph() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" aria-hidden="true">
      <path d="M1 3 H5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function ZoomGlyph() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" aria-hidden="true">
      <path
        d="M1.2 4 V1.2 H4 M4.8 2 V4.8 H2"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function WindowsControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | null = null;
    void win.isMaximized().then(setMaximized);
    void win
      .onResized(() => {
        void win.isMaximized().then(setMaximized);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const win = () => getCurrentWindow();
  const onMinimize = () => void win().minimize();
  const onToggleMax = () => void win().toggleMaximize();
  const onClose = () => void win().close();

  return (
    <Inline gap={0} align="center">
      <WinButton aria-label="Minimize" onClick={onMinimize}>
        <LuMinus size={12} />
      </WinButton>
      <WinButton aria-label={maximized ? 'Restore' : 'Maximize'} onClick={onToggleMax}>
        {maximized ? <LuChevronsDownUp size={11} /> : <LuSquare size={11} />}
      </WinButton>
      <WinButton aria-label="Close" onClick={onClose} danger>
        <LuX size={13} />
      </WinButton>
    </Inline>
  );
}

interface WinButtonProps {
  'aria-label': string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}

function WinButton({ 'aria-label': label, onClick, children, danger }: WinButtonProps) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        width: 46,
        height: HEIGHT,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'default',
        color: danger && hover ? '#fff' : 'var(--text-secondary)',
        background: hover
          ? danger
            ? '#E81123'
            : 'color-mix(in oklab, var(--text-primary) 8%, transparent)'
          : 'transparent',
        transition: 'background 80ms, color 80ms',
      }}
    >
      {children}
    </button>
  );
}
