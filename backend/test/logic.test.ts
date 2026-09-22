import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categorize, dominantCategory } from '../src/services/categorizer.js';
import { parseReceipt } from '../src/services/parser.js';
import { calculateDynamicRating, calculateRating, ratingStatus } from '../src/services/rating.js';
import { buildCycle } from '../src/services/incomeCycle.js';
import { canBeOnLeaderboard, checkExpense, isVerified } from '../src/services/anticheat.js';

test('категоризатор раскладывает товары по словарю', () => {
  assert.equal(categorize('Хлеб Бородинский'), 'Еда');
  assert.equal(categorize('Кола 0.5'), 'Напитки');
  assert.equal(categorize('Наушники JBL'), 'Электроника');
  assert.equal(categorize('Гвозди строительные'), 'Другое');
});

test('категория чека — там, где больше денег', () => {
  const category = dominantCategory([
    { price: 50, category: 'Еда' },
    { price: 500, category: 'Электроника' },
  ]);
  assert.equal(category, 'Электроника');
});

test('парсер достаёт товары, итог и дату', () => {
  const receipt = [
    'ООО Пятёрочка',
    'г. Москва, ул. Ленина 14',
    '11.09.2026 18:42',
    'Хлеб 50,00',
    'Молоко 2шт 80,00',
    'Наушники 1 200,00',
    'ИТОГО 1330,00',
  ].join('\n');

  const parsed = parseReceipt(receipt);
  assert.equal(parsed.total, 1330);
  assert.equal(parsed.date, '2026-09-11');
  assert.deepEqual(
    parsed.items.map((item) => [item.name, item.price, item.category]),
    [
      ['Хлеб', 50, 'Еда'],
      ['Молоко', 80, 'Еда'],
      ['Наушники', 1200, 'Электроника'],
    ],
  );
  assert.equal(parsed.category, 'Электроника');
});

test('парсер держит реальный грязный чек', () => {
  const receipt = [
    'МАГНИТ',
    'ИНН 2309085638',
    'Чек № 0042  Кассир: Иванова',
    'Молоко Простоквашино 3,2% 1шт х 89.90  89.90',
    'Хлеб Дарницкий',
    '  45.50',
    'Сыр Российский 0,254 кг х 899.00  228.35',
    'Пакет майка 8,00',
    'ИТОГ  371.75',
    'КАРТОЙ  371.75',
    'СПАСИБО ЗА ПОКУПКУ',
  ].join('\n');

  const parsed = parseReceipt(receipt);
  assert.equal(parsed.items.length, 4, 'цена со следующей строки тоже считается');
  assert.equal(parsed.total, 371.75);
  assert.equal(
    Number(parsed.items.reduce((sum, item) => sum + item.price, 0).toFixed(2)),
    371.75,
    'сумма позиций сходится с итогом',
  );
});

test('парсер не принимает реквизиты и адрес за товары', () => {
  const parsed = parseReceipt(
    ['ООО Ромашка', 'г. Москва ул. Ленина 14', 'ИНН 7701234567', 'Тел 8 495 123-45-67', 'Вода 45,00'].join('\n'),
  );
  assert.deepEqual(parsed.items.map((item) => item.name), ['Вода']);
});

test('парсер находит QR фискального чека', () => {
  const text = 'Чек\nt=20260911T1842&s=250.00&fn=9960440300123&i=12345&fp=1234567890&n=1\nИТОГО 250,00';
  assert.equal(parseReceipt(text).qrCode?.startsWith('t=20260911T1842'), true);
});

test('шкала рейтинга построена вокруг нейтральной середины', () => {
  const norm = 25000;
  // Тратишь как все — ровно середина шкалы.
  assert.equal(calculateRating(norm, 20, 5, norm, 30, 30), 5.18);
  // Каждое удвоение трат добавляет примерно 2.5 балла.
  assert.equal(calculateRating(norm * 2, 20, 5, norm, 30, 30), 7.78);
  assert.equal(calculateRating(norm / 2, 20, 5, norm, 30, 30), 2.59);
  // Потолок 10.00, а пол — 1.00: ноль выглядел бы как поломка, а не оценка.
  assert.equal(calculateRating(norm * 8, 40, 6, norm, 30, 30), 10);
  assert.equal(calculateRating(100, 1, 1, norm, 30, 30), 1);
});

