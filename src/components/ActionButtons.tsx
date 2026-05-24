import { Button, Divider, Kbd, Tooltip } from 'ember-design-system';
import { LuCopy, LuPencil, LuPin, LuPinOff, LuTrash2 } from 'react-icons/lu';
import { MdKeyboardBackspace, MdKeyboardCommandKey } from 'react-icons/md';
import type { ReactNode } from 'react';

interface CopyButtonProps {
  onClick: () => void;
  trailingKbd?: ReactNode;
}

function ShortcutTooltipContent({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1">{children}</span>;
}

export function CopyButton({ onClick, trailingKbd }: CopyButtonProps) {
  const button = (
    <Button size="sm" variant="primary" onClick={onClick} leadingIcon={<LuCopy size={13} />}>
      Copy
    </Button>
  );

  if (!trailingKbd) return button;

  return (
    <Tooltip
      content={
        <ShortcutTooltipContent>
          <Kbd size="sm">{trailingKbd}</Kbd>
        </ShortcutTooltipContent>
      }
    >
      {button}
    </Tooltip>
  );
}

interface PinButtonProps {
  pinned: boolean;
  onClick: () => void;
}

export function PinButton({ pinned, onClick }: PinButtonProps) {
  return (
    <Tooltip
      content={
        <ShortcutTooltipContent>
          <Kbd size="sm">
            <MdKeyboardCommandKey size={10} />
          </Kbd>
          <Kbd size="sm">P</Kbd>
        </ShortcutTooltipContent>
      }
    >
      <Button
        size="sm"
        variant="secondary"
        onClick={onClick}
        leadingIcon={pinned ? <LuPinOff size={13} /> : <LuPin size={13} />}
      >
        {pinned ? 'Unpin' : 'Pin'}
      </Button>
    </Tooltip>
  );
}

interface DeleteButtonProps {
  onClick: () => void;
  variant?: 'secondary' | 'ghost';
  kbd?: ReactNode;
}

export function DeleteButton({ onClick, variant = 'secondary', kbd }: DeleteButtonProps) {
  return (
    <Tooltip
      content={
        <ShortcutTooltipContent>
          {kbd ?? (
            <>
              <Kbd size="sm">
                <MdKeyboardCommandKey size={10} />
              </Kbd>
              <Kbd size="sm">
                <MdKeyboardBackspace size={10} />
              </Kbd>
            </>
          )}
        </ShortcutTooltipContent>
      }
    >
      <Button size="sm" variant={variant} onClick={onClick} leadingIcon={<LuTrash2 size={13} />}>
        Delete
      </Button>
    </Tooltip>
  );
}

interface RenameButtonProps {
  onClick: () => void;
}

export function RenameButton({ onClick }: RenameButtonProps) {
  return (
    <Tooltip
      content={
        <ShortcutTooltipContent>
          <Kbd size="sm">E</Kbd>
        </ShortcutTooltipContent>
      }
    >
      <Button size="sm" variant="secondary" onClick={onClick} leadingIcon={<LuPencil size={13} />}>
        Rename
      </Button>
    </Tooltip>
  );
}

export function ActionSeparator() {
  return (
    <span className="mx-1.5 inline-flex h-5 shrink-0 items-stretch" aria-hidden>
      <Divider orientation="vertical" />
    </span>
  );
}
