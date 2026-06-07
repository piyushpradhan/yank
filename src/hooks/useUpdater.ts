import { useCallback, useEffect, useRef, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

export type UpdaterStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'downloading'; version: string; downloaded: number; total: number | null }
  | { kind: 'ready'; version: string; notes: string | null }
  | { kind: 'uptodate' }
  | { kind: 'error'; message: string };

export interface Updater {
  status: UpdaterStatus;
  currentVersion: string | null;
  check: () => Promise<void>;
  restart: () => Promise<void>;
  dismiss: () => void;
}

// Tauri's updater API is only wired up in the desktop bundle; gate every call
// behind this so `npm run dev` (browser preview) doesn't blow up.
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function downloadInBackground(
  update: Update,
  onProgress: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;
  await update.download((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? null;
        onProgress(0, total);
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        onProgress(downloaded, total);
        break;
    }
  });
}

export function useUpdater(): Updater {
  const [status, setStatus] = useState<UpdaterStatus>({ kind: 'idle' });
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  // Hold the resolved Update across the check → download → install lifecycle.
  const pending = useRef<Update | null>(null);
  // Guard so the auto-check effect can't race with a user-initiated check.
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isTauri) return;
    void getVersion().then(setCurrentVersion).catch(() => {});
  }, []);

  const runCheck = useCallback(async () => {
    if (!isTauri || inFlight.current) return;
    inFlight.current = true;
    setStatus({ kind: 'checking' });
    try {
      const update = await check();
      if (!update) {
        pending.current = null;
        setStatus({ kind: 'uptodate' });
        return;
      }
      pending.current = update;
      setStatus({
        kind: 'downloading',
        version: update.version,
        downloaded: 0,
        total: null,
      });
      await downloadInBackground(update, (downloaded, total) => {
        setStatus({
          kind: 'downloading',
          version: update.version,
          downloaded,
          total,
        });
      });
      await update.install();
      setStatus({ kind: 'ready', version: update.version, notes: update.body ?? null });
    } catch (err) {
      pending.current = null;
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'error', message });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const restart = useCallback(async () => {
    if (!isTauri) return;
    try {
      await relaunch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'error', message });
    }
  }, []);

  const dismiss = useCallback(() => {
    setStatus({ kind: 'idle' });
  }, []);

  // Silent background check ~3s after launch so the prompt doesn't fight with
  // the first-paint hint/welcome modal.
  useEffect(() => {
    if (!isTauri) return;
    const t = setTimeout(() => {
      void runCheck();
    }, 3000);
    return () => clearTimeout(t);
  }, [runCheck]);

  return {
    status,
    currentVersion,
    check: runCheck,
    restart,
    dismiss,
  };
}
