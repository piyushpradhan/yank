import { Card, IconButton, Kbd } from 'ember-design-system';
import { LuX } from 'react-icons/lu';
import { getKeyIcon } from '../lib/keyIcons';

const accentStyle = {
  background: 'var(--accent-ember-50)',
  color: 'var(--accent-ember-700)',
  borderColor: 'var(--accent-ember-100)',
  boxShadow: 'inset 0 -1px 0 color-mix(in oklab, var(--accent-ember-700) 16%, transparent)',
} as const;

interface ShortcutHintProps {
  keys: string[];
  onDismiss: () => void;
}

export function ShortcutHint({ keys, onDismiss }: ShortcutHintProps) {
  return (
    <Card
      elevated
      padding="none"
      className="absolute right-5 top-[52px] z-[400] flex items-center gap-2.5 !rounded-[10px] !border-border px-5 py-3.5 font-sans text-[13px] text-fg shadow-ember-md"
    >
      <span className="text-fg-muted">Press</span>
      {keys.map((k, i) => (
        <Kbd key={i} size="sm" style={accentStyle}>
          {getKeyIcon(k)}
        </Kbd>
      ))}
      <span className="text-fg-muted">anywhere to open</span>
      <IconButton
        aria-label="Dismiss"
        icon={<LuX size={14} />}
        variant="ghost"
        size="sm"
        onClick={onDismiss}
      />
    </Card>
  );
}
