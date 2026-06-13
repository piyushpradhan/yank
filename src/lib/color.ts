// Resolve any CSS color string a clip might hold (hex, rgb/rgba, hsl/hsla, or
// a named color like "indigo") into its HEX / RGB / HSL representations, so
// the detail pane can show the user every form of the color they copied.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function parseHex(input: string): Rgb | null {
  const m = HEX_RE.exec(input.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function parseRgbFunc(input: string): Rgb | null {
  // Matches "rgb(r, g, b)" / "rgba(...)" and modern "rgb(r g b / a)".
  const m = /^rgba?\(([^)]+)\)$/i.exec(input.trim());
  if (!m) return null;
  const nums = m[1]
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => {
      const pct = p.endsWith('%');
      const v = parseFloat(p);
      if (Number.isNaN(v)) return NaN;
      return pct ? (v / 100) * 255 : v;
    });
  if (nums.length < 3 || nums.some(Number.isNaN)) return null;
  const [r, g, b] = nums.map((n) => Math.max(0, Math.min(255, Math.round(n))));
  return { r, g, b };
}

// Last resort for named colors / hsl / oklch and anything else the browser
// understands: let the engine resolve it to an rgb() string for us.
function resolveViaDom(input: string): Rgb | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.style.color = '';
  el.style.color = input;
  // An invalid value leaves the property untouched (empty).
  if (!el.style.color) return null;
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  document.body.removeChild(el);
  return parseRgbFunc(computed);
}

export function resolveColor(input: string): Rgb | null {
  if (!input) return null;
  return parseHex(input) ?? parseRgbFunc(input) ?? resolveViaDom(input);
}

export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function toRgbString({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function toHslString({ r, g, b }: Rgb): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6;
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

export interface ColorForms {
  hex: string;
  rgb: string;
  hsl: string;
}

/** All three representations of `input`, or `null` if it isn't a color. */
export function colorForms(input: string): ColorForms | null {
  const rgb = resolveColor(input);
  if (!rgb) return null;
  return { hex: toHex(rgb), rgb: toRgbString(rgb), hsl: toHslString(rgb) };
}
