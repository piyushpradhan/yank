import { useEffect, useRef } from 'react';
import {
  captureUsageReporter,
  CLIP_USED_EVENT,
  resultCountBucket,
  type UsageEvent,
  type UsageSurface,
  type SearchOutcome,
} from '../lib/telemetry';
import type { ClipItem, SearchMode } from '../lib/types';

interface SearchSnapshot {
  query: string;
  mode: SearchMode;
  surface: UsageSurface;
  results: ClipItem[];
  ready: boolean;
  provider: 'fuzzy' | 'local' | 'jev' | 'disabled';
  status: 'success' | 'error' | 'unavailable';
  timeFilter?: boolean;
  categoryFilter?: boolean;
}
interface Attempt {
  query: string;
  mode: SearchMode;
  started: number;
  report: (event: UsageEvent) => void;
  completed: boolean;
  ended: boolean;
  readyAt?: number;
}

function complete(current: Attempt, snapshot: SearchSnapshot) {
  current.completed = true;
  current.report({
    name: 'search_completed',
    surface: snapshot.surface,
    mode: current.mode,
    provider: snapshot.provider,
    status: snapshot.status,
    result_count: resultCountBucket(snapshot.results.length),
    duration_ms: Math.min(
      300_000,
      Math.max(0, Math.round((current.readyAt ?? performance.now()) - current.started))
    ),
    time_filter: !!snapshot.timeFilter,
    category_filter: !!snapshot.categoryFilter,
  });
}

// Measures settled searches, never keystrokes. Queries and item IDs stay in
// local refs; only outcome, rank, coarse counts, and timing leave the app.
export function useSearchTelemetry(snapshot: SearchSnapshot) {
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const attempt = useRef<Attempt | null>(null);

  useEffect(() => {
    const previous = attempt.current;
    if (previous?.completed && !previous.ended) {
      const outcome: SearchOutcome =
        previous.mode !== snapshot.mode
          ? 'mode_switched'
          : snapshot.query.trim()
            ? 'refined'
            : 'cleared';
      previous.report({
        name: 'search_outcome',
        surface: snapshot.surface,
        mode: previous.mode,
        outcome,
        rank: null,
      });
    }
    attempt.current = snapshot.query.trim()
      ? {
          query: snapshot.query,
          mode: snapshot.mode,
          started: performance.now(),
          report: captureUsageReporter(),
          completed: false,
          ended: false,
        }
      : null;
    // This effect starts only when a new query/mode is chosen.
  }, [snapshot.query, snapshot.mode, snapshot.surface]);

  useEffect(() => {
    const current = attempt.current;
    if (!current || current.completed || current.ended || !snapshot.ready) return;
    current.readyAt ??= performance.now();
    const timer = setTimeout(() => {
      if (attempt.current !== current || current.ended) return;
      const now = latest.current;
      complete(current, now);
    }, 500);
    return () => clearTimeout(timer);
  }, [
    snapshot.query,
    snapshot.mode,
    snapshot.ready,
    snapshot.status,
    snapshot.provider,
    snapshot.results.length,
    snapshot.timeFilter,
    snapshot.categoryFilter,
  ]);

  useEffect(() => {
    const end = (outcome: SearchOutcome, rank: number | null = null) => {
      const current = attempt.current;
      if (!current || current.ended) return;
      // Fast selections are real searches too, even before the idle debounce.
      if (!current.completed && outcome === 'selected' && latest.current.ready) {
        complete(current, latest.current);
      }
      if (!current.completed) return;
      current.ended = true;
      current.report({
        name: 'search_outcome',
        surface: latest.current.surface,
        mode: current.mode,
        outcome,
        rank,
      });
    };
    const used = (event: Event) => {
      const rank = latest.current.results.findIndex(
        (item) => item.id === (event as CustomEvent<string>).detail
      );
      if (rank >= 0) end('selected', Math.min(rank + 1, 500));
    };
    const blur = () => end('abandoned');
    window.addEventListener(CLIP_USED_EVENT, used);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener(CLIP_USED_EVENT, used);
      window.removeEventListener('blur', blur);
    };
  }, []);
}
