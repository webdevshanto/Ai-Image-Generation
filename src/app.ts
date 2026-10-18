import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestContext } from './middleware/request-context.js';
import { apiRouter } from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // Attach request IDs first so every later response and log can use them.
  app.use(requestContext);
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(helmet());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Keep the browser landing route plain text; API routes remain JSON.
  app.get('/', (_req, res) => {
    res.type('text').send('AI Image Generation API is running.');
  });

  // This lightweight probe does not require database or Redis availability.
  app.get('/health', (req, res) => {
    res.json({
      success: true,
      message: 'Service is live',
      data: { status: 'live' },
      error: null,
      requestId: req.requestId,
    });
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
