import 'dotenv/config';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { env } from '../src/config/env.js';

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: env.DIRECT_URL }),
});

try {
  await prisma.$connect();

  await prisma.plan.upsert({
    where: { slug: 'free' },
    update: {
      name: 'Free',
      priceCents: 0,
      monthlyCredits: 15,
      textToImageCredits: 5,
      imageToImageCredits: 5,
      enhanceImageCredits: 5,
      monthlyImageUploads: 10,
      imageStorageLimitBytes: 100 * 1024 * 1024,
      isActive: true,
      isComingSoon: false,
    },
    create: {
      slug: 'free',
      name: 'Free',
      priceCents: 0,
      monthlyCredits: 15,
      textToImageCredits: 5,
      imageToImageCredits: 5,
      enhanceImageCredits: 5,
      monthlyImageUploads: 10,
      imageStorageLimitBytes: 100 * 1024 * 1024,
    },
  });

  await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: {
      name: 'Pro',
      priceCents: null,
      monthlyCredits: 60,
      textToImageCredits: 20,
      imageToImageCredits: 20,
      enhanceImageCredits: 20,
      monthlyImageUploads: 50,
      imageStorageLimitBytes: 500 * 1024 * 1024,
      isActive: true,
      isComingSoon: false,
    },
    create: {
      slug: 'pro',
      name: 'Pro',
      priceCents: null,
      monthlyCredits: 60,
      textToImageCredits: 20,
      imageToImageCredits: 20,
      enhanceImageCredits: 20,
      monthlyImageUploads: 50,
      imageStorageLimitBytes: 500 * 1024 * 1024,
    },
  });

  await prisma.plan.upsert({
    where: { slug: 'max' },
    update: {
      name: 'Max',
      priceCents: null,
      monthlyCredits: 0,
      textToImageCredits: 0,
      imageToImageCredits: 0,
      enhanceImageCredits: 0,
      monthlyImageUploads: 0,
      imageStorageLimitBytes: 0,
      isActive: false,
      isComingSoon: true,
    },
    create: {
      slug: 'max',
      name: 'Max',
      priceCents: null,
      monthlyCredits: 0,
      textToImageCredits: 0,
      imageToImageCredits: 0,
      enhanceImageCredits: 0,
      monthlyImageUploads: 0,
      imageStorageLimitBytes: 0,
      isActive: false,
      isComingSoon: true,
    },
  });

  console.info('Seeded Free, Pro, and Max plan definitions.');
} finally {
  await prisma.$disconnect();
}
