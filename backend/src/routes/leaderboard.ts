import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { addFriend, findUserByEmail, findUserById, findUserByUsername, friendIds } from '../db/queries.js';
import { expenseIntegrity } from '../db/queries.js';
import { canBeOnLeaderboard } from '../services/anticheat.js';
import { currentRating } from './rating.js';

export const leaderboardRouter = Router();

leaderboardRouter.get('/friends', requireAuth, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const ids = [userId, ...friendIds(userId)];

  const rows = ids
    .map((id) => {
      const user = findUserById(id);
      if (!user) return null;
      const rating = currentRating(id);
      const integrity = expenseIntegrity(id);
      return {
        userId: id,
        name: user.username,
        isMe: id === userId,
        total: rating.monthlySpent,
        rating: rating.level,
        status: rating.status,
        eligible: canBeOnLeaderboard({
          verifiedCount: integrity.verifiedCount,
          totalCount: integrity.totalCount,
          flaggedCount: integrity.flaggedCount,
        }),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.rating - a.rating);

  const me = rows.find((row) => row.isMe);
  const rival = rows.find((row) => !row.isMe && me && row.total > 0);

  res.json({
    rows,
    share:
      me && rival
        ? `Я потратил на ${Math.round(((me.total - rival.total) / rival.total) * 100)}% ${
            me.total >= rival.total ? 'больше' : 'меньше'
          } чем ${rival.name}. Обойди меня в шопоголизме!`
        : 'Добавь друзей и обойди их в шопоголизме!',
  });
});

/**
 * Добавить друга: по имени в Telegram, по email или по id из ссылки-приглашения.
 * Дружба взаимная — оба сразу видят друг друга в лидерборде.
 */
leaderboardRouter.post('/friends', requireAuth, (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const friend = body.username
    ? findUserByUsername(String(body.username))
    : body.email
      ? findUserByEmail(String(body.email))
      : body.userId
        ? (findUserById(Number(body.userId)) as { id: number; username: string } | undefined)
        : undefined;

  if (!friend) {
    res.status(404).json({
      error: body.username
        ? 'Не нашёл такого пользователя. Он должен хотя бы раз открыть Recy через бота.'
        : 'Пользователь не найден',
    });
    return;
  }
  if (friend.id === req.userId) {
    res.status(400).json({ error: 'Себя добавлять не надо, ты и так в списке' });
    return;
  }
  addFriend(req.userId!, friend.id);
  addFriend(friend.id, req.userId!);
  res.status(201).json({ ok: true, friend: { id: friend.id, username: friend.username } });
});
