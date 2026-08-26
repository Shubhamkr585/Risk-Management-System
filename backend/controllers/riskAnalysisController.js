import Customer from '../models/Customer.js';
import ReturnRisk from '../models/ReturnRisk.js';
import RiskAlert from '../models/RiskAlert.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { calculateCustomerRisk as calculateRiskForCustomer, getRiskLevel } from '../utils/riskCalculator.js';
import { predictCustomerRisk, combineRiskScores } from '../utils/modelServiceClient.js';
import { sendRiskWarningMail } from '../utils/mailer.js';
import { recordModelFallback } from '../utils/monitoring.js';

const shouldSendRiskAlert = async (customer, riskScore, riskLevel) => {
    if (!['High', 'Critical'].includes(riskLevel)) {
        return { shouldSend: false, reason: 'Below alert threshold' };
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingAlert = await RiskAlert.findOne({
        customer: customer._id,
        alertType: 'warning_email',
        riskLevel,
        createdAt: { $gte: oneDayAgo },
        status: { $in: ['sent', 'pending'] },
    }).sort({ triggeredAt: -1 });

    if (existingAlert) {
        return { shouldSend: false, reason: 'Recent warning already sent', alert: existingAlert };
    }

    return { shouldSend: true, reason: 'Threshold crossed and no recent warning exists' };
};

const triggerRiskWarning = async (customer, riskScore, riskLevel) => {
    const { shouldSend, reason, alert } = await shouldSendRiskAlert(customer, riskScore, riskLevel);

    if (!shouldSend) {
        return {
            sent: false,
            reason,
            alert,
        };
    }

    const payload = {
        customer: customer._id,
        customerId: customer.customerId,
        riskScore,
        riskLevel,
        alertType: 'warning_email',
        status: 'pending',
        message: `Customer ${customer.name} crossed the ${riskLevel} risk threshold`,
        triggeredAt: new Date(),
    };

    const riskAlert = await RiskAlert.create(payload);

    try {
        await sendRiskWarningMail(customer.email, customer.name, riskScore, riskLevel);
        riskAlert.status = 'sent';
        riskAlert.sentAt = new Date();
        await riskAlert.save();

        return { sent: true, reason, alert: riskAlert };
    } catch (emailError) {
        riskAlert.status = 'failed';
        riskAlert.metadata = {
            ...(riskAlert.metadata || {}),
            error: emailError.message,
        };
        await riskAlert.save();

        return {
            sent: false,
            reason: 'Email delivery failed',
            alert: riskAlert,
        };
    }
};

/**
 * @function calculateCustomerRisk
 * @description Calculates and stores the return risk for a specific customer.
 * This uses customer behavior metrics such as return rate, frequency, recency, and total spend.
 * If the score crosses a high/critical threshold, it also sends a warning email.
 * @route POST /api/risk/calculate/:customerId
 * @access Private (Admin only)
 */
const calculateCustomerRisk = asyncHandler(async (req, res) => {
    // Joi validation middleware ensures customerId in params is valid.
    const { customerId } = req.params;
    // You could also accept specific factors from req.body if the calculation is dynamic
    // const { customFactors } = req.body;

    const customer = await Customer.findById(customerId);

    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    const localRisk = calculateRiskForCustomer(customer);
    customer.returnRate = localRisk.returnRate;

    let externalRisk = null;
    let fallbackUsed = false;
    let modelVersion = 'unknown';
    let source = 'local';

    try {
        externalRisk = await predictCustomerRisk(customer);
        modelVersion = externalRisk?.model_version || process.env.MODEL_VERSION || 'customer-risk-v1';
        source = 'hybrid';
    } catch (serviceError) {
        console.error('Model service error:', serviceError);
        fallbackUsed = true;
        recordModelFallback();
    }

    const localScore = Number(localRisk.riskScore || 0);
    const modelScore = Number(externalRisk?.risk_score || 0);
    const riskScore = externalRisk ? Math.round(combineRiskScores(localScore, modelScore)) : localScore;
    const riskLevel = getRiskLevel(riskScore);
    const recommendation = externalRisk?.recommendation || (riskLevel === 'High' || riskLevel === 'Critical' ? 'Monitor closely' : 'No immediate action');

    let returnRisk = await ReturnRisk.findOne({ customer: customer._id });

    const factorsObject = localRisk.factors;

    if (returnRisk) {
        returnRisk.riskScore = riskScore;
        returnRisk.riskLevel = riskLevel;
        returnRisk.source = externalRisk ? 'hybrid' : 'local';
        returnRisk.modelVersion = modelVersion;
        returnRisk.fallbackUsed = fallbackUsed;
        returnRisk.analysisDate = Date.now();
        returnRisk.factors = factorsObject;
        returnRisk.recommendations = [
            'Review customer return history',
            'Consider limiting future returns',
            recommendation,
        ];
    } else {
        returnRisk = await ReturnRisk.create({
            customer: customer._id,
            riskScore,
            riskLevel,
            source,
            modelVersion,
            fallbackUsed,
            factors: factorsObject,
            recommendations: [
                'Monitor return patterns',
                recommendation,
            ],
        });
    }

    // Save customer updates (e.g., returnRate)
    await customer.save();

    const savedRisk = await returnRisk.save();

    // Update the customer's riskAnalysis reference
    customer.riskAnalysis = savedRisk._id;
    await customer.save();

    let alertResult = { sent: false, reason: 'Below alert threshold' };
    if (riskLevel === 'High' || riskLevel === 'Critical') {
        alertResult = await triggerRiskWarning(customer, riskScore, riskLevel);
    }

    const finalRiskPayload = {
        risk: savedRisk,
        customer,
        alert: alertResult,
        source,
        fallbackUsed,
        modelVersion,
        localRiskScore: localScore,
        modelRiskScore: modelScore,
    };

    res.status(200).json(
        new ApiResponse(200, finalRiskPayload, 'Customer risk calculated and updated successfully')
    );
});
/**
 * @function getCustomerRisk
 * @description Retrieves the return risk for a specific customer.
 * @route GET /api/risk/:customerId
 * @access Private (Admin only)
 */
const getCustomerRisk = asyncHandler(async (req, res) => {
    // Joi validation middleware ensures customerId in params is valid.
    const risk = await ReturnRisk.findOne({ customer: req.params.customerId }).populate('customer');

    if (!risk) {
        throw new ApiError(404, 'Risk analysis not found for this customer');
    }
    res.status(200).json(
        new ApiResponse(200, risk, 'Customer risk fetched successfully')
    );
});

/**
 * @function getAllRisks
 * @description Retrieves all return risk analyses.
 * @route GET /api/risk
 * @access Private (Admin only)
 */
const getAllRisks = asyncHandler(async (req, res) => {
    const risks = await ReturnRisk.find({}).populate('customer');
    res.status(200).json(
        new ApiResponse(200, risks, 'All risks fetched successfully')
    );
});

const getRiskAlerts = asyncHandler(async (req, res) => {
    const alerts = await RiskAlert.find({})
        .populate('customer')
        .sort({ triggeredAt: -1 });

    res.status(200).json(
        new ApiResponse(200, alerts, 'Risk alerts fetched successfully')
    );
});

export {
    calculateCustomerRisk,
    getCustomerRisk,
    getAllRisks,
    getRiskAlerts,
};
