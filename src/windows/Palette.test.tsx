// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '../hooks/useAppState';
import type { ClipItem, Theme } from '../lib/types';
import { Palette } from './Palette';

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, () => void>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
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
  const editor = screen.getByRole('textbox', { name: 'Temporary clipboard text' });
  fireEvent.change(editor, { target: { value: 'Temporary version' } });
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

  await waitFor(() => {
    expect(copyItem).toHaveBeenCalledWith('1', 'Temporary version');
    expect(onClose).toHaveBeenCalledOnce();
  });
  expect(item.content).toBe('Hello, world');
});
