import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useImageUrl } from '../hooks/useImageUrl';
import { useWindowSize } from '../hooks/useWindowSize';
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
  TimeWindowDto,
} from '../lib/types';
import { invoke } from '@tauri-apps/api/core';
import type { AppState } from '../hooks/useAppState';
import {
  Box,
  Button,
  Dot,
  Grid,
  IconButton,
  Image,
  Inline,
  Input,
  Kbd,
  Overline,
  Stack,
  Text,
  Tooltip,
} from 'ember-design-system';
import { getKeyIcon } from '../lib/keyIcons';
import {
  LuCalendar,
  LuList,
  LuEllipsis,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPanelRightClose,
  LuPanelRightOpen,
  LuPin,
  LuSearch,
  LuSparkles,
  LuTextSearch,
  LuX,
} from 'react-icons/lu';
import { CategoryChip } from '../components/Primitives';
import { PreviewPane } from '../components/PreviewPane';
import { SidebarRow } from '../components/SidebarRow';
import { MdKeyboardCommandKey } from 'react-icons/md';

const SIDEBAR_BREAKPOINT = 640;
const PREVIEW_BREAKPOINT = 960;

interface LibraryProps {
  t: Theme;
  showLabels: boolean;
  categoryMode: CategoryDisplay;
  previewMode: PreviewMode;
  app: AppState;
  /** Whether semantic search (embedding) provider is active. */
  semanticAvailable: boolean;
  /** When semantic is unavailable, the reason in human-readable form. Drives
   *  the inline strip in the empty state so users know *why* it's off. */
  semanticOffMessage: string | null;
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
  /** When false, AI labels are off — `!labelGenerated` is the final state, not pending. */
  aiLabelsEnabled: boolean;
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
  offMessage: string | null;
  error: string | null;
  loading: boolean;
}

const BANNER_BORDER = { borderBottom: '1px solid var(--border-subtle)' } as const;

function SemanticBanner({ t, count, available, offMessage, error, loading }: SemanticBannerProps) {
  void t;
  if (!available) {
    return (
      <Inline gap={2} px={3} py={2} bg="subtle" style={BANNER_BORDER}>
        <Dot tone="danger" size="xs" />
        <Text family="mono" size={11} weight="medium" tone="secondary" truncate grow>
          {offMessage ?? 'Semantic search is off'}
        </Text>
      </Inline>
    );
  }
  if (error) {
    return (
      <Inline gap={2} px={3} py={2} bg="subtle" style={BANNER_BORDER}>
        <Dot tone="danger" size="xs" />
        <Text family="mono" size={11} weight="medium" tone="secondary">
          Semantic search failed
        </Text>
        <Text family="mono" size={11} tone="secondary" truncate grow style={{ opacity: 0.75 }}>
          {error}
        </Text>
      </Inline>
    );
  }
  if (loading) {
    return (
      <Inline gap={2} px={3} py={2} bg="accent-soft" style={BANNER_BORDER}>
        <Dot tone="accent" size="xs" style={{ opacity: 0.6 }} />
        <Text family="mono" size={11} weight="medium" tone="accent-ink">
          Thinking…
        </Text>
        <Text family="mono" size={11} tone="accent-ink" style={{ opacity: 0.6 }}>
          embedding query
        </Text>
      </Inline>
    );
  }
  return (
    <Inline gap={2} px={3} py={2} bg="accent-soft" style={BANNER_BORDER}>
      <Dot tone="accent" size="xs" />
      <Text family="mono" size={11} weight="medium" tone="accent-ink">
        {count} semantic match{count === 1 ? '' : 'es'}
      </Text>
      <Text family="mono" size={11} tone="accent-ink" style={{ opacity: 0.6 }}>
        ranked by intent
      </Text>
    </Inline>
  );
}

interface TimeChipProps {
  t: Theme;
  window: TimeWindowDto;
  onDismiss: () => void;
}

