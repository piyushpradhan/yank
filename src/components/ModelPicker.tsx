import { Badge, Button, IconButton, Text } from 'ember-design-system';
import { LuArrowDownToLine, LuPause, LuPlay, LuRotateCw, LuTrash2 } from 'react-icons/lu';
import type { BadgeTone } from 'ember-design-system';
import type { ModelState, useLocalModels } from '../hooks/useLocalModels';
import './ModelPicker.css';

/** Speeds and accuracy come from `examples/eval_semantic.rs` (1,845 clips). */
export const LOCAL_MODELS: {
  id: string;
  label: string;
  by: string;
  badge?: { text: string; tone: BadgeTone };
  note: string;
}[] = [
  {
    id: 'bge-small-en-v1.5',
    label: 'BGE Small',
    by: 'BAAI',
    badge: { text: 'Default', tone: 'neutral' },
    note: 'Fast and light. English. About 7 ms per search.',
  },
  {
    id: 'embeddinggemma-300m',
    label: 'EmbeddingGemma 300M',
    by: 'Google',
    badge: { text: 'Most accurate', tone: 'success' },
    note: 'Best at reworded searches: right first try 83% of the time, vs 69% for BGE. About 16 ms.',
  },
  {
    id: 'embeddinggemma-2',
    label: 'EmbeddingGemma 2',
    by: 'Google',
    badge: { text: 'New', tone: 'accent' },
    note: "Google's newest. Multilingual and stronger on code. Slowest here, 50–150 ms.",
  },
  {
    id: 'all-minilm-l6-v2',
    label: 'MiniLM L6',
    by: 'Microsoft',
    note: 'Smallest and quickest, slightly less accurate. About 5 ms.',
  },
];

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1e6))} MB`;

type Models = ReturnType<typeof useLocalModels>;

interface ModelPickerProps extends Models {
  /** The model selected in the unsaved settings draft. */
  value: string;
  /** The saved model, which search is using and cannot be deleted. */
  inUse: string;
  onSelect: (id: string) => void;
}

export function ModelPicker({ value, inUse, onSelect, models, rates, error, download, pause, remove }: ModelPickerProps) {
  return (
    <div className="model-picker" role="radiogroup" aria-label="Embedding model">
      {LOCAL_MODELS.map((m) => {
        const s: ModelState = models[m.id] ?? { state: 'missing', total: 0 };
        const ready = s.state === 'ready';
        return (
          <label key={m.id} className="model-row" data-selected={value === m.id} data-ready={ready}>
            <input
              type="radio"
              name="local-model"
              value={m.id}
              checked={value === m.id}
              disabled={!ready}
              onChange={() => onSelect(m.id)}
              title={ready ? undefined : 'Download this model to use it'}
            />
            <span className="model-row-body">
              <span className="model-row-title">
                <Text as="span" size={13} weight="semibold" tone="primary">
                  {m.label}
                </Text>
                <Text as="span" size={12} tone="tertiary">
                  {m.by}
                </Text>
                {m.badge && (
                  <Badge size="sm" variant="subtle" tone={m.badge.tone}>
                    {m.badge.text}
                  </Badge>
                )}
              </span>
              <Text as="span" size={12} tone="secondary" leading="snug">
                {m.note}
              </Text>
              {error?.id === m.id && (
                <Text as="span" size={12} tone="danger" role="alert">
                  {error.msg}
                </Text>
              )}
            </span>
            <span className="model-row-actions">
              <ModelActions
                id={m.id}
                label={m.label}
                state={s}
                inUse={inUse === m.id}
                download={download}
                pause={pause}
                remove={remove}
              />
            </span>
            <ModelProgress state={s} rate={rates[m.id]} />
          </label>
        );
      })}
      <Text size={12} tone="tertiary" leading="snug">
        Downloads keep going after you close Settings, and pick up where they stopped. Models run on
        this device; nothing you copy leaves it.
      </Text>
    </div>
  );
}

function ModelProgress({ state: s, rate }: { state: ModelState; rate?: number }) {
  if (s.state === 'missing') {
    return s.total ? <Meta>{`${mb(s.total)} download`}</Meta> : null;
  }
  if (s.state === 'ready') {
    return <Meta>{`Downloaded · ${mb(s.total)}`}</Meta>;
  }
  const pct = Math.min(100, Math.round((s.done / Math.max(1, s.total)) * 100));
  const amount = `${mb(s.done)} of ${mb(s.total)}`;
  const line =
    s.state === 'downloading'
      ? `${amount}${rate ? ` · ${(rate / 1e6).toFixed(1)} MB/s` : ''}`
      : s.state === 'paused'
        ? `Paused · ${amount}`
        : `Download failed at ${amount}: ${s.error}`;
  return (
    <span className="model-progress" data-state={s.state}>
      <progress value={pct} max={100} aria-label={`Download ${pct}%`} />
      <Text as="span" size={12} tone={s.state === 'failed' ? 'danger' : 'secondary'} aria-live="polite">
        {line}
      </Text>
    </span>
  );
}

function Meta({ children }: { children: string }) {
  return (
    <Text as="span" size={12} tone="tertiary" className="model-row-meta">
      {children}
    </Text>
  );
}

function ModelActions({
  id,
  label,
  state: s,
  inUse,
  download,
  pause,
  remove,
}: { id: string; label: string; state: ModelState; inUse: boolean } & Pick<Models, 'download' | 'pause' | 'remove'>) {
  // Buttons sit inside the row's <label>: keep their clicks off the radio.
  const act = (fn: (id: string) => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn(id);
  };
  const discard = (
    <IconButton
      size="sm"
      variant="ghost"
      aria-label={`Delete ${label}`}
      tooltip={s.state === 'ready' ? `Delete · frees ${mb(s.total)}` : 'Discard partial download'}
      icon={<LuTrash2 />}
      onClick={act(remove)}
    />
  );
  switch (s.state) {
    case 'missing':
      return (
        <Button size="sm" variant="secondary" leadingIcon={<LuArrowDownToLine />} onClick={act(download)}>
          Download
        </Button>
      );
    case 'downloading':
      return (
        <Button size="sm" variant="ghost" leadingIcon={<LuPause />} onClick={act(pause)}>
          Pause
        </Button>
      );
    case 'paused':
      return (
        <>
          <Button size="sm" variant="secondary" leadingIcon={<LuPlay />} onClick={act(download)}>
            Resume
          </Button>
          {!inUse && discard}
        </>
      );
    case 'failed':
      return (
        <Button size="sm" variant="secondary" leadingIcon={<LuRotateCw />} onClick={act(download)}>
          Retry
        </Button>
      );
    case 'ready':
      return inUse ? (
        <Badge size="sm" variant="outline" tone="neutral">
          In use
        </Badge>
      ) : (
        discard
      );
  }
}
