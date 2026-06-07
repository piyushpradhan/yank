import { Box, Button, Card, IconButton, Inline, Stack, Text } from 'ember-design-system';
import { LuArrowDownToLine, LuRefreshCw, LuX } from 'react-icons/lu';
import type { UpdaterStatus } from '../hooks/useUpdater';

interface UpdateBannerProps {
  status: UpdaterStatus;
  onRestart: () => void;
  onDismiss: () => void;
}

function progressPercent(downloaded: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((downloaded / total) * 100));
}

export function UpdateBanner({ status, onRestart, onDismiss }: UpdateBannerProps) {
  if (status.kind !== 'ready' && status.kind !== 'downloading') return null;

  return (
    <Card
      padding="none"
      className="fixed bottom-6 left-1/2 z-[1000] -translate-x-1/2 !rounded-2xl !border-border shadow-ember-md"
      style={{
        animation: 'toastIn 180ms var(--easing-standard)',
        padding: '10px 14px',
        minWidth: 320,
      }}
    >
      {status.kind === 'downloading' ? (
        <Inline gap={3} align="center">
          <Box
            display="flex"
            align="center"
            justify="center"
            radius="pill"
            bg="accent"
            style={{ width: 22, height: 22, color: 'var(--text-inverse)' }}
          >
            <LuArrowDownToLine size={12} />
          </Box>
          <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
            <Text size={12.5} weight="medium">
              Downloading update {status.version}
            </Text>
            <Text size={11} tone="secondary">
              {progressPercent(status.downloaded, status.total) === null
                ? `${(status.downloaded / 1024 / 1024).toFixed(1)} MB`
                : `${progressPercent(status.downloaded, status.total)}%`}
            </Text>
          </Stack>
        </Inline>
      ) : (
        <Inline gap={3} align="center">
          <Box
            display="flex"
            align="center"
            justify="center"
            radius="pill"
            bg="accent"
            style={{ width: 22, height: 22, color: 'var(--text-inverse)' }}
          >
            <LuRefreshCw size={12} />
          </Box>
          <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
            <Text size={12.5} weight="medium">
              Update {status.version} ready
            </Text>
            <Text size={11} tone="secondary">
              Restart Yank to finish installing.
            </Text>
          </Stack>
          <Button size="sm" variant="primary" onClick={onRestart}>
            Restart
          </Button>
          <IconButton
            aria-label="Dismiss"
            icon={<LuX size={12} />}
            variant="ghost"
            size="sm"
            onClick={onDismiss}
          />
        </Inline>
      )}
    </Card>
  );
}
