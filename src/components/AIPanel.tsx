import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Box,
  Button,
  Divider,
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
import type { EmbedProvider, EmbedSettings } from '../hooks/useSettings';

interface AIPanelProps {
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

type ErrorField = 'openai_key' | 'ollama_url' | 'connection';
type TestState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok' }
  | { kind: 'err'; msg: string };

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Overline as="div" size={10.5} weight="regular" tracking="wide" tone="secondary">
      {children}
    </Overline>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <Overline as="div" size={10.5} weight="medium" tracking="wider" tone="accent-ink">
      {children}
    </Overline>
  );
}

function needsRemoteProbe(p: EmbedProvider): boolean {
  return p === 'openai' || p === 'ollama';
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error.';
}

export function AIPanel({ settings, onChange, onClose }: AIPanelProps) {
  const [local, setLocal] = useState<EmbedSettings>(settings);
  const [error, setError] = useState<{ field: ErrorField; msg: string } | null>(null);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof EmbedSettings>(k: K, v: EmbedSettings[K]) => {
    setLocal((prev) => ({ ...prev, [k]: v }));
    setError(null);
    // Editing any field invalidates the prior test result.
    setTest({ kind: 'idle' });
  };

  const validateConfig = (): { field: ErrorField; msg: string } | null => {
    if (local.provider === 'openai' && !local.openai_api_key.trim()) {
      return { field: 'openai_key', msg: 'OpenAI API key is required.' };
    }
    if (local.provider === 'ollama' && !local.ollama_url.trim()) {
      return { field: 'ollama_url', msg: 'Ollama URL is required.' };
    }
    return null;
  };

  const probe = async (): Promise<{ ok: true } | { ok: false; msg: string }> => {
    try {
      await invoke<void>('test_embed_provider', { cfg: local });
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: toErrorMessage(e) };
    }
  };

  const runTest = async () => {
    const problem = validateConfig();
    if (problem) {
      setError(problem);
      setTest({ kind: 'idle' });
      return;
    }
    setError(null);
    setTest({ kind: 'running' });
    const res = await probe();
    setTest(res.ok ? { kind: 'ok' } : { kind: 'err', msg: res.msg });
  };

  const save = async () => {
    const problem = validateConfig();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);

    if (needsRemoteProbe(local.provider)) {
      setSaving(true);
      setTest({ kind: 'running' });
      const res = await probe();
      setSaving(false);
      if (!res.ok) {
        setTest({ kind: 'err', msg: res.msg });
        setError({
          field: 'connection',
          msg: `Could not reach ${local.provider === 'openai' ? 'OpenAI' : 'Ollama'}: ${res.msg}`,
        });
        return;
      }
      setTest({ kind: 'ok' });
    }

    onChange(local);
    onClose();
  };

  const embedStatus = summariseEmbedStatus(local, test);
  const labelsOn = local.anthropic_api_key.trim().length > 0;
  const localNote =
    LOCAL_MODELS.find((m) => m.id === local.local_model)?.note ??
    'Runs entirely on your machine via ONNX.';

  return (
    <Modal
      open
      onClose={onClose}
      title="AI features"
      description="Two independent AI features: local-by-default embeddings for search, plus optional Claude Haiku for one-line intent labels."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            {saving ? 'Testing…' : 'Save'}
          </Button>
        </>
      }
    >
      <Stack gap={5}>
        <Stack gap={2}>
          <StatusRow kind={embedStatus.kind} label="Semantic search" detail={embedStatus.text} />
          <StatusRow
            kind={labelsOn ? 'ok' : 'off'}
            label="AI labels"
            detail={
              labelsOn
                ? 'On — Claude Haiku generates labels in the background.'
                : 'Off — items show a content preview as their label.'
            }
          />
        </Stack>

        {local.provider === 'disabled' && (
          <Box bg="subtle" radius="lg" border="subtle" p={3}>
            <Stack gap={1}>
              <Text size={12} weight="medium" tone="primary">
                Semantic search is turned off.
              </Text>
              <Text size={11.5} tone="secondary" leading="snug">
                The palette will use fuzzy matching only. Pick Local, OpenAI, or Ollama to turn
                semantic search back on.
              </Text>
            </Stack>
          </Box>
        )}

        <Stack gap={3}>
          <SectionHeading>Semantic search</SectionHeading>

          <FormField label={<FieldLabel>Provider</FieldLabel>}>
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
          </FormField>

          {local.provider === 'local' && (
            <FormField
              label={<FieldLabel>Embedding model</FieldLabel>}
              hint={`${localNote} The first embedding may take a few seconds while the model downloads.`}
            >
              <Select
                value={local.local_model}
                onChange={(v) => set('local_model', v)}
                options={LOCAL_MODELS.map((m) => ({ value: m.id, label: m.label }))}
                aria-label="Embedding model"
              />
            </FormField>
          )}

          {local.provider === 'openai' && (
            <>
              <FormField
                label={<FieldLabel>OpenAI API key</FieldLabel>}
                error={error?.field === 'openai_key' ? error.msg : undefined}
              >
                <Input
                  type="password"
                  value={local.openai_api_key}
                  onChange={(e) => set('openai_api_key', e.target.value)}
                  placeholder="sk-…"
                />
              </FormField>
              <FormField label={<FieldLabel>Model</FieldLabel>}>
                <Input
                  value={local.openai_model}
                  onChange={(e) => set('openai_model', e.target.value)}
                />
              </FormField>
            </>
          )}

          {local.provider === 'ollama' && (
            <>
              <FormField
                label={<FieldLabel>Ollama URL</FieldLabel>}
                error={error?.field === 'ollama_url' ? error.msg : undefined}
              >
                <Input
                  value={local.ollama_url}
                  onChange={(e) => set('ollama_url', e.target.value)}
                />
              </FormField>
              <FormField
                label={<FieldLabel>Embedding model</FieldLabel>}
                hint={
                  <>
                    Install an embedding model first:{' '}
                    <Text as="code" family="mono" size={10.5} tone="secondary">
                      ollama pull {local.ollama_model}
                    </Text>
                  </>
                }
              >
                <Input
                  value={local.ollama_model}
                  onChange={(e) => set('ollama_model', e.target.value)}
                />
              </FormField>
            </>
          )}

          {needsRemoteProbe(local.provider) && (
            <Inline gap={3} align="center" wrap>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void runTest()}
                disabled={test.kind === 'running' || saving}
                loading={test.kind === 'running'}
              >
                {test.kind === 'running' ? 'Testing…' : 'Test connection'}
              </Button>
              {test.kind === 'ok' && (
                <Inline gap={2} align="center">
                  <Dot tone="success" size="sm" />
                  <Text size={11.5} tone="success">
                    Connected.
                  </Text>
                </Inline>
              )}
              {test.kind === 'err' && (
                <Text size={11.5} tone="danger" leading="snug">
                  {test.msg}
                </Text>
              )}
            </Inline>
          )}
        </Stack>

        <Divider />

        <Stack gap={3}>
          <SectionHeading>AI labels</SectionHeading>

          <FormField
            label={<FieldLabel>Anthropic API key</FieldLabel>}
            hint="Each clip gets a one-line intent summary (e.g. “Stripe Webhook Debug”). Runs on Claude Haiku in the background. A few hundred clips cost pennies."
          >
            <Input
              type="password"
              value={local.anthropic_api_key}
              onChange={(e) => set('anthropic_api_key', e.target.value)}
              placeholder="sk-ant-…"
            />
          </FormField>
        </Stack>
      </Stack>
    </Modal>
  );
}

