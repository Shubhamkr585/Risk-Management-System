import { Queue } from 'bullmq';
import { redisClient } from '../utils/redisClient.js';

// We use the existing REDIS_URL from environment variables
const redisOptions = {
  connection: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
};

// Create a new queue named 'RiskEvaluationQueue'
export const riskQueue = new Queue('RiskEvaluationQueue', redisOptions);

/**
 * Adds a job to the background queue to evaluate a customer's risk.
 * @param {string} customerId - The MongoDB ObjectId of the customer
 * @param {string} returnId - The return document ID that triggered this evaluation
 */
export const addRiskJob = async (customerId, returnId) => {
  try {
    const job = await riskQueue.add('evaluateRisk', {
      customerId,
      returnId,
      timestamp: Date.now()
    }, {
      // Job options
      attempts: 3, // Retry up to 3 times if it fails
      backoff: {
        type: 'exponential',
        delay: 5000 // Wait 5s before first retry, then 10s, etc.
      },
      removeOnComplete: true, // Keep Redis clean
      removeOnFail: false // Keep failed jobs for inspection
    });
    console.log(`[BullMQ] Enqueued risk evaluation job ${job.id} for customer ${customerId}`);
    return job;
  } catch (error) {
    console.error(`[BullMQ] Failed to enqueue risk job for customer ${customerId}:`, error);
  }
};
