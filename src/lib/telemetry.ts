import { invoke } from '@tauri-apps/api/core';
import type { Category, SearchMode } from './types';

export type UsageSurface = 'library' | 'palette' | 'background';
export type UsageFeature =
  | 'copy'
  | 'copy_edited'
  | 'pin'
  | 'unpin'
  | 'delete'
  | 'restore'
  | 'rename'
  | 'rename_labeled_clip'
  | 'edit'
  | 'clear_history'
  | 'dismiss_date_filter'
  | 'dismiss_category_filter'
  | 'category_filter'
  | 'preview'
  | 'ai_settings'
  | 'settings'
  | 'provider_changed'
  | 'retry_embeddings';
export type UsageOperation =
  | 'copy'
  | 'pin'
  | 'delete'
  | 'restore'
  | 'rename'
  | 'edit'
  | 'paste'
  | 'semantic_search';
export type SearchOutcome = 'selected' | 'refined' | 'mode_switched' | 'cleared' | 'abandoned';
export type UsageEvent =
  | {
      name: 'feature_used';
      surface: UsageSurface;
      feature: UsageFeature;
      category: Category | null;
    }
  | { name: 'operation_failed'; surface: UsageSurface; operation: UsageOperation }
  | { name: 'paste_completed'; outcome: 'pasted' | 'copied' | 'failed' }
  | {
      name: 'search_completed';
      surface: UsageSurface;
      mode: SearchMode;
      provider: 'fuzzy' | 'local' | 'jev' | 'disabled';
      result_count: 'zero' | 'one' | 'two_to_five' | 'six_to_twenty' | 'over_twenty';
      duration_ms: number;
      time_filter: boolean;
      category_filter: boolean;
      status: 'success' | 'error' | 'unavailable';
    }
  | {
      name: 'search_outcome';
      surface: UsageSurface;
      mode: SearchMode;
      outcome: SearchOutcome;
      rank: number | null;
    };

export interface TelemetryPreferences {
  enabled: boolean;
  prompt_handled: boolean;
}

// Per-webview gate mirrors the authoritative native gate. Epochs prevent an
// operation started before consent (or before an opt-out) being sent later.
let enabled = false;
let epoch = 0;
export function applyTelemetryPreferences(preferences: TelemetryPreferences) {
  if (enabled !== preferences.enabled) epoch++;
  enabled = preferences.enabled === true;
}

export function captureUsageReporter(): (event: UsageEvent) => void {
  const allowed = enabled;
  const startedAtEpoch = epoch;
  return (event) => {
    if (!allowed || !enabled || epoch !== startedAtEpoch) return;
    // Native transport is bounded, silent, and independently enforces consent.
    void invoke('track_usage', { event }).catch(() => {});
  };
}

export function trackUsage(event: UsageEvent) {
  captureUsageReporter()(event);
}
export function trackFeature(
  surface: UsageSurface,
  feature: UsageFeature,
  category: Category | null = null
) {
  trackUsage({ name: 'feature_used', surface, feature, category });
}

export function resultCountBucket(
  count: number
): Extract<UsageEvent, { name: 'search_completed' }>['result_count'] {
  if (count === 0) return 'zero';
  if (count === 1) return 'one';
  if (count <= 5) return 'two_to_five';
  if (count <= 20) return 'six_to_twenty';
  return 'over_twenty';
}

// Local-only notification lets a search record a successful copy from any
// button/keyboard/preview path. The clipboard ID never enters a telemetry event.
export const CLIP_USED_EVENT = 'yank:clip-used';
export function notifyClipUsed(id: string) {
  window.dispatchEvent(new CustomEvent(CLIP_USED_EVENT, { detail: id }));
}
