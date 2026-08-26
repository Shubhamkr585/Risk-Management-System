// backend/controllers/return.controller.js
import Return from '../models/Return.js';
import Customer from '../models/Customer.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import ReturnRisk from '../models/ReturnRisk.js';
import { sendApprovalMail, sendRejectionMail } from '../utils/mailer.js';
import { calculateCustomerRisk } from '../utils/riskCalculator.js';
import { addRiskJob } from '../workers/riskQueue.js';
import { performance } from 'perf_hooks';
import { recordBullMqLatency } from '../utils/monitoring.js';

const getReturnStats = asyncHandler(async (req, res) => {
  const totalReturnsCount = await Return.countDocuments();
  const pendingCount = await Return.countDocuments({ status: 'Pending' });
  const approvedCount = await Return.countDocuments({ status: 'Approved' });
  const rejectedCount = await Return.countDocuments({ status: 'Rejected' });

  const customers = await Customer.find({});
  let highRiskReturnCount = 0;
  customers.forEach(customer => {
    const { riskScore } = calculateCustomerRisk(customer);
    if (riskScore >= 70) {
      highRiskReturnCount += customer.totalReturns;
    }
  });

  const stats = {
    total: totalReturnsCount,
    pending: pendingCount,
    approved: approvedCount,
    rejected: rejectedCount,
    highRisk: highRiskReturnCount,
  };

  res.status(200).json(new ApiResponse(200, stats, 'Return stats fetched successfully'));
});

const parsePagination = (req) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

  return {
   page,
   limit,
   skip: (page - 1) * limit,
  };
};

const getReturnIdempotencyKey = (req) => {
  const headerKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  return headerKey || req.body?.idempotencyKey || req.body?.clientRequestId || null;
};

const buildReturnPayload = (returnItem) => ({
  id: returnItem._id,
  returnId: returnItem.returnId,
  orderId: returnItem.orderId,
  customerId: returnItem.customerId,
  customer: returnItem.customerName,
  product: returnItem.product,
  reason: returnItem.reason,
  status: returnItem.status,
  returnDate: returnItem.returnDate,
  riskScore: 0,
  riskLevel: 'Low',
  flags: returnItem.flags || [],
  productPrice: returnItem.productPrice,
  idempotencyKey: returnItem.idempotencyKey || null,
});

