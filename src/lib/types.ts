export type Category =
  | 'code'
  | 'url'
  | 'email'
  | 'phone'
  | 'color'
  | 'path'
  | 'text'
  | 'address'
  | 'number'
  | 'image';

export interface ClipItem {
  id: string;
  category: Category;
  label: string;
  labelGenerated?: boolean;
  source: string;
  minutesAgo: number;
  pinned?: boolean;
  content: string;
  preview: string;
  deleted?: boolean;
  deletedAt?: number;
}

export type ThemeMode = 'light' | 'dark';
export type Density = 'comfy' | 'compact';
export type CategoryDisplay = 'chip' | 'icon' | 'dot';
export type PreviewMode = 'split' | 'inline';
export type SearchMode = 'fuzzy' | 'semantic';
export type Filter = 'all' | 'pinned' | Category;

export interface TimeWindowDto {
  fromMs: number;
  toMs: number;
  label: string;
}

export interface SemanticSearchResponse {
  items: ClipItem[];
  timeWindow: TimeWindowDto | null;
}

export interface Tweaks {
  theme: ThemeMode;
  density: Density;
  categoryDisplay: CategoryDisplay;
  showLabels: boolean;
  previewMode: PreviewMode;
  paletteShortcut?: string;
  autostart?: boolean;
  plainTextOnly?: boolean;
}

/**
 * Theme view exposed to components. Colors and fonts are now applied via
 * Tailwind utilities backed by ember-design-system CSS variables, so this
 * struct only carries dimensions that change with density and a few logic
 * flags (`dark` is still used by category-palette branches).
 */
export interface Theme {
  dark: boolean;
  dense: boolean;
  rowH: number;
  rowHTall: number;
  pad: number;
  radius: number;
  radiusLg: number;
}

export type ToastKind = 'copy' | 'pin' | 'delete' | 'info';

export interface Toast {
  id: number;
  msg: string;
  kind: ToastKind;
  undo?: () => void;
}
