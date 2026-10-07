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
  { id: 'local', label: 'On-device' },
  { id: 'jev', label: '+ Jev re-rank' },
  { id: 'laya', label: '+ Laya re-rank' },
  { id: 'disabled', label: 'Off' },
];

type ErrorField = 'jev_key' | 'laya_url' | 'connection';
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
  return p === 'jev' || p === 'laya';
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
    if (local.provider === 'jev' && !local.typesafe_api_key.trim()) {
      return { field: 'jev_key', msg: 'TypeSafe API key is required.' };
    }
    if (local.provider === 'laya' && !local.laya_url.trim()) {
      return { field: 'laya_url', msg: 'Laya server URL is required.' };
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
          msg: `Could not reach ${local.provider === 'laya' ? 'the Laya server' : 'TypeSafe'}: ${res.msg}`,
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

  return (
    <Modal
      open
      onClose={onClose}
      title="AI features"
      description="On-device semantic search, optionally re-ranked by TypeSafe Jev or a local Laya model, plus optional Claude Haiku labels."
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
                The palette will use fuzzy matching only. Pick On-device to turn semantic search
                back on.
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

          {local.provider === 'jev' && (
            <>
              <FormField
                label={<FieldLabel>TypeSafe API key</FieldLabel>}
                error={error?.field === 'jev_key' ? error.msg : undefined}
                hint="Search queries and matching clip contents are sent to TypeSafe to re-rank results."
              >
                <Input
                  type="password"
                  value={local.typesafe_api_key}
                  onChange={(e) => set('typesafe_api_key', e.target.value)}
                  placeholder="ts-…"
                />
              </FormField>
              <FormField label={<FieldLabel>Model</FieldLabel>}>
                <Input
                  value={local.typesafe_model}
                  onChange={(e) => set('typesafe_model', e.target.value)}
                />
              </FormField>
            </>
          )}

          {local.provider === 'laya' && (
            <FormField
              label={<FieldLabel>Laya server URL</FieldLabel>}
              error={error?.field === 'laya_url' ? error.msg : undefined}
              hint="Runs on this Mac: uv run --with laya-mlx scripts/laya_server.py. Nothing leaves your machine."
            >
              <Input
                value={local.laya_url}
                onChange={(e) => set('laya_url', e.target.value)}
                placeholder="http://127.0.0.1:8765/v1/systemone"
              />
            </FormField>
          )}

          {local.provider !== 'disabled' && (
            <Text size={11.5} tone="secondary" leading="snug">
              Clips are embedded on this device (EmbeddingGemma, ~200 MB one-time download).
              {local.provider === 'jev' && ' Jev then re-orders the top 50 matches.'}
              {local.provider === 'laya' && ' Laya then re-orders the top 20 matches, locally.'}
            </Text>
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
    return { kind: 'ok', text: 'On-device embeddings.' };
  }
  if (s.provider === 'jev' && !s.typesafe_api_key.trim()) {
    return { kind: 'warn', text: 'No TypeSafe key yet — using on-device ranking only.' };
  }
  const name = s.provider === 'jev' ? `TypeSafe Jev — ${s.typesafe_model}` : 'Laya (local)';
  if (test.kind === 'err') {
    return { kind: 'err', text: `${name} unreachable — on-device ranking still works. ${test.msg}` };
  }
  return { kind: 'ok', text: `On-device embeddings, re-ranked by ${name}.` };
}
