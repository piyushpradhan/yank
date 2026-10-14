import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { applyTelemetryPreferences, type TelemetryPreferences } from '../lib/telemetry';

export function useTelemetryPreferences() {
  const [preferences, setPreferences] = useState<TelemetryPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedChoice, setFailedChoice] = useState<boolean | null>(null);
  const apply = useCallback((next: TelemetryPreferences) => {
    applyTelemetryPreferences(next);
    setPreferences(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let receivedChanges = 0;
    // Subscribe before reading, so the hidden palette cannot miss opt-out.
    void listen<TelemetryPreferences>('telemetry-preferences-changed', (event) => {
      if (!cancelled) {
        receivedChanges++;
        apply(event.payload);
      }
    })
      .then(async (stop) => {
        if (cancelled) {
          stop();
          return;
        }
        unlisten = stop;
        const changesBeforeRead = receivedChanges;
        const next = await invoke<TelemetryPreferences>('get_telemetry_preferences');
        if (!cancelled && changesBeforeRead === receivedChanges) apply(next);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your privacy preference. Usage sharing is off.');
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [apply]);

  const choose = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      setSaving(true);
      setError(null);
      setFailedChoice(null);
      // Opt-out stops this webview immediately, even on persistence failure.
      if (!enabled) applyTelemetryPreferences({ enabled: false, prompt_handled: true });
      try {
        apply(await invoke<TelemetryPreferences>('set_telemetry_enabled', { enabled }));
        return true;
      } catch {
        setFailedChoice(enabled);
        setError(
          enabled
            ? 'Could not save your privacy preference. Please try again.'
            : 'Sharing is off for this session. Retry saving to keep it off after restarting.'
        );
        if (!enabled) setPreferences((prev) => prev && { ...prev, enabled: false });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [apply]
  );
  return {
    preferences,
    saving,
    error,
    choose,
    retry: failedChoice === null ? undefined : () => choose(failedChoice),
  };
}
