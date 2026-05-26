import { useEffect, useState } from 'react';
import { Badge, Box, Inline, Input, Kbd, Stack, Text } from 'ember-design-system';
import { LuPin } from 'react-icons/lu';
import { MdKeyboardBackspace, MdKeyboardReturn } from 'react-icons/md';
import { relTime } from '../lib/time';
import type { ClipItem, Theme } from '../lib/types';
import type { AppState } from '../hooks/useAppState';
import { CategoryChip, ItemBody } from './Primitives';
import { ImagePreview } from './ImagePreview';
import {
  CopyButton,
  PinButton,
  DeleteButton,
  RenameButton,
  ActionSeparator,
} from './ActionButtons';

interface PreviewPaneProps {
  t: Theme;
  item: ClipItem;
  showLabels: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  app: AppState;
  anthropicEnabled: boolean;
}

export function PreviewPane({
  t,
  item,
  showLabels,
  editing,
  setEditing,
  app,
  anthropicEnabled,
}: PreviewPaneProps) {
  const [draft, setDraft] = useState(item.label);

  useEffect(() => {
    setDraft(item.label);
  }, [item.id, item.label]);

  return (
    <Stack grow={1} bg="subtle" style={{ minWidth: 0 }}>
      <Box px={5} pt={4} pb={3} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <Inline gap={3} style={{ marginBottom: 8, minHeight: 18 }}>
          <CategoryChip t={t} cat={item.category} mode="chip" />
          <Text family="mono" size={11} tone="tertiary" tabularNums truncate grow>
            {item.source} · {relTime(item.minutesAgo)}
          </Text>
          {item.pinned && (
            <LuPin
              size={12}
              color="var(--accent-ember-500)"
              style={{ flexShrink: 0, fill: 'currentColor' }}
              aria-label="pinned"
            />
          )}
        </Inline>
        {showLabels &&
          (editing ? (
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                app.updateLabel(item.id, draft);
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  app.updateLabel(item.id, draft);
                  setEditing(false);
                }
                if (e.key === 'Escape') {
                  setDraft(item.label);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <Inline
              gap={3}
              onDoubleClick={() => setEditing(true)}
              title={
                item.labelGenerated
                  ? 'Double-click to rename'
                  : 'Awaiting AI label — double-click to rename'
              }
              style={{ cursor: 'text' }}
            >
              <Text
                as="span"
                size={17}
                leading={1.3}
                tracking="tight"
                truncate
                grow
                weight={item.labelGenerated ? 'semibold' : 'medium'}
                italic={!item.labelGenerated}
                tone={item.labelGenerated ? 'primary' : 'secondary'}
              >
                {item.label}
              </Text>
              {!item.labelGenerated && anthropicEnabled && (
                <Badge tone="neutral" variant="outline" size="sm">
                  Labeling…
                </Badge>
              )}
            </Inline>
          ))}
      </Box>
      <Box grow={1} overflow="auto" p={5}>
        {item.category === 'image' ? (
          <ImagePreview item={item} getImage={app.getImage} maxHeight="400px" />
        ) : (
          <ItemBody t={t} item={item} />
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
          onClick={() => app.copyItem(item.id)}
          trailingKbd={<MdKeyboardReturn size={10} />}
        />

        <ActionSeparator />

        <PinButton pinned={!!item.pinned} onClick={() => app.pinItem(item.id)} />

        <ActionSeparator />

        <RenameButton onClick={() => setEditing(true)} />

        <DeleteButton
          onClick={() => app.deleteItem(item.id)}
          variant="secondary"
          kbd={
            <Kbd size="sm">
              <MdKeyboardBackspace size={10} />
            </Kbd>
          }
        />
      </Inline>
    </Stack>
  );
}
