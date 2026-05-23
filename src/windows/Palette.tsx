import { useEffect, useMemo, useRef, useState } from 'react';
import { highlightMatch, searchItems } from '../lib/search';
import { relTime } from '../lib/time';
import type { CategoryDisplay, ClipItem, SearchMode, Theme } from '../lib/types';
import type { AppState } from '../hooks/useAppState';
import { useImageUrl } from '../hooks/useImageUrl';
import { Button, Kbd } from 'ember-design-system';
import { LuCopy, LuEllipsis, LuPin, LuPinOff, LuSearch, LuTrash2 } from 'react-icons/lu';
import { CategoryChip } from '../components/Primitives';
import { ItemBody } from '../components/Primitives';

const accentStyle = {
  background: 'var(--accent-ember-50)',
  color: 'var(--accent-ember-700)',
  borderColor: 'var(--accent-ember-100)',
  boxShadow:
    'inset 0 -1px 0 color-mix(in oklab, var(--accent-ember-700) 16%, transparent)',
} as const;

const onAccentStyle = {
  background: 'rgba(255,255,255,0.18)',
  color: 'var(--text-inverse)',
  borderColor: 'rgba(255,255,255,0.28)',
  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.12)',
} as const;

// Stable no-op so useImageUrl's effect deps stay stable for non-image rows.
const NO_IMAGE = (): Promise<Blob | null> => Promise.resolve(null);

function ImagePreview({
  item,
  getImage,
}: {
  t: Theme;
  item: ClipItem;
  getImage: (id: string) => Promise<Blob | null>;
}) {
  const url = useImageUrl(item.id, getImage);

  if (!url) {
    return <div className="text-[13px] text-fg-faint">Loading image…</div>;
  }

  return (
    <img src={url} alt={item.preview} className="max-h-[280px] max-w-full rounded-lg bg-subtle" />
  );
}

interface PaletteRowProps {
  t: Theme;
  item: ClipItem;
  index: number;
  selected: boolean;
  query: string;
  showLabels: boolean;
  categoryMode: CategoryDisplay;
  getImage: (id: string) => Promise<Blob | null>;
  onMouseEnter: () => void;
  onClick: () => void;
}

function PaletteRow({
  t,
  item,
  index,
  selected,
  query,
  showLabels,
  categoryMode,
  getImage,
  onMouseEnter,
  onClick,
}: PaletteRowProps) {
  const isImage = item.category === 'image';
  const imageUrl = useImageUrl(isImage ? item.id : '', isImage ? getImage : NO_IMAGE);

  return (
    <div
      data-i={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`relative flex cursor-pointer items-center gap-3 rounded-lg px-3 transition-colors duration-150 ${
        t.dense ? 'py-2' : 'py-2.5'
      } ${selected ? 'bg-accent-soft' : 'bg-transparent'}`}
    >
      {categoryMode === 'chip' && <CategoryChip t={t} cat={item.category} mode="chip" />}
      {categoryMode === 'icon' && <CategoryChip t={t} cat={item.category} mode="icon" />}
      {categoryMode === 'dot' && <CategoryChip t={t} cat={item.category} mode="dot" />}

      {isImage && (
        <div className="flex h-8 w-11 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border-subtle bg-subtle">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.preview}
              className="max-h-full max-w-full object-contain"
            />
          ) : null}
        </div>
      )}

      <div className="min-w-0 flex-1">
        {showLabels && (
          <div
            className={`flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap tracking-[-0.1px] ${
              t.dense ? 'text-[13.5px]' : 'text-[14.5px]'
            } ${item.labelGenerated ? 'font-medium not-italic text-fg' : 'font-normal italic text-fg-muted'}`}
            title={item.labelGenerated ? undefined : 'Awaiting AI label'}
          >
            <span className="overflow-hidden text-ellipsis">
              {highlightMatch(t, item.label, query)}
            </span>
            {!item.labelGenerated && (
              <LuEllipsis size={11} aria-hidden="true" className="shrink-0 text-fg-faint" />
            )}
          </div>
        )}
        <div
          className={`overflow-hidden text-ellipsis whitespace-nowrap ${
            item.category === 'text' || item.category === 'address' ? 'font-sans' : 'font-mono'
          } ${
            showLabels
              ? `mt-0.5 ${t.dense ? 'text-[11.5px]' : 'text-xs'} text-fg-muted`
              : `${t.dense ? 'text-[13px]' : 'text-[13.5px]'} text-fg`
          }`}
        >
          {item.preview}
        </div>
      </div>

      {item.pinned && (
        <LuPin size={11} className="shrink-0 fill-current text-accent" aria-label="pinned" />
      )}
      {item.category === 'color' && (
        <div
          className="h-[18px] w-[18px] shrink-0 rounded-sm border border-border-subtle"
          style={{ background: item.content }}
        />
      )}

      <div className="min-w-[42px] shrink-0 text-right font-mono text-[11px] leading-none tabular-nums text-fg-faint">
        {relTime(item.minutesAgo)}
      </div>

      {selected && (
        <div className="flex shrink-0 items-center gap-1">
          <Kbd size="sm" style={accentStyle}>
            ↵
          </Kbd>
        </div>
      )}
    </div>
  );
}

