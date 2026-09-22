import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { addRecurring, listRecurring, materializeRecurring, removeRecurring, toggleRecurring } from '../db/queries.js';

export const recurringRouter = Router();

recurringRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  res.json(listRecurring(req.userId!));
});

recurringRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const amount = Number(body.amount);
  const dayOfMonth = Number(body.dayOfMonth);

  if (!body.name || !String(body.name).trim()) {
    res.status(400).json({ error: 'Нужно название, например «Связь» или «Подписка на музыку»' });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'Сумма должна быть больше нуля' });
    return;
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    res.status(400).json({ error: 'День списания — число от 1 до 31' });
    return;
  }

  const id = addRecurring(req.userId!, {
    name: String(body.name).trim(),
    amount,
    category: body.category ?? 'Другое',
    dayOfMonth,
  });

  // Если день уже прошёл в этом месяце — трата появится сразу, а не через месяц.
  const created = materializeRecurring(req.userId!);
  res.status(201).json({ id, createdNow: created });
});

recurringRouter.patch('/:id', requireAuth, (req: AuthedRequest, res) => {
  const ok = toggleRecurring(req.userId!, Number(req.params.id), Boolean(req.body?.active));
  if (!ok) {
    res.status(404).json({ error: 'Регулярная трата не найдена' });
    return;
  }
  res.json({ ok: true });
});

recurringRouter.delete('/:id', requireAuth, (req: AuthedRequest, res) => {
  if (!removeRecurring(req.userId!, Number(req.params.id))) {
    res.status(404).json({ error: 'Регулярная трата не найдена' });
    return;
  }
  res.json({ ok: true });
});
