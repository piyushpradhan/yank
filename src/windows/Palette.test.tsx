// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '../hooks/useAppState';
import type { ClipItem, Theme } from '../lib/types';
import { Palette } from './Palette';

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, () => void>(),
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, callback: () => void) => {
    mocks.listeners.set(event, callback);
    return () => {};
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onFocusChanged: async () => () => {},
  }),
}));
vi.mock('../lib/platform', () => ({ IS_MAC: true, IS_LINUX: false }));

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
  dark: false,
  dense: false,
  rowH: 0,
  rowHTall: 0,
  pad: 0,
  radius: 0,
  radiusLg: 0,
};

beforeEach(() => {
  mocks.listeners.clear();
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue('pasted');
});

it('starts each palette session fresh and pastes a temporary edit without changing the item', async () => {
  const copyItem = vi.fn(async () => true);
  const onClose = vi.fn();
  const app = {
    items: [item],
    copyItem,
    pinItem: vi.fn(),
    deleteItem: vi.fn(),
    getImage: vi.fn(async () => null),
    semanticSearch: vi.fn(),
    showToast: vi.fn(),
  } as unknown as AppState;

  render(
    <Palette
      t={theme}
      showLabels
      categoryMode="chip"
      app={app}
      onClose={onClose}
      semanticAvailable={false}
      semanticOffMessage={null}
      anthropicEnabled={false}
    />
  );

  const search = screen.getByPlaceholderText('Search clipboard history');
  fireEvent.change(search, { target: { value: 'old search' } });
  expect(search).toHaveValue('old search');

  await waitFor(() => expect(mocks.listeners.has('palette-shown')).toBe(true));
  act(() => mocks.listeners.get('palette-shown')?.());
  expect(search).toHaveValue('');

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const editor = screen.getByRole('textbox', { name: 'Clipboard text' });
  fireEvent.change(editor, { target: { value: 'Temporary version' } });
  fireEvent.click(screen.getByRole('button', { name: /Paste once/ }));

  await waitFor(() => {
    expect(copyItem).toHaveBeenCalledWith('1', 'Temporary version');
    expect(mocks.invoke).toHaveBeenCalledWith('paste_to_frontmost_app');
    // A successful paste closes the palette immediately.
    expect(onClose).toHaveBeenCalled();
  });
  expect(item.content).toBe('Hello, world');
});

it('focuses the search input every time the palette is shown', async () => {
  const app = {
    items: [item],
    copyItem: vi.fn(async () => true),
    pinItem: vi.fn(),
    deleteItem: vi.fn(),
    getImage: vi.fn(async () => null),
    semanticSearch: vi.fn(),
    showToast: vi.fn(),
  } as unknown as AppState;

  render(
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

  const search = screen.getByPlaceholderText('Search clipboard history');
  screen.getByRole('button', { name: 'Edit' }).focus();
  expect(search).not.toHaveFocus();

  await waitFor(() => expect(mocks.listeners.has('palette-shown')).toBe(true));
  act(() => mocks.listeners.get('palette-shown')?.());

  expect(search).toHaveFocus();
});

it('uses the same copy-then-paste flow for Enter and row clicks', async () => {
  const calls: string[] = [];
  const copyItem = vi.fn(async () => {
    calls.push('copy');
    return true;
  });
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'paste_to_frontmost_app') calls.push('paste');
  });
  const app = {
    items: [item],
    copyItem,
    pinItem: vi.fn(),
    deleteItem: vi.fn(),
    getImage: vi.fn(async () => null),
    semanticSearch: vi.fn(),
    showToast: vi.fn(),
  } as unknown as AppState;

  render(
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

  const search = screen.getByPlaceholderText('Search clipboard history');
  fireEvent.keyDown(search, { key: 'Enter' });
  await waitFor(() => expect(calls).toEqual(['copy', 'paste']));

  const row = document.querySelector<HTMLElement>('[data-i="0"]');
  expect(row).not.toBeNull();
  fireEvent.click(row!);
  await waitFor(() => expect(calls).toEqual(['copy', 'paste', 'copy', 'paste']));
});

