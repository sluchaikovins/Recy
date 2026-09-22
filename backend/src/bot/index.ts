import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from '../config.js';
import { getDb } from '../db/init.js';
import { markNotified, usersToNotify } from '../db/queries.js';
import { currentRating } from '../routes/rating.js';

if (!config.botToken) {
  console.error('Нет BOT_TOKEN. Возьми токен у @BotFather и положи его в backend/.env');
  process.exit(1);
}

if (!config.miniAppUrl.startsWith('https://')) {
  console.error('MINI_APP_URL должен быть публичным https-адресом — Telegram не открывает http.');
  console.error('Для разработки подними туннель: cloudflared tunnel --url http://localhost:5173');
  process.exit(1);
}

// Через прокси, если он задан: во многих сетях api.telegram.org напрямую недоступен.
const agent = config.botProxy ? new HttpsProxyAgent(config.botProxy) : undefined;
const bot = new Bot(config.botToken, {
  client: agent ? { baseFetchConfig: { agent } } : undefined,
});

if (agent) console.log(`Запросы к Telegram идут через прокси ${config.botProxy}`);

const openButton = new InlineKeyboard().webApp('Открыть трекер', config.miniAppUrl);
const bottomKeyboard = new Keyboard().webApp('Открыть трекер', config.miniAppUrl).resized().persistent();

bot.command('start', async (ctx) => {
  await ctx.reply(
    'Привет! Это Recy — трекер трат.\n\n' +
      'Записывай траты — посчитаю твой рейтинг по шкале до 10.00 ' +
      'и сколько денег осталось до зарплаты.\n\n' +
      'Жми кнопку ниже, чтобы открыть.',
    { reply_markup: openButton },
  );
  await ctx.reply('Кнопка всегда под рукой тут 👇', { reply_markup: bottomKeyboard });
});

bot.command('help', (ctx) =>
  ctx.reply(
    'Что умею:\n' +
      '/start — открыть трекер\n' +
      '/rating — быстрый ответ по рейтингу (скоро)\n\n' +
      'Скоро можно будет просто кинуть мне фото чека, и я сам всё распознаю.',
    { reply_markup: openButton },
  ),
);

bot.on('message:photo', (ctx) =>
  ctx.reply(
    'Вижу чек! Распознавание фото прямо в чате ещё делаем. ' +
      'Пока открой трекер и добавь трату — это пара тапов.',
    { reply_markup: openButton },
  ),
);

bot.on('message:text', (ctx) =>
  ctx.reply('Все траты живут в мини-аппе — открывай.', { reply_markup: openButton }),
);

bot.catch((error) => console.error('Ошибка бота:', error.message));

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')}р`;

/** Вечерняя сводка тем, кто включил уведомления в настройках. */
async function sendDigests(now = new Date()): Promise<void> {
  const today = now.toISOString().slice(0, 10);

  for (const user of usersToNotify(now.getHours())) {
    // markNotified вернёт false, если сводку за сегодня уже отправляли.
    if (!markNotified(user.id, today)) continue;

    try {
      const rating = currentRating(user.id, now);
      const spentToday = (
        getDb()
          .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND date = ?')
          .get(user.id, today) as { total: number }
      ).total;

      const lines = [
        `Сегодня потрачено: ${money(spentToday)}`,
        `За месяц: ${money(rating.monthlySpent)} · рейтинг ${rating.level.toFixed(2)}`,
      ];

      if (rating.cycle) {
        lines.push(
          `До зарплаты ${rating.cycle.daysUntilNextIncome} дн. — это ${money(rating.cycle.perDayLeft)} в день`,
        );
      }

      await bot.api.sendMessage(user.telegram_id, lines.join('\n'), { reply_markup: openButton });
    } catch (error) {
      console.error(`Не смог отправить сводку пользователю ${user.id}:`, (error as Error).message);
    }
  }
}

/** Понятное объяснение вместо стека вызовов, когда Telegram недоступен. */
function explain(error: unknown): string {
  // grammy заворачивает сетевую ошибку внутрь своей, поэтому смотрим и вглубь.
  const nested = (error as { error?: unknown; cause?: unknown }) ?? {};
  const message = [
    error instanceof Error ? error.message : String(error),
    nested.error instanceof Error ? nested.error.message : String(nested.error ?? ''),
    nested.cause instanceof Error ? nested.cause.message : String(nested.cause ?? ''),
  ].join(' ');
  if (/ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|fetch failed/i.test(message)) {
    return [
      'Не достучался до api.telegram.org.',
      'Обычно это значит, что Telegram недоступен из этой сети напрямую.',
      'Включи VPN или пропиши прокси в backend/.env: BOT_PROXY=http://127.0.0.1:порт',
    ].join('\n');
  }
  if (/401|unauthorized/i.test(message)) return 'Telegram не принял токен. Проверь BOT_TOKEN в backend/.env';
  return message;
}

/**
 * Адрес мини-аппа живёт ровно столько, сколько запущен туннель.
 * Стоит закрыть его окно — и кнопка в боте начнёт вести в никуда,
 * поэтому проверяем доступность заранее и говорим об этом прямо.
 */
async function checkMiniApp(): Promise<void> {
  try {
    const response = await fetch(config.miniAppUrl, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error(`ответил ${response.status}`);
  } catch (error) {
    console.error('');
    console.error(`Мини-апп по адресу ${config.miniAppUrl} не отвечает.`);
    console.error('Если это туннель — он перезапущен и адрес сменился.');
    console.error('Подними его заново, вставь новый адрес в MINI_APP_URL и перезапусти бота:');
    console.error('  cloudflared tunnel --url http://localhost:5173');
    console.error(`Причина: ${(error as Error).message}`);
    console.error('');
  }
}

async function start(): Promise<void> {
  // Оформление бота — приятный бонус, но не повод падать, если сеть подвела.
  try {
    // Кнопка меню рядом со скрепкой — самый заметный вход в мини-апп.
    await bot.api.setChatMenuButton({
      menu_button: { type: 'web_app', text: 'Трекер', web_app: { url: config.miniAppUrl } },
    });
    await bot.api.setMyCommands([
      { command: 'start', description: 'Открыть трекер' },
      { command: 'help', description: 'Что я умею' },
    ]);
  } catch (error) {
    console.error('Не смог настроить меню бота:');
    console.error(explain(error));
  }

  await checkMiniApp();

  // Проверяем каждые 10 минут: так сводка уходит в нужный час без внешнего планировщика.
  setInterval(() => void sendDigests(), 10 * 60 * 1000);
  void sendDigests();

  console.log(`Бот запущен. Мини-апп: ${config.miniAppUrl}`);
  await bot.start();
}

start().catch((error) => {
  console.error('Бот не запустился:');
  console.error(explain(error));
  process.exit(1);
});
