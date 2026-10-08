import { Badge, Box, Inline, Kbd, Stack, Text } from 'ember-design-system';
import { LuPin } from 'react-icons/lu';
import { MdKeyboardBackspace, MdKeyboardReturn } from 'react-icons/md';
import { relTime } from '../lib/time';
import type { ClipItem, Theme } from '../lib/types';
import type { AppState } from '../hooks/useAppState';
import { CategoryChip, ItemBody } from './Primitives';
import { ImagePreview } from './ImagePreview';
import { useRef } from 'react';
import { TitleInput, type TitleInputHandle } from './TitleInput';
import {
  CopyButton,
  DeleteButton,
  EditBar,
  PinButton,
  RenameButton,
} from './ActionButtons';

interface PreviewPaneProps {
  t: Theme;
  item: ClipItem;
  showLabels: boolean;
  renaming: boolean;
  setRenaming: (v: boolean) => void;
  app: AppState;
  anthropicEnabled: boolean;
  /** If provided, called instead of app.pinItem so the parent can lock the row index. */
  onPinItem?: (id: string) => void;
  /** If provided, called instead of app.deleteItem so the parent can lock the row index. */
  onDeleteItem?: (id: string) => void;
}

export function PreviewPane({
  t,
  item,
  showLabels,
  renaming,
  setRenaming,
  app,
  anthropicEnabled,
  onPinItem,
  onDeleteItem,
}: PreviewPaneProps) {
  const titleRef = useRef<TitleInputHandle>(null);
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
        {/* Renaming must show the field even when labels are hidden. */}
        {(showLabels || renaming) &&
          (renaming ? (
            <Inline>
              <TitleInput
                ref={titleRef}
                initial={item.label}
                size={17}
                onDone={(label) => {
                  if (label) app.updateLabel(item.id, label);
                  setRenaming(false);
                }}
              />
            </Inline>
          ) : (
            <Inline
              gap={3}
              onDoubleClick={() => setRenaming(true)}
              title={
                item.labelGenerated
                  ? 'Double-click to rename'
                  : 'Awaiting AI label — double-click to rename'
              }
            >
              <Text
                as="span"
                className="editable-title"
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
        className="action-bar"
        gap={2}
        px={3}
        py={2}
        style={{
          borderTop: '1px solid var(--border-subtle)',
          background: 'color-mix(in oklab, var(--bg-surface) 60%, transparent)',
        }}
      >
        {renaming ? (
          <EditBar
            onSave={() => titleRef.current?.finish(true)}
            onDiscard={() => titleRef.current?.finish(false)}
          />
        ) : (
          <>
            <CopyButton
              onClick={() => app.copyItem(item.id)}
              trailingKbd={<MdKeyboardReturn size={10} />}
            />

            <PinButton compact pinned={!!item.pinned} onClick={() => onPinItem ? onPinItem(item.id) : app.pinItem(item.id)} />

            <RenameButton compact onClick={() => setRenaming(true)} />

            <Box grow={1} />

            <DeleteButton
              compact
              onClick={() => onDeleteItem ? onDeleteItem(item.id) : app.deleteItem(item.id)}
              kbd={
                <Kbd size="sm">
                  <MdKeyboardBackspace size={10} />
                </Kbd>
              }
            />
          </>
        )}
      </Inline>
    </Stack>
  );
}
