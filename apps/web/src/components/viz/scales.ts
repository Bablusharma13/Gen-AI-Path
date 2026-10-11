/** Minimal, dependency-free scales and tick helpers for the lab charts. */

export type Scale = (value: number) => number;

export function linearScale([d0, d1]: [number, number], [r0, r1]: [number, number]): Scale {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Log10 scale; values ≤ 0 are clamped to the domain minimum. */
export function logScale([d0, d1]: [number, number], range: [number, number]): Scale {
  const lin = linearScale([Math.log10(d0), Math.log10(d1)], range);
  return (v) => lin(Math.log10(Math.max(v, d0)));
}

/** "Nice" round ticks covering [min, max] (classic 1-2-5 algorithm). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  // Pick the 1-2-5 step closest to the raw step (thresholds at √50, √10, √2).
  const step =
    (residual >= 7.07 ? 10 : residual >= 3.16 ? 5 : residual >= 1.41 ? 2 : 1) * magnitude;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** Domain [floor, ceil] snapped to nice tick boundaries. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  const ticks = niceTicks(min, max, count);
  if (ticks.length === 0) return [min, max];
  const step = ticks.length > 1 ? ticks[1]! - ticks[0]! : 1;
  const last = ticks[ticks.length - 1]!;
  return [ticks[0]!, last < max ? last + step : last];
}

export function logTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e += 1)
    ticks.push(10 ** e);
  return ticks;
}

/** Compact, readable tick labels: 1,000 · 2.5 · 0.01 · 1e-6 */
export function formatTick(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e6 || abs < 1e-3) return v.toExponential(0);
  if (abs >= 1000) return Math.round(v).toLocaleString('en');
  return Number(v.toPrecision(3)).toString();
}
