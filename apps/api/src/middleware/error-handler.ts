import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import type { ApiErrorBody } from '@genpath/shared';
import { AppError } from '../lib/errors';

interface HttpLikeError {
  type?: string;
  status?: number;
  statusCode?: number;
}

/** Converts known library errors into AppErrors with client-safe messages. */
function normalize(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const httpErr = err as HttpLikeError;
  if (httpErr?.type === 'entity.too.large') {
    return new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  if (httpErr?.type === 'entity.parse.failed') {
    return new AppError('BAD_REQUEST', 'Malformed JSON body');
  }
  if (httpErr?.type === 'encoding.unsupported' || httpErr?.type === 'charset.unsupported') {
    return new AppError('UNSUPPORTED_MEDIA_TYPE', 'Unsupported request encoding');
  }
  if (err instanceof mongoose.Error.CastError) {
    return new AppError('VALIDATION_ERROR', `Invalid value for ${err.path}`);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return new AppError(
      'VALIDATION_ERROR',
      'Invalid data',
      Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    );
  }
  if ((err as { code?: number })?.code === 11000) {
    return new AppError('CONFLICT', 'That record already exists');
  }
  return new AppError('INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = normalize(err);
  const log = req.log ?? console;
  if (appError.status >= 500) {
    log.error({ err }, 'request failed');
  } else {
    log.debug({ code: appError.code }, appError.message);
  }

  if (res.headersSent) {
    // Streaming responses: the connection can only be closed.
    res.end();
    return;
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      requestId: String(req.id ?? ''),
      ...(appError.details !== undefined ? { details: appError.details } : {}),
    },
  };
  res.status(appError.status).json(body);
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
};
