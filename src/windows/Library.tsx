import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useImageUrl } from '../hooks/useImageUrl';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { CATEGORIES, CATEGORY_META } from '../lib/category';
import { groupByTime, highlightMatch, searchItems } from '../lib/search';
import { relTime } from '../lib/time';
import type {
  Category,
  CategoryDisplay,
  ClipItem,
  Filter,
  PreviewMode,
  SearchMode,
  Theme,
  TimeFilter,
} from '../lib/types';
import type { AppState } from '../hooks/useAppState';
import { Button, Kbd } from 'ember-design-system';
import {
  LuClock,
  LuList,
  LuMaximize2,
  LuMinus,
  LuEllipsis,
  LuPin,
  LuSearch,
  LuSparkles,
  LuX,
} from 'react-icons/lu';
import { CategoryChip } from '../components/Primitives';
import { PreviewPane } from '../components/PreviewPane';
import { SidebarRow } from '../components/SidebarRow';

interface LibraryProps {
  t: Theme;
  showLabels: boolean;
  categoryMode: CategoryDisplay;
  previewMode: PreviewMode;
  app: AppState;
  /** Whether semantic search (embedding) provider is active. */
  semanticAvailable: boolean;
  /** Whether Anthropic labels are configured — controls the "Labeling…" hint. */
  anthropicEnabled: boolean;
  initialQuery?: string;
  initialMode?: SearchMode;
  initialFilter?: Filter;
  initialSelectedId?: string | null;
  initialEditing?: boolean;
}

interface ListRowProps {
  t: Theme;
  item: ClipItem;
  showLabels: boolean;
  categoryMode: CategoryDisplay;
  selected: boolean;
  onClick: () => void;
  onDouble: () => void;
  query: string;
  getImage?: (id: string) => Promise<Blob | null>;
}

interface SemanticBannerProps {
  t: Theme;
  count: number;
  available: boolean;
  error: string | null;
  loading: boolean;
}

function SemanticBanner({ t, count, available, error, loading }: SemanticBannerProps) {
  if (!available) {
    return (
      <div className="flex items-center gap-2 border-b border-border-subtle bg-subtle px-3 py-1.5 font-mono text-[11px] text-fg-muted">
        <span className="h-[5px] w-[5px] rounded-full" style={{ background: '#c94b3a' }} />
        <span className="font-medium">Semantic search is off</span>
        <span className="opacity-70">configure a provider in the AI panel</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 border-b border-border-subtle bg-subtle px-3 py-1.5 font-mono text-[11px] text-fg-muted">
        <span className="h-[5px] w-[5px] rounded-full" style={{ background: '#c94b3a' }} />
        <span className="font-medium">Semantic search failed</span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap opacity-75">{error}</span>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 border-b border-border-subtle bg-accent-soft px-3 py-1.5 font-mono text-[11px] text-accent-ink">
        <span className="h-[5px] w-[5px] rounded-full bg-accent opacity-60" />
        <span className="font-medium">Thinking…</span>
        <span className="opacity-60">embedding query</span>
      </div>
    );
  }
  // theme arg kept for prop-stable signature; no longer needed at render.
  void t;
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle bg-accent-soft px-3 py-1.5 font-mono text-[11px] text-accent-ink">
      <span className="h-[5px] w-[5px] rounded-full bg-accent" />
      <span className="font-medium">
        {count} semantic match{count === 1 ? '' : 'es'}
      </span>
      <span className="opacity-60">ranked by intent</span>
    </div>
  );
}

const NO_IMAGE = (): Promise<Blob | null> => Promise.resolve(null);

