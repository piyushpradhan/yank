import type { ComponentType } from 'react';
import { Button, Text } from 'ember-design-system';
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

// Styled by `.toast` in global.css (plain CSS, not Tailwind utilities: those
// live in a cascade layer and lose to the design system's unlayered styles).
export function Toast({ toast }: ToastProps) {
  const Icon = ICON[toast.kind];
  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden>
        <Icon size={12} />
      </span>
      <Text as="span" size={13} weight="medium" truncate>
        {toast.msg}
      </Text>
      {toast.undo && (
        <Button size="sm" variant="ghost" onClick={toast.undo}>
          Undo
        </Button>
      )}
    </div>
  );
}
