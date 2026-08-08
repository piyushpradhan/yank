import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { truncate } from "../lib/time";
import type { ClipItem, SemanticSearchResponse, Toast, ToastKind } from "../lib/types";
import { evictImageUrl } from "./useImageUrl";

export interface BackfillState {
  remaining: number;
  total: number;
  /** True when the backfill has stalled (30s with no progress / network error). */
  stalled: boolean;
}

/// Runtime health of the configured embedding provider. `'ok'` is the resting
/// state; we only flip to `'error'` after `semanticSearch` actually fails, and
/// reset to `'ok'` when the user updates settings (since the failure may have
/// been provoked by the now-stale config).
export interface ProviderHealth {
  status: 'ok' | 'error';
  error: string | null;
}

export interface AppState {
  items: ClipItem[];
  toast: Toast | null;
  backfill: BackfillState | null;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  libraryOpen: boolean;
  setLibraryOpen: (v: boolean) => void;
  showToast: (msg: string, kind?: ToastKind, undo?: () => void) => void;
  copyItem: (id: string, contentOverride?: string) => Promise<boolean>;
  pinItem: (id: string) => void;
  deleteItem: (id: string) => void;
  updateLabel: (id: string, label: string) => void;
  refresh: () => Promise<void>;
  semanticSearch: (query: string, limit?: number) => Promise<SemanticSearchResponse>;
  getImage: (id: string) => Promise<Blob | null>;
  providerHealth: ProviderHealth;
  resetProviderHealth: () => void;
}

let toastSeq = 0;

async function fetchItems(): Promise<ClipItem[]> {
  try {
    return await invoke<ClipItem[]>("list_items");
  } catch (err) {
    console.error("list_items failed", err);
    return [];
  }
}

