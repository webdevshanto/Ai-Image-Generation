import 'dotenv/config';
import { z } from 'zod';

// Parse environment variables once so invalid configuration fails at startup.
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z
    .string()
    .default(
      'postgresql://postgres:postgres@localhost:5432/app_db?sslmode=disable',
    ),
  DIRECT_URL: z
    .string()
    .default(
      'postgresql://postgres:postgres@localhost:5432/app_db?sslmode=disable',
    ),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16).default('development-secret-change-it'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  IMAGE_PROVIDER_API_KEY: z.string().optional(),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

export const env = envSchema.parse(process.env);
