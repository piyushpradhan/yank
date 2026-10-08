// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { PaletteWindow } from './PaletteWindow';

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (e: { payload: unknown }) => void>(),
  stored: { semanticDefault: false, provider: 'jev' as string },
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, cb: (e: { payload: unknown }) => void) => {
    mocks.listeners.set(event, cb);
    return () => {};
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onFocusChanged: async () => () => {}, hide: vi.fn() }),
}));
vi.mock('../lib/platform', () => ({ IS_MAC: true, IS_LINUX: false }));
vi.mock('ember-design-system', async (orig) => ({
  ...(await orig<typeof import('ember-design-system')>()),
  useTheme: () => ({ setTheme: () => {} }),
}));
vi.mock('../hooks/useAppState', () => ({
  useAppState: () => ({
    items: [],
    providerHealth: { status: 'ok' },
    copyItem: vi.fn(),
    pinItem: vi.fn(),
    deleteItem: vi.fn(),
    getImage: vi.fn(async () => null),
    semanticSearch: vi.fn(async () => []),
    showToast: vi.fn(),
    backfill: { running: false },
  }),
}));

beforeEach(() => {
  mocks.listeners.clear();
  mocks.stored.semanticDefault = false;
  mocks.stored.provider = 'jev';
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'get_palette_semantic_default') return mocks.stored.semanticDefault;
    if (cmd === 'get_settings')
      return {
        provider: mocks.stored.provider,
        typesafe_model: 'jev-latest',
        typesafe_api_key: 'test-key',
        anthropic_api_key: '',
      };
    return null;
  });
});

const fuzzy = () => screen.queryByPlaceholderText('Search clipboard history');
const semantic = () => screen.queryByPlaceholderText('Describe what you need…');

it('default off -> opens in fuzzy', async () => {
  render(<PaletteWindow />);
  await waitFor(() => expect(fuzzy()).not.toBeNull());
  await act(async () => {});
  expect(semantic()).toBeNull();
});

it('pref on + provider available -> first open is semantic (async load)', async () => {
  mocks.stored.semanticDefault = true;
  render(<PaletteWindow />);
  await waitFor(() => expect(semantic()).not.toBeNull());
  expect(fuzzy()).toBeNull();
});

it('pref on + provider disabled -> falls back to fuzzy', async () => {
  mocks.stored.semanticDefault = true;
  mocks.stored.provider = 'disabled';
  render(<PaletteWindow />);
  await act(async () => {});
  await act(async () => {});
  expect(fuzzy()).not.toBeNull();
  expect(semantic()).toBeNull();
});

it('live toggle event flips mode without restart', async () => {
  mocks.stored.semanticDefault = false;
  mocks.stored.provider = 'jev';
  render(<PaletteWindow />);
  await waitFor(() => expect(mocks.listeners.has('palette-semantic-default-changed')).toBe(true));
  await act(async () => {});
  expect(fuzzy()).not.toBeNull();
  act(() => mocks.listeners.get('palette-semantic-default-changed')!({ payload: true }));
  await waitFor(() => expect(semantic()).not.toBeNull());
  act(() => mocks.listeners.get('palette-semantic-default-changed')!({ payload: false }));
  await waitFor(() => expect(fuzzy()).not.toBeNull());
});
