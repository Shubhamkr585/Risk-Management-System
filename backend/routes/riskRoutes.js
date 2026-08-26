import express from 'express';
import {
    calculateCustomerRisk,
    getCustomerRisk,
    getAllRisks,
    getRiskAlerts,
} from '../controllers/riskAnalysisController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import validate from '../middleware/validateMiddleware.js';
import { calculateRiskParamsSchema } from '../validators/returnRiskValidator.js';

const router = express.Router();

// GET /api/risk - viewer/admin/superadmin can read risk analyses
router.route('/')
    .get(protect, authorize(['viewer', 'admin', 'superadmin']), getAllRisks);

// GET /api/risk/alerts - viewer/admin/superadmin can view risk alert history
router.route('/alerts')
    .get(protect, authorize(['viewer', 'admin', 'superadmin']), getRiskAlerts);

// POST /api/risk/calculate/:customerId - only admin and superadmin can calculate risk
router.route('/calculate/:customerId')
    .post(protect, authorize(['admin', 'superadmin']), validate(calculateRiskParamsSchema, 'params'), calculateCustomerRisk);

// GET /api/risk/:customerId - viewer/admin/superadmin can view one risk record
router.route('/:customerId')
    .get(protect, authorize(['viewer', 'admin', 'superadmin']), validate(calculateRiskParamsSchema, 'params'), getCustomerRisk);

export default router;
