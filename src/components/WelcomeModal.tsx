import { invoke } from '@tauri-apps/api/core';
import { Box, Button, Card, Inline, Kbd, Stack, Switch, Text } from 'ember-design-system';
import { Fragment, useState } from 'react';
import { getKeyIcon } from '../lib/keyIcons';
import { DEFAULT_SHORTCUT, tokensOf, type ShortcutConfig } from '../lib/shortcut';

interface WelcomeModalProps {
  shortcut: ShortcutConfig | null;
  onDismiss: (autostartEnabled: boolean) => void;
}

export function WelcomeModal({ shortcut, onDismiss }: WelcomeModalProps) {
  const tokens = tokensOf(shortcut ?? DEFAULT_SHORTCUT);
  // Default ON: a clipboard manager has to be running to capture clips —
  // an off-by-default toggle here just leads to "why didn't it save X?".
  const [autostart, setAutostart] = useState(true);

  const dismiss = () => {
    // Fire the autostart write before dismissing the modal — on macOS this
    // installs the LaunchAgent plist, on Windows the HKCU\…\Run registry
    // value, on Linux the ~/.config/autostart/.desktop file (all handled by
    // tauri-plugin-autostart). If the user opted out, explicitly disable
    // so a re-install can't silently inherit a stale LaunchAgent.
    void invoke('set_autostart', { enabled: autostart }).catch(() => {});
    void invoke('set_hint_dismissed', { dismissed: true }).catch(() => {});
    onDismiss(autostart);
  };

  return (
    <Box
      position="fixed"
      display="grid"
      style={{
        inset: 0,
        zIndex: 800,
        placeItems: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        animation: 'tweaksIn 220ms var(--easing-standard)',
      }}
    >
      <Card
        padding="none"
        style={{
          width: 'min(460px, 100%)',
          border: '1px solid var(--border-default)',
          borderRadius: 18,
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}
      >
        <Box
          position="relative"
          px={6}
          pt={6}
          pb={5}
          style={{
            background:
              'radial-gradient(120% 80% at 50% 0%, var(--accent-ember-50) 0%, transparent 65%)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <Stack gap={4} align="center">
            <Box
              display="flex"
              align="center"
              justify="center"
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background:
                  'linear-gradient(140deg, #f58247 0%, #d9541a 55%, #a8390a 100%)',
                boxShadow:
                  '0 8px 24px -8px rgba(217, 84, 26, 0.55), inset 0 1px 0 rgba(255,255,255,0.22)',
              }}
            >
              <svg width="34" height="34" viewBox="0 0 1024 1024" aria-hidden>
                <g
                  fill="none"
                  stroke="#fff4ec"
                  strokeWidth="160"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M 280 260 L 512 552" />
                  <path d="M 744 260 L 512 552" />
                  <path d="M 512 552 L 512 780" />
                </g>
              </svg>
            </Box>
            <Stack gap={1} align="center">
              <Text size={20} weight="semibold" tracking="tight">
                Welcome to Yank
              </Text>
              <Text size={13} tone="secondary" style={{ textAlign: 'center', lineHeight: 1.5 }}>
                Your clipboard, organized — and one keystroke away.
              </Text>
            </Stack>
          </Stack>
        </Box>

        <Stack gap={5} px={6} py={5}>
          <Stack gap={3} align="center">
            <Text
              family="mono"
              size={10.5}
              tone="tertiary"
              transform="uppercase"
              tracking="wider"
            >
              Open Yank from anywhere
            </Text>
            <Inline gap={2} justify="center" align="center">
              {tokens.map((tok, i) => (
                <Fragment key={i}>
                  {i > 0 && (
                    <Text size={13} tone="tertiary" style={{ opacity: 0.6 }}>
                      +
                    </Text>
                  )}
                  <Kbd size="md">{getKeyIcon(tok)}</Kbd>
                </Fragment>
              ))}
            </Inline>
          </Stack>

          <Box
            px={4}
            py={3}
            radius="md"
            bg="subtle"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            <Text size={12} tone="secondary" style={{ textAlign: 'center', lineHeight: 1.55 }}>
              Prefer a different combo? Change it any time in{' '}
              <Text as="b" weight="semibold" tone="primary">
                Tweaks
              </Text>{' '}
              → Global shortcut.
            </Text>
          </Box>

          <Box
            px={4}
            py={3}
            radius="md"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            <Inline justify="between" align="center" gap={3}>
              <Stack gap={1} style={{ minWidth: 0 }}>
                <Text size={13} weight="semibold">
                  Launch Yank at login
                </Text>
                <Text size={11.5} tone="secondary" style={{ lineHeight: 1.5 }}>
                  Yank needs to be running to capture clips. You can change this in Tweaks.
                </Text>
              </Stack>
              <Switch
                switchSize="md"
                checked={autostart}
                onChange={(e) => setAutostart(e.currentTarget.checked)}
                aria-label="Launch Yank at login"
              />
            </Inline>
          </Box>

          <Inline justify="center">
            <Button size="md" variant="primary" onClick={dismiss}>
              Let's go
            </Button>
          </Inline>
        </Stack>
      </Card>
    </Box>
  );
}
