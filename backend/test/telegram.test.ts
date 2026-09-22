import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { displayName, validateInitData } from '../src/services/telegramAuth.js';

const BOT_TOKEN = '123456:TEST-TOKEN-FOR-UNIT-TESTS';

/** Собирает initData так же, как это делает Telegram. */
function signInitData(user: object, authDate: number): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAEtest',
    user: JSON.stringify(user),
  });
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(checkString).digest('hex'));
  return params.toString();
}

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const FRESH = Math.floor(NOW / 1000) - 60;

test('принимает настоящую подпись Telegram', () => {
  const initData = signInitData({ id: 777, first_name: 'Вася', username: 'vasya' }, FRESH);
  const user = validateInitData(initData, BOT_TOKEN, NOW);
  assert.equal(user?.id, 777);
  assert.equal(user?.username, 'vasya');
});

test('отклоняет подделку: данные поменяли после подписи', () => {
  const initData = signInitData({ id: 777, first_name: 'Вася' }, FRESH);
  const forged = initData.replace(encodeURIComponent('777'), encodeURIComponent('999'));
  assert.equal(validateInitData(forged, BOT_TOKEN, NOW), null);
});

test('отклоняет подпись чужим токеном', () => {
  const initData = signInitData({ id: 777 }, FRESH);
  assert.equal(validateInitData(initData, 'другой:токен', NOW), null);
});

test('отклоняет протухшие данные старше суток', () => {
  const initData = signInitData({ id: 777 }, Math.floor(NOW / 1000) - 25 * 60 * 60);
  assert.equal(validateInitData(initData, BOT_TOKEN, NOW), null);
});

test('отклоняет мусор без hash', () => {
  assert.equal(validateInitData('user=%7B%7D', BOT_TOKEN, NOW), null);
  assert.equal(validateInitData('', BOT_TOKEN, NOW), null);
});

test('имя для лидерборда берётся из username, иначе из имени', () => {
  assert.equal(displayName({ id: 1, username: 'vasya', first_name: 'Вася' }), 'vasya');
  assert.equal(displayName({ id: 1, first_name: 'Вася', last_name: 'Пупкин' }), 'Вася Пупкин');
  assert.equal(displayName({ id: 42 }), 'Аноним 42');
});
