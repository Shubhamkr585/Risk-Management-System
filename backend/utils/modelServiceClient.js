const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || 'http://localhost:8000';
const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS || 2000);
const MODEL_WEIGHT = Number(process.env.MODEL_WEIGHT || 0.6);
const LOCAL_WEIGHT = Number(process.env.LOCAL_WEIGHT || 0.4);

const combineRiskScores = (localScore = 0, modelScore = 0) => {
  const combined = (Number(localScore) * LOCAL_WEIGHT) + (Number(modelScore) * MODEL_WEIGHT);
  return Math.min(100, Math.max(0, combined));
};

// Calls the separate model-service to obtain a customer risk score and level.
// Set MODEL_SERVICE_URL in backend environment variables to point to the trained model service.
const predictCustomerRisk = async (customer) => {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available. Please use Node 18+ or polyfill fetch.');
  }

  const payload = {
    returnRate: Number(customer.returnRate || 0),
    totalReturns: Number(customer.totalReturns || 0),
    totalOrders: Number(customer.totalOrders || 0),
    totalSpent: Number(customer.totalSpent || 0),
    lastReturnDate: customer.lastReturnDate ? new Date(customer.lastReturnDate).toISOString() : null,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const response = await fetch(`${MODEL_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Model service respond with status ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return {
      ...result,
      model_version: process.env.MODEL_VERSION || 'customer-risk-v1',
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Model service request timed out after ${MODEL_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export { predictCustomerRisk, combineRiskScores, MODEL_WEIGHT, LOCAL_WEIGHT };
