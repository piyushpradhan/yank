import type { Theme } from '../lib/types';
import { Kbd } from './Primitives';

interface KeyboardMapProps {
  t: Theme;
}

interface KeyRow {
  keys: string[];
  label: string;
  /** Optional contextual label (e.g. "palette", "library") shown after the description. */
  scope?: string;
}

const GROUPS: [string, KeyRow[]][] = [
  [
    'Global',
    [
      { keys: ['Ctrl', 'Shift', 'Space'], label: 'Open palette from anywhere' },
      { keys: ['Esc'], label: 'Close palette / clear search' },
    ],
  ],
  [
    'Navigation',
    [
      { keys: ['↑', '↓'], label: 'Move selection' },
      { keys: ['J', 'K'], label: 'Move selection (vim)' },
      { keys: ['/'], label: 'Focus search' },
      { keys: ['Tab'], label: 'Toggle fuzzy ↔ semantic', scope: 'palette' },
      { keys: ['1', '–', '9'], label: 'Jump to sidebar filter', scope: 'library' },
    ],
  ],
  [
    'Actions',
    [
      { keys: ['↵'], label: 'Copy + paste · close palette' },
      { keys: ['↵'], label: 'Promote fuzzy → semantic', scope: 'in search' },
      { keys: ['Ctrl', 'P'], label: 'Pin / unpin' },
      { keys: ['Ctrl', '⌫'], label: 'Delete item' },
      { keys: ['E'], label: 'Rename label', scope: 'library' },
      { keys: ['Ctrl', 'I'], label: 'Toggle preview pane', scope: 'library' },
    ],
  ],
];

export function KeyboardMap({ t }: KeyboardMapProps) {
  return (
    <div className="grid h-full w-full grid-cols-3 gap-8 overflow-auto bg-surface p-8 font-sans text-fg">
      {GROUPS.map(([heading, rows]) => (
        <div key={heading} className="flex flex-col">
          <div className="mb-3.5 border-b border-border-subtle pb-2.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[1.5px] text-accent-ink">
            {heading}
          </div>
          <div className="flex flex-col gap-2.5">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[108px_1fr] items-center gap-3.5">
                <div className="flex flex-wrap items-center gap-1">
                  {row.keys.map((k, j) => (
                    <Kbd key={j} t={t}>
                      {k}
                    </Kbd>
                  ))}
                </div>
                <div className="text-[12.5px] leading-[1.4] text-fg-muted">
                  {row.label}
                  {row.scope && (
                    <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                      · {row.scope}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
