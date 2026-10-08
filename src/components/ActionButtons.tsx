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
import { MdKeyboardBackspace, MdKeyboardReturn } from 'react-icons/md';
import type { MouseEvent, ReactNode } from 'react';
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
      keys={
        <>
          {CMD}
          <Kbd size="sm">R</Kbd>
        </>
      }
      onClick={onClick}
      compact={compact}
    />
  );
}

/** Starts editing the item's text: save it, or use it once. */
export function EditButton({ onClick, compact }: SimpleActionProps) {
  return (
    <Action
      label="Edit"
      icon={<LuPencil size={14} />}
      keys={
        <>
          {CMD}
          <Kbd size="sm">E</Kbd>
        </>
      }
      onClick={onClick}
      compact={compact}
    />
  );
}

/**
 * Key hint printed inside a button, so it's visible without hovering. Icons
 * rather than text glyphs (↵, ⌘) so they're legible and centre on the label.
 */
function InlineKeys({ children }: { children: ReactNode }) {
  return (
    <span className="inline-keys" aria-hidden>
      {children}
    </span>
  );
}

const ENTER = <MdKeyboardReturn size={14} />;

interface EditBarProps {
  onSave: () => void;
  onDiscard: () => void;
  /** Optional "use it now without saving" action, e.g. Paste once / Copy once. */
  once?: { label: string; onClick: () => void };
}

/**
 * Replaces the action bar while renaming or editing. Same words and keys
 * everywhere: the filled button is Enter, Discard is Escape.
 */
export function EditBar({ onSave, onDiscard, once }: EditBarProps) {
  // Keep focus in the field being edited; a blur would otherwise commit
  // before the click lands.
  const keepFocus = (e: MouseEvent) => e.preventDefault();
  const fixed = { flexShrink: 0 };
  return (
    <>
      <Button
        size="sm"
        variant="primary"
        onMouseDown={keepFocus}
        onClick={onSave}
        trailingIcon={<InlineKeys>{ENTER}</InlineKeys>}
        style={fixed}
      >
        Save
      </Button>
      {once && (
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={keepFocus}
          onClick={once.onClick}
          trailingIcon={
            <InlineKeys>
              <ModKey size={13} />
              {ENTER}
            </InlineKeys>
          }
          style={fixed}
        >
          {once.label}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onMouseDown={keepFocus}
        onClick={onDiscard}
        trailingIcon={<InlineKeys>esc</InlineKeys>}
        style={fixed}
      >
        Discard
      </Button>
    </>
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
