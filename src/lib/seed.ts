import type { ClipItem } from './types';

export const SEED_ITEMS: ClipItem[] = [
  {
    id: 'c01',
    category: 'code',
    label: 'React useEffect cleanup pattern',
    source: 'VS Code — App.tsx',
    minutesAgo: 2,
    pinned: true,
    content: `useEffect(() => {
  const controller = new AbortController();
  fetch('/api/feed', { signal: controller.signal })
    .then(r => r.json())
    .then(setFeed);
  return () => controller.abort();
}, []);`,
    preview: 'useEffect(() => { const controller = new AbortController(); …',
  },
  {
    id: 'c02',
    category: 'url',
    label: 'Tauri v2 docs — clipboard plugin',
    source: 'Arc — tauri.app',
    minutesAgo: 14,
    content: 'https://v2.tauri.app/plugin/clipboard-manager/',
    preview: 'v2.tauri.app/plugin/clipboard-manager/',
  },
  {
    id: 'c03',
    category: 'text',
    label: 'Pricing paragraph for landing page',
    source: 'Notion — Launch draft',
    minutesAgo: 38,
    content:
      "Yank is free for your first 100 items. Upgrade to Pro for unlimited history, AI labels, and semantic search — $4/month or $29 one-time. No subscriptions for system utilities if you don't want one.",
    preview: 'Yank is free for your first 100 items. Upgrade to Pro for…',
  },
  {
    id: 'c04',
    category: 'phone',
    label: 'Atisha — mobile',
    source: 'Contacts',
    minutesAgo: 55,
    content: '+1 (415) 555-0188',
    preview: '+1 (415) 555-0188',
  },
  {
    id: 'c05',
    category: 'color',
    label: 'Accent indigo — button default',
    source: 'Figma — Design tokens',
    minutesAgo: 72,
    content: '#5B5BF6',
    preview: '#5B5BF6',
  },
  {
    id: 'c06',
    category: 'email',
    label: 'Support inbox — for footer',
    source: 'Gmail',
    minutesAgo: 96,
    content: 'support@smartclipboard.app',
    preview: 'support@smartclipboard.app',
  },
  {
    id: 'c07',
    category: 'number',
    label: 'Flight confirmation — SFO → JFK Fri',
    source: 'Mail — United Airlines',
    minutesAgo: 180,
    content: 'UA-8842-QX7',
    preview: 'UA-8842-QX7',
  },
  {
    id: 'c08',
    category: 'path',
    label: 'Tauri config — macOS build',
    source: 'Terminal',
    minutesAgo: 240,
    content: '~/projects/yank/src-tauri/tauri.conf.json',
    preview: '~/projects/yank/src-tauri/tauri.conf.json',
  },
  {
    id: 'c09',
    category: 'code',
    label: 'SQLite FTS5 schema for history table',
    source: 'Cursor — schema.sql',
    minutesAgo: 360,
    content: `CREATE VIRTUAL TABLE clips_fts USING fts5(
  label, content, category,
  tokenize = 'porter unicode61'
);`,
    preview: 'CREATE VIRTUAL TABLE clips_fts USING fts5(…',
  },
  {
    id: 'c10',
    category: 'address',
    label: 'HackerRank office — SF',
    source: 'Maps',
    minutesAgo: 720,
    content: '700 Montgomery St, Floor 3, San Francisco, CA 94111',
    preview: '700 Montgomery St, Floor 3, San Francisco, CA 94111',
  },
  {
    id: 'c11',
    category: 'text',
    label: '"That error from the terminal earlier"',
    source: 'Terminal — cargo build',
    minutesAgo: 900,
    content:
      'error[E0308]: mismatched types\n  --> src/commands.rs:42:23\n   |\n42 |     Ok(clipboard.read_text())\n   |                       ^^^^^^^^^^^^ expected `String`, found `Result<String, Error>`',
    preview: 'error[E0308]: mismatched types  --> src/commands.rs:42:23  |  42 |…',
  },
  {
    id: 'c12',
    category: 'url',
    label: 'PR #184 — clipboard capture daemon',
    source: 'GitHub',
    minutesAgo: 1440,
    content: 'https://github.com/yank/app/pull/184',
    preview: 'github.com/yank/app/pull/184',
  },
  {
    id: 'c13',
    category: 'code',
    label: 'CSS: centered grid with min() clamp()',
    source: 'Codepen',
    minutesAgo: 2880,
    content: `.wrap {
  display: grid;
  grid-template-columns: min(100%, 640px);
  justify-content: center;
  padding-inline: clamp(16px, 4vw, 48px);
}`,
    preview: '.wrap { display: grid; grid-template-columns: min(100%, 640px); …',
  },
  {
    id: 'c14',
    category: 'color',
    label: 'Brand rose — error states',
    source: 'Figma',
    minutesAgo: 4320,
    content: '#E5484D',
    preview: '#E5484D',
  },
  {
    id: 'c15',
    category: 'text',
    label: "Quote: Raycast's quick-launch discipline",
    source: 'Pocket',
    minutesAgo: 5760,
    content:
      'The whole flow — shortcut to pasted — should take under 5 seconds. If it takes 8, people stop using it. If it takes 3, they evangelize it.',
    preview: 'The whole flow — shortcut to pasted — should take under 5 seconds…',
  },
];
