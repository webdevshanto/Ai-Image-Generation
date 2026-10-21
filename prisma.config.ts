import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Use Neon's direct connection for schema changes.
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
