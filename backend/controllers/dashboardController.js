import Customer from '../models/Customer.js';
import Return from '../models/Return.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { calculateCustomerRisk, getRiskLevel } from '../utils/riskCalculator.js';

const formatTimeAgo = (date) => {
  if (!date) return 'N/A';
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);

  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
};

const getDashboardData = asyncHandler(async (req, res) => {
  const customers = await Customer.find({}).populate('riskAnalysis');
  // Fetch recent returns and populate customer details along with riskAnalysis
  const recentReturnsFromDB = await Return.find({
    returnDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  })
    .sort({ returnDate: -1 })
    .limit(10)
    .populate({
      path: 'customer',
      populate: { path: 'riskAnalysis' },
    });

  // Initialize dashboard stats
  let totalCustomers = customers.length;
  let totalOrdersAcrossAllCustomers = 0;
  let totalReturnsAcrossAllCustomers = 0;
  let highRiskCustomerCount = 0;
  let lowRiskCustomerCount = 0;
  let mediumRiskCustomerCount = 0;

  const highRiskCustomersList = [];
  const recentReturnsListFormatted = []; // To store formatted recent return info

  // Revenue impact is calculated from actual return product prices in the database
  const returnRecords = await Return.find({}).lean();
  const revenueImpact = returnRecords.reduce((sum, returnItem) => sum + Number(returnItem.productPrice || 0), 0);

  // Process customers using canonical risk scoring
  customers.forEach(customer => {
    totalOrdersAcrossAllCustomers += customer.totalOrders;
    totalReturnsAcrossAllCustomers += customer.totalReturns;

    const localRisk = calculateCustomerRisk(customer);
    const riskScore = customer.riskAnalysis?.riskScore ?? localRisk.riskScore;
    const riskLevel = customer.riskAnalysis?.riskLevel ?? localRisk.riskLevel;

    // Count risk categories matching standard thresholds (High >= 70, Medium >= 40, Low < 40)
    if (riskLevel === 'High' || riskLevel === 'Critical' || riskScore >= 70) {
      highRiskCustomerCount++;
      highRiskCustomersList.push({
        id: customer.customerId,
        name: customer.name,
        riskScore: riskScore,
        returns: customer.totalReturns,
        totalOrders: customer.totalOrders,
      });
    } else if (riskLevel === 'Medium' || (riskScore >= 40 && riskScore < 70)) {
      mediumRiskCustomerCount++;
    } else {
      lowRiskCustomerCount++;
    }
  });

  // Format recent returns from DB using canonical risk score
  recentReturnsFromDB.forEach(returnItem => {
    const customerData = returnItem.customer;
    if (customerData) {
      const localRisk = calculateCustomerRisk(customerData);
      const riskScore = customerData.riskAnalysis?.riskScore ?? localRisk.riskScore;
      recentReturnsListFormatted.push({
        id: returnItem.returnId,
        customer: customerData.name,
        product: returnItem.product,
        reason: returnItem.reason,
        riskScore,
        time: formatTimeAgo(returnItem.returnDate)
      });
    }
  });

  highRiskCustomersList.sort((a, b) => b.riskScore - a.riskScore);


  const overallReturnRate = totalOrdersAcrossAllCustomers > 0
    ? ((totalReturnsAcrossAllCustomers / totalOrdersAcrossAllCustomers) * 100).toFixed(1)
    : '0.0';

  const previousMonthStart = new Date();
  previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);
  previousMonthStart.setDate(1);
  const previousMonthEnd = new Date();
  previousMonthEnd.setDate(1);

  const previousMonthReturns = await Return.countDocuments({
    createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd }
  });
  const previousMonthRevenue = await Return.aggregate([
    { $match: { createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd } } },
    { $group: { _id: null, total: { $sum: '$productPrice' } } }
  ]);

  const prevReturnRate = previousMonthReturns > 0
    ? ((previousMonthReturns / Math.max(totalCustomers, 1)) * 100)
    : 0;
  const returnRateChange = prevReturnRate > 0
    ? (((Number(overallReturnRate) - prevReturnRate) / prevReturnRate) * 100).toFixed(1)
    : '0.0';
  const prevRevenue = previousMonthRevenue[0]?.total || 0;
  const revenueChange = prevRevenue > 0
    ? (((revenueImpact - prevRevenue) / prevRevenue) * 100).toFixed(1)
    : '0.0';

  const stats = [
    {
      title: "Total Customers",
      value: totalCustomers.toLocaleString(),
      change: '0.0%',
      trend: 'neutral',
      icon: 'Users', 
      color: "text-blue-600",
    },
    {
      title: "Return Rate",
      value: `${overallReturnRate}%`,
      change: `${Number(returnRateChange) >= 0 ? '+' : ''}${returnRateChange}%`,
      trend: Number(returnRateChange) >= 0 ? 'up' : 'down',
      icon: 'TrendingDown',
      color: "text-green-600",
    },
    {
      title: "High Risk Customers",
      value: highRiskCustomerCount.toLocaleString(),
      change: '0.0%',
      trend: 'neutral',
      icon: 'AlertTriangle',
      color: "text-red-600",
    },
    {
      title: "Revenue Impact",
      value: `$${revenueImpact.toLocaleString()}`, 
      change: `${Number(revenueChange) >= 0 ? '+' : ''}${revenueChange}%`,
      trend: Number(revenueChange) >= 0 ? 'up' : 'down',
      icon: 'DollarSign',
      color: "text-purple-600",
    },
  ];

  const totalCustomersForPercentage = totalCustomers > 0 ? totalCustomers : 1; // Avoid division by zero
  const lowRiskPercentage = ((lowRiskCustomerCount / totalCustomersForPercentage) * 100).toFixed(1);
  const mediumRiskPercentage = ((mediumRiskCustomerCount / totalCustomersForPercentage) * 100).toFixed(1);
  const highRiskPercentage = ((highRiskCustomerCount / totalCustomersForPercentage) * 100).toFixed(1);

  const riskDistribution = [
    {
      label: "Low Risk (0-39)",
      count: lowRiskCustomerCount.toLocaleString(),
      percentage: lowRiskPercentage,
      color: "text-green-500",
    },
    {
      label: "Medium Risk (40-69)",
      count: mediumRiskCustomerCount.toLocaleString(),
      percentage: mediumRiskPercentage,
      color: "text-yellow-500",
    },
    {
      label: "High Risk (70-100)",
      count: highRiskCustomerCount.toLocaleString(),
      percentage: highRiskPercentage,
      color: "text-red-500",
    },
  ];



  res.status(200).json(
    new ApiResponse(
      200,
      {
        stats,
        highRiskCustomers: highRiskCustomersList.slice(0, 5), 
        recentReturns: recentReturnsListFormatted.slice(0, 4), 
        riskDistribution,
      },
      'Dashboard data fetched successfully'
    )
  );
});

export { getDashboardData };
