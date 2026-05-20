import { useEffect, useState } from 'react';
import { Button, Input } from 'ember-design-system';
import { LuCopy, LuPencil, LuPin, LuPinOff, LuTrash2 } from 'react-icons/lu';
import { relTime } from '../lib/time';
import type { ClipItem, Theme } from '../lib/types';
import type { AppState } from '../hooks/useAppState';
import { useImageUrl } from '../hooks/useImageUrl';
import { CategoryChip, ItemBody, Kbd } from './Primitives';

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
    <img src={url} alt={item.preview} className="max-h-[400px] max-w-full rounded-lg bg-subtle" />
  );
}

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
    <div className="flex min-w-0 flex-1 flex-col bg-subtle">
      <div className="border-b border-border-subtle px-5 pb-3 pt-4">
        <div className="mb-2 flex min-h-[18px] items-center gap-2.5">
          <CategoryChip t={t} cat={item.category} mode="chip" />
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] leading-none tabular-nums text-fg-faint">
            {item.source} · {relTime(item.minutesAgo)}
          </span>
          {item.pinned && (
            <LuPin size={12} className="shrink-0 fill-current text-accent" aria-label="pinned" />
          )}
        </div>
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
            <div
              onDoubleClick={() => setEditing(true)}
              title={
                item.labelGenerated
                  ? 'Double-click to rename'
                  : 'Awaiting AI label — double-click to rename'
              }
              className={`flex cursor-text items-center gap-2.5 text-[17px] leading-[1.3] tracking-[-0.3px] ${
                item.labelGenerated
                  ? 'font-semibold not-italic text-fg'
                  : 'font-medium italic text-fg-muted'
              }`}
            >
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {item.label}
              </span>
              {!item.labelGenerated && anthropicEnabled && (
                <span className="shrink-0 rounded-[3px] border border-border-subtle px-1.5 py-[3px] font-mono text-[10px] font-medium not-italic uppercase leading-none tracking-widest text-fg-faint">
                  Labeling…
                </span>
              )}
            </div>
          ))}
      </div>
      <div className="flex-1 overflow-auto p-5">
        {item.category === 'image' ? (
          <ImagePreview t={t} item={item} getImage={app.getImage} />
        ) : (
          <ItemBody t={t} item={item} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle bg-surface px-5 py-3">
        <Button
          size="sm"
          variant="primary"
          onClick={() => app.copyItem(item.id)}
          leadingIcon={<LuCopy size={13} />}
          trailingIcon={
            <Kbd t={t} onAccent>
              ↵
            </Kbd>
          }
        >
          Copy
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => app.pinItem(item.id)}
          leadingIcon={item.pinned ? <LuPinOff size={13} /> : <LuPin size={13} />}
          trailingIcon={<Kbd t={t}>⌘P</Kbd>}
        >
          {item.pinned ? 'Unpin' : 'Pin'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => app.deleteItem(item.id)}
          leadingIcon={<LuTrash2 size={13} />}
          trailingIcon={<Kbd t={t}>⌫</Kbd>}
        >
          Delete
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setEditing(true)}
          leadingIcon={<LuPencil size={13} />}
          trailingIcon={<Kbd t={t}>E</Kbd>}
        >
          Rename
        </Button>
      </div>
    </div>
  );
}
