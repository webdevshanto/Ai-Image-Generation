import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { redis } from './db/redis.js';

const port = env.PORT;
const server = app.listen(port, () => {
  console.info(`[INFO] Server listening at http://localhost:${port}`);
});

let isShuttingDown = false;

// Close the HTTP listener before releasing shared service connections.
async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.info(`[INFO] Server shutting down (${signal})`);

  // Prevent a stuck connection from keeping the process alive indefinitely.
  const forceExit = setTimeout(() => {
    console.error('[ERROR] Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    if (error) {
      console.error(`[ERROR] Server shutdown failed: ${error.message}`);
      process.exitCode = 1;
    }

    await Promise.allSettled([
      prisma.$disconnect(),
      redis.status === 'wait'
        ? Promise.resolve(redis.disconnect())
        : redis.quit(),
    ]);

    clearTimeout(forceExit);
    if (process.exitCode) process.exit(process.exitCode);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