export function useAppState(): AppState {
  const [items, setItems] = useState<ClipItem[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [backfill, setBackfill] = useState<BackfillState | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth>({
    status: 'ok',
    error: null,
  });
  const backfillRemaining = useRef(0);
  const backfillTotal = useRef(0);
  const backfillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<ClipItem[]>([]);
  itemsRef.current = items;

  const refresh = useCallback(async () => {
    const next = await fetchItems();
    setItems(next);
  }, []);

  useEffect(() => {
    void refresh();
    const unlisten = Promise.all([
      listen("clip-added", () => void refresh()),
      listen("clip-swept", () => void refresh()),
      listen("clip-labeled", () => void refresh()),
      listen<number>("embed-backfill-started", (ev) => {
        const total = ev.payload;
        backfillRemaining.current = total;
        backfillTotal.current = total;
        setBackfill({ remaining: total, total, stalled: false });
        if (backfillTimer.current) clearTimeout(backfillTimer.current);
        backfillTimer.current = setTimeout(() => {
          if (backfillRemaining.current > 0) {
            setBackfill({
              remaining: backfillRemaining.current,
              total: backfillTotal.current,
              stalled: true,
            });
          } else {
            setBackfill(null);
          }
        }, 30000);
      }),
      listen<number>("clip-embedded", () => {
        backfillRemaining.current = Math.max(0, backfillRemaining.current - 1);
        setBackfill({
          remaining: backfillRemaining.current,
          total: backfillTotal.current,
          stalled: false,
        });
        if (backfillTimer.current) clearTimeout(backfillTimer.current);
        if (backfillRemaining.current === 0) {
          backfillTimer.current = setTimeout(() => setBackfill(null), 3000);
        } else {
          // Reset stall timer on each progress event so a slow but live backfill stays visible.
          backfillTimer.current = setTimeout(() => {
            if (backfillRemaining.current > 0) {
              setBackfill({
                remaining: backfillRemaining.current,
                total: backfillTotal.current,
                stalled: true,
              });
            } else {
              setBackfill(null);
            }
          }, 30000);
        }
      }),
    ]);
    return () => {
      unlisten.then((fns) => fns.forEach((f) => f())).catch(() => {});
    };
  }, [refresh]);

  const showToast = useCallback(
    (msg: string, kind: ToastKind = "info", undo?: () => void) => {
      const id = ++toastSeq;
      setToast({ id, msg, kind, undo });
      // Undoable toasts linger long enough that a user can actually reach for Undo.
      setTimeout(() => {
        setToast((current) => (current && current.id === id ? null : current));
      }, undo ? 6000 : 1800);
    },
    [],
  );

  const copyItem = useCallback(
    async (id: string, contentOverride?: string) => {
      const it = itemsRef.current.find((i) => i.id === id);
      if (!it) return false;
      try {
        if (it.category === "image") {
          await invoke("copy_image", { id });
        } else {
          await writeText(contentOverride ?? it.content);
        }
      } catch (err) {
        console.error("clipboard write failed", err);
        showToast("Copy failed", "info");
        return false;
      }
      invoke("touch_item", { id }).then(
        () => void refresh(),
        (err) => console.error("touch_item failed", err),
      );
      showToast(`Copied "${truncate(it.label, 40)}"`, "copy");
      return true;
    },
    [refresh, showToast],
  );

  const pinItem = useCallback(
    (id: string) => {
      invoke<boolean>("pin_item", { id }).then(
        (nowPinned) => {
          void refresh();
          showToast(nowPinned ? "Pinned" : "Unpinned", "pin");
        },
        (err) => console.error("pin_item failed", err),
      );
    },
    [refresh, showToast],
  );

  const deleteItem = useCallback(
    (id: string) => {
      const it = itemsRef.current.find((i) => i.id === id);
      invoke("delete_item", { id }).then(
        () => {
          if (it?.category === "image") evictImageUrl(id);
          void refresh();
          const undo = () => {
            invoke("restore_item", { id }).then(
              () => void refresh(),
              (err) => console.error("restore_item failed", err),
            );
          };
          showToast("Deleted", "delete", undo);
        },
        (err) => console.error("delete_item failed", err),
      );
    },
    [refresh, showToast],
  );

  const updateLabel = useCallback(
    (id: string, label: string) => {
      invoke("update_label", { id, label }).then(
        () => void refresh(),
        (err) => console.error("update_label failed", err),
      );
    },
    [refresh],
  );

  const semanticSearch = useCallback(
    async (query: string, limit = 20): Promise<SemanticSearchResponse> => {
      if (!query.trim()) return { items: [], timeWindow: null, category: null };
      try {
        const resp = await invoke<SemanticSearchResponse>("search_semantic", {
          query,
          limit,
        });
        setProviderHealth((prev) =>
          prev.status === "ok" ? prev : { status: "ok", error: null },
        );
        return resp;
      } catch (err) {
        console.error("search_semantic failed", err);
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Semantic search failed.";
        setProviderHealth({ status: "error", error: msg });
        throw err;
      }
    },
    [],
  );

  const resetProviderHealth = useCallback(() => {
    setProviderHealth({ status: "ok", error: null });
  }, []);

  const getImage = useCallback(async (id: string): Promise<Blob | null> => {
    try {
      const result = await invoke<{ bytes: number[]; width: number; height: number } | null>(
        "get_image",
        { id },
      );
      if (!result) return null;
      return new Blob([new Uint8Array(result.bytes)], { type: "image/png" });
    } catch (err) {
      console.error("get_image failed", err);
      return null;
    }
  }, []);

  return {
    items: useMemo(() => items.filter((i) => !i.deleted), [items]),
    toast,
    backfill,
    paletteOpen,
    setPaletteOpen,
    libraryOpen,
    setLibraryOpen,
    showToast,
    copyItem,
    pinItem,
    deleteItem,
    updateLabel,
    refresh,
    semanticSearch,
    getImage,
    providerHealth,
    resetProviderHealth,
  };
}
