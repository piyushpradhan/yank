import { IS_MAC } from './platform';

export const MOD = {
  CONTROL: 0x08,
  SHIFT: 0x200,
  ALT: 0x01,
  META: 0x40,
} as const;

const USEFUL_MOD_MASK = MOD.CONTROL | MOD.SHIFT | MOD.ALT | MOD.META;

export interface ShortcutConfig {
  modifiers: number;
  key: string;
}

export const DEFAULT_SHORTCUT: ShortcutConfig = {
  modifiers: MOD.CONTROL | MOD.SHIFT,
  key: 'Space',
};

export function hasAnyModifier(modifiers: number): boolean {
  return (modifiers & USEFUL_MOD_MASK) !== 0;
}

// Convert a KeyboardEvent.code into a clean key label.
// "KeyA" → "A", "Digit1" → "1", "Space" → "Space", "Backquote" → "`", etc.
export function labelFromCode(code: string): string {
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code.startsWith('Numpad') && code.length > 6) return code.slice(6);
  switch (code) {
    case 'Backquote':
      return '`';
    case 'Minus':
      return '-';
    case 'Equal':
      return '=';
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Backslash':
      return '\\';
    case 'Semicolon':
      return ';';
    case 'Quote':
      return "'";
    case 'Comma':
      return ',';
    case 'Period':
      return '.';
    case 'Slash':
      return '/';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    default:
      return code;
  }
}

// Convert a physical modifier key into keyboard-types' persisted bitmask.
export function modifierFromCode(code: string): number {
  if (code === 'ControlLeft' || code === 'ControlRight') return MOD.CONTROL;
  if (code === 'ShiftLeft' || code === 'ShiftRight') return MOD.SHIFT;
  if (code === 'AltLeft' || code === 'AltRight') return MOD.ALT;
  if (code === 'MetaLeft' || code === 'MetaRight' || code === 'OSLeft' || code === 'OSRight') {
    return MOD.META;
  }
  return 0;
}

// Display tokens for the modifiers + key, in the order users expect to read them.
// On macOS we swap Control → ⌃ and Meta → ⌘ so the labels match the user's keys.
export function tokensOf(sc: ShortcutConfig): string[] {
  const tokens: string[] = [];
  const { modifiers } = sc;
  if (modifiers & MOD.CONTROL) tokens.push(IS_MAC ? '⌃' : 'Ctrl');
  if (modifiers & MOD.ALT) tokens.push(IS_MAC ? '⌥' : 'Alt');
  if (modifiers & MOD.SHIFT) tokens.push(IS_MAC ? '⇧' : 'Shift');
  if (modifiers & MOD.META) tokens.push(IS_MAC ? '⌘' : 'Meta');
  tokens.push(labelFromCode(sc.key));
  return tokens;
}

export function modifiersFromEvent(e: KeyboardEvent, heldModifiers = 0): number {
  let mods = heldModifiers;
  if (e.ctrlKey) mods |= MOD.CONTROL;
  if (e.shiftKey) mods |= MOD.SHIFT;
  if (e.altKey) mods |= MOD.ALT;
  if (e.metaKey) mods |= MOD.META;
  return mods;
}
