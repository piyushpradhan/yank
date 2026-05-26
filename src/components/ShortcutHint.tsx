import { Card, IconButton, Inline, Kbd, Text } from 'ember-design-system';
import { LuX } from 'react-icons/lu';
import { getKeyIcon } from '../lib/keyIcons';

interface ShortcutHintProps {
  keys: string[];
  onDismiss: () => void;
}

export function ShortcutHint({ keys, onDismiss }: ShortcutHintProps) {
  return (
    <Card
      elevated
      padding="none"
      className="absolute right-5 top-[52px] z-[400] !rounded-[10px] !border-border px-5 py-3.5 shadow-ember-md"
    >
      <Inline gap={2}>
        <Text tone="secondary" size={13}>
          Press
        </Text>
        {keys.map((k, i) => (
          <Kbd key={i} size="sm" tone="accent">
            {getKeyIcon(k)}
          </Kbd>
        ))}
        <Text tone="secondary" size={13}>
          anywhere to open
        </Text>
        <IconButton
          aria-label="Dismiss"
          icon={<LuX size={14} />}
          variant="ghost"
          size="sm"
          onClick={onDismiss}
        />
      </Inline>
    </Card>
  );
}
