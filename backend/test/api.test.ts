import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { initDb, setDb } from '../src/db/init.js';
import { createApp } from '../src/app.js';

let server: Server;
let baseUrl: string;
let token: string;

const api = (path: string, init: RequestInit = {}) =>
  fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

before(async () => {
  setDb(initDb(':memory:'));
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

test('регистрация выдаёт токен', async () => {
  const response = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'vasya', email: 'vasya@example.com', password: 'secret123' }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  token = body.token;
  assert.ok(token);
});

test('трата сохраняется, читается и фильтруется', async () => {
  const created = await api('/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      total: 1330,
      date: '2026-09-11',
      qrCode: 't=20260911T1842&s=1330.00&fn=1&i=1&fp=1&n=1',
      items: [
        { name: 'Хлеб', price: 50 },
        { name: 'Молоко', price: 80 },
        { name: 'Наушники', price: 1200 },
      ],
    }),
  });
  assert.equal(created.status, 201);

  const all = await (await api('/api/expenses?month=2026-09')).json();
  assert.equal(all.length, 1);
  assert.equal(all[0].category, 'Электроника');
  assert.equal(all[0].verified, 1);
  assert.equal(all[0].items.length, 3);

  const found = await (await api('/api/expenses?search=молоко')).json();
  assert.equal(found.length, 1);

  const empty = await (await api('/api/expenses?category=Одежда')).json();
  assert.equal(empty.length, 0);
});

test('статистика месяца собирается по категориям и дням', async () => {
  const stats = await (await api('/api/stats/month?year=2026&month=9')).json();
  assert.equal(stats.total, 1330);
  assert.equal(stats.receipts, 1);
  assert.equal(stats.byDay[0].date, '2026-09-11');
  assert.ok(stats.byCategory.length >= 1);
  assert.equal(stats.topItems[0].name, 'Наушники');
});

test('рейтинг учитывает зарплатный цикл', async () => {
  const withoutIncome = await (await api('/api/rating/current')).json();
  assert.equal(withoutIncome.cycle, null);
  assert.equal(typeof withoutIncome.level, 'number');

  await api('/api/income', {
    method: 'PUT',
    body: JSON.stringify({ type: '5/2', amount: 50000, frequency: 'monthly', lastIncomeDate: '2026-09-02' }),
  });

  const withIncome = await (await api('/api/rating/current')).json();
  assert.ok(withIncome.cycle);
  assert.equal(withIncome.cycle.amount, 50000);
  assert.ok(withIncome.cycle.phaseMessage.title.length > 0);
});

test('лидерборд показывает меня и друга', async () => {
  await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'masha', email: 'masha@example.com', password: 'secret123' }),
  });
  const added = await api('/api/leaderboard/friends', {
    method: 'POST',
    body: JSON.stringify({ email: 'masha@example.com' }),
  });
  assert.equal(added.status, 201);

  const board = await (await api('/api/leaderboard/friends')).json();
  assert.equal(board.rows.length, 2);
  assert.ok(board.rows.some((row: { isMe: boolean }) => row.isMe));
  // Ни у кого ещё нет 10 верифицированных чеков — в зачёт лидерборда никто не проходит.
  assert.equal(board.rows.every((row: { eligible: boolean }) => row.eligible === false), true);
});

test('удаление траты работает', async () => {
  const [expense] = await (await api('/api/expenses')).json();
  const deleted = await api(`/api/expenses/${expense.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.equal((await (await api('/api/expenses')).json()).length, 0);
});

test('без токена доступа нет', async () => {
  const response = await fetch(`${baseUrl}/api/expenses`);
  assert.equal(response.status, 401);
});
