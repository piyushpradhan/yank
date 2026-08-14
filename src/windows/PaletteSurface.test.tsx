// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '../hooks/useAppState';
import type { ClipItem, Theme } from '../lib/types';
import { Palette } from './Palette';

/**
 * The palette's frosted-glass surface is deliberately platform-dependent:
 * WebKitGTK leaves previously-painted rows on screen ("ghosts") when it
 * scrolls inside a translucent, backdrop-filtered layer, so Linux paints an
 * opaque surface instead (tauri-apps/tauri#14811, #14924).
 *
 * Both platforms are asserted here on purpose. Testing only the Linux side
 * would pass just as happily if the blur vanished everywhere, or if jsdom
 * silently dropped the property — the macOS case is what keeps the Linux
 * assertion honest.
 */

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  platform: { IS_MAC: false, IS_LINUX: false },
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onFocusChanged: async () => () => {} }),
}));
// Getters keep the binding live, so each test can pick a platform without
// having to reset the module registry between renders.
vi.mock('../lib/platform', () => ({
  get IS_MAC() {
    return mocks.platform.IS_MAC;
  },
  get IS_LINUX() {
    return mocks.platform.IS_LINUX;
  },
}));

const item: ClipItem = {
  id: '1',
  category: 'text',
  label: 'Greeting',
  source: 'Notes',
  minutesAgo: 1,
  content: 'Hello, world',
  preview: 'Hello, world',
};

const theme: Theme = {
  dark: true,
  dense: false,
  rowH: 0,
  rowHTall: 0,
  pad: 0,
  radius: 0,
  radiusLg: 0,
};

const app = {
  items: [item],
  copyItem: vi.fn(async () => true),
  pinItem: vi.fn(),
  deleteItem: vi.fn(),
  getImage: vi.fn(async () => null),
  semanticSearch: vi.fn(),
  showToast: vi.fn(),
} as unknown as AppState;

/** Inline style of the palette shell — the element carrying the surface. */
function renderSurfaceStyle(): string {
  const { container } = render(
    <Palette
      t={theme}
      showLabels
      categoryMode="chip"
      app={app}
      onClose={vi.fn()}
      semanticAvailable={false}
      semanticOffMessage={null}
      anthropicEnabled={false}
    />
  );
  const shell = container.firstElementChild?.firstElementChild;
  expect(shell).toBeTruthy();
  return shell?.getAttribute('style') ?? '';
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue(undefined);
  mocks.platform.IS_MAC = false;
  mocks.platform.IS_LINUX = false;
});

it('blurs the palette surface on platforms that composite transparency correctly', () => {
  mocks.platform.IS_MAC = true;
  const style = renderSurfaceStyle();

  expect(style).toContain('backdrop-filter');
  expect(style).toContain('color-mix');
});

it('paints an opaque palette surface on Linux, with no backdrop-filter', () => {
  mocks.platform.IS_LINUX = true;
  const style = renderSurfaceStyle();

  expect(style).not.toContain('backdrop-filter');
  expect(style).toContain('var(--bg-surface)');
  // A translucent background would keep WebKitGTK on the same broken
  // compositing path even with the blur gone.
  expect(style).not.toContain('color-mix');
});
