import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { AppContext } from './context';
import { authenticate } from './middleware/auth';
import { csrfProtection } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { createLimiterFactory } from './middleware/rate-limit';
import { rejectOperatorKeys } from './middleware/reject-operator-keys';
import { adminRouter } from './modules/admin/admin.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { assessmentRouter } from './modules/assessments/assessment.routes';
import { authRouter } from './modules/auth/auth.routes';
import { careerRouter } from './modules/career/career.routes';
import { curriculumRouter } from './modules/curriculum/curriculum.routes';
import { exerciseRouter } from './modules/exercises/exercise.routes';
import { healthRouter } from './modules/health/health.routes';
import { knowledgeRouter } from './modules/knowledge/knowledge.routes';
import { profileRouter } from './modules/profile/profile.routes';
import { projectRouter } from './modules/projects/project.routes';
import { roadmapRouter } from './modules/roadmap/roadmap.routes';
import { buildServices } from './services';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export function createApp(ctx: AppContext): Express {
  const app = express();
  const { config } = ctx;

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');

  app.use(
    pinoHttp({
      logger: ctx.logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
            ? incoming
            : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(
    helmet({
      // The API serves JSON only; a locked-down CSP is safe.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin and server-to-server requests carry no Origin header.
        if (!origin || config.allowedOrigins.includes(origin)) callback(null, true);
        else callback(null, false);
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(rejectOperatorKeys);

  const services = buildServices(ctx);
  app.locals.services = services;
  const limiter = createLimiterFactory(ctx.redis);
  const m = config.rateLimitMultiplier;

  const v1 = Router();
  v1.use('/health', healthRouter(ctx));
  v1.use(csrfProtection(config.allowedOrigins));
  v1.use(authenticate(services.tokens));
  v1.use(limiter({ name: 'api', windowMs: 60_000, limit: 300 * m, perUser: true }));
  v1.use('/auth', authRouter(ctx, services, limiter));
  v1.use('/profile', profileRouter(services));
  v1.use(curriculumRouter(services));
  v1.use(roadmapRouter(services));
  v1.use('/assessments', assessmentRouter(services, limiter, m));
  v1.use('/exercises', exerciseRouter(services));
  v1.use('/projects', projectRouter(services, limiter, m));
  v1.use('/career', careerRouter(services));
  v1.use('/ai', aiRouter(services, limiter, m));
  v1.use('/orgs', knowledgeRouter(services, limiter, m, config.uploads.maxBytes));
  v1.use('/admin', adminRouter(services));
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