/// Inline chip shown when the search query contains a date phrase the
/// backend parsed out ("4 days ago", "last week"). The tooltip exposes
/// the absolute range; clicking × strips the phrase from the query via
/// the `strip_time` Tauri command.
function TimeChip({ t, window: w, onDismiss }: TimeChipProps) {
  void t;
  const range = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };
    const from = new Date(w.fromMs).toLocaleDateString(undefined, opts);
    const to = new Date(w.toMs).toLocaleDateString(undefined, opts);
    return from === to ? from : `${from} — ${to}`;
  }, [w.fromMs, w.toMs]);

  return (
    <Inline gap={2} px={3} py={2} bg="subtle" style={BANNER_BORDER} align="center">
      <Tooltip
        content={
          <Text size={11} tone="secondary">
            {range}
          </Text>
        }
      >
        <Inline
          gap={1}
          align="center"
          px={2}
          py={1}
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: 999,
            background: 'var(--surface)',
          }}
        >
          <LuCalendar size={11} color="var(--text-secondary)" />
          <Text family="mono" size={11} weight="medium" tone="secondary">
            {w.label}
          </Text>
          <IconButton
            aria-label="Clear date filter"
            icon={<LuX size={10} />}
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            style={{ marginLeft: 2 }}
          />
        </Inline>
      </Tooltip>
      <Text family="mono" size={11} tone="tertiary" style={{ opacity: 0.7 }}>
        filtering by date
      </Text>
    </Inline>
  );
}

const NO_IMAGE = (): Promise<Blob | null> => Promise.resolve(null);

function SidebarIcon({ active, children }: { t: Theme; active: boolean; children: ReactNode }) {
  return (
    <Box
      display="inline-flex"
      align="center"
      justify="center"
      shrink={0}
      style={{
        width: 16,
        height: 16,
        color: active ? 'var(--accent-ember-500)' : 'var(--text-tertiary)',
      }}
    >
      {children}
    </Box>
  );
}

function SidebarCount({ children }: { t: Theme; children: ReactNode }) {
  return (
    <Text family="mono" size={11} tone="tertiary" tabularNums shrink>
      {children}
    </Text>
  );
}

function SidebarHeading({ children }: { t: Theme; children: ReactNode }) {
  return (
    <Overline
      as="div"
      size="2xs"
      tracking="wider"
      style={{ marginTop: 16, marginBottom: 6, paddingLeft: 10, paddingRight: 10 }}
    >
      {children}
    </Overline>
  );
}

