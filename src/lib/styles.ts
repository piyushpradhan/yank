export const onAccentStyle = {
  background: 'rgba(255,255,255,0.18)',
  color: 'var(--text-inverse)',
  borderColor: 'rgba(255,255,255,0.28)',
  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.12)',
} as const;

export const accentStyle = {
  background: 'var(--accent-ember-50)',
  color: 'var(--accent-ember-700)',
  borderColor: 'var(--accent-ember-100)',
  boxShadow: 'inset 0 -1px 0 color-mix(in oklab, var(--accent-ember-700) 16%, transparent)',
} as const;
