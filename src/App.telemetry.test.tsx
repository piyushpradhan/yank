import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { trackFeature } from './lib/telemetry';

const mocks = vi.hoisted(() => ({
  preferences: { enabled: false, prompt_handled: false },
  welcomeDone: true,
  failSave: false,
  invoke: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  setTheme: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    hide: vi.fn(),
    close: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    isMaximized: async () => false,
    onResized: async () => () => {},
  }),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    mocks.listeners.set(name, handler);
    return () => mocks.listeners.delete(name);
  }),
}));
vi.mock('ember-design-system', async (original) => ({
  ...(await original<typeof import('ember-design-system')>()),
  useTheme: () => ({ setTheme: mocks.setTheme }),
}));
vi.mock('./windows/Library', () => ({ Library: () => <div>Clipboard library</div> }));
vi.mock('./hooks/useAppState', () => ({
  useAppState: () => ({
    items: [],
    backfill: null,
    providerHealth: { status: 'ok', error: null },
    refresh: vi.fn(),
    resetProviderHealth: vi.fn(),
  }),
}));
vi.mock('./hooks/useUpdater', () => ({
  useUpdater: () => ({ status: { kind: 'idle' }, currentVersion: '0.7.70' }),
}));

beforeEach(() => {
  mocks.preferences = { enabled: false, prompt_handled: false };
  mocks.welcomeDone = true;
  mocks.failSave = false;
  mocks.listeners.clear();
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation(async (cmd: string, args?: { enabled?: boolean }) => {
    switch (cmd) {
      case 'get_settings':
        return { provider: 'disabled', anthropic_api_key: '' };
      case 'get_shortcut':
        return { modifiers: 520, key: 'Space' };
      case 'get_hint_dismissed':
        return mocks.welcomeDone;
      case 'set_hint_dismissed':
        mocks.welcomeDone = true;
        return;
      case 'get_telemetry_preferences':
        return mocks.preferences;
      case 'set_telemetry_enabled':
        if (mocks.failSave) throw new Error('disk unavailable');
        mocks.preferences = { enabled: !!args?.enabled, prompt_handled: true };
        return mocks.preferences;
      case 'platform_info':
        return { wayland: false };
      default:
        return false;
    }
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('starts off, persists a decline, and does not ask again after reopening', async () => {
  const view = render(<App />);
  await screen.findByRole('button', { name: 'No thanks' });
  trackFeature('library', 'copy');
  expect(mocks.invoke.mock.calls.filter(([cmd]) => cmd === 'track_usage')).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'No thanks' })).toBeNull());
  expect(mocks.preferences).toEqual({ enabled: false, prompt_handled: true });
  view.unmount();
  render(<App />);
  await act(async () => {});
  expect(screen.queryByText('Help make Yank better?')).toBeNull();
});

it('enables sharing only after permission and lets the footer panel turn it off', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Share usage' }));
  await waitFor(() => expect(mocks.preferences.enabled).toBe(true));
  trackFeature('library', 'copy', 'text');
  expect(mocks.invoke).toHaveBeenCalledWith('track_usage', {
    event: { name: 'feature_used', surface: 'library', feature: 'copy', category: 'text' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Tweaks' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Privacy & usage' }));
  const toggle = await screen.findByRole('switch', { name: 'Share usage statistics' });
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  const previous = mocks.invoke.mock.calls.filter(([cmd]) => cmd === 'track_usage').length;
  trackFeature('palette', 'copy');
  expect(mocks.invoke.mock.calls.filter(([cmd]) => cmd === 'track_usage')).toHaveLength(previous);
});

it('shows the prompt after the first-run welcome and treats Escape as a decline', async () => {
  mocks.welcomeDone = false;
  render(<App />);
  await screen.findByText('Welcome to Yank');
  expect(screen.queryByText('Help make Yank better?')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: "Let's go" }));
  await screen.findByText('Help make Yank better?');
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }));
  await waitFor(() => expect(mocks.preferences).toEqual({ enabled: false, prompt_handled: true }));
});

it('keeps sharing off and the prompt open when the consent save fails', async () => {
  mocks.failSave = true;
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Share usage' }));
  await screen.findByRole('alert');
  expect(mocks.preferences.enabled).toBe(false);
  expect(screen.getByText('Help make Yank better?')).toBeVisible();
});

it('reflects another window disabling sharing', async () => {
  mocks.preferences = { enabled: true, prompt_handled: true };
  render(<App />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Tweaks' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Privacy & usage' }));
  const toggle = await screen.findByRole('switch', { name: 'Share usage statistics' });
  expect(toggle).toBeChecked();
  act(() =>
    mocks.listeners.get('telemetry-preferences-changed')?.({
      payload: { enabled: false, prompt_handled: true },
    })
  );
  expect(toggle).not.toBeChecked();
});

it('does not let a stale initial read undo a newer opt-out event', async () => {
  const original = mocks.invoke.getMockImplementation()!;
  let resolveRead: (value: { enabled: boolean; prompt_handled: boolean }) => void;
  mocks.invoke.mockImplementation((cmd: string, args: unknown) =>
    cmd === 'get_telemetry_preferences'
      ? new Promise((resolve) => {
          resolveRead = resolve;
        })
      : original(cmd, args)
  );
  render(<App />);
  await waitFor(() => expect(mocks.listeners.has('telemetry-preferences-changed')).toBe(true));
  await act(async () => {
    mocks.listeners.get('telemetry-preferences-changed')?.({
      payload: { enabled: false, prompt_handled: true },
    });
    resolveRead!({ enabled: true, prompt_handled: true });
  });
  trackFeature('library', 'copy');
  expect(mocks.invoke.mock.calls.filter(([cmd]) => cmd === 'track_usage')).toEqual([]);
});

it('stops sharing on an opt-out save failure and can retry saving off', async () => {
  mocks.preferences = { enabled: true, prompt_handled: true };
  render(<App />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Tweaks' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Privacy & usage' }));
  mocks.invoke.mockClear();
  mocks.failSave = true;
  fireEvent.click(screen.getByRole('switch', { name: 'Share usage statistics' }));
  await screen.findByText(
    'Sharing is off for this session. Retry saving to keep it off after restarting.'
  );
  expect(screen.getByRole('switch')).not.toBeChecked();
  trackFeature('library', 'copy');
  expect(mocks.invoke.mock.calls.filter(([cmd]) => cmd === 'track_usage')).toEqual([]);
  mocks.failSave = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }));
  await waitFor(() => expect(mocks.preferences.enabled).toBe(false));
  expect(screen.queryByRole('alert')).toBeNull();
});
