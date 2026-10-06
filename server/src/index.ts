import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { log } from './log.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await createApp({ config });
  const port = await app.listen(config.port);
  log.info(`CityGuess server listening on http://localhost:${port}`, {
    provider: config.streetViewProvider,
    production: config.isProduction,
  });

  const shutdown = (signal: string): void => {
    log.info(`received ${signal}, shutting down`);
    app
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  log.error('fatal', { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