interface PaletteProps {
  t: Theme;
  showLabels: boolean;
  categoryMode: CategoryDisplay;
  app: AppState;
  onClose: () => void;
  /** Whether semantic search (embedding) provider is active. */
  semanticAvailable: boolean;
  initialQuery?: string;
  initialMode?: SearchMode;
  initialSelected?: number;
}

export function Palette({
  t,
  showLabels,
  categoryMode,
  app,
  onClose,
  semanticAvailable,
  initialQuery = '',
  initialMode = 'fuzzy',
  initialSelected = 0,
}: PaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [selected, setSelected] = useState(initialSelected);
  const [semanticResults, setSemanticResults] = useState<ClipItem[] | null>(null);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (mode !== 'semantic' || !query.trim()) {
      setSemanticResults(null);
      setSemanticError(null);
      setSemanticLoading(false);
      return;
    }
    if (!semanticAvailable) {
      setSemanticResults([]);
      setSemanticError(null);
      setSemanticLoading(false);
      return;
    }
    let cancelled = false;
    setSemanticLoading(true);
    setSemanticError(null);
    const h = setTimeout(() => {
      app
        .semanticSearch(query, 20)
        .then((rows) => {
          if (cancelled) return;
          setSemanticResults(rows);
          setSemanticLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === 'string'
                ? err
                : 'semantic search failed';
          setSemanticError(msg);
          setSemanticLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [query, mode, app, semanticAvailable]);

  const results = useMemo(() => {
    if (mode === 'semantic') {
      return semanticResults ?? [];
    }
    const pinned = app.items.filter((i) => i.pinned);
    const rest = app.items.filter((i) => !i.pinned);
    const ordered = [...pinned, ...rest];
    return searchItems(ordered, query, mode);
  }, [app.items, query, mode, semanticResults]);

  const MAX_VISIBLE = 8;
  const displayResults = results.slice(0, MAX_VISIBLE);
  const lastIdx = Math.max(0, displayResults.length - 1);
  const selectedItem = displayResults[selected] ?? null;

  useEffect(() => {
    setSelected(0);
  }, [query, mode]);

  useEffect(() => {
    setSelected((s) => Math.min(s, lastIdx));
  }, [lastIdx]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-i="${selected}"]`);
    (el as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, lastIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = displayResults[selected];
      if (it) {
        app.copyItem(it.id);
        onClose();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setMode((m) => (m === 'fuzzy' ? 'semantic' : 'fuzzy'));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      const it = displayResults[selected];
      if (it) app.pinItem(it.id);
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      const it = displayResults[selected];
      if (it) {
        app.deleteItem(it.id);
        setSelected((s) => Math.min(s, lastIdx - 1));
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setMode((m) => (m === 'fuzzy' ? 'semantic' : 'fuzzy'));
    }
  };

  return (
    <div
      className="absolute inset-0 z-[500] flex items-stretch justify-stretch bg-transparent"
      style={{ animation: 'paletteFadeIn 150ms ease' }}
    >
      <div
        onKeyDown={onKey}
        tabIndex={-1}
        className="flex h-full max-h-full w-full overflow-hidden rounded-[14px] bg-surface font-sans text-fg"
        style={{
          backdropFilter: 'blur(40px) saturate(160%)',
          WebkitBackdropFilter: 'blur(40px) saturate(160%)',
          boxShadow: `inset 0 0 0 1px var(--border-default),
                      0 80px 160px -30px rgba(0,0,0,${t.dark ? 0.75 : 0.3}),
                      0 20px 40px -10px rgba(0,0,0,${t.dark ? 0.5 : 0.14})`,
          animation: 'paletteScaleIn 180ms cubic-bezier(.2,.9,.3,1.1)',
        }}
      >
        <div className="flex flex-[0_0_380px] flex-col overflow-hidden border-r border-border-subtle">
          <div className="flex h-14 items-center gap-3 border-b border-border-subtle px-4">
            <LuSearch
              size={16}
              className={`shrink-0 transition-colors duration-150 ${
                mode === 'semantic' ? 'text-accent' : 'text-fg-faint'
              }`}
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === 'semantic' ? 'Describe what you need…' : 'Search clipboard history'
              }
              className="min-w-0 flex-1 border-none bg-transparent font-sans text-lg font-normal tracking-[-0.2px] text-fg outline-none"
            />
            <Button
              size="sm"
              variant={mode === 'semantic' ? 'primary' : 'secondary'}
              onClick={() => setMode((m) => (m === 'fuzzy' ? 'semantic' : 'fuzzy'))}
              title="Tab to toggle"
              leadingIcon={
                <span
                  className={`h-[5px] w-[5px] rounded-full ${
                    mode === 'semantic' ? 'bg-fg-inverse' : 'bg-fg-faint'
                  }`}
                />
              }
              trailingIcon={<Kbd size="sm">Tab</Kbd>}
            >
              {mode}
            </Button>
          </div>

          <div ref={listRef} className="min-h-[120px] flex-1 overflow-auto p-1.5">
            {results.length === 0 && (
              <div className="px-5 py-12 text-center text-[13px] leading-[1.6] text-fg-faint">
                {mode === 'semantic' && !semanticAvailable ? (
                  <>
                    <b className="text-fg">Semantic search is off.</b>
                    <br />
                    <span className="text-[11.5px]">
                      Open the main window and click <b>AI</b> to configure.
                    </span>
                    <br />
                    Press <Kbd size="sm">Tab</Kbd> to fall back to fuzzy.
                  </>
                ) : mode === 'semantic' && semanticLoading ? (
                  'Thinking…'
                ) : mode === 'semantic' && semanticError ? (
                  <>
                    <b className="text-fg">Semantic search failed.</b>
                    <br />
                    <span className="text-[11.5px]">{semanticError}</span>
                    <br />
                    Press <Kbd size="sm">Tab</Kbd> to fall back to fuzzy.
                  </>
                ) : app.items.length === 0 ? (
                  <>
                    Clipboard is empty.
                    <br />
                    <span className="text-[11.5px]">Copy anything and it lands here.</span>
                  </>
                ) : query ? (
                  <>
                    No matches for <b className="text-fg">"{query}"</b>.<br />
                    Press <Kbd size="sm">Tab</Kbd> to try semantic search.
                  </>
                ) : (
                  'Clipboard is empty.'
                )}
              </div>
            )}
            {displayResults.map((item, i) => (
              <PaletteRow
                key={item.id}
                t={t}
                item={item}
                index={i}
                selected={i === selected}
                query={query}
                showLabels={showLabels}
                categoryMode={categoryMode}
                getImage={app.getImage}
                onMouseEnter={() => setSelected(i)}
                onClick={() => {
                  app.copyItem(item.id);
                  onClose();
                }}
              />
            ))}
          </div>

          <div
            className="flex h-[34px] items-center justify-between border-t border-border-subtle px-3.5 text-[11px] text-fg-faint"
            style={{ background: t.dark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.015)' }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
              <span className="flex shrink-0 items-center gap-1.5">
                <Kbd size="sm">↑↓</Kbd> nav
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Kbd size="sm">↵</Kbd> paste
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Kbd size="sm">⌘P</Kbd> pin
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Kbd size="sm">⌘⌫</Kbd> del
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span>
                {results.length > MAX_VISIBLE
                  ? `${MAX_VISIBLE} of ${results.length}`
                  : results.length}{' '}
                {query ? 'matches' : 'items'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-subtle">
          {selectedItem ? (
            <>
              <div className="border-b border-border-subtle bg-surface px-5 py-3.5">
                <div className="mb-2 flex min-h-4 items-center gap-2.5">
                  <CategoryChip t={t} cat={selectedItem.category} mode="chip" />
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] tabular-nums text-fg-faint">
                    {selectedItem.source} · {relTime(selectedItem.minutesAgo)}
                  </span>
                  {selectedItem.pinned && (
                    <LuPin
                      size={12}
                      className="shrink-0 fill-current text-accent"
                      aria-label="pinned"
                    />
                  )}
                </div>
                <div className="flex items-center gap-2.5 text-[15px] font-semibold leading-[1.3] tracking-[-0.2px] text-fg">
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {selectedItem.label}
                  </span>
                  {!selectedItem.labelGenerated && (
                    <span className="shrink-0 rounded-[3px] border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase leading-none tracking-widest text-fg-faint">
                      Pending
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-1 items-start justify-center overflow-auto p-4">
                {selectedItem.category === 'image' ? (
                  <ImagePreview t={t} item={selectedItem} getImage={app.getImage} />
                ) : (
                  <div className="w-full max-w-[400px] whitespace-pre-wrap break-all font-mono text-[13px] leading-[1.5] text-fg">
                    <ItemBody t={t} item={selectedItem} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 border-t border-border-subtle bg-surface/60 px-4 py-2.5">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    app.copyItem(selectedItem.id);
                    onClose();
                  }}
                  leadingIcon={<LuCopy size={13} />}
                  trailingIcon={
                    <Kbd size="sm" style={onAccentStyle}>
                      ↵
                    </Kbd>
                  }
                >
                  Copy
                </Button>

                <div className="mx-1.5 h-5 w-px shrink-0 bg-border-subtle" />

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => app.pinItem(selectedItem.id)}
                  leadingIcon={selectedItem.pinned ? <LuPinOff size={13} /> : <LuPin size={13} />}
                  trailingIcon={<Kbd size="sm">⌘P</Kbd>}
                >
                  {selectedItem.pinned ? 'Unpin' : 'Pin'}
                </Button>

                <div className="mx-1.5 h-5 w-px shrink-0 bg-border-subtle" />

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    app.deleteItem(selectedItem.id);
                    setSelected((s) => Math.max(0, s - 1));
                  }}
                  leadingIcon={<LuTrash2 size={13} />}
                  trailingIcon={<Kbd size="sm">⌘⌫</Kbd>}
                >
                  Delete
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[13px] text-fg-faint">
              Select an item to preview
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes paletteFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes paletteScaleIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
