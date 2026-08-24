const calculateReturnRate = (totalOrders = 0, totalReturns = 0) => {
  if (!totalOrders || totalOrders <= 0) return 0;
  return Math.min(Math.round((totalReturns / totalOrders) * 100), 100);
};

const getRiskLevel = (score) => {
  if (score >= 85) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
};

const daysSinceDate = (date) => {
  if (!date) return Number.MAX_SAFE_INTEGER;
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return Number.MAX_SAFE_INTEGER;
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
};

const calculateCustomerRisk = (customer = {}) => {
  const totalOrders = Number(customer.totalOrders || 0);
  const totalReturns = Number(customer.totalReturns || 0);
  const totalSpent = Number(customer.totalSpent || 0);
  const returnRate = calculateReturnRate(totalOrders, totalReturns);
  const lastReturnDate = customer.lastReturnDate || customer.lastReturnAt || null;
  const lastReturnAgeDays = daysSinceDate(lastReturnDate);

  const factors = {};
  let riskScore = 0;

  // Return rate is the strongest signal.
  if (returnRate >= 25) {
    riskScore += 35;
    factors.returnRate = 35;
  } else if (returnRate >= 15) {
    riskScore += 20;
    factors.returnRate = 20;
  } else if (returnRate >= 8) {
    riskScore += 10;
    factors.returnRate = 10;
  } else {
    factors.returnRate = 0;
  }

  // Count of returns indicates persistent suspicious activity.
  if (totalReturns >= 6) {
    riskScore += 30;
    factors.totalReturns = 30;
  } else if (totalReturns >= 3) {
    riskScore += 15;
    factors.totalReturns = 15;
  } else if (totalReturns >= 1) {
    riskScore += 5;
    factors.totalReturns = 5;
  } else {
    factors.totalReturns = 0;
  }

  // Recent return behavior increases risk.
  if (lastReturnAgeDays <= 30) {
    riskScore += 25;
    factors.recentReturn = 25;
  } else if (lastReturnAgeDays <= 90) {
    riskScore += 10;
    factors.recentReturn = 10;
  } else {
    factors.recentReturn = 0;
  }

  // Higher spend customers may be monitored more closely because their returns have bigger impact.
  if (totalSpent >= 5000) {
    riskScore += 10;
    factors.highValueCustomer = 10;
  } else if (totalSpent >= 2000) {
    riskScore += 5;
    factors.highValueCustomer = 5;
  } else {
    factors.highValueCustomer = 0;
  }

  riskScore = Math.min(Math.round(riskScore), 100);
  const riskLevel = getRiskLevel(riskScore);

  return {
    riskScore,
    riskLevel,
    returnRate,
    factors,
    lastReturnAgeDays,
  };
};

export { calculateReturnRate, calculateCustomerRisk, getRiskLevel };
