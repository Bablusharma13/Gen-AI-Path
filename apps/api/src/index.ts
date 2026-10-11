import { createServer } from 'node:http';
import { createApp } from './app';
import { buildContext, shutdownContext } from './bootstrap';

async function main(): Promise<void> {
  const ctx = await buildContext();
  const app = createApp(ctx);
  const server = createServer(app);

  server.listen(ctx.config.port, () => {
    ctx.logger.info(
      { port: ctx.config.port, env: ctx.config.env, web: ctx.config.webUrl },
      'GenPath API listening',
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    ctx.logger.info({ signal }, 'Shutting down');
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    server.close(() => {
      void shutdownContext(ctx).finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
