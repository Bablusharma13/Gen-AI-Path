import { z } from 'zod';

/** JSON-safe value for inspectable lab state. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/**
 * One step of a deterministic lab visualisation. Labs produce validated steps; the frontend
 * renderer decides how to draw them. Nothing in a step is ever executed or rendered as HTML.
 */
export const labStepSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  stage: z.string().min(1).max(40),
  state: z.record(z.string(), jsonValueSchema),
  highlights: z.array(z.string().max(64)).max(50).default([]),
  codeLine: z.number().int().positive().optional(),
});
export type LabStep = z.infer<typeof labStepSchema>;

export const labStepsSchema = z.array(labStepSchema).min(1).max(100);
