import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  Dot,
  FormField,
  Inline,
  Input,
  Modal,
  Overline,
  Select,
  Stack,
  Text,
} from 'ember-design-system';
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Overline as="div" size={10.5} weight="regular" tracking="wide" tone="secondary">
      {children}
    </Overline>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Text as="p" size={10.5} tone="tertiary" leading={1.5} style={{ marginTop: 6, marginBottom: 14 }}>
      {children}
    </Text>
  );
}

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

      <Stack gap={2} style={{ marginTop: 16, marginBottom: 16 }}>
        <FieldLabel>Provider</FieldLabel>
        <Inline gap={2} wrap>
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
        </Inline>
      </Stack>

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
          <Hint>
            {LOCAL_MODELS.find((m) => m.id === local.local_model)?.note ??
              'Runs entirely on your machine via ONNX.'}{' '}
            The first embedding may take a few seconds while the model downloads.
          </Hint>
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
          <Hint>
            Install an embedding model first:{' '}
            <Box
              as="code"
              display="inline"
              bg="subtle"
              radius="sm"
              style={{ padding: '1px 6px' }}
            >
              <Text family="mono" size={10.5} tone="secondary">
                ollama pull {local.ollama_model}
              </Text>
            </Box>
          </Hint>
        </>
      )}

      <Box style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
        <Field label="Anthropic API key — AI labels">
          <Input
            type="password"
            value={local.anthropic_api_key}
            onChange={(e) => set('anthropic_api_key', e.target.value)}
            placeholder="sk-ant-…"
          />
        </Field>
        <Hint>
          Each clip gets a one-line intent summary (e.g. "Stripe Webhook Debug"). Runs on Claude
          Haiku in the background. A few hundred clips cost pennies.
        </Hint>
      </Box>

      {error && (
        <Card
          role="alert"
          padding="none"
          className="mt-3.5 !bg-subtle px-2.5 py-2"
          style={{ borderColor: 'var(--status-danger)' }}
        >
          <Text size={11.5} tone="danger">
            {error}
          </Text>
        </Card>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <FormField className="mb-3.5 !gap-1.5" label={<FieldLabel>{label}</FieldLabel>}>
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
  const tone = kind === 'ok' ? 'success' : kind === 'warn' ? 'warning' : 'neutral';
  return (
    <Card padding="none" className="mb-2 !rounded-lg !bg-subtle px-3 py-2.5">
      <Inline gap={3} align="start">
        <Dot tone={tone} size="md" ring style={{ marginTop: 5 }} />
        <Stack gap={1} grow={1}>
          <Overline as="span" size="2xs" tone="secondary">
            {label}
          </Overline>
          <Text size={11.5} tone="primary" leading={1.5}>
            {detail}
          </Text>
        </Stack>
      </Inline>
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