function ListRow({
  t,
  item,
  showLabels,
  categoryMode,
  aiLabelsEnabled,
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
  const labelPending = !item.labelGenerated && aiLabelsEnabled;

  return (
    <Box
      data-id={item.id}
      onClick={onClick}
      onDoubleClick={onDouble}
      position="relative"
      interactive
      radius="md"
      px={3}
      bg={selected ? 'accent-soft' : 'transparent'}
      style={{ paddingTop: t.dense ? 8 : 10, paddingBottom: t.dense ? 8 : 10 }}
    >
      <Inline gap={2} style={{ marginBottom: 4, minHeight: 16 }}>
        {categoryMode === 'chip' && <CategoryChip t={t} cat={item.category} mode="mono" />}
        {categoryMode === 'icon' && <CategoryChip t={t} cat={item.category} mode="icon" />}
        {categoryMode === 'dot' && <CategoryChip t={t} cat={item.category} mode="dot" />}
        {item.pinned && (
          <LuPin
            size={11}
            color="var(--accent-ember-500)"
            style={{ flexShrink: 0, fill: 'currentColor' }}
            aria-label="pinned"
          />
        )}
        <Box grow={1} />
        <Text family="mono" size={10.5} leading={1} tabularNums tone="tertiary">
          {relTime(item.minutesAgo)}
        </Text>
      </Inline>
      {showLabels && (
        <Inline
          title={labelPending ? 'Awaiting AI label' : undefined}
          style={{ gap: 6, marginBottom: 4, overflow: 'hidden' }}
        >
          <Text
            as="span"
            size={t.dense ? 12.5 : 13.5}
            leading={1.3}
            tracking="tight"
            truncate
            weight={labelPending ? 'regular' : 'medium'}
            italic={labelPending}
            tone={labelPending ? 'secondary' : 'primary'}
          >
            {highlightMatch(t, item.label, query)}
          </Text>
          {labelPending && (
            <LuEllipsis
              size={11}
              aria-hidden="true"
              color="var(--text-tertiary)"
              style={{ flexShrink: 0 }}
            />
          )}
        </Inline>
      )}
      <Text
        as="div"
        family={isMono ? 'mono' : 'sans'}
        size={11.5}
        leading={1.4}
        tone="secondary"
        truncate
      >
        {isImage ? (
          imageUrl ? (
            <Image
              src={imageUrl}
              alt={item.preview}
              radius="sm"
              bg
              fit="contain"
              style={{ height: 40 }}
            />
          ) : (
            <Text tone="tertiary">Loading...</Text>
          )
        ) : (
          item.preview
        )}
      </Text>
    </Box>
  );
}

export function Library({
  t,
  showLabels,
  categoryMode,
  previewMode,
  app,
  semanticAvailable,
  semanticOffMessage,
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
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? app.items[0]?.id ?? null
  );
  const [editingId, setEditingId] = useState<string | null>(
    initialEditing ? (initialSelectedId ?? app.items[0]?.id ?? null) : null
  );
  const [localPreview, setLocalPreview] = useState<PreviewMode>(previewMode);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [previewOverlayOpen, setPreviewOverlayOpen] = useState(false);

  const { width: viewportWidth } = useWindowSize();
  const sidebarFloating = viewportWidth < SIDEBAR_BREAKPOINT;
  const previewAllowed = viewportWidth >= PREVIEW_BREAKPOINT;
  const effectivePreview: PreviewMode = previewAllowed ? localPreview : 'inline';
  const previewOverlayAvailable = !previewAllowed;

  useEffect(() => {
    setLocalPreview(previewMode);
  }, [previewMode]);

  useEffect(() => {
    if (!sidebarFloating) setSidebarOpen(false);
  }, [sidebarFloating]);

  useEffect(() => {
    if (!previewOverlayAvailable) setPreviewOverlayOpen(false);
  }, [previewOverlayAvailable]);

  useEffect(() => {
    if (!selectedId) setPreviewOverlayOpen(false);
  }, [selectedId]);

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
    return items;
  }, [app.items, filter]);

  const [semanticResults, setSemanticResults] = useState<typeof app.items | null>(null);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [detectedTime, setDetectedTime] = useState<TimeWindowDto | null>(null);

  useEffect(() => {
    if (mode !== 'semantic' || !query.trim()) {
      setSemanticResults(null);
      setSemanticError(null);
      setDetectedTime(null);
      return;
    }
    if (!semanticAvailable) {
      setSemanticResults([]);
      setSemanticError(null);
      setDetectedTime(null);
      return;
    }
    let cancelled = false;
    const h = setTimeout(() => {
      app
        .semanticSearch(query, 50)
        .then((resp) => {
          if (cancelled) return;
          setSemanticResults(resp.items);
          setDetectedTime(resp.timeWindow);
          setSemanticError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'failed';
          setSemanticError(msg);
          setSemanticResults([]);
          setDetectedTime(null);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [query, mode, app, semanticAvailable]);

  const dismissTimeChip = useCallback(async () => {
    try {
      const stripped = await invoke<string>('strip_time', { query });
      setQuery(stripped);
    } catch {
      // Defensive: if the backend hiccups, just drop the chip and leave the
      // input as-is — the user can clear the phrase manually.
      setDetectedTime(null);
    }
  }, [query]);

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
      if (previewOverlayOpen) {
        setPreviewOverlayOpen(false);
        return;
      }
      if (sidebarFloating && sidebarOpen) {
        setSidebarOpen(false);
        return;
      }
      if (query) setQuery('');
      else searchRef.current?.blur();
      return;
    }
    if (e.key === '/' && !inSearch) {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (inSearch && e.key === 'Tab') {
      e.preventDefault();
      if (mode === 'fuzzy' && !semanticAvailable) return;
      if (mode === 'fuzzy') setMode('semantic');
      else setMode('fuzzy');
    }
    const hasMod = e.metaKey || e.ctrlKey;
    if (inSearch && !hasMod && e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter')
      return;

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
      if (previewAllowed) {
        setLocalPreview((p) => (p === 'split' ? 'inline' : 'split'));
      } else if (current) {
        setPreviewOverlayOpen((v) => !v);
      }
    } else if (e.key >= '1' && e.key <= '9' && !inSearch) {
      e.preventDefault();
      const idx = parseInt(e.key, 10) - 1;
      const all: Filter[] = ['all', 'pinned', ...CATEGORIES];
      if (all[idx]) setFilter(all[idx]);
    }
  };

  return (
    <Stack
      tabIndex={0}
      onKeyDown={onKey}
      fullHeight
      fullWidth
      bg="surface"
      style={{ outline: 'none', position: 'relative' }}
    >
      <Inline align="stretch" grow={1} style={{ minHeight: 0, position: 'relative' }}>
        {/* Backdrop for floating sidebar */}
        {sidebarFloating && sidebarOpen && (
          <Box
            onClick={() => setSidebarOpen(false)}
            position="absolute"
            style={{
              inset: 0,
              zIndex: 90,
              background: 'rgba(0,0,0,0.32)',
              animation: 'paletteFadeIn 140ms ease',
            }}
            aria-hidden
          />
        )}

        {/* Sidebar */}
        <Stack
          shrink={0}
          grow={0}
          px={2}
          py={3}
          bg="surface"
          style={{
            flexBasis: 'auto',
            width: sidebarFloating ? 240 : 'clamp(180px, 22%, 220px)',
            minHeight: 0,
            borderRight: '1px solid var(--border-subtle)',
            fontSize: 13,
            position: sidebarFloating ? 'absolute' : 'relative',
            top: 0,
            bottom: 0,
            left: 0,
            zIndex: sidebarFloating ? 100 : undefined,
            transform: sidebarFloating && !sidebarOpen ? 'translateX(-100%)' : 'translateX(0)',
            transition: sidebarFloating ? 'transform 180ms cubic-bezier(.2,.9,.3,1.1)' : undefined,
            boxShadow: sidebarFloating && sidebarOpen ? '0 12px 32px rgba(0,0,0,0.18)' : undefined,
            pointerEvents: sidebarFloating && !sidebarOpen ? 'none' : undefined,
          }}
        >
          <Stack grow={1} overflow="auto" style={{ minHeight: 0 }}>
            <SidebarRow t={t} active={filter === 'all'} onClick={() => setFilter('all')}>
              <SidebarIcon t={t} active={filter === 'all'}>
                <LuList size={12} />
              </SidebarIcon>
              <Box grow={1} style={{ minWidth: 0 }}>
                All items
              </Box>
              <SidebarCount t={t}>{counts.all}</SidebarCount>
            </SidebarRow>
            <SidebarRow t={t} active={filter === 'pinned'} onClick={() => setFilter('pinned')}>
              <SidebarIcon t={t} active={filter === 'pinned'}>
                <LuPin
                  size={12}
                  style={filter === 'pinned' ? { fill: 'currentColor' } : undefined}
                />
              </SidebarIcon>
              <Box grow={1} style={{ minWidth: 0 }}>
                Pinned
              </Box>
              <SidebarCount t={t}>{counts.pinned}</SidebarCount>
            </SidebarRow>

            <SidebarHeading t={t}>Categories</SidebarHeading>
            {CATEGORIES.map((cat: Category) => {
              const meta = CATEGORY_META[cat];
              return (
                <SidebarRow key={cat} t={t} active={filter === cat} onClick={() => setFilter(cat)}>
                  <Box
                    display="inline-flex"
                    align="center"
                    justify="center"
                    shrink={0}
                    style={{ width: 16 }}
                  >
                    <CategoryChip t={t} cat={cat} mode="dot" />
                  </Box>
                  <Box grow={1} style={{ minWidth: 0 }}>
                    {meta.label}
                  </Box>
                  <SidebarCount t={t}>{counts[cat] || 0}</SidebarCount>
                </SidebarRow>
              );
            })}
          </Stack>

          <Grid
            shrink={0}
            columns="auto 1fr auto 1fr"
            align="center"
            px={2}
            py={2}
            style={{
              paddingBottom: 4,
              columnGap: 6,
              rowGap: 8,
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <Kbd size="sm">/</Kbd>
            <Text family="mono" size={10.5} tone="tertiary">
              search
            </Text>
            <Kbd size="sm">1–9</Kbd>
            <Text family="mono" size={10.5} tone="tertiary">
              filter
            </Text>
            <Kbd size="sm">E</Kbd>
            <Text family="mono" size={10.5} tone="tertiary">
              rename
            </Text>
            <Kbd size="sm">
              <MdKeyboardCommandKey />I
            </Kbd>
            <Text family="mono" size={10.5} tone="tertiary">
              preview
            </Text>
          </Grid>
        </Stack>

        {/* List column */}
        <Stack
          shrink={1}
          grow={1}
          style={{
            minHeight: 0,
            minWidth: 0,
            flexBasis: 0,
            borderRight:
              effectivePreview === 'split' ? '1px solid var(--border-subtle)' : undefined,
          }}
        >
          {/* Search row */}
          <Box style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <Inline gap={2} px={3} py={3} overflow="hidden">
              {sidebarFloating && (
                <Tooltip
                  content={
                    <Text size={11} tone="secondary">
                      {sidebarOpen ? 'Hide filters' : 'Show filters'}
                    </Text>
                  }
                >
                  <IconButton
                    aria-label={sidebarOpen ? 'Hide filters' : 'Show filters'}
                    icon={
                      sidebarOpen ? <LuPanelLeftClose size={14} /> : <LuPanelLeftOpen size={14} />
                    }
                    variant={sidebarOpen ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setSidebarOpen((v) => !v)}
                  />
                </Tooltip>
              )}
              <Input
                leadingIcon={
                  <LuSearch
                    size={13}
                    color={mode === 'semantic' ? 'var(--accent-ember-500)' : 'var(--text-tertiary)'}
                    style={{ flexShrink: 0, transition: 'color 150ms' }}
                  />
                }
                inputSize="md"
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === 'semantic' ? 'Describe what you need…' : 'Search history…'}
              />
              <Button
                size="md"
                variant={mode === 'semantic' ? 'primary' : 'ghost'}
                onClick={() => {
                  if (mode === 'fuzzy' && !semanticAvailable) return;
                  setMode((m) => (m === 'fuzzy' ? 'semantic' : 'fuzzy'));
                }}
                leadingIcon={
                  mode === 'semantic' ? (
                    <LuSparkles size={13} color="var(--text-inverse)" />
                  ) : (
                    <LuTextSearch size={13} color="var(--text-tertiary)" />
                  )
                }
                style={{
                  minWidth: 0,
                  width: viewportWidth < 600 ? 38 : 100,
                  paddingLeft: viewportWidth < 600 ? 8 : undefined,
                  paddingRight: viewportWidth < 600 ? 8 : undefined,
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {viewportWidth < 600 ? '' : mode}
              </Button>
              {previewOverlayAvailable && current && (
                <Tooltip
                  content={
                    <Inline gap={1} align="center">
                      <Text size={11} tone="secondary">
                        {previewOverlayOpen ? 'Hide preview' : 'Show preview'}
                      </Text>
                      <Kbd size="sm">
                        <MdKeyboardCommandKey size={10} />
                      </Kbd>
                      <Kbd size="sm">I</Kbd>
                    </Inline>
                  }
                >
                  <IconButton
                    aria-label={previewOverlayOpen ? 'Hide preview' : 'Show preview'}
                    icon={
                      previewOverlayOpen ? (
                        <LuPanelRightClose size={14} />
                      ) : (
                        <LuPanelRightOpen size={14} />
                      )
                    }
                    variant={previewOverlayOpen ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setPreviewOverlayOpen((v) => !v)}
                  />
                </Tooltip>
              )}
            </Inline>
          </Box>

          {detectedTime && mode === 'semantic' && query && (
            <TimeChip t={t} window={detectedTime} onDismiss={dismissTimeChip} />
          )}

          {query && mode === 'semantic' ? (
            <SemanticBanner
              t={t}
              count={searched.length}
              available={semanticAvailable}
              offMessage={semanticOffMessage}
              error={semanticError}
              loading={semanticResults === null && !semanticError}
            />
          ) : (
            <Box aria-hidden style={{ height: 34, borderBottom: '1px solid transparent' }} />
          )}

          <Box ref={listRef} grow={1} overflow="auto" p={1}>
            {searched.length === 0 && (
              <Box px={5} style={{ paddingTop: 48, paddingBottom: 48, textAlign: 'center' }}>
                <Text size={12.5} leading={1.6} tone="tertiary">
                  {app.items.length === 0 ? (
                    <>
                      No clips yet.
                      <br />
                      Copy anything and it lands here automatically.
                    </>
                  ) : query ? (
                    mode === 'semantic' && !semanticAvailable ? (
                      <>
                        <Text as="b" weight="semibold" tone="primary">
                          {semanticOffMessage ?? 'Semantic search is unavailable.'}
                        </Text>
                        <br />
                        Click{' '}
                        <Text as="b" weight="semibold" tone="primary">
                          AI
                        </Text>{' '}
                        in the title bar to configure a provider,
                        <br />
                        or press <Kbd size="sm">{getKeyIcon('Tab')}</Kbd> to search fuzzy.
                      </>
                    ) : mode === 'semantic' && semanticError ? (
                      <>
                        Semantic search failed.
                        <br />
                        <Text tone="secondary">{semanticError}</Text>
                        <br />
                        Press <Kbd size="sm">{getKeyIcon('Tab')}</Kbd> to fall back to fuzzy.
                      </>
                    ) : (
                      <>
                        Nothing matches.
                        <br />
                        Press <Kbd size="sm">{getKeyIcon('Tab')}</Kbd> to{' '}
                        {mode === 'fuzzy' ? 'search semantically' : 'search again'}.
                      </>
                    )
                  ) : (
                    'No items in this filter.'
                  )}
                </Text>
              </Box>
            )}
            {showGroups
              ? Object.entries(groups).map(([g, items]) =>
                  items.length === 0 ? null : (
                    <Box key={g} style={{ marginBottom: 8 }}>
                      <Overline
                        as="div"
                        size="2xs"
                        tracking="wider"
                        style={{
                          paddingLeft: 10,
                          paddingRight: 10,
                          paddingTop: 8,
                          paddingBottom: 4,
                        }}
                      >
                        {g} · {items.length}
                      </Overline>
                      {items.map((item) => (
                        <ListRow
                          key={item.id}
                          t={t}
                          item={item}
                          showLabels={showLabels}
                          categoryMode={categoryMode}
                          aiLabelsEnabled={anthropicEnabled}
                          selected={item.id === selectedId}
                          onClick={() => setSelectedId(item.id)}
                          onDouble={() => app.copyItem(item.id)}
                          query={query}
                          getImage={app.getImage}
                        />
                      ))}
                    </Box>
                  )
                )
              : searched.map((item) => (
                  <ListRow
                    key={item.id}
                    t={t}
                    item={item}
                    showLabels={showLabels}
                    categoryMode={categoryMode}
                    aiLabelsEnabled={anthropicEnabled}
                    selected={item.id === selectedId}
                    onClick={() => setSelectedId(item.id)}
                    onDouble={() => app.copyItem(item.id)}
                    query={query}
                    getImage={app.getImage}
                  />
                ))}
          </Box>

          <Inline
            justify="between"
            px={3}
            py={2}
            bg="subtle"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <Text family="mono" size={10.5} tabularNums tone="tertiary">
              <Text as="span" tone="secondary">
                {searched.length}
              </Text>
              <Text as="span" style={{ opacity: 0.6 }}>
                {' '}
                / {app.items.length}
              </Text>
            </Text>
            <Inline style={{ gap: 6 }}>
              <Dot tone="success" size="xs" />
              <Text
                family="mono"
                size={10.5}
                tone="tertiary"
                transform="uppercase"
                tracking="widest"
              >
                local
              </Text>
              <Text family="mono" size={10.5} tone="tertiary" style={{ opacity: 0.5 }}>
                ·
              </Text>
              <Text family="mono" size={10.5} tabularNums tone="tertiary">
                {(app.items.length * 0.4).toFixed(1)} KB
              </Text>
            </Inline>
          </Inline>
        </Stack>

        {effectivePreview === 'split' && current && (
          <Box
            grow={0}
            shrink={0}
            style={{
              flexBasis: 'auto',
              width: 'clamp(340px, 42%, 520px)',
              minWidth: 0,
              display: 'flex',
            }}
          >
            <PreviewPane
              t={t}
              item={current}
              showLabels={showLabels}
              editing={editingId === current.id}
              setEditing={(v) => setEditingId(v ? current.id : null)}
              app={app}
              anthropicEnabled={anthropicEnabled}
            />
          </Box>
        )}

        {/* Right-side preview drawer for narrow widths */}
        {previewOverlayAvailable && current && (
          <>
            {previewOverlayOpen && (
              <Box
                onClick={() => setPreviewOverlayOpen(false)}
                position="absolute"
                style={{
                  inset: 0,
                  zIndex: 90,
                  background: 'rgba(0,0,0,0.32)',
                  animation: 'paletteFadeIn 140ms ease',
                }}
                aria-hidden
              />
            )}
            <Box
              position="absolute"
              style={{
                top: 0,
                right: 0,
                bottom: 0,
                width: `min(${Math.max(360, Math.min(480, viewportWidth - 80))}px, 100%)`,
                zIndex: 100,
                display: 'flex',
                transform: previewOverlayOpen ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 180ms cubic-bezier(.2,.9,.3,1.1)',
                boxShadow: previewOverlayOpen ? '-12px 0 32px rgba(0,0,0,0.18)' : undefined,
                pointerEvents: previewOverlayOpen ? undefined : 'none',
                borderLeft: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
              }}
            >
              <PreviewPane
                t={t}
                item={current}
                showLabels={showLabels}
                editing={editingId === current.id}
                setEditing={(v) => setEditingId(v ? current.id : null)}
                app={app}
                anthropicEnabled={anthropicEnabled}
              />
            </Box>
          </>
        )}
      </Inline>
    </Stack>
  );
}
