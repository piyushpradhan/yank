import { describe, expect, it } from 'vitest';
import { colorForms, resolveColor, toHex, toHslString, toRgbString } from './color';

describe('resolveColor', () => {
  it('parses 6-digit hex', () => {
    expect(resolveColor('#4b0082')).toEqual({ r: 75, g: 0, b: 130 });
  });

  it('parses 3-digit hex', () => {
    expect(resolveColor('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('parses hex without leading hash', () => {
    expect(resolveColor('00ff00')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('parses rgb()', () => {
    expect(resolveColor('rgb(75, 0, 130)')).toEqual({ r: 75, g: 0, b: 130 });
  });

  it('parses rgba() ignoring alpha', () => {
    expect(resolveColor('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('resolves a CSS named color via the DOM', () => {
    expect(resolveColor('indigo')).toEqual({ r: 75, g: 0, b: 130 });
  });

  it('returns null for non-colors', () => {
    expect(resolveColor('not a color')).toBeNull();
    expect(resolveColor('')).toBeNull();
  });
});

describe('formatting', () => {
  it('round-trips indigo across forms', () => {
    const rgb = { r: 75, g: 0, b: 130 };
    expect(toHex(rgb)).toBe('#4b0082');
    expect(toRgbString(rgb)).toBe('rgb(75, 0, 130)');
    expect(toHslString(rgb)).toBe('hsl(275, 100%, 25%)');
  });

  it('colorForms gives all three for a named color', () => {
    expect(colorForms('indigo')).toEqual({
      hex: '#4b0082',
      rgb: 'rgb(75, 0, 130)',
      hsl: 'hsl(275, 100%, 25%)',
    });
  });

  it('colorForms returns null for non-colors', () => {
    expect(colorForms('hello world')).toBeNull();
  });
});
