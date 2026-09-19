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
  library: (w) => {
    // The library scrolls a list too, so it hits the same WebKitGTK ghosting
    // class as the palette. It has no frosted-glass surface to opt into, so it
    // stays opaque and drops the Windows-only mica entry (a no-op on Linux that
    // just confuses reviewers).
    const next: WindowConfig = { ...w, transparent: false };
    delete next.windowEffects;
    return next;
  },
  palette: (w) => {
    // The palette is created `transparent: true` (transparency can't be toggled
    // after window creation) so the opt-in "translucent" setting can work.
    // Opacity is enforced at runtime instead: when the setting is off (default),
    // the webview paints an opaque background so WebKitGTK never enters the
    // damage-tracking path that leaves ghost rows while scrolling (tauri#14811,
    // webkit#305758). Only the macOS/Windows window effects are dropped.
    const next: WindowConfig = { ...w };
    delete next.windowEffects;
    return next;
  },
};

it('mirrors every base window into the Linux config, applying only the intended overrides', () => {
  const expected = baseWindows.map((w) => linuxOverrides[w.label]?.(w) ?? w);
  expect(linuxWindows).toEqual(expected);
});

it('creates the palette window transparent (opacity controlled at runtime) and the library opaque on Linux', () => {
  expect(linuxWindows.find((w) => w.label === 'palette')?.transparent).toBe(true);
  expect(linuxWindows.find((w) => w.label === 'library')?.transparent).toBe(false);
});
