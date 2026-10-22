import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** "Block sensitive copies" capture setting, kept in sync across windows.
 * `blocked` is null until loaded; pass `active = false` to skip loading. */
export function useSensitiveCopies(active = true) {
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let current = true;
    let changed = false;
    // Subscribe before reading so a change from another window is never lost.
    const unlisten = listen<boolean>('capture-privacy-changed', ({ payload }) => {
      changed = true;
      if (current) setBlocked(payload);
    });
    void unlisten
      .then(() => invoke<boolean>('get_skip_sensitive_copies'))
      .then((enabled) => {
        if (current && !changed) setBlocked(enabled);
      })
      .catch(() => {
        if (current) setError('Could not load clipboard privacy settings. Reopen to retry.');
      });
    return () => {
      current = false;
      void unlisten.then((stop) => stop()).catch(() => {});
    };
  }, [active]);

  const choose = async (enabled: boolean) => {
    setSaving(true);
    setError(null);
    try {
      setBlocked(await invoke<boolean>('set_skip_sensitive_copies', { enabled }));
    } catch {
      setError('Could not save clipboard privacy settings. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return { blocked, saving, error, choose };
}
