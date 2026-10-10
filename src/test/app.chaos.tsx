// @vitest-environment jsdom
//
// Chaos monkey for the React frontend. NOT part of `npm test` (different file
// suffix, own config) — run it with `npm run chaos:ui`.
//
//   CHAOS_SEED=<n>      replay a run (printed with the findings)
//   CHAOS_STEPS=<n>     random actions per session (default 120)
//   CHAOS_UNKNOWN_CATEGORY=0  don't seed rows with a category this build lacks
//   CHAOS_CONTRACT=1    also inject wrong-shaped IPC payloads (off by default:
//                       the Rust side is typed, so these are rarely realistic)
//
// What it does: renders the real <App/> (library window) and <PaletteWindow/>
// against a fake Tauri backend that rejects, hangs, lags, and serves ugly-but-
// valid data, then hammers the UI with random keys, clicks, typing, resizes
// and backend events. A finding is anything uncaught, any blank tree, any UI
// freeze, or any injected markup.

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

// Node's `process` is present under vitest; declared here so the app's `tsc`
// gate doesn't need @types/node just for this opt-in suite.
declare const process: {
  env: Record<string, string | undefined>;
  on(event: 'unhandledRejection', cb: (reason: unknown) => void): void;
};

const backend = vi.hoisted(() => ({
  rnd: Math.random as () => number,
  items: [] as Record<string, unknown>[],
  contract: false,
  shortcut: null as unknown,
  listeners: new Map<string, Set<(e: { payload: unknown }) => void>>(),
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  // Any window/app API → async no-op that resolves to a no-op unlisten fn.
  anyAsync: () => new Proxy({}, { get: () => async () => () => {} }),
}));

const { sleep } = backend;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    const b = backend;
    const roll = b.rnd();
    if (roll < 0.08) throw `chaos: ${cmd} failed`; // Tauri rejects with a bare string
    if (roll < 0.11) throw new Error(`chaos: ${cmd} exploded`);
    if (roll < 0.14) return new Promise(() => {}); // never settles
    if (roll < 0.35) await b.sleep(b.rnd() * 80);
    if (b.contract && roll > 0.96) {
      return [null, undefined, {}, [], 'x', 42][Math.floor(b.rnd() * 6)];
    }
    const q = String(args?.query ?? '');
    switch (cmd) {
      case 'list_items':
        return b.items.map((i) => ({ ...i }));
      case 'search_semantic':
        return {
          items: b.items.filter(() => b.rnd() < 0.5).map((i) => ({ ...i })),
          timeWindow: b.rnd() < 0.3 ? { fromMs: 0, toMs: Date.now(), label: 'chaos window' } : null,
          category: b.rnd() < 0.2 ? 'url' : null,
        };
      case 'strip_time':
      case 'strip_category':
        return q.split(' ').slice(0, -1).join(' ');
      case 'get_settings':
        return {
          provider: ['local', 'jev', 'disabled'][Math.floor(b.rnd() * 3)],
          local_model: 'bge-small-en-v1.5',
          typesafe_model: 'jev-latest',
          typesafe_api_key: b.rnd() < 0.5 ? 'k' : '',
          anthropic_api_key: b.rnd() < 0.5 ? 'sk-ant' : '',
        };
      case 'get_shortcut':
        return b.shortcut;
      case 'get_theme':
        return b.rnd() < 0.5 ? 'dark' : 'light';
      case 'get_hint_dismissed':
        return b.rnd() < 0.7;
      case 'get_autostart':
      case 'get_minimized_on_start':
      case 'get_translucent':
      case 'get_palette_semantic_default':
      case 'pin_item':
        return b.rnd() < 0.5;
      case 'paste_to_frontmost_app':
        return b.rnd() < 0.5 ? 'pasted' : 'copied';
      case 'platform_info':
        return { wayland: false };
      case 'get_image': {
        if (b.rnd() < 0.3) return null;
        const bytes = [137, 80, 78, 71, 13, 10, 26, 10, ...Array.from({ length: 24 }, () => 0)];
        return { bytes, width: 1, height: 1 };
      }
      default:
        return null;
    }
  },
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (event: string, cb: (e: { payload: unknown }) => void) => {
    const set = backend.listeners.get(event) ?? new Set();
    set.add(cb);
    backend.listeners.set(event, set);
    return () => set.delete(cb);
  },
}));

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => backend.anyAsync() }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '0.0.0-chaos' }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: async () => {} }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: async () => {} }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: async () => {
    if (backend.rnd() < 0.25) throw 'chaos: clipboard busy';
    await backend.sleep(backend.rnd() * 30);
  },
}));
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: async () => {
    if (backend.rnd() < 0.4) throw new Error('chaos: updater offline');
    return backend.rnd() < 0.5
      ? null
      : {
          version: '9.9.9',
          body: 'x'.repeat(5000),
          downloadAndInstall: async () => {
            await backend.sleep(20);
            if (backend.rnd() < 0.5) throw new Error('chaos: download interrupted');
          },
        };
  },
}));

