import type { Request } from 'express';
import type { z } from 'zod';
import { AppError } from './errors';

function toDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function parseWith<S extends z.ZodType>(
  schema: S,
  value: unknown,
  where: string,
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', `Invalid ${where}`, toDetails(result.error));
  }
  return result.data;
}

export const parseBody = <S extends z.ZodType>(schema: S, req: Request) =>
  parseWith(schema, req.body ?? {}, 'request body');

export const parseQuery = <S extends z.ZodType>(schema: S, req: Request) =>
  parseWith(schema, req.query, 'query parameters');

export const parseParams = <S extends z.ZodType>(schema: S, req: Request) =>
  parseWith(schema, req.params, 'path parameters');
