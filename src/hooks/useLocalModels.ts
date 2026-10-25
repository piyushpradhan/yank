import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Mirrors `model_store::Status` in the Rust backend. Sizes are bytes. */
export type ModelState =
  | { state: 'missing'; total: number }
  | { state: 'downloading'; done: number; total: number }
  | { state: 'paused'; done: number; total: number }
  | { state: 'ready'; total: number }
  | { state: 'failed'; done: number; total: number; error: string };

type ModelStatus = ModelState & { id: string };

function toEntry({ id, ...state }: ModelStatus): [string, ModelState] {
  return [id, state as ModelState];
}

/**
 * Download state of every local embedding model, kept live by the
 * backend's `model-download` events. Downloads run in the backend, so they
 * keep going after the settings window closes.
 */
export function useLocalModels() {
  const [models, setModels] = useState<Record<string, ModelState>>({});
  const [rates, setRates] = useState<Record<string, number>>({});
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);
  const samples = useRef<Record<string, { done: number; at: number }>>({});

  useEffect(() => {
    let alive = true;
    invoke<ModelStatus[]>('list_local_models')
      .then((list) => alive && setModels(Object.fromEntries(list.map(toEntry))))
      .catch((e) => console.error('list_local_models failed', e));
    const unlisten = listen<ModelStatus>('model-download', (ev) => {
      const [id, state] = toEntry(ev.payload);
      setModels((prev) => ({ ...prev, [id]: state }));
      if (state.state !== 'downloading') {
        delete samples.current[id];
        return;
      }
      // Smoothed transfer rate from samples at least a second apart.
      const now = performance.now();
      const prev = samples.current[id];
      if (!prev) {
        samples.current[id] = { done: state.done, at: now };
      } else if (now - prev.at >= 1000) {
        const rate = ((state.done - prev.done) * 1000) / (now - prev.at);
        samples.current[id] = { done: state.done, at: now };
        setRates((r) => ({ ...r, [id]: r[id] ? r[id] * 0.6 + rate * 0.4 : rate }));
      }
    });
    return () => {
      alive = false;
      void unlisten.then((off) => off());
    };
  }, []);

  const run = useCallback((command: string, id: string) => {
    setError(null);
    invoke(command, { id }).catch((e) =>
      setError({ id, msg: typeof e === 'string' ? e : e instanceof Error ? e.message : 'Failed.' }),
    );
  }, []);

  return {
    models,
    rates,
    error,
    download: (id: string) => run('download_local_model', id),
    pause: (id: string) => run('pause_local_model', id),
    remove: (id: string) => run('delete_local_model', id),
  };
}
