import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

import morganMiddleware from './middleware/morganMiddleware.js';
import errorMiddleware from './middleware/errorMiddleware.js';
import { ApiError } from './utils/ApiError.js'; 

import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import riskRoutes from './routes/riskRoutes.js';
import returnRoutes from './routes/returns.js';
import monitorRoutes from './routes/monitorRoutes.js';
import { recordRequest } from './utils/monitoring.js';

dotenv.config();

const app = express();

app.set('trust proxy', 1);

app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
}));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://risk-management-system-git-main-ankit-gargs-projects-9478362f.vercel.app",
].filter(Boolean);

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(cookieParser());
app.use(morganMiddleware);

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    recordRequest(req, res.statusCode, Date.now() - startedAt);
  });

  next();
});

app.use('/api/monitor', monitorRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/returns', returnRoutes);

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use(errorMiddleware);

export default app;