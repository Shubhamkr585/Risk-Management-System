import Customer from '../models/Customer.js';
import Return from '../models/Return.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { formatDistanceToNow, subMonths, subDays, startOfMonth } from 'date-fns';

// Notice: The manual formatTimeAgo function is completely removed!
// We now use date-fns `formatDistanceToNow(date, { addSuffix: true })` directly.

const getDashboardData = asyncHandler(async (req, res) => {
  
  // Use date-fns for clean, readable date boundaries
  const now = new Date();
  const previousMonthStart = startOfMonth(subMonths(now, 1));
  const previousMonthEnd = startOfMonth(now);
  const thirtyDaysAgo = subDays(now, 30);

  // ---------------------------------------------------------------------------
  // CRITICAL IMPROVEMENT 1: Execute all DB calls concurrently with Promise.all
  // and completely replace `.find({})` memory dumps with Aggregations.
  // ---------------------------------------------------------------------------
  const [
    customerMetrics, 
    revenueMetrics, 
    previousMonthMetrics,
    recentReturnsFromDB
  ] = await Promise.all([
    
    // 1. Customer Aggregation (Totals + Risk Distribution + Top 5 High Risk)
    Customer.aggregate([
      {
        $facet: {
          totals: [
            { 
              $group: { 
                _id: null, 
                totalCustomers: { $sum: 1 },
                totalOrders: { $sum: "$totalOrders" },
                totalReturns: { $sum: "$totalReturns" }
              } 
            }
          ],
          riskDistribution: [
            {
              $bucket: {
                groupBy: "$riskScore", 
                boundaries: [0, 40, 70, 100],
                default: "High Risk",
                output: { count: { $sum: 1 } }
              }
            }
          ],
          topHighRisk: [
            { $match: { riskScore: { $gte: 70 } } },
            { $sort: { riskScore: -1 } },
            { $limit: 5 },
            { 
              $project: {
                id: "$customerId",
                name: 1,
                riskScore: 1,
                returns: "$totalReturns",
                totalOrders: 1
              }
            }
          ]
        }
      }
    ]),

    // 2. Total Revenue Impact
    Return.aggregate([
      { $group: { _id: null, revenueImpact: { $sum: { $toDouble: "$productPrice" } } } }
    ]),

    // 3. Previous Month Metrics (Returns Count & Revenue combined)
    Return.aggregate([
      { $match: { createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd } } },
      { $group: { _id: null, returns: { $sum: 1 }, revenue: { $sum: { $toDouble: "$productPrice" } } } }
    ]),

    // 4. Recent Returns (Only pull the 10 we need) using date-fns thirtyDaysAgo
    Return.find({ returnDate: { $gte: thirtyDaysAgo } })
      .sort({ returnDate: -1 })
      .limit(10)
      .populate('customer') 
      .lean()
  ]);

  // ---------------------------------------------------------------------------
  // CRITICAL IMPROVEMENT 2: Extract values safely from Aggregation results
  // ---------------------------------------------------------------------------
  const totals = customerMetrics[0]?.totals[0] || { totalCustomers: 0, totalOrders: 0, totalReturns: 0 };
  const totalCustomers = totals.totalCustomers;
  
  const revenueImpact = revenueMetrics[0]?.revenueImpact || 0;
  
  const previousMonthReturns = previousMonthMetrics[0]?.returns || 0;
  const prevRevenue = previousMonthMetrics[0]?.revenue || 0;

  // Extract Risk Distribution
  const dist = customerMetrics[0]?.riskDistribution || [];
  const lowRiskCount = dist.find(d => d._id === 0)?.count || 0;
  const mediumRiskCount = dist.find(d => d._id === 40)?.count || 0;
  const highRiskCount = dist.find(d => typeof d._id === 'string' ? true : d._id === 70)?.count || 0;
  
  const highRiskCustomersList = customerMetrics[0]?.topHighRisk || [];

  // Format recent returns (using date-fns for "time ago")
  const recentReturnsListFormatted = recentReturnsFromDB.map(returnItem => ({
    id: returnItem.returnId || returnItem._id,
    customer: returnItem.customer?.name || 'Unknown',
    product: returnItem.product,
    reason: returnItem.reason,
    riskScore: returnItem.customer?.riskScore || 0,
    time: returnItem.returnDate ? formatDistanceToNow(new Date(returnItem.returnDate), { addSuffix: true }) : 'N/A'
  })).slice(0, 4);

  // ---------------------------------------------------------------------------
  // CRITICAL IMPROVEMENT 3: Calculate percentages safely
  // ---------------------------------------------------------------------------
  const overallReturnRate = totals.totalOrders > 0
    ? ((totals.totalReturns / totals.totalOrders) * 100).toFixed(1)
    : '0.0';

  const prevReturnRate = previousMonthReturns > 0
    ? ((previousMonthReturns / Math.max(totalCustomers, 1)) * 100)
    : 0;
    
  const returnRateChange = prevReturnRate > 0
    ? (((Number(overallReturnRate) - prevReturnRate) / prevReturnRate) * 100).toFixed(1)
    : '0.0';
    
  const revenueChange = prevRevenue > 0
    ? (((revenueImpact - prevRevenue) / prevRevenue) * 100).toFixed(1)
    : '0.0';

  const totalCustomersForPercentage = totalCustomers > 0 ? totalCustomers : 1;

  const riskDistribution = [
    {
      label: "Low Risk (0-39)",
      count: lowRiskCount.toLocaleString(),
      percentage: ((lowRiskCount / totalCustomersForPercentage) * 100).toFixed(1),
      color: "text-green-500",
    },
    {
      label: "Medium Risk (40-69)",
      count: mediumRiskCount.toLocaleString(),
      percentage: ((mediumRiskCount / totalCustomersForPercentage) * 100).toFixed(1),
      color: "text-yellow-500",
    },
    {
      label: "High Risk (70-100)",
      count: highRiskCount.toLocaleString(),
      percentage: ((highRiskCount / totalCustomersForPercentage) * 100).toFixed(1),
      color: "text-red-500",
    },
  ];

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
      value: highRiskCount.toLocaleString(),
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

  res.status(200).json(
    new ApiResponse(
      200,
      {
        stats,
        highRiskCustomers: highRiskCustomersList,
        recentReturns: recentReturnsListFormatted,
        riskDistribution,
      },
      'Dashboard data fetched successfully'
    )
  );
});

export { getDashboardData };
