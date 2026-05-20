import { IconButton } from 'ember-design-system';
import { LuX } from 'react-icons/lu';
import type { Theme } from '../lib/types';
import { Kbd } from './Primitives';

interface ShortcutHintProps {
  t: Theme;
  onDismiss: () => void;
}

export function ShortcutHint({ t, onDismiss }: ShortcutHintProps) {
  return (
    <div className="absolute right-5 top-[52px] z-[400] flex items-center gap-2.5 rounded-[10px] border border-border bg-surface px-5 py-3.5 font-sans text-[13px] text-fg shadow-ember-md">
      <span className="text-fg-muted">Press</span>
      <Kbd t={t} accent>
        Ctrl
      </Kbd>
      <Kbd t={t} accent>
        Shift
      </Kbd>
      <Kbd t={t} accent>
        V
      </Kbd>
      <span className="text-fg-muted">anywhere to open</span>
      <IconButton
        aria-label="Dismiss"
        icon={<LuX size={14} />}
        variant="ghost"
        size="sm"
        onClick={onDismiss}
      />
    </div>
  );
}
