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
import { useLocalModels, type ModelState } from '../hooks/useLocalModels';
import { LOCAL_MODELS, ModelPicker } from './ModelPicker';

interface AIPanelProps {
  settings: EmbedSettings;
  onChange: (next: EmbedSettings) => void;
  onClose: () => void;
  embedded?: boolean;
}

const PROVIDERS: { id: EmbedProvider; label: string }[] = [
  { id: 'local', label: 'Local (default)' },
  { id: 'jev', label: 'TypeSafe (Jev)' },
  { id: 'disabled', label: 'Off' },
];


type ErrorField = 'jev_key' | 'connection';
type TestState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok' }
  | { kind: 'err'; msg: string };

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Overline as="div" size={11} weight="medium" tracking="wide" tone="secondary">
      {children}
    </Overline>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <Overline as="div" size={11} weight="semibold" tracking="wider" tone="accent-ink">
      {children}
    </Overline>
  );
}

function needsRemoteProbe(p: EmbedProvider): boolean {
  return p === 'jev';
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error.';
}

export function AIPanel({ settings, onChange, onClose, embedded = false }: AIPanelProps) {
  const [local, setLocal] = useState<EmbedSettings>(settings);
  const [error, setError] = useState<{ field: ErrorField; msg: string } | null>(null);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const localModels = useLocalModels();

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
          msg: `Could not reach TypeSafe: ${res.msg}`,
        });
        return;
      }
      setTest({ kind: 'ok' });
    }

    onChange(local);
    if (!embedded) onClose();
  };

  const embedStatus = summariseEmbedStatus(local, test, localModels.models[local.local_model]);
  const labelsOn = local.anthropic_api_key.trim().length > 0;

  const content = (
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
            <Text size={12} tone="secondary" leading="snug">
              The palette will use fuzzy matching only. Pick Local or TypeSafe to turn semantic
              search back on.
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
          <FormField label={<FieldLabel>Embedding model</FieldLabel>}>
            <ModelPicker
              {...localModels}
              value={local.local_model}
              inUse={settings.local_model}
              onSelect={(id) => set('local_model', id)}
            />
          </FormField>
        )}

        {local.provider === 'jev' && (
          <>
            <FormField
              label={<FieldLabel>TypeSafe API key</FieldLabel>}
              error={error?.field === 'jev_key' ? error.msg : undefined}
              hint="Optional. Bring your own TypeSafe key — search queries and matching clip contents are sent to TypeSafe to re-rank results."
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
                <Text size={12} tone="success">
                  Connected.
                </Text>
              </Inline>
            )}
            {test.kind === 'err' && (
              <Text size={12} tone="danger" leading="snug">
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
  );

  if (embedded) {
    return (
      <Box display="flex" fullHeight style={{ flexDirection: 'column', minHeight: 0 }}>
        <Box grow={1} overflow="auto" p={5} style={{ minHeight: 0 }}>
          {content}
        </Box>
        <Box
          px={5}
          py={3}
          style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
        >
          <Inline justify="between" align="center" gap={3}>
            <Text size={12} tone="tertiary" role="status" aria-live="polite">
              {JSON.stringify(local) === JSON.stringify(settings)
                ? 'AI configuration saved'
                : 'Unsaved AI changes'}
            </Text>
            <Inline gap={2}>
              <Button
                variant="secondary"
                size="sm"
                disabled={saving || JSON.stringify(local) === JSON.stringify(settings)}
                onClick={() => {
                  setLocal(settings);
                  setError(null);
                  setTest({ kind: 'idle' });
                }}
              >
                Discard
              </Button>
              <Button variant="primary" size="sm" onClick={() => void save()} loading={saving}>
                {saving ? 'Testing…' : 'Save AI settings'}
              </Button>
            </Inline>
          </Inline>
        </Box>
      </Box>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="AI features"
      description="On-device semantic search by default (or TypeSafe's Jev with your own key), plus optional Claude Haiku for one-line intent labels."
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
      {content}
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
          <Overline as="span" size={11} weight="medium" tracking="wide" tone="secondary">
            {label}
          </Overline>
          <Text size={12} tone="primary" leading="snug">
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
  model?: ModelState,
): { kind: StatusKind; text: string } {
  if (s.provider === 'disabled') {
    return { kind: 'off', text: 'Off — fuzzy search only.' };
  }
  if (s.provider === 'local') {
    const name = LOCAL_MODELS.find((m) => m.id === s.local_model)?.label ?? s.local_model;
    if (model && model.state !== 'ready') {
      const pct =
        model.state === 'missing' ? 0 : Math.round((model.done / Math.max(1, model.total)) * 100);
      const what = model.state === 'downloading' ? 'downloading' : 'not downloaded';
      return {
        kind: 'warn',
        text: `Local — ${name} ${what} (${pct}%). Keyword results until it's ready.`,
      };
    }
    return { kind: 'ok', text: `Local — ${name}, running on this device.` };
  }
  if (!s.typesafe_api_key.trim()) {
    return { kind: 'warn', text: 'TypeSafe selected but no API key yet.' };
  }
  if (test.kind === 'err') {
    return { kind: 'err', text: `TypeSafe unreachable — ${test.msg}` };
  }
  return { kind: 'ok', text: `TypeSafe — ${s.typesafe_model}` };
}
