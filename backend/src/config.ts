import 'dotenv/config';
import path from 'node:path';

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  port: num(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  dbPath: process.env.DB_PATH ?? path.resolve('data/expense-tracker.db'),
  uploadDir: process.env.UPLOAD_DIR ?? path.resolve('data/uploads'),
  /** Средняя трата россиянина за месяц — база нормализации рейтинга. */
  averageMonthlySpent: num(process.env.AVERAGE_MONTHLY_SPENT, 25000),
  maxReceiptsPerDay: num(process.env.MAX_RECEIPTS_PER_DAY, 20),
  maxAmountPerDay: num(process.env.MAX_AMOUNT_PER_DAY, 100000),
  /** Токен бота от @BotFather. Без него вход через Telegram выключен. */
  botToken: process.env.BOT_TOKEN ?? '',
  /** Публичный https-адрес мини-аппа — его открывает кнопка в боте. */
  miniAppUrl: process.env.MINI_APP_URL ?? '',
  /** Имя бота без @ — из него собирается ссылка-приглашение для друзей. */
  botUsername: process.env.BOT_USERNAME ?? '',
  /** Прокси для запросов к Telegram: там, где api.telegram.org недоступен напрямую. */
  botProxy: process.env.BOT_PROXY ?? process.env.HTTPS_PROXY ?? '',
};
