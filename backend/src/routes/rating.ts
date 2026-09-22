import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { expenseIntegrity, getIncome, monthSummary, saveRating } from '../db/queries.js';
import { buildCycle } from '../services/incomeCycle.js';
import {
  CYCLE_MESSAGES,
  calculateDynamicRating,
  calculateRating,
  cyclePhase,
  ratingStatus,
} from '../services/rating.js';

export const ratingRouter = Router();

export function currentRating(userId: number, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const summary = monthSummary(userId, month);
  const categoriesSpread = summary.byCategory.length;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = now.getDate();
  const baseRating = calculateRating(
    summary.total,
    summary.receipts,
    categoriesSpread,
    config.averageMonthlySpent,
    daysPassed,
    daysInMonth,
  );

  const cycle = buildCycle(getIncome(userId) ?? null, now);
  const rating = cycle
    ? calculateDynamicRating(baseRating, cycle.daysSinceIncome, cycle.daysUntilNextIncome)
    : baseRating;

  const { status, message } = ratingStatus(rating);

  const integrity = expenseIntegrity(userId);
  saveRating(userId, rating, integrity.verifiedCount, integrity.totalCount);

  return {
    level: rating,
    baseLevel: baseRating,
    status,
    message,
    monthlySpent: summary.total,
    receiptsCount: summary.receipts,
    averageReceipt: summary.receipts > 0 ? Number((summary.total / summary.receipts).toFixed(2)) : 0,
    averageDay: Number((summary.total / daysInMonth).toFixed(2)),
    categoriesSpread,
    /** Во сколько обошёлся бы месяц при нынешнем темпе трат. */
    projectedMonth: Number(((summary.total / Math.max(daysPassed, 1)) * daysInMonth).toFixed(2)),
    cycle: cycle && {
      ...cycle,
      remaining: Number(Math.max(cycle.amount - summary.total, 0).toFixed(2)),
      perDayLeft:
        cycle.daysUntilNextIncome > 0
          ? Number((Math.max(cycle.amount - summary.total, 0) / cycle.daysUntilNextIncome).toFixed(2))
          : 0,
      phase: cyclePhase(cycle.cycleDepth, summary.total, cycle.amount),
      phaseMessage: CYCLE_MESSAGES[cyclePhase(cycle.cycleDepth, summary.total, cycle.amount)],
      forecastEndOfCycle: calculateDynamicRating(baseRating, cycle.daysSinceIncome + cycle.daysUntilNextIncome, 0),
    },
  };
}

ratingRouter.get('/current', requireAuth, (req: AuthedRequest, res) => {
  res.json(currentRating(req.userId!));
});
