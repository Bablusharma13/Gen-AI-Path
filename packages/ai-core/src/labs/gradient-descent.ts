import { z } from 'zod';

export const gradientDescentConfigSchema = z.object({
  learningRate: z.number().min(0.0001).max(2).default(0.05),
  steps: z.number().int().min(1).max(500).default(60),
  points: z
    .array(z.tuple([z.number(), z.number()]))
    .min(2)
    .max(50)
    .default([
      [0, 1.1],
      [1, 2.9],
      [2, 5.2],
      [3, 6.8],
      [4, 9.1],
    ]),
  initialW: z.number().min(-100).max(100).default(0),
  initialB: z.number().min(-100).max(100).default(0),
});
export type GradientDescentConfig = z.input<typeof gradientDescentConfigSchema>;

export interface GradientDescentPoint {
  step: number;
  w: number;
  b: number;
  loss: number;
}

export interface GradientDescentResult {
  history: GradientDescentPoint[];
  diverged: boolean;
  points: [number, number][];
  /** Closed-form least-squares answer, to compare against. */
  optimum: { w: number; b: number; loss: number };
}

const mse = (w: number, b: number, points: [number, number][]) =>
  points.reduce((s, [x, y]) => s + (w * x + b - y) ** 2, 0) / points.length;

/** Real batch gradient descent on mean squared error for y ≈ w·x + b. */
export function runGradientDescent(input: GradientDescentConfig = {}): GradientDescentResult {
  const config = gradientDescentConfigSchema.parse(input);
  const { points, learningRate } = config;
  let w = config.initialW;
  let b = config.initialB;
  const history: GradientDescentPoint[] = [{ step: 0, w, b, loss: mse(w, b, points) }];
  let diverged = false;
  const n = points.length;

  for (let step = 1; step <= config.steps; step += 1) {
    let gradW = 0;
    let gradB = 0;
    for (const [x, y] of points) {
      const error = w * x + b - y;
      gradW += (2 / n) * error * x;
      gradB += (2 / n) * error;
    }
    w -= learningRate * gradW;
    b -= learningRate * gradB;
    const loss = mse(w, b, points);
    if (!Number.isFinite(loss) || loss > 1e12) {
      diverged = true;
      break;
    }
    history.push({ step, w, b, loss });
  }

  const meanX = points.reduce((s, [x]) => s + x, 0) / n;
  const meanY = points.reduce((s, [, y]) => s + y, 0) / n;
  const sxx = points.reduce((s, [x]) => s + (x - meanX) ** 2, 0);
  const sxy = points.reduce((s, [x, y]) => s + (x - meanX) * (y - meanY), 0);
  const optW = sxx === 0 ? 0 : sxy / sxx;
  const optB = meanY - optW * meanX;
  return {
    history,
    diverged,
    points,
    optimum: { w: optW, b: optB, loss: mse(optW, optB, points) },
  };
}
