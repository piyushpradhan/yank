import { expect, it } from 'vitest';
import { MOD, modifierFromCode, modifiersFromEvent } from './shortcut';

it('keeps Linux Super held when WebKit omits metaKey from the next key event', () => {
  const key = new KeyboardEvent('keydown', { code: 'KeyV' });
  expect(modifiersFromEvent(key, modifierFromCode('OSLeft'))).toBe(MOD.META);
});