const createReturn = asyncHandler(async (req, res) => {
  const payload = req.body || {};
  const requiredFields = ['orderId', 'customerId', 'customerName', 'product', 'reason', 'productPrice'];
  const missingFields = requiredFields.filter((field) => !payload[field] && payload[field] !== 0);

  if (missingFields.length > 0) {
   throw new ApiError(400, `Missing required fields: ${missingFields.join(', ')}`);
  }

  const idempotencyKey = getReturnIdempotencyKey(req);

  if (idempotencyKey) {
   const existingReturn = await Return.findOne({ idempotencyKey }).populate('customer', 'customerId name email totalOrders totalReturns');
   if (existingReturn) {
     const existingPayload = buildReturnPayload(existingReturn);
     const customer = existingReturn.customer;
     const { riskScore, riskLevel } = customer ? calculateCustomerRisk(customer) : { riskScore: 0, riskLevel: 'Low' };
     existingPayload.riskScore = riskScore;
     existingPayload.riskLevel = riskLevel;

     return res.status(200).json(new ApiResponse(200, { return: existingPayload, duplicate: true }, 'Duplicate return request detected and ignored'));
   }
  }

  const customer = await Customer.findOne({ customerId: payload.customerId });
  if (!customer) {
   throw new ApiError(404, 'Customer not found for this return request');
  }

  const existingCustomerName = payload.customerName || customer.name;
  const generatedReturnId = `RET-${Date.now()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

  let returnItem;
  try {
   returnItem = await Return.create({
     returnId: generatedReturnId,
     orderId: payload.orderId,
     customer: customer._id,
     customerId: customer.customerId,
     customerName: existingCustomerName,
     product: payload.product,
     productSku: payload.productSku || '',
     productCategory: payload.productCategory || 'General',
     productPrice: Number(payload.productPrice),
     reason: payload.reason,
     status: 'Pending',
     returnDate: payload.returnDate ? new Date(payload.returnDate) : new Date(),
     images: Array.isArray(payload.images) ? payload.images : [],
     adminNotes: payload.adminNotes || '',
     flags: Array.isArray(payload.flags) ? payload.flags : [],
     idempotencyKey: idempotencyKey || undefined,
   });
  } catch (error) {
   if (idempotencyKey && error?.code === 11000) {
     const existingReturn = await Return.findOne({ idempotencyKey }).populate('customer', 'customerId name email totalOrders totalReturns');
     if (existingReturn) {
       const existingPayload = buildReturnPayload(existingReturn);
       const { riskScore, riskLevel } = existingReturn.customer ? calculateCustomerRisk(existingReturn.customer) : { riskScore: 0, riskLevel: 'Low' };
       existingPayload.riskScore = riskScore;
       existingPayload.riskLevel = riskLevel;

       return res.status(200).json(new ApiResponse(200, { return: existingPayload, duplicate: true }, 'Duplicate return request detected and ignored'));
     }
   }

   throw error;
  }

  // Trigger asynchronous risk evaluation via BullMQ
  // Measure exactly how long it takes to establish the Redis connection and enqueue the job
  const enqueueStartTime = performance.now();
  await addRiskJob(customer._id.toString(), returnItem._id.toString());
  const enqueueEndTime = performance.now();
  
  // Send the latency metric to our custom monitoring module to prove "sub-second latency"
  recordBullMqLatency(enqueueEndTime - enqueueStartTime);

  const createdData = buildReturnPayload(returnItem);
  // Default values until background worker finishes
  createdData.riskScore = 0;
  createdData.riskLevel = 'Pending Calculation';

  // Return a 202 Accepted status, which is best practice for asynchronous processing
  res.status(202).json(new ApiResponse(202, { return: createdData, duplicate: false }, 'Return logged. Risk evaluation processing in background.'));
});

/**
 * @function getReturns
 * @description Fetches a list of returns with optional search and filtering.
 * @route GET /api/returns
 * @access Private (Admin only)
 * @query search - Optional search term for customer, product, or reason
 * @query status - Optional filter by status ('Pending', 'Approved', 'Rejected')
 * @query page - Optional page number for offset-based pagination
 * @query limit - Optional page size, capped at 100
 */
const getReturns = asyncHandler(async (req, res) => {
  const { search, status } = req.query;
  const { page, limit, skip } = parsePagination(req);
  const query = {};

  if (search) {
   query.$or = [
     { customerName: { $regex: search, $options: 'i' } },
     { product: { $regex: search, $options: 'i' } },
     { reason: { $regex: search, $options: 'i' } },
   ];
  }

  if (status && status !== 'All') {
   query.status = status;
  }

  const totalItems = await Return.countDocuments(query);
  const totalPages = Math.ceil(totalItems / limit);

  const returns = await Return.find(query)
   .sort({ returnDate: -1 })
   .skip(skip)
   .limit(limit)
   .populate('customer', 'totalOrders totalReturns');

  const processedReturns = returns.map(returnItem => {
   const customer = returnItem.customer;
   const { riskScore, riskLevel } = customer ? calculateCustomerRisk(customer) : { riskScore: 0, riskLevel: 'Low' };

   return {
     id: returnItem._id,
     returnId: returnItem.returnId,
     orderId: returnItem.orderId,
     customerId: returnItem.customerId,
     customer: returnItem.customerName,
     product: returnItem.product,
     reason: returnItem.reason,
     status: returnItem.status,
     riskScore,
     riskLevel,
     flags: returnItem.flags || [],
     productPrice: returnItem.productPrice,
     returnDate: returnItem.returnDate,
   };
  });

  res.status(200).json(new ApiResponse(200, {
   items: processedReturns,
   pagination: {
     page,
     limit,
     totalItems,
     totalPages,
     hasNextPage: page < totalPages,
     hasPrevPage: page > 1,
   },
  }, 'Returns fetched successfully'));
});


const getReturnById = asyncHandler(async (req, res) => {
  const returnId = req.params.id;

  const returnItem = await Return.findById(returnId).populate('customer', 'customerId email name');

  if (!returnItem) {
    throw new ApiError(404, 'Return not found');
  }

  const customer = returnItem.customer;
  const { riskScore, riskLevel } = customer ? calculateCustomerRisk(customer) : { riskScore: 0, riskLevel: 'Low' };
  
  const returnDetails = {
    id: returnItem._id,
    returnId: returnItem.returnId,
    orderId: returnItem.orderId,
    product: {
      name: returnItem.product,
      sku: returnItem.productSku || 'N/A',
      category: returnItem.productCategory || 'N/A',
      price: returnItem.productPrice,
    },
    customer: {
      name: returnItem.customerName,
      email: customer?.email || 'N/A',
      id: customer?.customerId || 'N/A',
    },
    reason: returnItem.reason,
    status: returnItem.status,
    riskScore: riskScore,
    riskLevel: riskLevel,
    requestDate: returnItem.returnDate.toLocaleDateString('en-US'),
    responseTime: returnItem.responseTime || 'N/A',
    images: returnItem.images || [],
    adminNotes: returnItem.adminNotes || 'No notes available.',
    flags: returnItem.flags || [],
  };

  res.status(200).json(new ApiResponse(200, returnDetails, 'Return details fetched successfully'));
});


/**
 * @function approveReturn
 * @description Approves a return request and sends email to customer
 * @route POST /api/returns/:id/approve
 * @access Private (Admin only)
 */
const approveReturn = asyncHandler(async (req, res) => {
  try {
    const returnId = req.params.id;
    console.log(`🚀 APPROVE CONTROLLER STARTED - Return ID: ${returnId}`);
    console.log(`🚀 Request User:`, req.user);

    // Find the return by ID and populate customer data
    console.log(`🔍 Searching for return with ID: ${returnId}`);
    const returnItem = await Return.findById(returnId).populate('customer', 'email name customerId');
    console.log(`🔍 Found return:`, returnItem ? 'YES' : 'NO');

    if (!returnItem) {
      console.log(`❌ Return not found with ID: ${returnId}`);
      return res.status(404).json({
        success: false,
        message: 'Return not found'
      });
    }

    console.log(`✅ Return found: ${returnItem.returnId}`);
    console.log(`📧 Customer populated:`, returnItem.customer ? 'YES' : 'NO');
    console.log(`📧 Customer email:`, returnItem.customer?.email);

    // Check if already approved
    if (returnItem.status === 'Approved') {
      console.log(`⚠️ Return already approved: ${returnItem.returnId}`);
      return res.status(400).json({
        success: false,
        message: 'Return is already approved'
      });
    }

    // Update return status to approved
    console.log(`📝 Updating return status to Approved...`);
    returnItem.status = 'Approved';
    returnItem.responseTime = new Date().toISOString();
    await returnItem.save();
    console.log(`✅ Return status updated successfully`);

    // Get customer email
    const customerEmail = returnItem.customer?.email;
    const customerName = returnItem.customer?.name;
    
    console.log(`📧 Customer Email: ${customerEmail}`);
    console.log(`👤 Customer Name: ${customerName}`);
    
    if (!customerEmail) {
      console.log(`❌ Customer email not found for return: ${returnItem.returnId}`);
      return res.status(400).json({
        success: false,
        message: 'Customer email not found'
      });
    }

    try {
      // Send approval email
      console.log(`📤 Attempting to send email to: ${customerEmail}`);
      console.log(`📤 Return ID for email: ${returnItem.returnId}`);
      console.log(`📤 Customer name for email: ${customerName}`);
      
      const emailResult = await sendApprovalMail(customerEmail, returnItem.returnId, customerName);
      console.log(`✅ Email sent successfully:`, emailResult.messageId);
      
      const responseData = {
        success: true,
        data: { 
          returnId: returnItem.returnId,
          status: returnItem.status,
          customerEmail: customerEmail,
          customerName: customerName
        }, 
        message: 'Return approved and email sent successfully'
      };
      
      console.log(`📤 Sending response:`, responseData);
      return res.status(200).json(responseData);
      
    } catch (emailError) {
      console.error(`❌ Email sending failed:`, emailError);
      console.error(`❌ Email error stack:`, emailError.stack);
      
      // Revert the status change if email fails
      console.log(`🔄 Reverting return status to Pending...`);
      returnItem.status = 'Pending';
      await returnItem.save();
      console.log(`🔄 Status reverted successfully`);
      
      return res.status(500).json({
        success: false,
        message: `Return approval failed: ${emailError.message}`
      });
    }
  } catch (error) {
    console.error(`💥 APPROVE CONTROLLER ERROR:`, error);
    console.error(`💥 Error stack:`, error.stack);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});


/**
 * @function rejectReturn
 * @description Rejects a return request and sends email to customer
 * @route POST /api/returns/:id/reject
 * @access Private (Admin only)
 */
const rejectReturn = asyncHandler(async (req, res) => {
  try {
    const returnId = req.params.id;
    console.log(`🚀 REJECT CONTROLLER STARTED - Return ID: ${returnId}`);
    console.log(`🚀 Request User:`, req.user);

    // Find the return by ID and populate customer data
    console.log(`🔍 Searching for return with ID: ${returnId}`);
    const returnItem = await Return.findById(returnId).populate('customer', 'email name customerId');
    console.log(`🔍 Found return:`, returnItem ? 'YES' : 'NO');

    if (!returnItem) {
      console.log(`❌ Return not found with ID: ${returnId}`);
      return res.status(404).json({
        success: false,
        message: 'Return not found'
      });
    }

    console.log(`✅ Return found: ${returnItem.returnId}`);
    console.log(`📧 Customer populated:`, returnItem.customer ? 'YES' : 'NO');
    console.log(`📧 Customer email:`, returnItem.customer?.email);

    // Check if already rejected
    if (returnItem.status === 'Rejected') {
      console.log(`⚠️ Return already rejected: ${returnItem.returnId}`);
      return res.status(400).json({
        success: false,
        message: 'Return is already rejected'
      });
    }

    // Update return status to rejected
    console.log(`📝 Updating return status to Rejected...`);
    returnItem.status = 'Rejected';
    returnItem.responseTime = new Date().toISOString();
    await returnItem.save();
    console.log(`✅ Return status updated successfully`);

    // Get customer email
    const customerEmail = returnItem.customer?.email;
    const customerName = returnItem.customer?.name;
    
    console.log(`📧 Customer Email: ${customerEmail}`);
    console.log(`👤 Customer Name: ${customerName}`);
    
    if (!customerEmail) {
      console.log(`❌ Customer email not found for return: ${returnItem.returnId}`);
      return res.status(400).json({
        success: false,
        message: 'Customer email not found'
      });
    }

    try {
      // Send rejection email
      console.log(`📤 Attempting to send rejection email to: ${customerEmail}`);
      console.log(`📤 Return ID for email: ${returnItem.returnId}`);
      console.log(`📤 Customer name for email: ${customerName}`);
      
      const emailResult = await sendRejectionMail(customerEmail, returnItem.returnId, customerName);
      console.log(`✅ Rejection email sent successfully:`, emailResult.messageId);
      
      const responseData = {
        success: true,
        data: { 
          returnId: returnItem.returnId,
          status: returnItem.status,
          customerEmail: customerEmail,
          customerName: customerName
        }, 
        message: 'Return rejected and email sent successfully'
      };
      
      console.log(`📤 Sending response:`, responseData);
      return res.status(200).json(responseData);
      
    } catch (emailError) {
      console.error(`❌ Email sending failed:`, emailError);
      console.error(`❌ Email error stack:`, emailError.stack);
      
      // Revert the status change if email fails
      console.log(`🔄 Reverting return status to Pending...`);
      returnItem.status = 'Pending';
      await returnItem.save();
      console.log(`🔄 Status reverted successfully`);
      
      return res.status(500).json({
        success: false,
        message: `Return rejection failed: ${emailError.message}`
      });
    }
  } catch (error) {
    console.error(`💥 REJECT CONTROLLER ERROR:`, error);
    console.error(`💥 Error stack:`, error.stack);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export { getReturnStats, getReturns, getReturnById, createReturn, approveReturn, rejectReturn };
