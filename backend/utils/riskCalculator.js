/**
 * @file riskCalculator.js
 * @description Canonical Rule Engine for calculating customer return risk scores.
 * Evaluates return rates, return frequencies, return recency, lifetime spend, and average order value.
 */

/**
 * Calculates the return percentage rounded to the nearest integer.
 * 
 * @param {number} totalOrders - Total orders placed by the customer.
 * @param {number} totalReturns - Total return requests submitted.
 * @return {number} Return rate percentage capped at 100%.
 */
const calculateReturnRate = (totalOrders = 0, totalReturns = 0) => {
  if (!totalOrders || totalOrders <= 0) return 0;
  return Math.min(Math.round((totalReturns / totalOrders) * 100), 100);
};

/**
 * Maps a numerical risk score (0-100) to a business risk level.
 * 
 * @param {number} score - Risk score between 0 and 100.
 * @return {string} Risk category ('Critical', 'High', 'Medium', 'Low').
 */
const getRiskLevel = (score) => {
  if (score >= 85) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
};

/**
 * Computes elapsed days between current date and target timestamp.
 * 
 * @param {Date|string|null} date - Target return timestamp.
 * @return {number} Integer count of elapsed days.
 */
const daysSinceDate = (date) => {
  if (!date) return Number.MAX_SAFE_INTEGER;
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return Number.MAX_SAFE_INTEGER;
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
};

/**
 * Calculates comprehensive customer risk score and factor breakdown.
 * 
 * @param {Object} customer - Customer metadata document.
 * @param {number} [customer.totalOrders=0] - Total order count.
 * @param {number} [customer.totalReturns=0] - Total return count.
 * @param {number} [customer.totalSpent=0] - Total monetary spend.
 * @param {Date|string} [customer.lastReturnDate] - Timestamp of last return.
 * @return {Object} Risk breakdown object containing score, level, returnRate, factors, and recency.
 */
const calculateCustomerRisk = (customer = {}) => {
  const totalOrders = Number(customer.totalOrders || 0);
  const totalReturns = Number(customer.totalReturns || 0);
  const totalSpent = Number(customer.totalSpent || 0);
  const returnRate = calculateReturnRate(totalOrders, totalReturns);
  const lastReturnDate = customer.lastReturnDate || customer.lastReturnAt || null;
  const lastReturnAgeDays = daysSinceDate(lastReturnDate);
  const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

  const factors = {};
  let riskScore = 0;

  // 1. Return rate is the primary signal
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

  // 2. Count of returns indicates persistent suspicious activity
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

  // 3. Recent return behavior within 30 or 90 days increases current risk
  if (lastReturnAgeDays <= 30) {
    riskScore += 25;
    factors.recentReturn = 25;
  } else if (lastReturnAgeDays <= 90) {
    riskScore += 10;
    factors.recentReturn = 10;
  } else {
    factors.recentReturn = 0;
  }

  // 4. Lifetime spend exposure signal
  if (totalSpent >= 5000) {
    riskScore += 10;
    factors.highValueCustomer = 10;
  } else if (totalSpent >= 2000) {
    riskScore += 5;
    factors.highValueCustomer = 5;
  } else {
    factors.highValueCustomer = 0;
  }

  // 5. High average order value exposure signal
  if (avgOrderValue >= 400) {
    riskScore += 5;
    factors.highAvgOrderValue = 5;
  }

  riskScore = Math.min(Math.round(riskScore), 100);
  const riskLevel = getRiskLevel(riskScore);

  return {
    riskScore,
    riskLevel,
    returnRate,
    factors,
    lastReturnAgeDays,
    avgOrderValue: Math.round(avgOrderValue),
  };
};

export { calculateReturnRate, calculateCustomerRisk, getRiskLevel };
