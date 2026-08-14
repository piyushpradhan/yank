// @vitest-environment node

import { expect, it } from 'vitest';
import baseConfig from '../../src-tauri/tauri.conf.json';
import linuxConfig from '../../src-tauri/tauri.linux.conf.json';

/**
 * Tauri merges `tauri.linux.conf.json` over `tauri.conf.json` using JSON Merge
 * Patch (RFC 7396), which *replaces* arrays instead of merging them
 * element-wise. The Linux overlay therefore has to restate every window in
 * full — any window or property left out of it is dropped from the Linux build
 * rather than inherited from the base config.
 *
 * That makes the two files easy to drift apart silently: adding a window (or a
 * property) to `tauri.conf.json` alone would simply never ship on Linux, with
 * nothing at build time to say so. These tests pin them together, so the only
 * differences that survive are the ones deliberately listed below.
 */

type WindowConfig = Record<string, unknown> & { label: string };

const baseWindows = baseConfig.app.windows as unknown as WindowConfig[];
const linuxWindows = linuxConfig.app.windows as unknown as WindowConfig[];

/** The only intended differences between the base and the Linux window config. */
const linuxOverrides: Record<string, (w: WindowConfig) => WindowConfig> = {
  palette: (w) => {
    // WebKitGTK mis-computes scroll damage while painting into a translucent
    // window and leaves previously-drawn rows on screen as ghosts, so the
    // Linux palette is created opaque (tauri-apps/tauri#14811, #14924).
    const next: WindowConfig = { ...w, transparent: false };
    // hudWindow/acrylic are macOS/Windows effects that Linux never applies, so
    // the key only ever described an effect this platform could not have.
    delete next.windowEffects;
    return next;
  },
};

it('mirrors every base window into the Linux config, applying only the intended overrides', () => {
  const expected = baseWindows.map((w) => linuxOverrides[w.label]?.(w) ?? w);
  expect(linuxWindows).toEqual(expected);
});

it('creates the palette window opaque on Linux and translucent everywhere else', () => {
  expect(linuxWindows.find((w) => w.label === 'palette')?.transparent).toBe(false);
  expect(baseWindows.find((w) => w.label === 'palette')?.transparent).toBe(true);
});
