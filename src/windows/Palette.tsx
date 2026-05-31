import { useEffect, useMemo, useRef, useState } from 'react';
import { highlightMatch, searchItems } from '../lib/search';
import { relTime } from '../lib/time';
import type { CategoryDisplay, ClipItem, SearchMode, Theme } from '../lib/types';
import type { AppState } from '../hooks/useAppState';
import { useImageUrl } from '../hooks/useImageUrl';
import {
  Box,
  Button,
  Dot,
  Image,
  Inline,
  Input,
  Kbd,
  Stack,
  Text,
  Tooltip,
} from 'ember-design-system';
import { LuArrowUpDown, LuEllipsis, LuPin, LuSearch } from 'react-icons/lu';
import { getKeyIcon } from '../lib/keyIcons';
import { CategoryChip } from '../components/Primitives';
import { ItemBody } from '../components/Primitives';
import { ImagePreview } from '../components/ImagePreview';
import { CopyButton, PinButton, DeleteButton, ActionSeparator } from '../components/ActionButtons';
import { MdKeyboardBackspace, MdKeyboardCommandKey, MdKeyboardReturn } from 'react-icons/md';

// Stable no-op so useImageUrl's effect deps stay stable for non-image rows.
const NO_IMAGE = (): Promise<Blob | null> => Promise.resolve(null);

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
    <Inline
      data-i={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      position="relative"
      interactive
      gap={3}
      radius="lg"
      px={3}
      bg={selected ? 'accent-soft' : 'transparent'}
      style={{ paddingTop: t.dense ? 8 : 10, paddingBottom: t.dense ? 8 : 10 }}
    >
      {categoryMode === 'chip' && <CategoryChip t={t} cat={item.category} mode="chip" />}
      {categoryMode === 'icon' && <CategoryChip t={t} cat={item.category} mode="icon" />}
      {categoryMode === 'dot' && <CategoryChip t={t} cat={item.category} mode="dot" />}

      {isImage && (
        <Box
          display="flex"
          align="center"
          justify="center"
          shrink={0}
          overflow="hidden"
          radius="sm"
          border="subtle"
          bg="subtle"
          style={{ height: 32, width: 44 }}
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={item.preview}
              fit="contain"
              style={{ maxHeight: '100%', maxWidth: '100%' }}
            />
          ) : null}
        </Box>
      )}

      <Box grow={1} style={{ minWidth: 0 }}>
        {showLabels && (
          <Inline
            title={item.labelGenerated ? undefined : 'Awaiting AI label'}
            style={{ gap: 6, overflow: 'hidden' }}
          >
            <Text
              as="span"
              size={t.dense ? 13.5 : 14.5}
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
          family={item.category === 'text' || item.category === 'address' ? 'sans' : 'mono'}
          truncate
          size={showLabels ? (t.dense ? 11.5 : 12) : t.dense ? 13 : 13.5}
          tone={showLabels ? 'secondary' : 'primary'}
          style={{ marginTop: showLabels ? 2 : 0 }}
        >
          {item.preview}
        </Text>
      </Box>

      {item.pinned && (
        <LuPin
          size={11}
          color="var(--accent-ember-500)"
          style={{ flexShrink: 0, fill: 'currentColor' }}
          aria-label="pinned"
        />
      )}
      {item.category === 'color' && (
        <Box
          shrink={0}
          radius="sm"
          border="subtle"
          style={{ height: 18, width: 18, background: item.content }}
        />
      )}

      <Text
        family="mono"
        size={11}
        leading={1}
        tabularNums
        tone="tertiary"
        shrink
        style={{ minWidth: 42, textAlign: 'right' }}
      >
        {relTime(item.minutesAgo)}
      </Text>

      {selected && (
        <Inline shrink={0} gap={1}>
          <Kbd size="sm" tone="accent">
            ↵
          </Kbd>
        </Inline>
      )}
    </Inline>
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
    <Box
      position="absolute"
      display="flex"
      align="stretch"
      style={{ inset: 0, zIndex: 500, animation: 'paletteFadeIn 150ms ease' }}
    >
      <Inline
        onKeyDown={onKey}
        tabIndex={-1}
        align="stretch"
        fullWidth
        fullHeight
        overflow="hidden"
        bg="surface"
        style={{
          maxHeight: '100%',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--window-radius)',
          backdropFilter: 'blur(40px) saturate(160%)',
          WebkitBackdropFilter: 'blur(40px) saturate(160%)',
          boxShadow: `0 80px 160px -30px rgba(0,0,0,${t.dark ? 0.75 : 0.3}),
                      0 20px 40px -10px rgba(0,0,0,${t.dark ? 0.5 : 0.14})`,
          animation: 'paletteScaleIn 180ms cubic-bezier(.2,.9,.3,1.1)',
        }}
      >
        <Stack
          overflow="hidden"
          style={{ flex: '0 0 380px', borderRight: '1px solid var(--border-subtle)' }}
        >
          <Inline
            gap={3}
            px={4}
            style={{ height: 56, borderBottom: '1px solid var(--border-subtle)' }}
          >
            <LuSearch
              size={16}
              color={mode === 'semantic' ? 'var(--accent-ember-500)' : 'var(--text-tertiary)'}
              style={{ flexShrink: 0, transition: 'color 150ms' }}
            />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === 'semantic' ? 'Describe what you need…' : 'Search clipboard history'
              }
              className="!border-none !bg-transparent !text-lg"
            />
            <Tooltip content={<Kbd size="sm">{getKeyIcon('Tab')}</Kbd>}>
              <Button
                size="sm"
                variant={mode === 'semantic' ? 'primary' : 'secondary'}
                onClick={() => setMode((m) => (m === 'fuzzy' ? 'semantic' : 'fuzzy'))}
                leadingIcon={
                  <Dot
                    size="xs"
                    color={mode === 'semantic' ? 'var(--text-inverse)' : 'var(--text-tertiary)'}
                  />
                }
              >
                {mode}
              </Button>
            </Tooltip>
          </Inline>

          <Box ref={listRef} grow={1} overflow="auto" style={{ minHeight: 120, padding: 6 }}>
            {results.length === 0 && (
              <Box px={5} style={{ paddingTop: 48, paddingBottom: 48, textAlign: 'center' }}>
                <Text size={13} leading={1.6} tone="tertiary">
                  {mode === 'semantic' && !semanticAvailable ? (
                    <>
                      <Text as="b" tone="primary" weight="semibold">
                        Semantic search is off.
                      </Text>
                      <br />
                      <Text size={11.5}>
                        Open the main window and click{' '}
                        <Text as="b" weight="semibold" tone="primary">
                          AI
                        </Text>{' '}
                        to configure.
                      </Text>
                      <br />
                      Press <Kbd size="sm">{getKeyIcon('Tab')}</Kbd> to fall back to fuzzy.
                    </>
                  ) : mode === 'semantic' && semanticLoading ? (
                    'Thinking…'
                  ) : mode === 'semantic' && semanticError ? (
                    <>
                      <Text as="b" tone="primary" weight="semibold">
                        Semantic search failed.
                      </Text>
                      <br />
                      <Text size={11.5}>{semanticError}</Text>
                      <br />
                      Press <Kbd size="sm">{getKeyIcon('Tab')}</Kbd> to fall back to fuzzy.
                    </>
                  ) : app.items.length === 0 ? (
                    <>
                      Clipboard is empty.
                      <br />
                      <Text size={11.5}>Copy anything and it lands here.</Text>
                    </>
                  ) : query ? (
                    <>
                      No matches for{' '}
                      <Text as="b" tone="primary" weight="semibold">
                        "{query}"
                      </Text>
                      .<br />
                      Press <Kbd size="sm">{getKeyIcon('Tab')}</Kbd> to try semantic search.
                    </>
                  ) : (
                    'Clipboard is empty.'
                  )}
                </Text>
              </Box>
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
          </Box>

          <Inline
            justify="between"
            px={3}
            style={{
              height: 34,
              borderTop: '1px solid var(--border-subtle)',
              background: t.dark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.015)',
            }}
          >
            <Inline grow={1} gap={2} overflow="hidden" style={{ minWidth: 0 }}>
              <Inline shrink={0} style={{ gap: 6 }}>
                <Kbd size="sm">
                  <LuArrowUpDown />
                </Kbd>
                <Text size={11} tone="tertiary">
                  nav
                </Text>
              </Inline>
              <Inline shrink={0} style={{ gap: 6 }}>
                <Kbd size="sm">
                  <MdKeyboardReturn />
                </Kbd>
                <Text size={11} tone="tertiary">
                  paste
                </Text>
              </Inline>
              <Inline shrink={0} style={{ gap: 6 }}>
                <Kbd size="sm">
                  <MdKeyboardCommandKey />P
                </Kbd>
                <Text size={11} tone="tertiary">
                  pin
                </Text>
              </Inline>
              <Inline shrink={0} style={{ gap: 6 }}>
                <Kbd size="sm">
                  <MdKeyboardCommandKey />
                  <MdKeyboardBackspace />
                </Kbd>
                <Text size={11} tone="tertiary">
                  del
                </Text>
              </Inline>
            </Inline>
            <Inline shrink={0} style={{ gap: 6 }}>
              <Text size={11} tone="tertiary">
                {results.length > MAX_VISIBLE
                  ? `${MAX_VISIBLE} of ${results.length}`
                  : results.length}{' '}
                {query ? 'matches' : 'items'}
              </Text>
            </Inline>
          </Inline>
        </Stack>

        <Stack grow={1} bg="subtle" style={{ minWidth: 0 }}>
          {selectedItem ? (
            <>
              <Box
                px={5}
                bg="surface"
                style={{
                  paddingTop: 14,
                  paddingBottom: 14,
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <Inline gap={3} style={{ marginBottom: 8, minHeight: 16 }}>
                  <CategoryChip t={t} cat={selectedItem.category} mode="chip" />
                  <Text family="mono" size={11} tabularNums tone="tertiary" truncate grow>
                    {selectedItem.source} · {relTime(selectedItem.minutesAgo)}
                  </Text>
                  {selectedItem.pinned && (
                    <LuPin
                      size={12}
                      color="var(--accent-ember-500)"
                      style={{ flexShrink: 0, fill: 'currentColor' }}
                      aria-label="pinned"
                    />
                  )}
                </Inline>
                <Inline gap={3} style={{ gap: 10 }}>
                  <Text
                    as="span"
                    size={15}
                    weight="semibold"
                    leading={1.3}
                    tracking="tight"
                    truncate
                    grow
                  >
                    {selectedItem.label}
                  </Text>
                  {!selectedItem.labelGenerated && (
                    <Box
                      as="span"
                      shrink={0}
                      border="subtle"
                      radius="sm"
                      style={{ padding: '2px 6px' }}
                    >
                      <Text
                        family="mono"
                        size={10}
                        weight="medium"
                        tone="tertiary"
                        transform="uppercase"
                        tracking="widest"
                      >
                        Pending
                      </Text>
                    </Box>
                  )}
                </Inline>
              </Box>
              <Box grow={1} display="flex" align="start" justify="center" overflow="auto" p={4}>
                {selectedItem.category === 'image' ? (
                  <ImagePreview item={selectedItem} getImage={app.getImage} maxHeight="280px" />
                ) : (
                  <Box fullWidth style={{ maxWidth: 400 }}>
                    <ItemBody t={t} item={selectedItem} />
                  </Box>
                )}
              </Box>
              <Inline
                gap={1}
                px={4}
                py={2}
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'color-mix(in oklab, var(--bg-surface) 60%, transparent)',
                }}
              >
                <CopyButton
                  onClick={() => {
                    app.copyItem(selectedItem.id);
                    onClose();
                  }}
                />

                <ActionSeparator />

                <PinButton
                  pinned={!!selectedItem.pinned}
                  onClick={() => app.pinItem(selectedItem.id)}
                />

                <ActionSeparator />

                <DeleteButton
                  onClick={() => {
                    app.deleteItem(selectedItem.id);
                    setSelected((s) => Math.max(0, s - 1));
                  }}
                  variant="ghost"
                />
              </Inline>
            </>
          ) : (
            <Box grow={1} display="flex" align="center" justify="center">
              <Text size={13} tone="tertiary">
                Select an item to preview
              </Text>
            </Box>
          )}
        </Stack>
      </Inline>
    </Box>
  );
}
