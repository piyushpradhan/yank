import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTelemetryPreferences, captureUsageReporter, trackFeature } from './telemetry';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => {}) }));

beforeEach(() => {
  applyTelemetryPreferences({ enabled: false, prompt_handled: false });
  vi.mocked(invoke).mockClear();
});

describe('telemetry consent boundaries', () => {
  it('does not invoke the tracker while off', () => {
    trackFeature('library', 'copy', 'text');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('never reports an async operation started before consent', () => {
    const finish = captureUsageReporter();
    applyTelemetryPreferences({ enabled: true, prompt_handled: true });
    finish({ name: 'feature_used', surface: 'library', feature: 'copy', category: 'text' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invalidates old operations across opt-out and a later opt-in', () => {
    applyTelemetryPreferences({ enabled: true, prompt_handled: true });
    const finish = captureUsageReporter();
    applyTelemetryPreferences({ enabled: false, prompt_handled: true });
    applyTelemetryPreferences({ enabled: true, prompt_handled: true });
    finish({ name: 'feature_used', surface: 'palette', feature: 'copy', category: 'image' });
    trackFeature('palette', 'pin');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('track_usage', {
      event: { name: 'feature_used', surface: 'palette', feature: 'pin', category: null },
    });
  });
});
