import type { ComponentType } from 'react';
import { Box, Button, Card, Inline, Text } from 'ember-design-system';
import { LuCheck, LuInfo, LuPin, LuTrash2 } from 'react-icons/lu';
import type { Theme, Toast as ToastType, ToastKind } from '../lib/types';

const ICON: Record<ToastKind, ComponentType<{ size?: number }>> = {
  copy: LuCheck,
  pin: LuPin,
  delete: LuTrash2,
  info: LuInfo,
};

interface ToastProps {
  t: Theme;
  toast: ToastType;
}

export function Toast({ toast }: ToastProps) {
  const Icon = ICON[toast.kind];
  return (
    <Card
      padding="none"
      className="fixed bottom-6 left-1/2 z-[1000] -translate-x-1/2 !rounded-full !border-border px-4 py-2.5 shadow-ember-md"
      style={{ animation: 'toastIn 180ms var(--easing-standard)' }}
    >
      <Inline gap={3}>
        <Box
          display="flex"
          align="center"
          justify="center"
          radius="pill"
          bg="accent"
          style={{ width: 18, height: 18, color: 'var(--text-inverse)' }}
        >
          <Icon size={11} />
        </Box>
        <Text size={12.5} weight="medium">
          {toast.msg}
        </Text>
        {toast.undo && (
          <Button size="sm" variant="ghost" onClick={toast.undo}>
            Undo
          </Button>
        )}
      </Inline>
    </Card>
  );
}
