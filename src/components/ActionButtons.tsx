import { Button, Kbd } from 'ember-design-system';
import { LuCopy, LuPencil, LuPin, LuPinOff, LuTrash2 } from 'react-icons/lu';
import type { ReactNode } from 'react';
import { onAccentStyle } from '../lib/styles';

interface CopyButtonProps {
  onClick: () => void;
  trailingKbd?: ReactNode;
}

export function CopyButton({ onClick, trailingKbd }: CopyButtonProps) {
  return (
    <Button
      size="sm"
      variant="primary"
      onClick={onClick}
      leadingIcon={<LuCopy size={13} />}
      trailingIcon={
        trailingKbd ? (
          <Kbd size="sm" style={onAccentStyle}>
            {trailingKbd}
          </Kbd>
        ) : undefined
      }
    >
      Copy
    </Button>
  );
}

interface PinButtonProps {
  pinned: boolean;
  onClick: () => void;
}

export function PinButton({ pinned, onClick }: PinButtonProps) {
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={onClick}
      leadingIcon={pinned ? <LuPinOff size={13} /> : <LuPin size={13} />}
      trailingIcon={<Kbd size="sm">⌘P</Kbd>}
    >
      {pinned ? 'Unpin' : 'Pin'}
    </Button>
  );
}

interface DeleteButtonProps {
  onClick: () => void;
  variant?: 'secondary' | 'ghost';
  kbd?: string;
}

export function DeleteButton({ onClick, variant = 'secondary', kbd = '⌘⌫' }: DeleteButtonProps) {
  return (
    <Button
      size="sm"
      variant={variant}
      onClick={onClick}
      leadingIcon={<LuTrash2 size={13} />}
      trailingIcon={<Kbd size="sm">{kbd}</Kbd>}
    >
      Delete
    </Button>
  );
}

interface RenameButtonProps {
  onClick: () => void;
}

export function RenameButton({ onClick }: RenameButtonProps) {
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={onClick}
      leadingIcon={<LuPencil size={13} />}
      trailingIcon={<Kbd size="sm">E</Kbd>}
    >
      Rename
    </Button>
  );
}

export function ActionSeparator() {
  return <div className="mx-1.5 h-5 w-px shrink-0 bg-border-subtle" />;
}
