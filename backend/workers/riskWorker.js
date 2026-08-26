import { Worker } from 'bullmq';
import Customer from '../models/Customer.js';
import ReturnRisk from '../models/ReturnRisk.js';
import { calculateCustomerRisk as calculateLocalRisk, getRiskLevel } from '../utils/riskCalculator.js';
import { predictCustomerRisk, combineRiskScores } from '../utils/modelServiceClient.js';
import { recordModelFallback } from '../utils/monitoring.js';
import mongoose from 'mongoose';

// Connect to MongoDB if not already connected (useful if running worker as a separate process)
if (mongoose.connection.readyState === 0) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/risk-management');
}

const redisOptions = {
  connection: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
};

// Create a worker that listens to the 'RiskEvaluationQueue'
export const riskWorker = new Worker('RiskEvaluationQueue', async (job) => {
  const { customerId, returnId } = job.data;
  console.log(`[BullMQ Worker] Processing risk evaluation for customer: ${customerId}`);

  try {
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    // 1. Calculate local risk parameters (returnRate etc)
    const localRisk = calculateLocalRisk(customer);
    
    // We can silently update the customer's returnRate while we are here
    customer.returnRate = localRisk.returnRate;
    await customer.save();

    let externalRisk = null;
    let fallbackUsed = false;
    let modelVersion = 'unknown';
    let source = 'local';

    // 2. Call the slow Python ML Microservice
    try {
      externalRisk = await predictCustomerRisk(customer);
      modelVersion = externalRisk?.model_version || process.env.MODEL_VERSION || 'customer-risk-v1';
      source = 'hybrid';
    } catch (serviceError) {
      console.error(`[BullMQ Worker] Model service failed, using fallback:`, serviceError.message);
      fallbackUsed = true;
      recordModelFallback();
    }

    // 3. Combine scores
    const localScore = Number(localRisk.riskScore || 0);
    const modelScore = Number(externalRisk?.risk_score || 0);
    const riskScore = externalRisk ? Math.round(combineRiskScores(localScore, modelScore)) : localScore;
    const riskLevel = getRiskLevel(riskScore);
    const recommendation = externalRisk?.recommendation || (riskLevel === 'High' || riskLevel === 'Critical' ? 'Monitor closely' : 'No immediate action');

    // 4. Save to Database
    let returnRisk = await ReturnRisk.findOne({ customer: customer._id });
    if (returnRisk) {
      returnRisk.riskScore = riskScore;
      returnRisk.riskLevel = riskLevel;
      returnRisk.source = source;
      returnRisk.modelVersion = modelVersion;
      returnRisk.fallbackUsed = fallbackUsed;
      returnRisk.analysisDate = Date.now();
      returnRisk.factors = localRisk.factors;
      await returnRisk.save();
    } else {
      returnRisk = await ReturnRisk.create({
        customer: customer._id,
        riskScore,
        riskLevel,
        source,
        modelVersion,
        fallbackUsed,
        factors: localRisk.factors,
        recommendations: ['Monitor return patterns', recommendation],
      });
    }

    // Update customer reference
    customer.riskAnalysis = returnRisk._id;
    await customer.save();

    console.log(`[BullMQ Worker] Successfully evaluated risk for ${customerId}. Score: ${riskScore} (${riskLevel})`);
    
    // Attempt to emit a WebSocket event to the frontend
    try {
      const { getIo } = await import('../utils/socket.js');
      const io = getIo();
      io.emit('risk_calculated', {
        returnId,
        customerId,
        finalRiskScore: riskScore,
        finalRiskLevel: riskLevel,
        source
      });
      console.log(`[BullMQ Worker] Emitted 'risk_calculated' WebSocket event`);
    } catch (socketError) {
      console.log(`[BullMQ Worker] Could not emit WebSocket event (Socket.io might not be initialized):`, socketError.message);
    }
    
    // Return result to BullMQ
    return { riskScore, riskLevel, source };
  } catch (error) {
    console.error(`[BullMQ Worker] Fatal error processing job ${job.id}:`, error);
    throw error; // Let BullMQ handle retries
  }
}, redisOptions);

riskWorker.on('completed', (job, returnvalue) => {
  console.log(`[BullMQ Worker] Job ${job.id} has completed!`);
});

riskWorker.on('failed', (job, err) => {
  console.log(`[BullMQ Worker] Job ${job.id} has failed with ${err.message}`);
});
