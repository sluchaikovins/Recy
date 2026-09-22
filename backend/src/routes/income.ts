import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { getIncome, upsertIncome } from '../db/queries.js';
import { buildCycle } from '../services/incomeCycle.js';

export const incomeRouter = Router();

const TYPES = ['2/2', '5/2', 'freelance', 'study', 'other'];
const FREQUENCIES = ['daily', 'weekly', 'twice_monthly', 'monthly'];

incomeRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const income = getIncome(req.userId!) ?? null;
  res.json({ income, cycle: buildCycle(income) });
});

incomeRouter.put('/', requireAuth, (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const amount = Number(body.amount);
  if (!TYPES.includes(body.type)) {
    res.status(400).json({ error: `type должен быть одним из: ${TYPES.join(', ')}` });
    return;
  }
  if (!FREQUENCIES.includes(body.frequency)) {
    res.status(400).json({ error: `frequency должен быть одним из: ${FREQUENCIES.join(', ')}` });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'amount должен быть положительным' });
    return;
  }

  upsertIncome(req.userId!, {
    type: body.type,
    amount,
    frequency: body.frequency,
    nextIncomeDate: body.nextIncomeDate ?? null,
    lastIncomeDate: body.lastIncomeDate ?? null,
    scheduleData: body.scheduleData ?? null,
  });

  const income = getIncome(req.userId!) ?? null;
  res.json({ income, cycle: buildCycle(income) });
});
