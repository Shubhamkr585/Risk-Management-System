import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import Customer from '../models/Customer.js';
import Return from '../models/Return.js';
import ReturnRisk from '../models/ReturnRisk.js';
import { subDays, subMonths, startOfMonth } from 'date-fns';

// If you have redis set up, import it here:
// import { redisClient } from '../utils/redisClient.js';

/**
 * @function getAnalyticsData
 * @description Retrieves analytics data using optimized MongoDB Aggregation Pipelines
 * @route GET /api/analytics
 * @access Protected (Admin only)
 */
const getAnalyticsData = asyncHandler(async (req, res) => {
  const period = req.query.period || '12months';
  
  // 1. CACHING STRATEGY (Optional but recommended)
  // const cacheKey = `analytics:${period}`;
  // const cachedData = await redisClient.get(cacheKey);
  // if (cachedData) return res.status(200).json(new ApiResponse(200, JSON.parse(cachedData), 'From cache'));

  const now = new Date();
  let startDate;
  
  // Use date-fns for clean date calculations
  switch (period) {
    case '7days': startDate = subDays(now, 7); break;
    case '30days': startDate = subDays(now, 30); break;
    case '6months': startDate = subMonths(now, 6); break;
    case '12months':
    default: startDate = subMonths(now, 12); break;
  }

  try {
    // -------------------------------------------------------------------------
    // CRITICAL IMPROVEMENT 1: Use Aggregation for Risk Metrics (No JS memory overload)
    // -------------------------------------------------------------------------
    const [riskMetrics] = await ReturnRisk.aggregate([
      {
        $facet: {
          averages: [
            { $group: { _id: null, avgScore: { $avg: "$riskScore" }, total: { $sum: 1 } } }
          ],
          highRisk: [
            { $match: { riskScore: { $gte: 70 } } },
            { $count: "count" }
          ],
          distribution: [
            {
              $bucket: {
                groupBy: "$riskScore",
                boundaries: [0, 40, 70, 100],
                default: "High Risk",
                output: { count: { $sum: 1 } }
              }
            }
          ]
        }
      }
    ]);

    const avgRiskScore = riskMetrics.averages[0]?.avgScore.toFixed(1) || "0.0";
    const totalRiskAnalyses = riskMetrics.averages[0]?.total || 1;
    const highRiskCount = riskMetrics.highRisk[0]?.count || 0;
    const highRiskPercentage = ((highRiskCount / totalRiskAnalyses) * 100).toFixed(1);

    // Format Distribution
    const distData = riskMetrics.distribution;
    const lowRiskCount = distData.find(d => d._id === 0)?.count || 0;
    const mediumRiskCount = distData.find(d => d._id === 40)?.count || 0;

    const riskDistribution = [
      { name: "Low Risk", value: lowRiskCount, color: "#10B981", percentage: ((lowRiskCount / totalRiskAnalyses) * 100).toFixed(1) },
      { name: "Medium Risk", value: mediumRiskCount, color: "#F59E0B", percentage: ((mediumRiskCount / totalRiskAnalyses) * 100).toFixed(1) },
      { name: "High Risk", value: highRiskCount, color: "#EF4444", percentage: ((highRiskCount / totalRiskAnalyses) * 100).toFixed(1) }
    ];


    // -------------------------------------------------------------------------
    // CRITICAL IMPROVEMENT 2: Use Aggregation for Returns & Revenue
    // -------------------------------------------------------------------------
    const [returnMetrics] = await Return.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          totalReturns: { $sum: 1 },
          revenueImpact: { $sum: { $toDouble: "$productPrice" } }
        }
      }
    ]);

    const revenueImpact = returnMetrics?.revenueImpact || 0;
    const totalReturns = returnMetrics?.totalReturns || 0;
    const totalCustomers = await Customer.countDocuments({ createdAt: { $gte: startDate } });
    const returnRate = totalCustomers > 0 ? ((totalReturns / totalCustomers) * 100).toFixed(1) : "0.0";


    // -------------------------------------------------------------------------
    // CRITICAL IMPROVEMENT 3: Group 18 Monthly Queries into 1 Single Pipeline
    // -------------------------------------------------------------------------
    // Use date-fns to easily get the start of the month 5 months ago
    const sixMonthsAgo = startOfMonth(subMonths(now, 5));
    
    const monthlyReturnsAggregation = await Return.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          returns: { $sum: 1 },
          revenue: { $sum: { $toDouble: "$productPrice" } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Map the DB results into the chart format
    const monthlyData = monthlyReturnsAggregation.map(item => {
      const [year, month] = item._id.split('-');
      const date = new Date(year, month - 1);
      return {
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        returns: item.returns,
        revenue: item.revenue,
        riskScore: 50 // Note: To get monthly risk score accurately, you need a $lookup pipeline joining ReturnRisk
      };
    });


    // Top return reasons (Already perfectly optimized in your original code!)
    const reasonCounts = await Return.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: "$reason", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 }
    ]);

    const totalReasonsCount = reasonCounts.reduce((sum, item) => sum + item.count, 0);
    const topReasons = reasonCounts.map(item => ({
      reason: item._id,
      count: item.count,
      percentage: totalReasonsCount > 0 ? ((item.count / totalReasonsCount) * 100).toFixed(1) : "0.0"
    }));

    const analyticsData = {
      metrics: [
        { title: "Avg Risk Score", value: avgRiskScore, change: "0.0%", trend: "neutral" },
        { title: "Return Rate", value: `${returnRate}%`, change: "0.0%", trend: "neutral" },
        { title: "High Risk %", value: `${highRiskPercentage}%`, change: "0.0%", trend: "neutral" },
        { title: "Revenue Impact", value: `$${(revenueImpact / 1000).toFixed(1)}K`, change: "0.0%", trend: "neutral" }
      ],
      monthlyData,
      riskDistribution,
      categoryData: [], // Placeholder: Similar aggregation needed here
      topReasons
    };
    
    // Save to Cache
    // await redisClient.setEx(cacheKey, 300, JSON.stringify(analyticsData)); // 5 mins cache
    
    return res.status(200).json(new ApiResponse(200, analyticsData, 'Analytics data fetched successfully'));

  } catch (error) {
    console.error("Analytics error:", error);
    throw new ApiError(500, error.message || 'Error fetching analytics data');
  }
});

export { getAnalyticsData };
