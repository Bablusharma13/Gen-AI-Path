'use client';

import { useTheme } from 'next-themes';

/**
 * Chart palette (hex) per mode — the same values as the --viz-* CSS tokens, needed in JS where
 * colours must be computed (heatmap cells pick their text ink by measured contrast).
 * Slots 1–2 were validated with the dataviz palette validator on the real card surfaces.
 */
export const VIZ = {
  light: {
    seqLow: '#cde2fb',
    seqHigh: '#184f95',
    divNeg: '#e34948',
    divMid: '#f0efec',
    // Step 550 of the blue ramp: slot-1 blue (#2a78d6) gives only 4.46:1 for cell text.
    divPos: '#1c5cab',
    surface: '#ffffff',
  },
  dark: {
    seqLow: '#0d366b',
    seqHigh: '#86b6ef',
    divNeg: '#e66767',
    divMid: '#383835',
    divPos: '#3987e5',
    surface: '#151821',
  },
} as const;
export type VizMode = keyof typeof VIZ;

export function useVizMode(): VizMode {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'dark' ? 'dark' : 'light';
}

// Pure black: with white as the alternative, some ink always clears 4.5:1 (near-black leaves a gap).
const INK_DARK = '#000000';
const INK_LIGHT = '#ffffff';

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, c)) * 255);
};

function rgbToOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToHex([L, a, b]: [number, number, number]): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return `#${[r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Mix in OKLab, like CSS `color-mix(in oklab, a t, b)` with t = share of `a`. */
export function mixOklab(a: string, b: string, t: number): string {
  const A = rgbToOklab(hexToRgb(a));
  const B = rgbToOklab(hexToRgb(b));
  return oklabToHex([B[0] + (A[0] - B[0]) * t, B[1] + (A[1] - B[1]) * t, B[2] + (A[2] - B[2]) * t]);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** The ink (near-black or white) with the higher WCAG contrast on `background`. */
export function bestInk(background: string): string {
  return contrastRatio(INK_DARK, background) >= contrastRatio(INK_LIGHT, background)
    ? INK_DARK
    : INK_LIGHT;
}

export function cellColors(
  value: number | null,
  scale: 'sequential' | 'diverging',
  mode: VizMode,
): { background: string; color: string } | null {
  if (value === null || !Number.isFinite(value)) return null;
  const p = VIZ[mode];
  const background =
    scale === 'sequential'
      ? mixOklab(p.seqHigh, p.seqLow, Math.max(0, Math.min(1, value)))
      : mixOklab(value >= 0 ? p.divPos : p.divNeg, p.divMid, Math.min(1, Math.abs(value)));
  return { background, color: bestInk(background) };
}
