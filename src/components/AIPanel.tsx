import { useState } from 'react';
import { Button, Card, FormField, Input, Modal, Select } from 'ember-design-system';
import type { Theme } from '../lib/types';
import type { EmbedProvider, EmbedSettings } from '../hooks/useSettings';

interface AIPanelProps {
  t: Theme;
  settings: EmbedSettings;
  onChange: (next: EmbedSettings) => void;
  onClose: () => void;
}

const PROVIDERS: { id: EmbedProvider; label: string }[] = [
  { id: 'local', label: 'Local (default)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'disabled', label: 'Off' },
];

const LOCAL_MODELS: { id: string; label: string; note: string }[] = [
  {
    id: 'bge-small-en-v1.5',
    label: 'BGE Small EN v1.5',
    note: 'Best quality. ~130 MB download on first use.',
  },
  {
    id: 'all-minilm-l6-v2',
    label: 'All-MiniLM-L6-v2',
    note: 'Smallest, fastest. ~90 MB download on first use.',
  },
];

const FIELD_LABEL_CLS = 'mb-1.5 font-mono text-[10.5px] uppercase tracking-wide text-fg-muted';
const HINT_CLS = 'mt-1.5 mb-3.5 text-[10.5px] leading-[1.5] text-fg-faint';

export function AIPanel({ settings, onChange, onClose }: AIPanelProps) {
  const [local, setLocal] = useState<EmbedSettings>(settings);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof EmbedSettings>(k: K, v: EmbedSettings[K]) => {
    setLocal((prev) => ({ ...prev, [k]: v }));
    setError(null);
  };

  const validate = (): string | null => {
    if (local.provider === 'openai' && !local.openai_api_key.trim()) {
      return 'OpenAI API key is required.';
    }
    if (local.provider === 'ollama' && !local.ollama_url.trim()) {
      return 'Ollama URL is required.';
    }
    return null;
  };

  const save = () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    onChange(local);
    onClose();
  };

  const embedStatus = summariseEmbedStatus(local);
  const labelStatus = local.anthropic_api_key.trim()
    ? 'On — Claude Haiku generates labels in the background.'
    : 'Off — items show a content preview as their label.';

  return (
    <Modal
      open
      onClose={onClose}
      title="Semantic search"
      description="Two independent AI features: local-by-default embeddings for search, plus optional Claude Haiku for one-line intent labels."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <StatusRow kind={embedStatus.kind} label="Semantic search" detail={embedStatus.text} />
      <StatusRow
        kind={local.anthropic_api_key.trim() ? 'ok' : 'off'}
        label="AI labels"
        detail={labelStatus}
      />

      <div className="mb-4 mt-4">
        <div className={FIELD_LABEL_CLS}>Provider</div>
        <div className="flex flex-wrap gap-1.5">
          {PROVIDERS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={local.provider === p.id ? 'primary' : 'secondary'}
              onClick={() => set('provider', p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {local.provider === 'local' && (
        <>
          <Field label="Embedding model">
            <Select
              value={local.local_model}
              onChange={(v) => set('local_model', v)}
              options={LOCAL_MODELS.map((m) => ({ value: m.id, label: m.label }))}
              aria-label="Embedding model"
            />
          </Field>
          <p className={HINT_CLS}>
            {LOCAL_MODELS.find((m) => m.id === local.local_model)?.note ??
              'Runs entirely on your machine via ONNX.'}{' '}
            The first embedding may take a few seconds while the model downloads.
          </p>
        </>
      )}

      {local.provider === 'openai' && (
        <>
          <Field label="OpenAI API key">
            <Input
              type="password"
              value={local.openai_api_key}
              onChange={(e) => set('openai_api_key', e.target.value)}
              placeholder="sk-…"
            />
          </Field>
          <Field label="Model">
            <Input
              value={local.openai_model}
              onChange={(e) => set('openai_model', e.target.value)}
            />
          </Field>
        </>
      )}

      {local.provider === 'ollama' && (
        <>
          <Field label="Ollama URL">
            <Input value={local.ollama_url} onChange={(e) => set('ollama_url', e.target.value)} />
          </Field>
          <Field label="Embedding model">
            <Input
              value={local.ollama_model}
              onChange={(e) => set('ollama_model', e.target.value)}
            />
          </Field>
          <p className={HINT_CLS}>
            Install an embedding model first:{' '}
            <code className="rounded-[3px] bg-subtle px-1.5 py-px font-mono text-fg-muted">
              ollama pull {local.ollama_model}
            </code>
          </p>
        </>
      )}

      <div className="mt-[18px] border-t border-border-subtle pt-3.5">
        <Field label="Anthropic API key — AI labels">
          <Input
            type="password"
            value={local.anthropic_api_key}
            onChange={(e) => set('anthropic_api_key', e.target.value)}
            placeholder="sk-ant-…"
          />
        </Field>
        <p className={HINT_CLS}>
          Each clip gets a one-line intent summary (e.g. "Stripe Webhook Debug"). Runs on Claude
          Haiku in the background. A few hundred clips cost pennies.
        </p>
      </div>

      {error && (
        <Card
          role="alert"
          padding="none"
          className="mt-3.5 !bg-subtle px-2.5 py-2 text-[11.5px] text-danger"
          style={{ borderColor: 'var(--status-danger)' }}
        >
          {error}
        </Card>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <FormField
      className="mb-3.5 !gap-1.5"
      label={<span className={FIELD_LABEL_CLS.replace('mb-1.5 ', '')}>{label}</span>}
    >
      {children}
    </FormField>
  );
}

type StatusKind = 'ok' | 'off' | 'warn';

interface StatusRowProps {
  kind: StatusKind;
  label: string;
  detail: string;
}

function StatusRow({ kind, label, detail }: StatusRowProps) {
  const colour =
    kind === 'ok'
      ? 'var(--status-success)'
      : kind === 'warn'
        ? 'var(--status-warning)'
        : 'var(--text-tertiary)';
  return (
    <Card padding="none" className="mb-2 flex items-start gap-3 !rounded-lg !bg-subtle px-3 py-2.5">
      <span
        className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
        style={{
          background: colour,
          boxShadow: `0 0 0 3px color-mix(in oklab, ${colour} 18%, transparent)`,
        }}
      />
      <div className="flex min-w-0 flex-col gap-[3px]">
        <span className="font-mono text-[10px] font-semibold uppercase leading-none tracking-wider text-fg-muted">
          {label}
        </span>
        <span className="text-[11.5px] leading-[1.5] text-fg">{detail}</span>
      </div>
    </Card>
  );
}

function summariseEmbedStatus(s: EmbedSettings): {
  kind: StatusKind;
  text: string;
} {
  if (s.provider === 'disabled') {
    return { kind: 'off', text: 'Off — fuzzy search only.' };
  }
  if (s.provider === 'local') {
    return {
      kind: 'ok',
      text: `Local — ${s.local_model} (offline after first download)`,
    };
  }
  if (s.provider === 'openai') {
    if (!s.openai_api_key.trim()) {
      return { kind: 'warn', text: 'OpenAI selected but no API key yet.' };
    }
    return { kind: 'ok', text: `OpenAI — ${s.openai_model}` };
  }
  if (!s.ollama_url.trim()) {
    return { kind: 'warn', text: 'Ollama selected but no URL yet.' };
  }
  return { kind: 'ok', text: `Ollama — ${s.ollama_model} at ${s.ollama_url}` };
}
