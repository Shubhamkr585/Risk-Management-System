import Customer from '../models/Customer.js';
import Return from '../models/Return.js'; 
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import ReturnRisk from '../models/ReturnRisk.js'; 
import { calculateCustomerRisk } from '../utils/riskCalculator.js';

/**
 * @function calculateAvgReturnTime
 * @description Calculates the average days between returns for a given customer.
 * This is a simplified calculation. For a real system, you'd track order dates too.
 * @param {string} customerId - The customerId string.
 * @returns {Promise<number|null>} - Average days or null if no returns.
 */
const calculateAvgReturnTime = async (customerId) => {
  const customerReturns = await Return.find({ customerId: customerId })
                                      .sort({ returnDate: 1 }); 

  if (customerReturns.length < 2) {
    return null; 
  }

  let totalDaysBetweenReturns = 0;
  for (let i = 1; i < customerReturns.length; i++) {
    const prevReturnDate = new Date(customerReturns[i - 1].returnDate);
    const currentReturnDate = new Date(customerReturns[i].returnDate);
    const diffTime = Math.abs(currentReturnDate.getTime() - prevReturnDate.getTime());
    totalDaysBetweenReturns += Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  }

  return totalDaysBetweenReturns / (customerReturns.length - 1);
};


/**
 * @function getCustomers
 * @description Fetches customer data with optional search and filtering.
 * @route GET /api/customers
 * @access Private (Admin only)
 * @query search - Optional search term for name, email, or customerId
 * @query riskLevel - Optional filter by risk level ('Low', 'Medium', 'High', 'Critical')
 */
const getCustomers = asyncHandler(async (req, res) => {
  const { search, riskLevel } = req.query;
  const query = {};

  // Build search query
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { customerId: { $regex: search, $options: 'i' } },
    ];
  }

  const customers = await Customer.find(query).populate('riskAnalysis'); 

  console.log('Fetched customers:', customers);


  const processedCustomers = await Promise.all(customers.map(async customer => {
    const calculatedReturnRate = customer.totalOrders > 0 ? ((customer.totalReturns / customer.totalOrders) * 100).toFixed(1) : '0.0';
    const localRisk = calculateCustomerRisk(customer);

    const riskScore = customer.riskAnalysis?.riskScore ?? localRisk.riskScore;
    const riskLevel = customer.riskAnalysis?.riskLevel ?? localRisk.riskLevel;

    return {
      id: customer._id, // Use Mongoose _id for unique key in frontend
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
      lastReturnDate: customer.lastReturnDate,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      flags: customer.riskAnalysis && customer.riskAnalysis.factors ? Array.from(customer.riskAnalysis.factors.keys()) : [],
      commonReasons: customer.riskAnalysis?.recommendations || [],
    };
  }));

  let filteredCustomers = processedCustomers;
  if (riskLevel && riskLevel !== 'All') {
    filteredCustomers = processedCustomers.filter(customer => customer.riskLevel === riskLevel);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      filteredCustomers,
      'Customers fetched successfully'
    )
  );
});

/**
 * @function getCustomerById
 * @description Fetches a single customer's data by ID.
 * @route GET /api/customers/:id
 * @access Private (Admin only)
 */
const getCustomerById = asyncHandler(async (req, res) => {
  const customerId = req.params.id; // This is the Mongoose _id

  const customer = await Customer.findById(customerId).populate('riskAnalysis'); // <--- POPULATING riskAnalysis

  if (!customer) {
    throw new ApiError(404, 'Customer not found');
  }

  const localRisk = calculateCustomerRisk(customer);
  const calculatedReturnRate = customer.totalOrders > 0 ? ((customer.totalReturns / customer.totalOrders) * 100).toFixed(1) : '0.0';
  const avgReturnTime = await calculateAvgReturnTime(customer.customerId); // Use customerId for Return model lookup

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
    totalSpent: customer.totalSpent, // <--- REAL DATA
    returnRate: parseFloat(calculatedReturnRate),
    riskScore,
    riskLevel,
    avgReturnTime: avgReturnTime, 
    lastReturnDate: customer.lastReturnDate,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    flags: customer.riskAnalysis && customer.riskAnalysis.factors ? Array.from(customer.riskAnalysis.factors.keys()) : [],
    commonReasons: customer.riskAnalysis?.recommendations || [],
  };

  res.status(200).json(
    new ApiResponse(
      200,
      customerData,
      'Customer fetched successfully'
    )
  );
});


export { getCustomers, getCustomerById };
