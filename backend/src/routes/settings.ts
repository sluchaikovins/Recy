import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { getNotifySettings, setNotifySettings } from '../db/queries.js';
import { config } from '../config.js';

export const settingsRouter = Router();

/** Что фронту нужно знать о самом приложении. */
settingsRouter.get('/app', (_req, res) => {
  res.json({ botUsername: config.botUsername });
});

/** Настройки уведомлений живут на сервере: их читает бот, а не браузер. */
settingsRouter.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
  const settings = getNotifySettings(req.userId!);
  res.json({
    enabled: Boolean(settings?.notify_enabled),
    hour: settings?.notify_hour ?? 20,
  });
});

settingsRouter.put('/notifications', requireAuth, (req: AuthedRequest, res) => {
  const hour = Number(req.body?.hour ?? 20);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    res.status(400).json({ error: 'Час — целое число от 0 до 23' });
    return;
  }
  setNotifySettings(req.userId!, Boolean(req.body?.enabled), hour);
  res.json({ enabled: Boolean(req.body?.enabled), hour });
});
