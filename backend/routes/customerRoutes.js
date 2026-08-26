import express from 'express';
import { getCustomers, getCustomerById } from '../controllers/customerController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protect, authorize(['admin', 'superadmin']), getCustomers);
router.get('/:id', protect, authorize(['admin', 'superadmin']), getCustomerById);

export default router;