function SidebarIcon({ active, children }: { t: Theme; active: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center text-xs leading-none ${
        active ? 'text-accent' : 'text-fg-faint'
      }`}
    >
      {children}
    </span>
  );
}

function SidebarCount({ children }: { t: Theme; children: ReactNode }) {
  return (
    <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-faint">{children}</span>
  );
}

function SidebarHeading({ children }: { t: Theme; children: ReactNode }) {
  return (
    <div className="mb-1.5 mt-4 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[1.4px] text-fg-faint">
      {children}
    </div>
  );
}

function ListRow({
  t,
  item,
  showLabels,
  categoryMode,
  selected,
  onClick,
  onDouble,
  query,
  getImage,
}: ListRowProps) {
  const isMono =
    item.category === 'code' ||
    item.category === 'url' ||
    item.category === 'color' ||
    item.category === 'path' ||
    item.category === 'email' ||
    item.category === 'phone' ||
    item.category === 'number';
  const isImage = item.category === 'image';
  const imageUrl = useImageUrl(isImage ? item.id : '', getImage ?? NO_IMAGE);

  return (
    <div
      data-id={item.id}
      onClick={onClick}
      onDoubleClick={onDouble}
      className={`relative cursor-pointer rounded-md px-3 transition-colors duration-150 ${
        t.dense ? 'py-2' : 'py-2.5'
      } ${selected ? 'bg-accent-soft' : 'bg-transparent'}`}
    >
      <div className="mb-1 flex min-h-4 items-center gap-2">
        {categoryMode === 'chip' && <CategoryChip t={t} cat={item.category} mode="mono" />}
        {categoryMode === 'icon' && <CategoryChip t={t} cat={item.category} mode="icon" />}
        {categoryMode === 'dot' && <CategoryChip t={t} cat={item.category} mode="dot" />}
        {item.pinned && (
          <LuPin size={11} className="shrink-0 fill-current text-accent" aria-label="pinned" />
        )}
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] leading-none tabular-nums text-fg-faint">
          {relTime(item.minutesAgo)}
        </span>
      </div>
      {showLabels && (
        <div
          className={`mb-1 flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap leading-[1.3] tracking-[-0.1px] ${
            t.dense ? 'text-[12.5px]' : 'text-[13.5px]'
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
        className={`overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] leading-[1.4] text-fg-muted ${
          isMono ? 'font-mono' : 'font-sans'
        }`}
      >
        {isImage ? (
          imageUrl ? (
            <img
              src={imageUrl}
              alt={item.preview}
              className="h-10 rounded-sm bg-subtle object-contain"
            />
          ) : (
            <span className="text-fg-faint">Loading...</span>
          )
        ) : (
          item.preview
        )}
      </div>
    </div>
  );
}

export function Library({
  t,
  showLabels,
  categoryMode,
  previewMode,
  app,
  semanticAvailable,
  anthropicEnabled,
  initialQuery = '',
  initialMode = 'fuzzy',
  initialFilter = 'all',
  initialSelectedId = null,
  initialEditing = false,
}: LibraryProps) {
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? app.items[0]?.id ?? null
  );
  const [editingId, setEditingId] = useState<string | null>(
    initialEditing ? (initialSelectedId ?? app.items[0]?.id ?? null) : null
  );
  const [localPreview, setLocalPreview] = useState<PreviewMode>(previewMode);

  useEffect(() => {
    setLocalPreview(previewMode);
  }, [previewMode]);

  useEffect(() => {
    const unlisten = listen<string>('library-filter', (ev) => {
      const payload = ev.payload;
      const allowed: Filter[] = [
        'all',
        'pinned',
        'code',
        'url',
        'email',
        'phone',
        'color',
        'path',
        'text',
        'address',
        'number',
      ];
      if (allowed.includes(payload as Filter)) {
        setFilter(payload as Filter);
        setQuery('');
      }
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, []);

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filterStage = useMemo(() => {
    let items = app.items;
    if (filter === 'pinned') {
      items = items.filter((i) => i.pinned);
    } else if (filter !== 'all') {
      items = items.filter((i) => i.category === filter);
    }
    if (timeFilter !== 'all') {
      const now = Date.now();
      const minute = 60 * 1000;
      const day = 24 * 60 * minute;
      items = items.filter((i) => {
        const age = i.minutesAgo * minute;
        switch (timeFilter) {
          case 'today':
            return now - age < day;
          case 'yesterday': {
            const yesterdayStart = now - day;
            const yesterdayEnd = now;
            const itemTime = now - age;
            return itemTime >= yesterdayStart && itemTime < yesterdayEnd;
          }
          case 'week':
            return age < 7 * day;
          case 'month':
            return age < 30 * day;
          default:
            return true;
        }
      });
    }
    return items;
  }, [app.items, filter, timeFilter]);

  const [semanticResults, setSemanticResults] = useState<typeof app.items | null>(null);
  const [semanticError, setSemanticError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'semantic' || !query.trim()) {
      setSemanticResults(null);
      setSemanticError(null);
      return;
    }
    if (!semanticAvailable) {
      setSemanticResults([]);
      setSemanticError(null);
      return;
    }
    let cancelled = false;
    const h = setTimeout(() => {
      app
        .semanticSearch(query, 50)
        .then((rows) => {
          if (cancelled) return;
          setSemanticResults(rows);
          setSemanticError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'failed';
          setSemanticError(msg);
          setSemanticResults([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [query, mode, app, semanticAvailable]);

  const searched = useMemo(() => {
    if (mode === 'semantic') {
      if (!query.trim()) return filterStage;
      if (semanticResults === null) return filterStage;
      const allowed = new Set(filterStage.map((i) => i.id));
      return semanticResults.filter((i) => allowed.has(i.id));
    }
    return searchItems(filterStage, query, mode);
  }, [filterStage, query, mode, semanticResults]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: app.items.length,
      pinned: app.items.filter((i) => i.pinned).length,
    };
    for (const k of CATEGORIES) {
      c[k] = app.items.filter((i) => i.category === k).length;
    }
    return c;
  }, [app.items]);

  const showGroups = !query && filter === 'all';
  const groups = useMemo(() => groupByTime(searched), [searched]);

  useEffect(() => {
    if (!searched.find((i) => i.id === selectedId)) {
      setSelectedId(searched[0]?.id ?? null);
    }
  }, [searched, selectedId]);

  const selectedIdx = searched.findIndex((i) => i.id === selectedId);
  const current = searched.find((i) => i.id === selectedId) ?? null;

  const moveSel = (delta: number) => {
    const i = Math.max(0, Math.min(searched.length - 1, selectedIdx + delta));
    const item = searched[i];
    if (item) setSelectedId(item.id);
    setTimeout(() => {
      const el = listRef.current?.querySelector(`[data-id="${item?.id}"]`);
      (el as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
    }, 0);
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingId) return;
    const inSearch = document.activeElement === searchRef.current;
    if (e.key === 'Escape') {
      if (query) setQuery('');
      else searchRef.current?.blur();
      return;
    }
    if (e.key === '/' && !inSearch) {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (inSearch && e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'fuzzy') setMode('semantic');
      else if (current) app.copyItem(current.id);
      return;
    }
    if (inSearch && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      moveSel(1);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      moveSel(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (current) app.copyItem(current.id);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      if (current) app.pinItem(current.id);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (current) app.deleteItem(current.id);
    } else if (e.key.toLowerCase() === 'e' && !inSearch) {
      e.preventDefault();
      if (current) setEditingId(current.id);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      setLocalPreview((p) => (p === 'split' ? 'inline' : 'split'));
    } else if (e.key >= '1' && e.key <= '9' && !inSearch) {
      e.preventDefault();
      const idx = parseInt(e.key, 10) - 1;
      const all: Filter[] = ['all', 'pinned', ...CATEGORIES];
      if (all[idx]) setFilter(all[idx]);
    }
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={onKey}
      className="flex h-full w-full flex-col bg-surface font-sans text-fg outline-none"
    >
      {/* Title bar */}
      <div
        data-tauri-drag-region
        className="flex h-10 shrink-0 select-none items-center justify-between border-b border-border-subtle pl-3.5"
      >
        <div data-tauri-drag-region className="flex items-center gap-2.5">
          <div
            data-tauri-drag-region
            className="grid h-[18px] w-[18px] place-items-center rounded text-fg-inverse"
            style={{
              background:
                'linear-gradient(135deg, var(--accent-ember-500) 0%, var(--accent-ember-700) 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.15)',
            }}
          >
            <LuSparkles size={11} />
          </div>
          <div
            data-tauri-drag-region
            className="font-sans text-[13px] font-semibold tracking-[-0.2px] text-fg"
          >
            Yank
          </div>
          <span
            data-tauri-drag-region
            className="rounded-[3px] border border-border-subtle px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.4px] text-fg-faint"
          >
            v0.6.4
          </span>
        </div>
        <div className="flex self-stretch">
          {(
            [
              [
                <LuMinus size={12} />,
                'Minimize',
                async () => {
                  await getCurrentWindow().minimize();
                },
              ],
              [
                <LuMaximize2 size={11} />,
                'Maximize',
                async () => {
                  await getCurrentWindow().toggleMaximize();
                },
              ],
              [
                <LuX size={12} />,
                'Close',
                async () => {
                  await getCurrentWindow().close();
                },
              ],
            ] as const
          ).map(([g, title, action], i) => {
            const isClose = i === 2;
            return (
              <button
                key={i}
                title={title}
                data-tauri-drag-region="false"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  action();
                }}
                className={`grid h-10 w-[46px] cursor-pointer place-items-center border-none bg-transparent text-[11px] text-fg-muted transition-colors duration-150 ${
                  isClose ? 'hover:bg-danger hover:text-fg-inverse' : 'hover:text-fg'
                }`}
                style={
                  !isClose
                    ? {
                        // Tailwind alpha utility on a CSS-var color is finicky; this
                        // matches the original "primary text at 8% over canvas" wash.
                        ['--hover-bg' as string]:
                          'color-mix(in oklab, var(--text-primary) 8%, transparent)',
                      }
                    : undefined
                }
                onMouseEnter={(e) => {
                  if (!isClose) {
                    (e.currentTarget as HTMLElement).style.background =
                      'color-mix(in oklab, var(--text-primary) 8%, transparent)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isClose) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }
                }}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main body */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <div className="flex w-[200px] shrink-0 flex-col overflow-auto border-r border-border-subtle p-2 px-2 py-3 text-[13px]">
          <SidebarRow t={t} active={filter === 'all'} onClick={() => setFilter('all')}>
            <SidebarIcon t={t} active={filter === 'all'}>
              <LuList size={12} />
            </SidebarIcon>
            <span className="min-w-0 flex-1">All items</span>
            <SidebarCount t={t}>{counts.all}</SidebarCount>
          </SidebarRow>
          <SidebarRow t={t} active={filter === 'pinned'} onClick={() => setFilter('pinned')}>
            <SidebarIcon t={t} active={filter === 'pinned'}>
              <LuPin size={12} className={filter === 'pinned' ? 'fill-current' : ''} />
            </SidebarIcon>
            <span className="min-w-0 flex-1">Pinned</span>
            <SidebarCount t={t}>{counts.pinned}</SidebarCount>
          </SidebarRow>

          <SidebarHeading t={t}>Time</SidebarHeading>
          {(
            [
              ['all', 'Any time'],
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['week', 'Last 7 days'],
              ['month', 'Last 30 days'],
            ] as [TimeFilter, string][]
          ).map(([value, label]) => (
            <SidebarRow
              key={value}
              t={t}
              active={timeFilter === value}
              onClick={() => setTimeFilter(value)}
            >
              <SidebarIcon t={t} active={timeFilter === value}>
                <LuClock size={12} />
              </SidebarIcon>
              <span className="min-w-0 flex-1">{label}</span>
            </SidebarRow>
          ))}

          <SidebarHeading t={t}>Categories</SidebarHeading>
          {CATEGORIES.map((cat: Category) => {
            const meta = CATEGORY_META[cat];
            return (
              <SidebarRow key={cat} t={t} active={filter === cat} onClick={() => setFilter(cat)}>
                <span className="inline-flex w-4 shrink-0 items-center justify-center">
                  <CategoryChip t={t} cat={cat} mode="dot" />
                </span>
                <span className="min-w-0 flex-1">{meta.label}</span>
                <SidebarCount t={t}>{counts[cat] || 0}</SidebarCount>
              </SidebarRow>
            );
          })}

          <div className="mt-auto flex flex-col gap-2 px-2.5 pb-1 pt-4 font-mono text-[10.5px] leading-none tracking-[0.3px] text-fg-faint">
            <div className="flex flex-wrap items-center gap-1.5">
              <Kbd size="sm">/</Kbd>
              <span>search</span>
              <span className="flex-1" />
              <Kbd size="sm">1–9</Kbd>
              <span>filter</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Kbd size="sm">E</Kbd>
              <span>rename</span>
              <span className="flex-1" />
              <Kbd size="sm">⌘I</Kbd>
              <span>preview</span>
            </div>
          </div>
        </div>

        {/* List column */}
        <div
          className={`flex min-h-0 min-w-[320px] shrink-0 flex-col ${
            localPreview === 'split' ? 'w-[340px] border-r border-border-subtle' : 'w-auto flex-1'
          }`}
        >
          {/* Search row */}
          <div className="border-b border-border-subtle px-3 py-2.5">
            <div className="flex h-8 items-center gap-2.5 rounded-lg border border-border-subtle bg-subtle pl-2.5 pr-1.5">
              <LuSearch
                size={13}
                className={`shrink-0 transition-colors duration-150 ${
                  mode === 'semantic' ? 'text-accent' : 'text-fg-faint'
                }`}
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === 'semantic' ? 'Describe what you need…' : 'Search history…'}
                className="min-w-0 flex-1 border-none bg-transparent font-sans text-[13.5px] tracking-[-0.1px] text-fg outline-none"
              />
              <Button
                size="sm"
                variant={mode === 'semantic' ? 'primary' : 'ghost'}
                onClick={() => setMode((m) => (m === 'fuzzy' ? 'semantic' : 'fuzzy'))}
                leadingIcon={
                  <span
                    className={`h-[5px] w-[5px] rounded-full ${
                      mode === 'semantic' ? 'bg-fg-inverse' : 'bg-fg-faint'
                    }`}
                  />
                }
              >
                {mode}
              </Button>
            </div>
          </div>

          {query && mode === 'semantic' && (
            <SemanticBanner
              t={t}
              count={searched.length}
              available={semanticAvailable}
              error={semanticError}
              loading={semanticResults === null && !semanticError}
            />
          )}

          <div ref={listRef} className="flex-1 overflow-auto p-1">
            {searched.length === 0 && (
              <div className="px-5 py-12 text-center text-[12.5px] leading-[1.6] text-fg-faint">
                {app.items.length === 0 ? (
                  <>
                    No clips yet.
                    <br />
                    Copy anything and it lands here automatically.
                  </>
                ) : query ? (
                  mode === 'semantic' && !semanticAvailable ? (
                    <>
                      Semantic search is off.
                      <br />
                      Click <b>AI</b> in the title bar to configure a provider,
                      <br />
                      or press <Kbd size="sm">Tab</Kbd> to search fuzzy.
                    </>
                  ) : mode === 'semantic' && semanticError ? (
                    <>
                      Semantic search failed.
                      <br />
                      <span className="text-fg-muted">{semanticError}</span>
                      <br />
                      Press <Kbd size="sm">Tab</Kbd> to fall back to fuzzy.
                    </>
                  ) : (
                    <>
                      Nothing matches.
                      <br />
                      Press <Kbd size="sm">Enter</Kbd> to{' '}
                      {mode === 'fuzzy' ? 'search semantically' : 'search again'}.
                    </>
                  )
                ) : (
                  'No items in this filter.'
                )}
              </div>
            )}
            {showGroups
              ? Object.entries(groups).map(([g, items]) =>
                  items.length === 0 ? null : (
                    <div key={g} className="mb-2">
                      <div className="px-2.5 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-fg-faint">
                        {g} · {items.length}
                      </div>
                      {items.map((item) => (
                        <ListRow
                          key={item.id}
                          t={t}
                          item={item}
                          showLabels={showLabels}
                          categoryMode={categoryMode}
                          selected={item.id === selectedId}
                          onClick={() => setSelectedId(item.id)}
                          onDouble={() => app.copyItem(item.id)}
                          query={query}
                          getImage={app.getImage}
                        />
                      ))}
                    </div>
                  )
                )
              : searched.map((item) => (
                  <ListRow
                    key={item.id}
                    t={t}
                    item={item}
                    showLabels={showLabels}
                    categoryMode={categoryMode}
                    selected={item.id === selectedId}
                    onClick={() => setSelectedId(item.id)}
                    onDouble={() => app.copyItem(item.id)}
                    query={query}
                    getImage={app.getImage}
                  />
                ))}
          </div>

          <div className="flex items-center justify-between border-t border-border-subtle bg-subtle px-3 py-2 font-mono text-[10.5px] tracking-[0.2px] tabular-nums text-fg-faint">
            <span>
              <span className="text-fg-muted">{searched.length}</span>
              <span className="opacity-60"> / {app.items.length}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: 'var(--status-success)' }}
                aria-hidden
              />
              <span className="uppercase tracking-widest">local</span>
              <span className="opacity-50">·</span>
              <span>{(app.items.length * 0.4).toFixed(1)} KB</span>
            </span>
          </div>
        </div>

        {localPreview === 'split' && current && (
          <PreviewPane
            t={t}
            item={current}
            showLabels={showLabels}
            editing={editingId === current.id}
            setEditing={(v) => setEditingId(v ? current.id : null)}
            app={app}
            anthropicEnabled={anthropicEnabled}
          />
        )}
      </div>
    </div>
  );
}