type StatusKind = 'ok' | 'off' | 'warn' | 'err';

interface StatusRowProps {
  kind: StatusKind;
  label: string;
  detail: string;
}

function StatusRow({ kind, label, detail }: StatusRowProps) {
  const tone =
    kind === 'ok' ? 'success' : kind === 'warn' ? 'warning' : kind === 'err' ? 'danger' : 'neutral';
  return (
    <Box bg="subtle" radius="lg" px={3} py={2}>
      <Inline gap={3} align="center">
        <Dot tone={tone} size="md" ring />
        <Stack gap={1} grow={1}>
          <Overline as="span" size="2xs" tone="secondary">
            {label}
          </Overline>
          <Text size={11.5} tone="primary" leading="snug">
            {detail}
          </Text>
        </Stack>
      </Inline>
    </Box>
  );
}

function summariseEmbedStatus(
  s: EmbedSettings,
  test: TestState,
): { kind: StatusKind; text: string } {
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
    if (test.kind === 'err') {
      return { kind: 'err', text: `OpenAI unreachable — ${test.msg}` };
    }
    return { kind: 'ok', text: `OpenAI — ${s.openai_model}` };
  }
  if (!s.ollama_url.trim()) {
    return { kind: 'warn', text: 'Ollama selected but no URL yet.' };
  }
  if (test.kind === 'err') {
    return { kind: 'err', text: `Ollama unreachable — ${test.msg}` };
  }
  return { kind: 'ok', text: `Ollama — ${s.ollama_model} at ${s.ollama_url}` };
}
