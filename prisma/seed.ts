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
      monthlyCredits: 16,
      textToImageCredits: 5,
      imageToImageCredits: 5,
      textToVideoCredits: 2,
      imageToVideoCredits: 2,
      videoToVideoCredits: 2,
      monthlyImageUploads: 10,
      libraryImageLimit: 10,
      libraryVideoLimit: 5,
      imageStorageLimitBytes: 100 * 1024 * 1024,
      isActive: true,
      isComingSoon: false,
    },
    create: {
      slug: 'free',
      name: 'Free',
      priceCents: 0,
      monthlyCredits: 16,
      textToImageCredits: 5,
      imageToImageCredits: 5,
      textToVideoCredits: 2,
      imageToVideoCredits: 2,
      videoToVideoCredits: 2,
      monthlyImageUploads: 10,
      libraryImageLimit: 10,
      libraryVideoLimit: 5,
      imageStorageLimitBytes: 100 * 1024 * 1024,
    },
  });

  await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: {
      name: 'Pro',
      priceCents: null,
      monthlyCredits: 58,
      textToImageCredits: 20,
      imageToImageCredits: 20,
      textToVideoCredits: 6,
      imageToVideoCredits: 6,
      videoToVideoCredits: 6,
      monthlyImageUploads: 50,
      libraryImageLimit: 30,
      libraryVideoLimit: 15,
      imageStorageLimitBytes: 500 * 1024 * 1024,
      isActive: true,
      isComingSoon: false,
    },
    create: {
      slug: 'pro',
      name: 'Pro',
      priceCents: null,
      monthlyCredits: 58,
      textToImageCredits: 20,
      imageToImageCredits: 20,
      textToVideoCredits: 6,
      imageToVideoCredits: 6,
      videoToVideoCredits: 6,
      monthlyImageUploads: 50,
      libraryImageLimit: 30,
      libraryVideoLimit: 15,
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
      textToVideoCredits: 0,
      imageToVideoCredits: 0,
      videoToVideoCredits: 0,
      monthlyImageUploads: 0,
      libraryImageLimit: 0,
      libraryVideoLimit: 0,
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
      textToVideoCredits: 0,
      imageToVideoCredits: 0,
      videoToVideoCredits: 0,
      monthlyImageUploads: 0,
      libraryImageLimit: 0,
      libraryVideoLimit: 0,
      imageStorageLimitBytes: 0,
      isActive: false,
      isComingSoon: true,
    },
  });

  console.info('Seeded Free, Pro, and Max plan definitions.');
} finally {
  await prisma.$disconnect();
}
