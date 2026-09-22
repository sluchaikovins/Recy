import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { expensesRouter } from './routes/expenses.js';
import { incomeRouter } from './routes/income.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { ratingRouter } from './routes/rating.js';
import { recurringRouter } from './routes/recurring.js';
import { settingsRouter } from './routes/settings.js';
import { statsRouter } from './routes/stats.js';
import { uploadRouter } from './routes/upload.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(config.uploadDir));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/rating', ratingRouter);
  app.use('/api/income', incomeRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/recurring', recurringRouter);
  app.use('/api/settings', settingsRouter);

  return app;
}
