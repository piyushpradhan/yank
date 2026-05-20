import type { ReactNode } from 'react';
import { catStyle } from '../lib/category';
import type { Category, ClipItem, Theme } from '../lib/types';

interface CategoryChipProps {
  t: Theme;
  cat: Category;
  mode?: 'chip' | 'icon' | 'dot' | 'mono';
}

export function CategoryChip({ t, cat, mode = 'chip' }: CategoryChipProps) {
  const c = catStyle(t, cat);

  if (mode === 'dot') {
    return (
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: c.bgStrong }}
      />
    );
  }

  if (mode === 'mono') {
    return (
      <span
        className="font-mono text-[10.5px] font-medium uppercase tracking-wider"
        style={{ color: c.ink }}
      >
        {c.mono}
      </span>
    );
  }

  if (mode === 'icon') {
    return (
      <span
        className="inline-grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border font-mono text-[11px] font-bold leading-none"
        style={{ background: c.bg, color: c.ink, borderColor: c.border }}
      >
        {c.icon}
      </span>
    );
  }

  return (
    <span
      className="inline-flex h-[18px] shrink-0 items-center rounded border px-1.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-wider"
      style={{ color: c.ink, background: c.bg, borderColor: c.border }}
    >
      {c.mono}
    </span>
  );
}

interface KbdProps {
  t: Theme;
  children: ReactNode;
  /** Warm ember tint — for callouts (hint banner, primary actions). */
  accent?: boolean;
  /**
   * Render against a solid accent surface (e.g. a primary Button's
   * background). The default and `accent` tones both sit too close in
   * lightness to ember orange to read once they land on it.
   */
  onAccent?: boolean;
}

export function Kbd({ children, accent = false, onAccent = false }: KbdProps) {
  const palette = onAccent
    ? {
        bg: 'rgba(255,255,255,0.18)',
        color: 'var(--text-inverse)',
        border: 'rgba(255,255,255,0.28)',
        shadow: 'inset 0 -1px 0 rgba(0,0,0,0.12)',
      }
    : accent
      ? {
          bg: 'var(--accent-ember-50)',
          color: 'var(--accent-ember-700)',
          border: 'var(--accent-ember-100)',
          shadow:
            'inset 0 -1px 0 color-mix(in oklab, var(--accent-ember-700) 16%, transparent)',
        }
      : {
          bg: 'color-mix(in oklab, var(--text-primary) 6%, transparent)',
          color: 'var(--text-secondary)',
          border: 'var(--border-subtle)',
          shadow:
            'inset 0 -1px 0 color-mix(in oklab, var(--text-primary) 8%, transparent)',
        };

  return (
    <kbd
      className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[3px] border px-[5px] align-middle font-mono text-[10px] font-medium leading-none tabular-nums"
      style={{
        background: palette.bg,
        color: palette.color,
        borderColor: palette.border,
        boxShadow: palette.shadow,
      }}
    >
      {children}
    </kbd>
  );
}

interface ItemBodyProps {
  t: Theme;
  item: ClipItem;
  compact?: boolean;
}

export function ItemBody({ t, item, compact = false }: ItemBodyProps) {
  const c = catStyle(t, item.category);

  if (item.category === 'color') {
    return (
      <div className="flex items-center gap-3">
        <div
          className={`${compact ? 'h-5 w-5' : 'h-9 w-9'} shrink-0 rounded-md border border-border-subtle`}
          style={{
            background: item.content,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
          }}
        />
        <code className={`font-mono text-fg ${compact ? 'text-xs' : 'text-[13px]'}`}>
          {item.content}
        </code>
      </div>
    );
  }

  if (item.category === 'code') {
    return (
      <pre
        className={`m-0 overflow-auto whitespace-pre rounded-lg border border-border-subtle font-mono leading-[1.55] text-fg ${
          compact ? 'px-3 py-2 text-[11.5px]' : 'px-4 py-3 text-[12.5px]'
        }`}
        style={{
          background:
            'color-mix(in oklab, var(--text-primary) 4%, var(--bg-subtle))',
        }}
      >
        {item.content}
      </pre>
    );
  }

  if (
    item.category === 'url' ||
    item.category === 'email' ||
    item.category === 'phone' ||
    item.category === 'path' ||
    item.category === 'number'
  ) {
    return (
      <code
        className={`break-all font-mono ${compact ? 'text-xs' : 'text-[13.5px]'}`}
        style={{ color: c.ink }}
      >
        {item.content}
      </code>
    );
  }

  return (
    <div
      className={`whitespace-pre-wrap leading-[1.55] text-fg ${
        compact ? 'text-[13px]' : 'text-sm'
      }`}
    >
      {item.content}
    </div>
  );
}
