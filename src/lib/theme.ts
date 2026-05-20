import type { Density, Theme, ThemeMode } from "./types";

/**
 * Build the per-render Theme view. Colors and fonts are now driven directly
 * through Tailwind utilities backed by ember-design-system CSS variables, so
 * this struct keeps only the density-dependent dimensions and the `dark`
 * flag (some logic paths — category palette etc — branch on theme mode).
 */
export function buildTheme(mode: ThemeMode, densityName: Density): Theme {
  const dark = mode === "dark";
  const dense = densityName === "compact";

  return {
    dark,
    dense,
    rowH: dense ? 36 : 52,
    rowHTall: dense ? 48 : 64,
    pad: dense ? 12 : 16,
    radius: 8,
    radiusLg: 12,
  };
}
