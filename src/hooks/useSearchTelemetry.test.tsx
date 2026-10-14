import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useSearchTelemetry } from './useSearchTelemetry';
import { applyTelemetryPreferences, notifyClipUsed } from '../lib/telemetry';
import type { ClipItem } from '../lib/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => {}) }));
const clip: ClipItem = {
  id: 'private-id',
  category: 'text',
  content: 'private-content',
  label: 'private-title',
  preview: 'private-preview',
  source: 'private-source',
  minutesAgo: 1,
};
const initial = {
  query: 'private query',
  mode: 'semantic' as const,
  surface: 'library' as const,
  results: [clip],
  ready: false,
  provider: 'local' as const,
  status: 'success' as const,
};
const sent = () =>
  vi.mocked(invoke).mock.calls.map(([, args]) => (args as { event: unknown })?.event);
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(invoke).mockClear();
  applyTelemetryPreferences({ enabled: false, prompt_handled: true });
  applyTelemetryPreferences({ enabled: true, prompt_handled: true });
});
afterEach(() => vi.useRealTimers());

it('waits for authoritative results and reports no query or clipboard data', () => {
  const { rerender } = renderHook((props) => useSearchTelemetry(props), { initialProps: initial });
  act(() => vi.advanceTimersByTime(1000));
  expect(sent()).toEqual([]);
  rerender({ ...initial, ready: true });
  act(() => vi.advanceTimersByTime(500));
  expect(sent()).toMatchObject([
    { name: 'search_completed', result_count: 'one', status: 'success', provider: 'local' },
  ]);
  expect(JSON.stringify(sent())).not.toContain('private');
});

it('records fast selections once, with only the result rank', () => {
  renderHook(() => useSearchTelemetry({ ...initial, ready: true }));
  act(() => {
    notifyClipUsed(clip.id);
    notifyClipUsed(clip.id);
    vi.advanceTimersByTime(500);
  });
  expect(sent()).toMatchObject([
    { name: 'search_completed', result_count: 'one' },
    { name: 'search_outcome', outcome: 'selected', rank: 1 },
  ]);
  expect(sent()).toHaveLength(2);
  expect(JSON.stringify(sent())).not.toContain('private');
});

it('distinguishes an empty result from a failed search and records refinement', () => {
  const start = {
    ...initial,
    ready: true,
    results: [] as ClipItem[],
    status: 'error' as 'error' | 'success',
  };
  const { rerender } = renderHook((props) => useSearchTelemetry(props), { initialProps: start });
  act(() => vi.advanceTimersByTime(500));
  rerender({ ...start, query: 'another private query', status: 'success' });
  act(() => vi.advanceTimersByTime(500));
  expect(sent()).toMatchObject([
    { name: 'search_completed', status: 'error', result_count: 'zero' },
    { name: 'search_outcome', outcome: 'refined' },
    { name: 'search_completed', status: 'success', result_count: 'zero' },
  ]);
});

it('counts a semantic-to-fuzzy switch and abandoning a settled query', () => {
  const start = { ...initial, ready: true, mode: 'semantic' as 'semantic' | 'fuzzy' };
  const { rerender } = renderHook((props) => useSearchTelemetry(props), { initialProps: start });
  act(() => vi.advanceTimersByTime(500));
  rerender({ ...start, mode: 'fuzzy' });
  act(() => {
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new Event('blur'));
  });
  expect(sent()).toMatchObject([
    { name: 'search_completed', mode: 'semantic' },
    { name: 'search_outcome', outcome: 'mode_switched' },
    { name: 'search_completed', mode: 'fuzzy' },
    { name: 'search_outcome', outcome: 'abandoned' },
  ]);
});

it('discards searches begun before consent even if the results arrive after opt-in', () => {
  applyTelemetryPreferences({ enabled: false, prompt_handled: false });
  const { rerender } = renderHook((props) => useSearchTelemetry(props), { initialProps: initial });
  applyTelemetryPreferences({ enabled: true, prompt_handled: true });
  rerender({ ...initial, ready: true });
  act(() => vi.advanceTimersByTime(500));
  expect(sent()).toEqual([]);
});
