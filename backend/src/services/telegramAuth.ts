import crypto from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

/** Данные из initData живут сутки — потом Telegram считает их протухшими. */
const MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Проверяет подпись initData из Telegram Mini App.
 * Алгоритм: secret = HMAC-SHA256(bot_token, "WebAppData"),
 * затем HMAC этим ключом по строке «ключ=значение», отсортированной по алфавиту.
 * Возвращает пользователя, если подпись настоящая, иначе null.
 */
export function validateInitData(
  initData: string,
  botToken: string,
  now = Date.now(),
): TelegramUser | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const checkString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(checkString).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(hash, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) return null;
  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) return null;
  if (now / 1000 - authDate > MAX_AGE_SECONDS) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null;
    return user && typeof user.id === 'number' ? user : null;
  } catch {
    return null;
  }
}

/** Имя для лидерборда: @username, иначе имя, иначе «Аноним». */
export function displayName(user: TelegramUser): string {
  if (user.username) return user.username;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name || `Аноним ${user.id}`;
}