test('рейтинг считает темп трат, а не накопленную сумму', () => {
  const norm = 25000;
  // 4000р за 5 дней — это темп 24 000 в месяц, то есть почти норма.
  const early = calculateRating(4000, 4, 3, norm, 5, 30);
  assert.ok(early > 4.5 && early < 5.5, `в начале месяца рейтинг должен быть около нормы, получили ${early}`);

  // Та же сумма, но за весь месяц — человек почти ничего не тратил.
  const late = calculateRating(4000, 4, 3, norm, 30, 30);
  assert.ok(late < 2, `за полный месяц те же 4000р должны дать низкий рейтинг, получили ${late}`);
});

test('без трат рейтинг стоит посередине, а не в нуле', () => {
  assert.equal(calculateRating(0, 0, 0, 25000, 10, 30), 5);
  assert.equal(calculateRating(5000, 0, 0, 25000, 10, 30), 5, 'чеков нет — судить не о чем');
});

test('статус подбирается по уровню рейтинга', () => {
  assert.equal(ratingStatus(9.87).status, 'ЛЕГЕНДАРНЫЙ');
  assert.equal(ratingStatus(7.42).status, 'СЕРЬЁЗНЫЙ');
  assert.equal(ratingStatus(1.47).status, 'СВЯТОЙ');
});

test('цикл дохода прокручивается до актуального периода', () => {
  const cycle = buildCycle(
    {
      type: '5/2',
      amount: 50000,
      frequency: 'twice_monthly',
      next_income_date: null,
      last_income_date: '2026-09-02',
      schedule_data: null,
    },
    new Date('2026-09-07T10:00:00Z'),
  );

  assert.ok(cycle);
  assert.equal(cycle.daysSinceIncome, 5);
  assert.equal(cycle.daysUntilNextIncome, 10);
  assert.equal(cycle.nextIncomeDate, '2026-09-17');
});

test('анти-чит: лимиты и аномалии', () => {
  const base = { receiptsToday: 0, amountToday: 0, historicalAverage: 0, historicalCount: 0 };
  assert.deepEqual(checkExpense(1000, base), { allowed: true, flagged: false, reason: null });

  const overLimit = checkExpense(1000, { ...base, receiptsToday: 20 });
  assert.equal(overLimit.allowed, false);

  const tooMuch = checkExpense(60000, { ...base, amountToday: 60000 });
  assert.equal(tooMuch.allowed, false);

  const anomaly = checkExpense(50000, { ...base, historicalAverage: 1000, historicalCount: 10 });
  assert.equal(anomaly.allowed, true);
  assert.equal(anomaly.flagged, true);
});

test('верификация по QR и допуск в лидерборд', () => {
  assert.equal(isVerified('t=2026...'), true);
  assert.equal(isVerified(null), false);
  assert.equal(canBeOnLeaderboard({ verifiedCount: 10, totalCount: 12, flaggedCount: 1 }), true);
  assert.equal(canBeOnLeaderboard({ verifiedCount: 9, totalCount: 10, flaggedCount: 0 }), false);
  assert.equal(canBeOnLeaderboard({ verifiedCount: 10, totalCount: 20, flaggedCount: 0 }), false);
  assert.equal(canBeOnLeaderboard({ verifiedCount: 0, totalCount: 0, flaggedCount: 0 }), false);
});

test('регулярная трата создаётся один раз в месяц', async () => {
  const { initDb, setDb } = await import('../src/db/init.js');
  const { addRecurring, listExpenses, materializeRecurring, createUser } = await import('../src/db/queries.js');

  setDb(initDb(':memory:'));
  const userId = createUser('vasya', 'v@e.com', 'hash');
  addRecurring(userId, { name: 'Связь', amount: 450, category: 'Другое', dayOfMonth: 5 });
  addRecurring(userId, { name: 'Подписка', amount: 299, category: 'Другое', dayOfMonth: 25 });

  const now = new Date('2026-09-10T12:00:00Z');
  assert.equal(materializeRecurring(userId, now), 1, 'создаётся только та, чей день уже наступил');
  assert.equal(materializeRecurring(userId, now), 0, 'повторный вызов не дублирует');

  const expenses = listExpenses(userId);
  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].amount, 450);
  assert.equal(expenses[0].date, '2026-09-05');

  // В следующем месяце появляется новая запись.
  assert.equal(materializeRecurring(userId, new Date('2026-10-06T12:00:00Z')), 1);
  assert.equal(listExpenses(userId).length, 2);
});

