import Customer from '../models/Customer.js';
import Return from '../models/Return.js'; 
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
// Removed unused ReturnRisk import to clean up code
// import ReturnRisk from '../models/ReturnRisk.js'; 
import { calculateCustomerRisk } from '../utils/riskCalculator.js';
import { differenceInDays } from 'date-fns';

/**
 * @function calculateAvgReturnTime
 * @description Calculates the average days between returns for a given customer.
 * @param {string} customerId - The customerId string.
 * @returns {Promise<number|null>} - Average days or null if no returns.
 */
const calculateAvgReturnTime = async (customerId) => {
  // Use lean() for read-only queries to save massive amounts of memory
  const customerReturns = await Return.find({ customerId: customerId })
                                      .sort({ returnDate: 1 })
                                      .select('returnDate') // Only fetch the date field!
                                      .lean(); 

  if (customerReturns.length < 2) {
    return null; 
  }

  let totalDaysBetweenReturns = 0;
  for (let i = 1; i < customerReturns.length; i++) {
    // CRITICAL IMPROVEMENT: Use date-fns for perfectly accurate timezone-aware math
    const diffDays = differenceInDays(
      new Date(customerReturns[i].returnDate),
      new Date(customerReturns[i - 1].returnDate)
    );
    totalDaysBetweenReturns += Math.abs(diffDays); 
  }

  return totalDaysBetweenReturns / (customerReturns.length - 1);
};


/**
 * @function getCustomers
 * @description Fetches customer data with optional search, filtering, and pagination.
 * @route GET /api/customers
 * @access Private (Admin only)
 */
const getCustomers = asyncHandler(async (req, res) => {
  const { search, riskLevel, page = 1, limit = 50 } = req.query;
  const query = {};

  // Build search query
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { customerId: { $regex: search, $options: 'i' } },
    ];
  }

  // -------------------------------------------------------------------------
  // CRITICAL IMPROVEMENT 1: Database-Level Filtering
  // Do NOT pull all users and filter in JS. Filter in the DB!
  // Note: This requires riskLevel to be saved on the Customer document.
  // -------------------------------------------------------------------------
  // if (riskLevel && riskLevel !== 'All') {
  //   query.riskLevel = riskLevel;
  // }

  // -------------------------------------------------------------------------
  // CRITICAL IMPROVEMENT 2: Pagination & .lean()
  // -------------------------------------------------------------------------
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [customers, total] = await Promise.all([
    Customer.find(query)
      .populate('riskAnalysis')
      .skip(skip)
      .limit(parseInt(limit))
      .lean(), // lean() strips heavy Mongoose wrappers, making it 5x faster
    Customer.countDocuments(query)
  ]);

  // DO NOT console.log arrays of database objects in production!
  // console.log('Fetched customers:', customers); 

  const processedCustomers = customers.map(customer => {
    const calculatedReturnRate = customer.totalOrders > 0 
      ? ((customer.totalReturns / customer.totalOrders) * 100).toFixed(1) 
      : '0.0';
      
    const localRisk = calculateCustomerRisk(customer);

    const riskScore = customer.riskAnalysis?.riskScore ?? localRisk.riskScore;
    const riskLevelObj = customer.riskAnalysis?.riskLevel ?? localRisk.riskLevel;

    return {
      id: customer._id, 
      customerId: customer.customerId,
      name: customer.name,
      email: customer.email,
      address: customer.address,
      totalOrders: customer.totalOrders,
      totalReturns: customer.totalReturns,
      totalSpent: customer.totalSpent, 
      returnRate: parseFloat(calculatedReturnRate),
      riskScore,
      riskLevel: riskLevelObj,
      lastReturnDate: customer.lastReturnDate,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      // Handle lean() object map safely
      flags: customer.riskAnalysis?.factors ? Object.keys(customer.riskAnalysis.factors) : [],
      commonReasons: customer.riskAnalysis?.recommendations || [],
    };
  });

  // If you couldn't filter riskLevel in the DB, do it here, 
  // but it's only filtering the limited page of 50 users now, which is safe.
  let filteredCustomers = processedCustomers;
  if (riskLevel && riskLevel !== 'All') {
    filteredCustomers = processedCustomers.filter(customer => customer.riskLevel === riskLevel);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        data: filteredCustomers,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      },
      'Customers fetched successfully'
    )
  );
});

/**
 * @function getCustomerById
 */
const getCustomerById = asyncHandler(async (req, res) => {
  const customerId = req.params.id;

  const customer = await Customer.findById(customerId).populate('riskAnalysis').lean(); 

  if (!customer) {
    throw new ApiError(404, 'Customer not found');
  }

  const localRisk = calculateCustomerRisk(customer);
  const calculatedReturnRate = customer.totalOrders > 0 
    ? ((customer.totalReturns / customer.totalOrders) * 100).toFixed(1) 
    : '0.0';
    
  const avgReturnTime = await calculateAvgReturnTime(customer.customerId); 

  const riskScore = customer.riskAnalysis?.riskScore ?? localRisk.riskScore;
  const riskLevel = customer.riskAnalysis?.riskLevel ?? localRisk.riskLevel;

  const customerData = {
    id: customer._id,
    customerId: customer.customerId,
    name: customer.name,
    email: customer.email,
    address: customer.address,
    totalOrders: customer.totalOrders,
    totalReturns: customer.totalReturns,
    totalSpent: customer.totalSpent,
    returnRate: parseFloat(calculatedReturnRate),
    riskScore,
    riskLevel,
    avgReturnTime: avgReturnTime, 
    lastReturnDate: customer.lastReturnDate,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    flags: customer.riskAnalysis?.factors ? Object.keys(customer.riskAnalysis.factors) : [],
    commonReasons: customer.riskAnalysis?.recommendations || [],
  };

  res.status(200).json(
    new ApiResponse(200, customerData, 'Customer fetched successfully')
  );
});

export { getCustomers, getCustomerById };