import App from '../App';
import { DEFAULT_SHORTCUT } from '../lib/shortcut';
import { PaletteWindow } from '../windows/PaletteWindow';

// ----------------------------------------------------------------- helpers --

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.env.CHAOS_SEED) || (Date.now() % 2147483647);
const STEPS = Number(process.env.CHAOS_STEPS) || 120;
const SESSIONS = 4;

const CATS = ['code', 'url', 'email', 'phone', 'color', 'path', 'text', 'address', 'number', 'image'];
const TEXT = [
  '', ' ', '\n\n', 'a', 'Hello', '🙂'.repeat(40), '👨‍👩‍👧‍👦', 'é'.repeat(30), '‮evil‬', '日本語のテキスト',
  'مرحبا بالعالم', 'x'.repeat(20000), 'word '.repeat(4000), '<script>window.__pwn=1</script>',
  '<img src=x onerror="window.__pwn=1">', '"; DROP TABLE items; --', '${process.exit(1)}', '__proto__',
  '\0\u0001\u007f', 'https://example.com/' + 'a'.repeat(3000), '99999999999 weeks ago', 'yesterday',
  'links', 'AND OR NOT', '(', '"', '*', 'line1\nline2\nline3', '\t\t',
];
const KEYS = [
  'Enter', 'Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace',
  'Delete', ' ', '?', '/', 'k', 'n', 'p', 'e', 'd', 'a', '1', '9', 'Home', 'End', 'PageDown',
];
const EVENTS = [
  'clip-added', 'clip-swept', 'clip-labeled', 'clip-embedded', 'embed-backfill-started',
  'palette-shown', 'translucent-changed', 'theme-changed', 'palette-semantic-default-changed',
];

function makeItem(r: () => number, i: number): Record<string, unknown> {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const content = pick(TEXT);
  // Rows written by an older build can carry a category this build no longer knows.
  const stale = process.env.CHAOS_UNKNOWN_CATEGORY !== '0' && r() < 0.05;
  const cat = stale ? 'category-from-an-older-build' : pick(CATS);
  return {
    id: String(i),
    category: cat,
    label: r() < 0.3 ? '' : pick(TEXT),
    labelGenerated: r() < 0.5 ? undefined : r() < 0.5,
    source: r() < 0.5 ? '' : pick(TEXT),
    minutesAgo: pick([0, 1, 59, 60, 1440, 525600, 99999999, -5, Number.NaN]),
    pinned: r() < 0.2,
    content,
    preview: content.split('\n')[0].slice(0, 160),
    deleted: false,
  };
}

// ---------------------------------------------------------------- findings --

