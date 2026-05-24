import {
  MdKeyboardAlt,
  MdKeyboardArrowDown,
  MdKeyboardArrowLeft,
  MdKeyboardArrowRight,
  MdKeyboardArrowUp,
  MdKeyboardBackspace,
  MdKeyboardCommandKey,
  MdKeyboardControlKey,
  MdKeyboardOptionKey,
  MdKeyboardReturn,
  MdKeyboardTab,
  MdSpaceBar,
} from 'react-icons/md';
import { LuArrowBigUp, LuX } from 'react-icons/lu';
import type { ReactNode } from 'react';

const size = 10;

const KEY_ICON_MAP: Record<string, ReactNode> = {
  // Modifiers
  ctrl: <MdKeyboardControlKey size={size} />,
  control: <MdKeyboardControlKey size={size} />,
  shift: <LuArrowBigUp size={size} />,
  command: <MdKeyboardCommandKey size={size} />,
  meta: <MdKeyboardCommandKey size={size} />,
  '⌘': <MdKeyboardCommandKey size={size} />,
  option: <MdKeyboardOptionKey size={size} />,
  alt: <MdKeyboardAlt size={size} />,

  // Action keys
  tab: <MdKeyboardTab size={size} />,
  enter: <MdKeyboardReturn size={size} />,
  return: <MdKeyboardReturn size={size} />,
  '↵': <MdKeyboardReturn size={size} />,
  delete: <MdKeyboardBackspace size={size} />,
  backspace: <MdKeyboardBackspace size={size} />,
  '⌫': <MdKeyboardBackspace size={size} />,
  esc: <LuX size={size} />,
  escape: <LuX size={size} />,
  space: <MdSpaceBar size={size} />,

  // Arrows
  '↑': <MdKeyboardArrowUp size={size} />,
  '↓': <MdKeyboardArrowDown size={size} />,
  '←': <MdKeyboardArrowLeft size={size} />,
  '→': <MdKeyboardArrowRight size={size} />,
};

export function getKeyIcon(key: string): ReactNode {
  const lower = key.toLowerCase();
  if (KEY_ICON_MAP[lower]) return KEY_ICON_MAP[lower];
  return key;
}
