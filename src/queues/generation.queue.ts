import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export type GenerationJobData = {
  generationId: string;
  userId: string;
  mode: 'text-to-image' | 'image-to-image' | 'enhance';
  prompt?: string;
  sourceImageUrl?: string;
  settings: Record<string, unknown>;
};

const queueName = 'image-generation';
let generationQueue: Queue<GenerationJobData> | undefined;

// BullMQ requires a dedicated Redis connection with per-command retries disabled.
function createQueueConnection() {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export function getGenerationQueue() {
  // Create the producer only when a generation request first needs the queue.
  generationQueue ??= new Queue<GenerationJobData>(queueName, {
    connection: createQueueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800 },
    },
  });

  return generationQueue;
}

export function createGenerationWorker(
  processor: (job: Job<GenerationJobData>) => Promise<unknown>,
) {
  // Workers use their own Redis connection and bounded concurrency.
  const worker = new Worker<GenerationJobData>(queueName, processor, {
    connection: createQueueConnection(),
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    console.info(`[INFO] Generation job completed: ${job.id}`);
  });
  worker.on('failed', (job, error) => {
    console.error(
      `[ERROR] Generation job ${job?.id ?? 'unknown'} failed: ${error.message}`,
    );
  });

  return worker;
}

export async function closeGenerationQueue() {
  await generationQueue?.close();
  generationQueue = undefined;
}