const findings = new Map<string, { n: number; example: string }>();
const note = (rawKind: string, example = '') => {
  // Collapse "library#2: action "key" threw: X" → "render error: X" so repeats dedupe.
  const kind = rawKind
    .replace(/^\w+#\d+: /, '')
    .replace(/^action "[^"]+" threw: /, 'render error: ')
    .replace(/^render crashed: /, 'render error: ');
  const f = findings.get(kind) ?? { n: 0, example: example.slice(0, 220) };
  f.n++;
  findings.set(kind, f);
};

const IGNORABLE_LOG = /not wrapped in act|chaos:|\bfailed\b/; // app's own error logs + RTL noise

beforeAll(() => {
  // jsdom gaps the real webview fills in.
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= () => {};
  URL.createObjectURL ??= () => 'blob:chaos';
  URL.revokeObjectURL ??= () => {};
  window.addEventListener('error', (e) => {
    note(`uncaught error: ${e.message}`, String(e.error?.stack ?? '').split('\n').slice(0, 3).join(' | '));
    e.preventDefault();
  });
  process.on('unhandledRejection', (reason) => {
    note(`unhandled rejection: ${String((reason as Error)?.message ?? reason)}`);
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const msg = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ');
    if (!IGNORABLE_LOG.test(msg)) note(`console.error: ${msg.slice(0, 140)}`, msg);
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => cleanup());

// ------------------------------------------------------------------ driver --

async function session(Component: ComponentType, seed: number, label: string) {
  const r = mulberry32(seed);
  backend.rnd = r;
  backend.contract = process.env.CHAOS_CONTRACT === '1';
  backend.shortcut = DEFAULT_SHORTCUT;
  backend.listeners.clear();
  backend.items = Array.from({ length: Math.floor(r() * 60) }, (_, i) => makeItem(r, i));
  let nextId = 1000;
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];

  let view = render(<Component />);
  // A render crash surfaces from `act`; record it and keep driving a fresh tree.
  const settle = async (ms = 0) => {
    try {
      await act(async () => void (await sleep(ms)));
    } catch (e) {
      note(`${label}: render crashed: ${(e as Error).message}`, (e as Error).stack ?? '');
      view.unmount();
      view = render(<Component />);
    }
  };
  await settle(20);

  const clickable = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, [role="button"], [role="option"], [role="switch"], [role="tab"], a, li, input, textarea, [tabindex]',
      ),
    );

  const actions: Array<[string, () => Promise<void> | void]> = [
    ['key', () => {
      const target = (document.activeElement as HTMLElement) ?? document.body;
      fireEvent.keyDown(target, {
        key: pick(KEYS), metaKey: r() < 0.2, ctrlKey: r() < 0.15, shiftKey: r() < 0.2, altKey: r() < 0.1,
      });
    }],
    ['click', () => {
      const els = clickable();
      if (els.length) fireEvent.click(pick(els));
    }],
    ['type', () => {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'));
      if (inputs.length) fireEvent.change(pick(inputs), { target: { value: pick(TEXT) } });
    }],
    ['burst-typing', () => {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
      if (!inputs.length) return;
      const el = pick(inputs);
      for (let i = 0; i < 25; i++) fireEvent.change(el, { target: { value: 'ab'.repeat(i) } });
    }],
    ['backend-event', () => {
      const ev = pick(EVENTS);
      const payload = pick([0, 1, -1, 1e9, Number.NaN, null, 'dark', true, {}, 'x'.repeat(1000)]);
      backend.listeners.get(ev)?.forEach((cb) => cb({ payload }));
    }],
    ['event-storm', () => {
      for (let i = 0; i < 40; i++) {
        pick(['clip-added', 'clip-embedded', 'clip-labeled']).split('|').forEach((ev) =>
          backend.listeners.get(ev)?.forEach((cb) => cb({ payload: i })),
        );
      }
    }],
    ['clipboard-arrival', () => {
      backend.items.unshift(makeItem(r, nextId++));
      backend.listeners.get('clip-added')?.forEach((cb) => cb({ payload: nextId }));
    }],
    ['backend-wipe', () => {
      backend.items = r() < 0.5 ? [] : backend.items.slice(0, Math.floor(r() * 3));
      backend.listeners.get('clip-swept')?.forEach((cb) => cb({ payload: 1 }));
    }],
    ['resize', () => {
      Object.assign(window, { innerWidth: pick([200, 480, 900, 3000]), innerHeight: pick([120, 600, 2000]) });
      fireEvent(window, new Event('resize'));
    }],
    ['focus-blur', () => {
      fireEvent(window, new Event(pick(['focus', 'blur', 'visibilitychange'])));
      fireEvent(document, new Event('visibilitychange'));
    }],
    ['remount', () => {
      view.unmount();
      view = render(<Component />);
    }],
    ['wait', () => settle(pick([0, 5, 20, 80]))],
  ];

  for (let step = 0; step < STEPS; step++) {
    const [name, run] = pick(actions);
    const t0 = performance.now();
    try {
      await act(async () => {
        await run();
      });
    } catch (e) {
      note(`${label}: action "${name}" threw: ${(e as Error).message}`, (e as Error).stack ?? '');
    }
    await settle(r() < 0.3 ? 10 : 0);
    const dt = performance.now() - t0;
    if (dt > 2000) note(`${label}: UI froze ${Math.round(dt)}ms on "${name}"`);
    if (!document.body.textContent && document.body.querySelectorAll('*').length < 2) {
      note(`${label}: blank tree after "${name}"`);
      view.unmount();
      view = render(<Component />);
    }
    if (document.querySelector('script:not([src]), img[onerror], [onerror]')) {
      note(`${label}: clip content was injected as live markup after "${name}"`);
    }
    if ((window as unknown as { __pwn?: number }).__pwn) {
      note(`${label}: injected script executed`);
      delete (window as unknown as { __pwn?: number }).__pwn;
    }
  }
}

function report(scope: string) {
  const mine = [...findings.entries()];
  if (!mine.length) return;
  const lines = mine.map(([k, v]) => `  - ${k}  (x${v.n})\n      e.g. ${v.example}`);
  throw new Error(
    `[chaos:${scope}] ${mine.length} finding(s) — replay with CHAOS_SEED=${SEED}\n${lines.join('\n')}`,
  );
}

// ------------------------------------------------------------------ tests --

it('library window survives hostile backend + random input', async () => {
  findings.clear();
  for (let s = 0; s < SESSIONS; s++) {
    await session(App, SEED + s, `library#${s}`);
    cleanup();
  }
  expect(() => report('ui-library')).not.toThrow();
}, 180_000);

it('palette window survives hostile backend + random input', async () => {
  findings.clear();
  for (let s = 0; s < SESSIONS; s++) {
    await session(PaletteWindow, SEED + 100 + s, `palette#${s}`);
    cleanup();
  }
  expect(() => report('ui-palette')).not.toThrow();
}, 180_000);
