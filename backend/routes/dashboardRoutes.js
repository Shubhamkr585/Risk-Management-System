import express from 'express';
import { getDashboardData } from '../controllers/dashboardController.js';
import { protect, authorize } from '../middleware/authMiddleware.js'; 

const router = express.Router();

// viewer can read summaries, admin/superadmin can manage full operations
router.get('/', protect, authorize(['viewer', 'admin', 'superadmin']), getDashboardData);

export default router;