test('день 31 в коротком месяце становится последним днём', async () => {
  const { initDb, setDb } = await import('../src/db/init.js');
  const { addRecurring, listExpenses, materializeRecurring, createUser } = await import('../src/db/queries.js');

  setDb(initDb(':memory:'));
  const userId = createUser('masha', 'm@e.com', 'hash');
  addRecurring(userId, { name: 'Аренда', amount: 30000, category: 'Другое', dayOfMonth: 31 });

  materializeRecurring(userId, new Date('2026-09-30T12:00:00Z'));
  assert.equal(listExpenses(userId)[0].date, '2026-09-30');
});

test('фискальный QR отдаёт точную сумму и дату', async () => {
  const { parseFiscalQr } = await import('../src/services/qr.js');

  const qr = parseFiscalQr('t=20260911T1842&s=1330.00&fn=9960440300123&i=12345&fp=1234567890&n=1');
  assert.equal(qr?.total, 1330);
  assert.equal(qr?.date, '2026-09-11');

  assert.equal(parseFiscalQr('просто текст'), null);
  assert.equal(parseFiscalQr('s=100.00'), null, 'без времени это не фискальный код');
});

test('чек Пятёрочки: цены со следующей строки, объём не путается с ценой', () => {
  const receipt = [
    'Пятерочка',
    'КАССОВЫЙ ЧЕК/ПРИХОД',
    'ЦЕНА ДО СКИДКИ СКИДКА ЦЕНА КОЛ-ВО ИТОГО',
    '4972 САДЫ ПР.НАП.ЯБЛ.ОСВ.0,95Л',
    'НДС 10%  69.99   69.99   1ШТ  69.99',
    '6575 BURN НАП.СОЧ.ЭНЕРГ, Ж/Б 0.449Л',
    'НДС 22%  119.99  3.00  116.99  1ШТ  116.99',
    'ПЕЛЕШ.ТОМАТЫ С БАЗИЛ.165Г',
    'НДС 10%  85.99   85.99   1ШТ  85.99',
    'СКИДКА НА ЧЕК                     3.00',
    'ПОДЫТОГ:              275.97',
    'ИТОГ:                 272.97',
    'БЕЗНАЛИЧНЫМИ:         272.97',
    'ООО "АГРОТОРГ"',
    'ИНН:7825706086 СНО:ОСН',
    'РН ККТ:0007952870112 47',
    'ФН:0087917160',
  ].join('\n');

  const parsed = parseReceipt(receipt);

  assert.equal(parsed.total, 272.97, 'ИТОГ важнее ПОДЫТОГа');
  assert.deepEqual(
    parsed.items.map((item) => item.price),
    [69.99, 116.99, 85.99],
    'цена берётся со следующей строки, а объём 0,95Л ценой не считается',
  );
  assert.equal(parsed.itemsMismatch, false, 'позиции сходятся с итогом');
  assert.equal(parsed.items[0].category, 'Напитки');
});

test('номера ИНН и ККТ не превращаются в покупки', () => {
  const parsed = parseReceipt(
    [
      'ИНН:7825706086 СНО:ОСН',
      'РН ККТ:0007952870112 47',
      'ЗН ККТ:0064690061269 63',
      'АВТОМАТ 0064699006126963',
      'Хлеб 52.00',
      'ИТОГ: 52.00',
    ].join('\n'),
  );
  assert.deepEqual(parsed.items.map((item) => item.name), ['Хлеб']);
  assert.equal(parsed.total, 52);
});

test('оценка ориентации отличает чек от перевёрнутой каши', async () => {
  const { receiptScore } = await import('../src/services/orientation.js');

  const normal = 'Пятерочка\nКАССОВЫЙ ЧЕК\nХлеб 52.00\nИТОГ: 52.00';
  const garbage = 'vail DLS ELE ТСТеы\nfal 03, 10%.\nIM KEY: 126563';

  assert.ok(receiptScore(normal) > receiptScore(garbage) * 2, 'нормальный чек набирает заметно больше');
});
