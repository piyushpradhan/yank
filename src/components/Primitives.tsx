import { Badge, type BadgeTone } from 'ember-design-system';
import { catStyle, CATEGORY_TONE } from '../lib/category';
import type { Category, ClipItem, Theme } from '../lib/types';

interface CategoryChipProps {
  t: Theme;
  cat: Category;
  mode?: 'chip' | 'icon' | 'dot' | 'mono';
}

export function CategoryChip({ t, cat, mode = 'chip' }: CategoryChipProps) {
  const c = catStyle(t, cat);
  const tone = CATEGORY_TONE[cat] as BadgeTone;

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
      <Badge
        tone={tone}
        variant="subtle"
        size="sm"
        className="!h-[22px] !w-[22px] !rounded-md !px-0 justify-center font-mono !text-[11px] font-bold"
        style={{ borderColor: c.border }}
      >
        {c.icon}
      </Badge>
    );
  }

  return (
    <Badge
      tone={tone}
      variant="subtle"
      size="sm"
      className="!rounded !px-1.5 font-mono !text-[10px] font-semibold uppercase tracking-wider"
      style={{ borderColor: c.border }}
    >
      {c.mono}
    </Badge>
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
          background: 'color-mix(in oklab, var(--text-primary) 4%, var(--bg-subtle))',
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
