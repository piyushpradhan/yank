import { Box, Grid, Inline, Kbd, Overline, Stack, Text } from 'ember-design-system';
import { getKeyIcon } from '../lib/keyIcons';
import { DEFAULT_SHORTCUT, tokensOf, type ShortcutConfig } from '../lib/shortcut';

interface KeyRow {
  keys: string[];
  label: string;
  /** Optional contextual label (e.g. "palette", "library") shown after the description. */
  scope?: string;
}

function buildGroups(shortcut: ShortcutConfig): [string, KeyRow[]][] {
  return [
  [
    'Global',
    [
      { keys: tokensOf(shortcut), label: 'Open palette from anywhere' },
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
      { keys: ['0', '–', '9'], label: 'Jump to sidebar filter', scope: 'library' },
    ],
  ],
  [
    'Actions',
    [
      { keys: ['↵'], label: 'Copy + paste · close palette' },

      { keys: ['Ctrl', 'P'], label: 'Pin / unpin' },
      { keys: ['Ctrl', '⌫'], label: 'Delete item' },
      { keys: ['E'], label: 'Rename label', scope: 'library' },
      { keys: ['Ctrl', 'I'], label: 'Toggle preview pane', scope: 'library' },
    ],
  ],
  ];
}

interface KeyboardMapProps {
  shortcut?: ShortcutConfig | null;
}

export function KeyboardMap({ shortcut }: KeyboardMapProps = {}) {
  const groups = buildGroups(shortcut ?? DEFAULT_SHORTCUT);
  return (
    <Grid
      gap={6}
      bg="surface"
      overflow="auto"
      fullHeight
      fullWidth
      style={{
        padding: 'var(--space-6)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      }}
    >
      {groups.map(([heading, rows]) => (
        <Stack key={heading}>
          <Box
            pb={3}
            style={{ marginBottom: 14, borderBottom: '1px solid var(--border-subtle)' }}
          >
            <Overline tone="accent-ink" size="2xs">
              {heading}
            </Overline>
          </Box>
          <Stack gap={3}>
            {rows.map((row, i) => (
              <Grid key={i} columns="108px 1fr" gap={3} align="center">
                <Inline gap={1} wrap>
                  {row.keys.map((k, j) => (
                    <Kbd key={j} size="sm">
                      {getKeyIcon(k)}
                    </Kbd>
                  ))}
                </Inline>
                <Text as="div" size={12.5} tone="secondary" leading={1.4}>
                  {row.label}
                  {row.scope && (
                    <Text
                      family="mono"
                      size={10}
                      tone="tertiary"
                      transform="uppercase"
                      tracking="wider"
                      style={{ marginLeft: 6 }}
                    >
                      · {row.scope}
                    </Text>
                  )}
                </Text>
              </Grid>
            ))}
          </Stack>
        </Stack>
      ))}
    </Grid>
  );
}
