import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import {
  materializeRecurring,
  dayUsage,
  deleteExpense,
  insertExpense,
  listExpenses,
  updateExpense,
  type ExpenseFilters,
} from '../db/queries.js';
import { categorize, dominantCategory } from '../services/categorizer.js';
import { checkExpense, isVerified } from '../services/anticheat.js';

export const expensesRouter = Router();

const numberOrUndefined = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

expensesRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const query = req.query as Record<string, string | undefined>;
  const filters: ExpenseFilters = {
    month: query.month,
    category: query.category,
    from: query.from,
    to: query.to,
    minAmount: numberOrUndefined(query.minAmount),
    maxAmount: numberOrUndefined(query.maxAmount),
    search: query.search,
  };
  materializeRecurring(req.userId!);
  res.json(listExpenses(req.userId!, filters));
});

expensesRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const rawItems: { name?: string; price?: number; category?: string }[] = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .filter((item) => item.name && Number.isFinite(Number(item.price)))
    .map((item) => ({
      name: String(item.name),
      price: Number(item.price),
      category: item.category ?? categorize(String(item.name)),
    }));

  const amount = Number(body.total ?? items.reduce((sum, item) => sum + item.price, 0));
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'Нужна положительная сумма чека' });
    return;
  }

  const date = String(body.date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const verdict = checkExpense(amount, dayUsage(req.userId!, date));
  if (!verdict.allowed) {
    res.status(429).json({ error: verdict.reason });
    return;
  }

  const id = insertExpense({
    userId: req.userId!,
    amount: Number(amount.toFixed(2)),
    category: body.category ?? dominantCategory(items),
    description: body.description ?? null,
    date,
    imagePath: body.imagePath ?? null,
    qrCode: body.qrCode ?? null,
    verified: isVerified(body.qrCode),
    flagged: verdict.flagged,
    flaggedReason: verdict.reason,
    items,
  });

  res.status(201).json({ id, flagged: verdict.flagged, flaggedReason: verdict.reason });
});

expensesRouter.patch('/:id', requireAuth, (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const updated = updateExpense(req.userId!, Number(req.params.id), {
    amount: numberOrUndefined(body.amount),
    category: body.category,
    description: body.description,
    date: body.date,
  });
  if (!updated) {
    res.status(404).json({ error: 'Трата не найдена' });
    return;
  }
  res.json({ ok: true });
});

expensesRouter.delete('/:id', requireAuth, (req: AuthedRequest, res) => {
  if (!deleteExpense(req.userId!, Number(req.params.id))) {
    res.status(404).json({ error: 'Трата не найдена' });
    return;
  }
  res.json({ ok: true });
});
