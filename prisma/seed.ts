import 'dotenv/config';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { env } from '../src/config/env.js';

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: env.DIRECT_URL }),
});

// The schema has no application models yet; verify connectivity until seed data exists.
try {
  await prisma.$connect();
  console.info(
    'Database connection verified; no seed records are defined yet.',
  );
} finally {
  await prisma.$disconnect();
}
