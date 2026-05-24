import type { Category, Theme } from './types';

export interface CategoryMeta {
  label: string;
  mono: string;
  icon: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  code: { label: 'Code', mono: 'CODE', icon: '{ }' },
  url: { label: 'Link', mono: 'URL', icon: '↗' },
  email: { label: 'Email', mono: 'EMAIL', icon: '@' },
  phone: { label: 'Phone', mono: 'PHONE', icon: '☏' },
  color: { label: 'Color', mono: 'HEX', icon: '●' },
  path: { label: 'Path', mono: 'PATH', icon: '/' },
  text: { label: 'Text', mono: 'TEXT', icon: '¶' },
  address: { label: 'Address', mono: 'ADDR', icon: '⌂' },
  number: { label: 'Number', mono: 'NUM', icon: '#' },
  image: { label: 'Image', mono: 'IMG', icon: '🖼' },
};

export const CATEGORIES: Category[] = [
  'code',
  'url',
  'text',
  'color',
  'email',
  'phone',
  'path',
  'address',
  'number',
  'image',
];

export interface CategoryStyle {
  bg: string;
  bgStrong: string;
  ink: string;
  border: string;
  mono: string;
  icon: string;
  label: string;
}

/**
 * Five tones aligned with ember's palette. The previous catStyle synthesised
 * a different hue per category which leaked cool blues into a warm-neutral
 * design language. Now every category resolves to one of: ember accent, a
 * semantic status colour (success/warning/danger/info), or a warm neutral —
 * so chips read as part of the system rather than an arbitrary spectrum.
 */
type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface TonePalette {
  bg: string;
  bgStrong: string;
  ink: string;
  border: string;
}

const TONE: Record<Tone, TonePalette> = {
  accent: {
    bg: 'var(--accent-ember-50)',
    bgStrong: 'var(--accent-ember-500)',
    ink: 'var(--accent-ember-700)',
    border: 'var(--accent-ember-100)',
  },
  success: {
    bg: 'color-mix(in oklab, var(--status-success) 14%, transparent)',
    bgStrong: 'var(--status-success)',
    ink: 'var(--status-success)',
    border: 'color-mix(in oklab, var(--status-success) 35%, transparent)',
  },
  warning: {
    bg: 'color-mix(in oklab, var(--status-warning) 16%, transparent)',
    bgStrong: 'var(--status-warning)',
    ink: 'var(--status-warning)',
    border: 'color-mix(in oklab, var(--status-warning) 38%, transparent)',
  },
  danger: {
    bg: 'color-mix(in oklab, var(--status-danger) 14%, transparent)',
    bgStrong: 'var(--status-danger)',
    ink: 'var(--status-danger)',
    border: 'color-mix(in oklab, var(--status-danger) 35%, transparent)',
  },
  info: {
    bg: 'color-mix(in oklab, var(--status-info) 14%, transparent)',
    bgStrong: 'var(--status-info)',
    ink: 'var(--status-info)',
    border: 'color-mix(in oklab, var(--status-info) 35%, transparent)',
  },
  neutral: {
    bg: 'var(--bg-subtle)',
    bgStrong: 'var(--text-tertiary)',
    ink: 'var(--text-secondary)',
    border: 'var(--border-subtle)',
  },
};

export const CATEGORY_TONE: Record<Category, Tone> = {
  code: 'accent',
  url: 'info',
  email: 'success',
  phone: 'warning',
  color: 'danger',
  path: 'neutral',
  text: 'neutral',
  address: 'neutral',
  number: 'neutral',
  image: 'accent',
};

export function catStyle(_t: Theme, cat: Category): CategoryStyle {
  const meta = CATEGORY_META[cat];
  const tone = TONE[CATEGORY_TONE[cat]];
  return {
    ...tone,
    mono: meta.mono,
    icon: meta.icon,
    label: meta.label,
  };
}
