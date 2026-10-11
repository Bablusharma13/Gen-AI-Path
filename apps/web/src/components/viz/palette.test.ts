import { describe, expect, it } from 'vitest';
import { cellColors, contrastRatio, mixOklab, VIZ } from './palette';

describe('viz palette math', () => {
  it('mix endpoints return the endpoint colours', () => {
    expect(mixOklab('#2a78d6', '#ffffff', 1)).toBe('#2a78d6');
    expect(mixOklab('#2a78d6', '#ffffff', 0)).toBe('#ffffff');
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('every heatmap cell text clears 4.5:1 in both modes, across both scales', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const scale of ['sequential', 'diverging'] as const) {
        const values =
          scale === 'sequential'
            ? [0, 0.1, 0.25, 0.5, 0.55, 0.6, 0.75, 1]
            : [-1, -0.6, -0.3, 0, 0.3, 0.6, 1];
        for (const v of values) {
          const c = cellColors(v, scale, mode)!;
          expect(
            contrastRatio(c.color, c.background),
            `${mode} ${scale} ${v}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('sequential low end recedes toward the surface in both modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const low = cellColors(0, 'sequential', mode)!.background;
      const high = cellColors(1, 'sequential', mode)!.background;
      expect(contrastRatio(low, VIZ[mode].surface)).toBeLessThan(
        contrastRatio(high, VIZ[mode].surface),
      );
    }
  });

  it('masked cells have no colour', () => {
    expect(cellColors(null, 'sequential', 'light')).toBeNull();
  });
});
