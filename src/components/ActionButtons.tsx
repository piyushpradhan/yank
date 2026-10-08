import { Box, Button, Divider, IconButton, Kbd, Text, Tooltip } from 'ember-design-system';
import {
  LuClipboardPaste,
  LuCopy,
  LuPencil,
  LuPin,
  LuPinOff,
  LuTextCursorInput,
  LuTrash2,
} from 'react-icons/lu';
import { MdKeyboardBackspace } from 'react-icons/md';
import type { ReactNode } from 'react';
import { ModKey } from '../lib/keyIcons';

/** Tooltip body: optional action name followed by its keycaps. */
function Shortcut({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <Box as="span" display="inline-flex" align="center" gap={2}>
      {label && (
        <Text as="span" size={12} weight="medium">
          {label}
        </Text>
      )}
      <Box as="span" display="inline-flex" align="center" gap={1}>
        {children}
      </Box>
    </Box>
  );
}

const CMD = (
  <Kbd size="sm">
    <ModKey />
  </Kbd>
);

interface ActionProps {
  label: string;
  icon: ReactNode;
  keys: ReactNode;
  onClick: () => void;
  /** Icon-only, for tight spaces like the palette. The label moves into the tooltip. */
  compact?: boolean;
  /** Tooltip side; the right-most action uses 'left' so it isn't clipped by the window edge. */
  side?: 'top' | 'left';
}

/** Secondary action: borderless, so a row of them reads as one toolbar. */
function Action({ label, icon, keys, onClick, compact, side = 'top' }: ActionProps) {
  if (compact) {
    return (
      <IconButton
        size="sm"
        variant="ghost"
        aria-label={label}
        icon={icon}
        onClick={onClick}
        tooltip={<Shortcut label={label}>{keys}</Shortcut>}
        tooltipSide={side}
      />
    );
  }
  return (
    <Tooltip content={<Shortcut>{keys}</Shortcut>} side={side}>
      <Button
        size="sm"
        variant="ghost"
        onClick={onClick}
        leadingIcon={icon}
      >
        {label}
      </Button>
    </Tooltip>
  );
}

interface CopyButtonProps {
  onClick: () => void;
  trailingKbd?: ReactNode;
  label?: string;
}

export function CopyButton({ onClick, trailingKbd, label = 'Copy' }: CopyButtonProps) {
  const button = (
    <Button
      size="sm"
      variant="primary"
      onClick={onClick}
      leadingIcon={label === 'Paste' ? <LuClipboardPaste size={13} /> : <LuCopy size={13} />}
    >
      {label}
    </Button>
  );

  if (!trailingKbd) return button;

  return (
    <Tooltip
      content={
        <Shortcut>
          <Kbd size="sm">{trailingKbd}</Kbd>
        </Shortcut>
      }
    >
      {button}
    </Tooltip>
  );
}

interface PinButtonProps {
  pinned: boolean;
  onClick: () => void;
  compact?: boolean;
}

export function PinButton({ pinned, onClick, compact }: PinButtonProps) {
  return (
    <Action
      label={pinned ? 'Unpin' : 'Pin'}
      icon={pinned ? <LuPinOff size={14} /> : <LuPin size={14} />}
      keys={
        <>
          {CMD}
          <Kbd size="sm">P</Kbd>
        </>
      }
      onClick={onClick}
      compact={compact}
    />
  );
}

interface DeleteButtonProps {
  onClick: () => void;
  kbd?: ReactNode;
  compact?: boolean;
}

export function DeleteButton({ onClick, kbd, compact }: DeleteButtonProps) {
  return (
    <Action
      label="Delete"
      icon={<LuTrash2 size={14} />}
      side="left"
      keys={
        kbd ?? (
          <>
            {CMD}
            <Kbd size="sm">
              <MdKeyboardBackspace size={10} />
            </Kbd>
          </>
        )
      }
      onClick={onClick}
      compact={compact}
    />
  );
}

interface SimpleActionProps {
  onClick: () => void;
  compact?: boolean;
}

export function RenameButton({ onClick, compact }: SimpleActionProps) {
  return (
    <Action
      label="Rename"
      icon={<LuTextCursorInput size={14} />}
      keys={<Kbd size="sm">E</Kbd>}
      onClick={onClick}
      compact={compact}
    />
  );
}

/** Toggles a temporary, paste-only edit of the item's text. */
export function EditButton({ onClick, compact }: SimpleActionProps) {
  return (
    <Action
      label="Edit before pasting"
      icon={<LuPencil size={14} />}
      keys={<Kbd size="sm">E</Kbd>}
      onClick={onClick}
      compact={compact}
    />
  );
}

export function ActionSeparator() {
  return (
    <Box
      as="span"
      display="inline-flex"
      align="stretch"
      shrink={0}
      aria-hidden
      style={{ height: 20, marginLeft: 6, marginRight: 6 }}
    >
      <Divider orientation="vertical" />
    </Box>
  );
}
