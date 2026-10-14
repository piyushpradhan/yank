import { useEffect, useRef } from 'react';
import { Box, Button, Card, IconButton, Inline, Stack, Switch, Text } from 'ember-design-system';
import { LuShieldCheck, LuX } from 'react-icons/lu';
import type { TelemetryPreferences } from '../lib/telemetry';

interface PrivacyPanelProps {
  consent: boolean;
  preferences: TelemetryPreferences | null;
  saving: boolean;
  error: string | null;
  onChoose: (enabled: boolean) => Promise<boolean>;
  onRetry?: () => Promise<boolean>;
  onClose: () => void;
}

export function PrivacyPanel({
  consent,
  preferences,
  saving,
  error,
  onChoose,
  onRetry,
  onClose,
}: PrivacyPanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const choose = async (enabled: boolean) => {
    if (await onChoose(enabled)) {
      if (consent) onClose();
    }
  };
  const dismiss = () => {
    if (saving) return;
    if (consent) void choose(false);
    else onClose();
  };
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
        <Stack gap={4} p={6}>
          <Inline align="center" justify="between">
            <Box p={3} radius="lg" bg="accent-soft" style={{ color: 'var(--accent-ember-500)' }}>
              <LuShieldCheck size={22} aria-hidden />
            </Box>
            <IconButton
              aria-label={consent ? 'Keep usage sharing off' : 'Close privacy settings'}
              icon={<LuX size={16} />}
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={dismiss}
            />
          </Inline>
          <Stack gap={2}>
            <Text as="h2" id="privacy-title" size={20} weight="semibold" tracking="tight">
              {consent ? 'Help make Yank better?' : 'Privacy & usage'}
            </Text>
            <Text id="privacy-description" size={13} tone="secondary" leading={1.6}>
              Share usage statistics to help improve features and search reliability. Sharing is
              optional and off by default.
            </Text>
          </Stack>
          <Stack gap={3} p={4} radius="md" bg="subtle">
            <Text size={12} leading={1.6} tone="secondary">
              <Text as="b" tone="primary">
                What’s shared:
              </Text>{' '}
              features used, clip types, search result counts, timings, errors, app version, and
              operating system. A random installation ID connects your usage across sessions in
              Umami.
            </Text>
            <Text size={12} leading={1.6} tone="secondary">
              <Text as="b" tone="primary">
                Your content stays private:
              </Text>{' '}
              no clipboard text, images, search terms, clip titles, source apps, file paths, or API
              keys are included in usage statistics.
            </Text>
          </Stack>
          <Text size={11.5} tone="tertiary" leading={1.6}>
            Umami receives your IP address to deliver the request, but does not store it. You can
            turn sharing off any time in Tweaks → the shield icon. Turning it off also resets your
            random ID.
          </Text>
          {error && (
            <Stack gap={2}>
              <Text role="alert" size={12} tone="danger">
                {error}
              </Text>
              {onRetry && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  onClick={() => void onRetry()}
                >
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
      </Card>
    </dialog>
  );
}
