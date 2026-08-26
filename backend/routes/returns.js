import express from "express";
const router = express.Router();

import { getReturnStats, getReturns, getReturnById, createReturn, approveReturn, rejectReturn } from '../controllers/returnController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

router.get('/stats', protect, authorize(['admin', 'superadmin']), getReturnStats);
router.post('/', protect, authorize(['admin', 'superadmin']), createReturn);
router.get('/', protect, authorize(['admin', 'superadmin']), getReturns);
router.get('/:id', protect, authorize(['admin', 'superadmin']), getReturnById);
router.post('/:id/approve', protect, authorize(['admin', 'superadmin']), approveReturn);
router.post('/:id/reject', protect, authorize(['admin', 'superadmin']), rejectReturn);

export default router;

