import type { ComponentType } from 'react';
import { Button, Card } from 'ember-design-system';
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
      className="fixed bottom-6 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2.5 !rounded-full !border-border px-4 py-2.5 font-sans text-[12.5px] font-medium text-fg shadow-ember-md"
      style={{ animation: 'toastIn 180ms var(--easing-standard)' }}
    >
      <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-accent text-fg-inverse">
        <Icon size={11} />
      </span>
      <span>{toast.msg}</span>
      {toast.undo && (
        <Button size="sm" variant="ghost" onClick={toast.undo}>
          Undo
        </Button>
      )}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </Card>
  );
}
