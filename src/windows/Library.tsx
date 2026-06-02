import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useImageUrl } from '../hooks/useImageUrl';
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
import {
  Box,
  Button,
  Dot,
  Grid,
  Image,
  Inline,
  Input,
  Kbd,
  Overline,
  Stack,
  Text,
} from 'ember-design-system';
import { getKeyIcon } from '../lib/keyIcons';
import {
  LuClock,
  LuList,
  LuEllipsis,
  LuPin,
  LuSearch,
  LuSparkles,
  LuTextSearch,
} from 'react-icons/lu';
import { CategoryChip } from '../components/Primitives';
import { PreviewPane } from '../components/PreviewPane';
import { SidebarRow } from '../components/SidebarRow';
import { MdKeyboardCommandKey } from 'react-icons/md';

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

const BANNER_BORDER = { borderBottom: '1px solid var(--border-subtle)' } as const;

function SemanticBanner({ t, count, available, error, loading }: SemanticBannerProps) {
  void t;
  if (!available) {
    return (
      <Inline gap={2} px={3} py={2} bg="subtle" style={BANNER_BORDER}>
        <Dot tone="danger" size="xs" />
        <Text family="mono" size={11} weight="medium" tone="secondary">
          Semantic search is off
        </Text>
        <Text family="mono" size={11} tone="secondary" style={{ opacity: 0.7 }}>
          configure a provider in the AI panel
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
          title={item.labelGenerated ? undefined : 'Awaiting AI label'}
          style={{ gap: 6, marginBottom: 4, overflow: 'hidden' }}
        >
          <Text
            as="span"
            size={t.dense ? 12.5 : 13.5}
            leading={1.3}
            tracking="tight"
            truncate
            weight={item.labelGenerated ? 'medium' : 'regular'}
            italic={!item.labelGenerated}
            tone={item.labelGenerated ? 'primary' : 'secondary'}
          >
            {highlightMatch(t, item.label, query)}
          </Text>
          {!item.labelGenerated && (
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
    if (inSearch && e.key === 'Tab') {
      e.preventDefault();
      if (mode === 'fuzzy' && !semanticAvailable) return;
      if (mode === 'fuzzy') setMode('semantic');
      else setMode('fuzzy');
    }
    if (inSearch && e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'fuzzy' && !semanticAvailable) return;
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
    <Stack
      tabIndex={0}
      onKeyDown={onKey}
      fullHeight
      fullWidth
      bg="surface"
      style={{ outline: 'none' }}
    >
      <Inline align="stretch" grow={1} style={{ minHeight: 0 }}>
        {/* Sidebar */}
        <Stack
          shrink={0}
          grow={1}
          px={2}
          py={3}
          style={{
            flexBasis: '18%',
            minWidth: 200,
            maxWidth: 260,
            minHeight: 0,
            borderRight: '1px solid var(--border-subtle)',
            fontSize: 13,
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
                <LuPin size={12} style={filter === 'pinned' ? { fill: 'currentColor' } : undefined} />
              </SidebarIcon>
              <Box grow={1} style={{ minWidth: 0 }}>
                Pinned
              </Box>
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
                <Box grow={1} style={{ minWidth: 0 }}>
                  {label}
                </Box>
              </SidebarRow>
            ))}

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
          shrink={0}
          grow={localPreview === 'split' ? undefined : 1}
          style={{
            minHeight: 0,
            flexBasis: localPreview === 'split' ? '36%' : undefined,
            minWidth: localPreview === 'split' ? 320 : 320,
            maxWidth: localPreview === 'split' ? 460 : undefined,
            width: localPreview === 'split' ? undefined : 'auto',
            borderRight: localPreview === 'split' ? '1px solid var(--border-subtle)' : undefined,
          }}
        >
          {/* Search row */}
          <Box style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <Inline gap={2} px={3} py={3} overflow="hidden">
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
                style={{ width: 100, justifyContent: 'center', flexShrink: 0 }}
              >
                {mode}
              </Button>
            </Inline>
          </Box>

          {query && mode === 'semantic' ? (
            <SemanticBanner
              t={t}
              count={searched.length}
              available={semanticAvailable}
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
                        Semantic search is off.
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
                        Press <Kbd size="sm">{getKeyIcon('Enter')}</Kbd> to{' '}
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
      </Inline>
    </Stack>
  );
}
