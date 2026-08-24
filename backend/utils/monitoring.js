const metrics = {
  requestsTotal: 0,
  requestsByRoute: {},
  successCount: 0,
  errorCount: 0,
  modelFallbacks: 0,
  latencySamples: [],
  lastUpdated: null,
};

const recordRequest = (req, statusCode, durationMs) => {
  const routeKey = req.route?.path || req.path || 'unknown';

  metrics.requestsTotal += 1;
  metrics.requestsByRoute[routeKey] = (metrics.requestsByRoute[routeKey] || 0) + 1;
  metrics.lastUpdated = new Date().toISOString();

  if (statusCode >= 400) {
    metrics.errorCount += 1;
  } else {
    metrics.successCount += 1;
  }

  metrics.latencySamples.push(durationMs);
  if (metrics.latencySamples.length > 100) {
    metrics.latencySamples.shift();
  }
};

const recordModelFallback = () => {
  metrics.modelFallbacks += 1;
  metrics.lastUpdated = new Date().toISOString();
};

const getMonitoringSnapshot = () => {
  const totalSamples = metrics.latencySamples.length;
  const avgLatency = totalSamples > 0
    ? metrics.latencySamples.reduce((sum, value) => sum + value, 0) / totalSamples
    : 0;

  return {
    service: 'risk-management-backend',
    uptimeSeconds: Number(process.uptime().toFixed(2)),
    requestsTotal: metrics.requestsTotal,
    successCount: metrics.successCount,
    errorCount: metrics.errorCount,
    modelFallbacks: metrics.modelFallbacks,
    requestsByRoute: { ...metrics.requestsByRoute },
    averageLatencyMs: Number(avgLatency.toFixed(2)),
    lastUpdated: metrics.lastUpdated,
  };
};

export { recordRequest, recordModelFallback, getMonitoringSnapshot, metrics };
