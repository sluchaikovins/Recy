import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  createTelegramUser,
  createUser,
  findUserByEmail,
  findUserById,
  findUserByTelegramId,
  updateTelegramProfile,
} from '../db/queries.js';
import { requireAuth, signToken, type AuthedRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { displayName, validateInitData } from '../services/telegramAuth.js';

export const authRouter = Router();

authRouter.post('/register', (req, res) => {
  const { username, email, password } = req.body ?? {};
  if (!username || !email || !password) {
    res.status(400).json({ error: 'username, email и password обязательны' });
    return;
  }
  if (findUserByEmail(email)) {
    res.status(409).json({ error: 'Пользователь с таким email уже есть' });
    return;
  }
  const userId = createUser(username, email, bcrypt.hashSync(password, 10));
  res.status(201).json({ token: signToken(userId), user: { id: userId, username, email } });
});

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const user = email ? findUserByEmail(email) : undefined;
  // У пользователей из Telegram пароля нет вообще — их пускает только /auth/telegram.
  if (!user?.password_hash || !password || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Неверный email или пароль' });
    return;
  }
  res.json({ token: signToken(user.id), user: { id: user.id, username: user.username, email: user.email } });
});

/**
 * Вход из мини-аппа: фронт присылает initData, который Telegram положил ему в window.
 * Подпись проверяется секретом бота, поэтому подделать чужой telegram_id нельзя.
 */
authRouter.post('/telegram', (req, res) => {
  if (!config.botToken) {
    res.status(503).json({ error: 'Вход через Telegram не настроен: нет BOT_TOKEN' });
    return;
  }

  const telegramUser = validateInitData(String(req.body?.initData ?? ''), config.botToken);
  if (!telegramUser) {
    res.status(401).json({ error: 'Подпись Telegram не сошлась' });
    return;
  }

  const telegramId = String(telegramUser.id);
  const name = displayName(telegramUser);
  const photo = telegramUser.photo_url ?? null;

  const existing = findUserByTelegramId(telegramId);
  const userId = existing ? existing.id : createTelegramUser(telegramId, name, photo);
  if (existing) updateTelegramProfile(userId, name, photo);

  res.json({
    token: signToken(userId),
    user: { id: userId, username: name, photoUrl: photo },
    isNew: !existing,
  });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  const user = findUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  res.json(user);
});
