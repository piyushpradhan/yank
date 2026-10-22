import { useEffect, useRef } from 'react';
import { Box, Button, Card, IconButton, Inline, Stack, Switch, Text } from 'ember-design-system';
import { LuShieldCheck, LuX } from 'react-icons/lu';
import type { TelemetryPreferences } from '../lib/telemetry';
import { useSensitiveCopies } from '../hooks/useSensitiveCopies';

interface PrivacyPanelProps {
  consent: boolean;
  preferences: TelemetryPreferences | null;
  saving: boolean;
  error: string | null;
  onChoose: (enabled: boolean) => Promise<boolean>;
  onRetry?: () => Promise<boolean>;
  onClose: () => void;
  inline?: boolean;
}

export function PrivacyPanel({
  consent,
  preferences,
  saving,
  error,
  onChoose,
  onRetry,
  onClose,
  inline = false,
}: PrivacyPanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const {
    blocked: skipSensitive,
    saving: captureSaving,
    error: captureError,
    choose: chooseCapture,
  } = useSensitiveCopies(!consent);
  useEffect(() => {
    if (inline) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [inline]);
  const choose = async (enabled: boolean) => {
    if (await onChoose(enabled)) {
      if (consent) onClose();
    }
  };
  const dismiss = () => {
    if (saving || captureSaving) return;
    if (consent) void choose(false);
    else onClose();
  };
  const content = (
    <Stack gap={inline ? 3 : 4} p={inline ? 0 : 6}>
      {!inline && (
        <>
          <Inline align="center" justify="between">
            <Box p={3} radius="lg" bg="accent-soft" style={{ color: 'var(--accent-ember-500)' }}>
              <LuShieldCheck size={22} aria-hidden />
            </Box>
            <IconButton
              aria-label={consent ? 'Keep usage sharing off' : 'Close privacy settings'}
              icon={<LuX size={16} />}
              variant="ghost"
              size="sm"
              disabled={saving || captureSaving}
              onClick={dismiss}
            />
          </Inline>
          <Stack gap={2}>
            <Text as="h2" id="privacy-title" size={20} weight="semibold" tracking="tight">
              {consent ? 'Help make Yank better?' : 'Privacy & usage'}
            </Text>
            <Text id="privacy-description" size={13} tone="secondary" leading={1.6}>
              {consent
                ? 'Share usage statistics to help improve features and search reliability. Sharing is optional and off by default.'
                : 'Control what Yank saves and whether to share optional usage statistics.'}
            </Text>
          </Stack>
        </>
      )}
      {!consent && (
        <Stack gap={2} p={inline ? 3 : 4} radius="md" bg="subtle">
          <Inline justify="between" align="center" gap={3}>
            <label htmlFor="skip-sensitive-copies">
              <Text size={13} weight="medium">
                Block sensitive copies
              </Text>
            </label>
            <Switch
              id="skip-sensitive-copies"
              aria-label="Block sensitive copies"
              aria-describedby="capture-privacy-description"
              checked={skipSensitive ?? true}
              disabled={captureSaving || skipSensitive === null}
              onChange={(event) => void chooseCapture(event.currentTarget.checked)}
            />
          </Inline>
          <Text id="capture-privacy-description" size={12} tone="secondary" leading={1.55}>
            Keep recognized card numbers, Social Security numbers, credentials, and copies that
            apps like password managers mark confidential out of new clipboard history. Detection
            runs on this device; normal paste still works.
          </Text>
          <Text size={12} tone="tertiary" leading={1.55}>
            Turn off to save sensitive copies like any other clip. Some unmarked passwords and
            images cannot be detected. Existing history is unchanged.
          </Text>
          {captureError && (
            <Text role="alert" size={12} tone="danger">
              {captureError}
            </Text>
          )}
        </Stack>
      )}
      <Stack gap={3} p={inline ? 3 : 4} radius="md" bg="subtle">
        <Text size={12.5} leading={1.55} tone="secondary">
          <Text as="b" tone="primary">
            What’s shared:
          </Text>{' '}
          features used, clip types, search result counts, timings, errors, app version, and
          operating system. A random installation ID connects your usage across sessions in Umami.
        </Text>
        <Text size={12.5} leading={1.55} tone="secondary">
          <Text as="b" tone="primary">
            Your content stays private:
          </Text>{' '}
          no clipboard text, images, search terms, clip titles, source apps, file paths, or API keys
          are included in usage statistics.
        </Text>
      </Stack>
      <Text size={12} tone="tertiary" leading={1.55}>
        Umami receives your IP address to deliver the request, but does not store it. You can turn
        sharing off any time in Settings → Privacy & history. Turning it off also resets your
        random ID.
      </Text>
      {error && (
        <Stack gap={2}>
          <Text role="alert" size={12} tone="danger">
            {error}
          </Text>
          {onRetry && (
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => void onRetry()}>
              Retry saving
            </Button>
          )}
        </Stack>
      )}
      {consent ? (
        <Inline gap={3}>
          <Button
            fullWidth
            variant="secondary"
            size="md"
            disabled={saving}
            onClick={() => void choose(false)}
            autoFocus
          >
            No thanks
          </Button>
          <Button
            fullWidth
            variant="primary"
            size="md"
            disabled={saving || !preferences}
            onClick={() => void choose(true)}
          >
            Share usage
          </Button>
        </Inline>
      ) : (
        <Inline justify="between" align="center" gap={3}>
          <label htmlFor="share-usage">
            <Text size={13} weight="medium">
              Share usage statistics
            </Text>
          </label>
          <Switch
            id="share-usage"
            aria-label="Share usage statistics"
            checked={preferences?.enabled ?? false}
            disabled={saving || !preferences}
            onChange={(event) => void choose(event.currentTarget.checked)}
          />
        </Inline>
      )}
    </Stack>
  );

  if (inline) return content;

  return (
    <dialog
      ref={dialog}
      className="privacy-dialog"
      aria-labelledby="privacy-title"
      aria-describedby="privacy-description"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <Card padding="none" style={{ border: '1px solid var(--border-default)', borderRadius: 16 }}>
        {content}
      </Card>
    </dialog>
  );
}
