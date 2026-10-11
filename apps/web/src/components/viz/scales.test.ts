import { describe, expect, it } from 'vitest';
import { formatTick, linearScale, logScale, logTicks, niceDomain, niceTicks } from './scales';

describe('scales', () => {
  it('maps linearly', () => {
    const s = linearScale([0, 10], [0, 100]);
    expect(s(5)).toBe(50);
    expect(linearScale([0, 10], [100, 0])(10)).toBe(0);
  });

  it('maps on a log10 scale and clamps non-positive values', () => {
    const s = logScale([0.01, 100], [0, 400]);
    expect(s(1)).toBeCloseTo(200);
    expect(s(0)).toBe(0);
  });

  it('produces round ticks', () => {
    expect(niceTicks(0, 21)).toEqual([0, 5, 10, 15, 20]);
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceDomain(0.3, 21)).toEqual([0, 25]);
  });

  it('produces decade ticks for log axes', () => {
    expect(logTicks(0.02, 30)).toEqual([0.01, 0.1, 1, 10, 100]);
  });

  it('formats tick labels compactly', () => {
    expect(formatTick(1500)).toBe('1,500');
    expect(formatTick(0.25)).toBe('0.25');
    expect(formatTick(0.0001)).toBe('1e-4');
    expect(formatTick(0)).toBe('0');
  });
});