it('shows a copy fallback pill and stays open when auto-paste falls back to copy-only', async () => {
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'paste_to_frontmost_app') return 'copied';
    return undefined;
  });
  const copyItem = vi.fn(async () => true);
  const onClose = vi.fn();
  const app = {
    items: [item],
    copyItem,
    pinItem: vi.fn(),
    deleteItem: vi.fn(),
    getImage: vi.fn(async () => null),
    semanticSearch: vi.fn(),
    showToast: vi.fn(),
  } as unknown as AppState;

  render(
    <Palette
      t={theme}
      showLabels
      categoryMode="chip"
      app={app}
      onClose={onClose}
      semanticAvailable={false}
      semanticOffMessage={null}
      anthropicEnabled={false}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Paste' }));

  await waitFor(() => {
    expect(screen.getByText('Copied — paste with Ctrl+V')).toBeTruthy();
  });
  expect(onClose).not.toHaveBeenCalled();

  // The pill is transient: after the grace window the palette closes itself.
  await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 1200 });
});

it('renames an item from the palette and cancels with Escape', () => {
  const updateLabel = vi.fn();
  const onClose = vi.fn();
  const app = {
    items: [item],
    copyItem: vi.fn(async () => true),
    pinItem: vi.fn(),
    deleteItem: vi.fn(),
    updateLabel,
    getImage: vi.fn(async () => null),
    semanticSearch: vi.fn(),
    showToast: vi.fn(),
  } as unknown as AppState;

  render(
    <Palette
      t={theme}
      showLabels
      categoryMode="chip"
      app={app}
      onClose={onClose}
      semanticAvailable={false}
      semanticOffMessage={null}
      anthropicEnabled={false}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  let title = screen.getByRole('textbox', { name: 'Item title' });
  fireEvent.change(title, { target: { value: '  New name ' } });
  fireEvent.keyDown(title, { key: 'Enter' });
  expect(updateLabel).toHaveBeenCalledTimes(1);
  expect(updateLabel).toHaveBeenCalledWith('1', 'New name');
  expect(screen.queryByRole('textbox', { name: 'Item title' })).toBeNull();
  expect(screen.getByPlaceholderText('Search clipboard history')).toHaveFocus();

  // Cmd+R works straight from the search box; Escape cancels without closing.
  fireEvent.keyDown(screen.getByPlaceholderText('Search clipboard history'), {
    key: 'r',
    metaKey: true,
  });
  title = screen.getByRole('textbox', { name: 'Item title' });
  expect(title).toHaveValue('Greeting');
  fireEvent.change(title, { target: { value: 'Discarded' } });
  fireEvent.keyDown(title, { key: 'Escape' });
  expect(updateLabel).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox', { name: 'Item title' })).toBeNull();
});

it('confirms or cancels a rename with the visible Save / Cancel buttons', () => {
  const updateLabel = vi.fn();
  const app = {
    items: [item],
    copyItem: vi.fn(async () => true),
    pinItem: vi.fn(),
    deleteItem: vi.fn(),
    updateLabel,
    getImage: vi.fn(async () => null),
    semanticSearch: vi.fn(),
    showToast: vi.fn(),
  } as unknown as AppState;

  render(
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

  fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Item title' }), {
    target: { value: 'Discarded' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Discard/ }));
  expect(updateLabel).not.toHaveBeenCalled();
  // Back to the normal action bar.
  expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Item title' }), {
    target: { value: 'Kept' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Save/ }));
  expect(updateLabel).toHaveBeenCalledTimes(1);
  expect(updateLabel).toHaveBeenCalledWith('1', 'Kept');
});

it('saves an edit with Enter, keeps Shift+Enter for newlines, discards with Escape', () => {
  const updateContent = vi.fn();
  const app = {
    items: [item],
    copyItem: vi.fn(async () => true),
    pinItem: vi.fn(),
    deleteItem: vi.fn(),
    updateContent,
    getImage: vi.fn(async () => null),
    semanticSearch: vi.fn(),
    showToast: vi.fn(),
  } as unknown as AppState;

  render(
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

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  let editor = screen.getByRole('textbox', { name: 'Clipboard text' });
  fireEvent.change(editor, { target: { value: 'Thrown away' } });
  fireEvent.keyDown(editor, { key: 'Escape' });
  expect(screen.queryByRole('textbox', { name: 'Clipboard text' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  editor = screen.getByRole('textbox', { name: 'Clipboard text' });
  fireEvent.change(editor, { target: { value: 'Hello, edited' } });
  fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true });
  expect(updateContent).not.toHaveBeenCalled();
  fireEvent.keyDown(editor, { key: 'Enter' });
  expect(updateContent).toHaveBeenCalledTimes(1);
  expect(updateContent).toHaveBeenCalledWith('1', 'Hello, edited');
});
