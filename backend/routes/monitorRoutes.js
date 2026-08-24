import express from 'express';
import { getMonitoringSnapshot } from '../utils/monitoring.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'risk-management-backend',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Number(process.uptime().toFixed(2)),
  });
});

router.get('/metrics', (req, res) => {
  res.status(200).json(getMonitoringSnapshot());
});

export default router;
