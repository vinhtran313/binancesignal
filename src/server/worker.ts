/**
 * Standalone worker process for the trading engine
 * Run with: npm run worker
 */

import { initializeEngine } from './engine';
import { logger } from './utils/logger';

async function main() {
  logger.info('[Worker] Starting trading engine worker...');

  try {
    const engine = await initializeEngine();
    logger.info('[Worker] Trading engine initialized and running');

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('[Worker] Received shutdown signal');
      await engine.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep process alive
    process.on('uncaughtException', (error) => {
      logger.error('[Worker] Uncaught exception', error);
    });

    process.on('unhandledRejection', (error) => {
      logger.error('[Worker] Unhandled rejection', error);
    });
  } catch (error) {
    logger.error('[Worker] Failed to start', error);
    process.exit(1);
  }
}

main();
