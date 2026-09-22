import { getDb } from './init.js';

export interface ExpenseRow {
  id: number;
  user_id: number;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  image_path: string | null;
  qr_code: string | null;
  verified: number;
  flagged: number;
  flagged_reason: string | null;
  created_at: string;
}

export interface ItemRow {
  id: number;
  expense_id: number;
  name: string;
  price: number;
  category: string;
}

export interface UserRow {
  id: number;
  username: string;
  email: string | null;
  password_hash: string | null;
  telegram_id: string | null;
  photo_url: string | null;
}

export function createUser(username: string, email: string, passwordHash: string): number {
  const result = getDb()
    .prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
    .run(username, email, passwordHash);
  return Number(result.lastInsertRowid);
}

export const findUserByEmail = (email: string) =>
  getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;

export const findUserById = (id: number) =>
  getDb().prepare('SELECT id, username, email, telegram_id, photo_url FROM users WHERE id = ?').get(id) as
    | Omit<UserRow, 'password_hash'>
    | undefined;

/** Поиск друга по имени в Telegram: регистр и @ в начале не важны. */
export const findUserByUsername = (username: string) =>
  getDb()
    .prepare('SELECT * FROM users WHERE lower_u(username) = lower_u(?)')
    .get(username.replace(/^@/, '').trim()) as UserRow | undefined;

export const findUserByTelegramId = (telegramId: string) =>
  getDb().prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as UserRow | undefined;

/** Заводит пользователя, пришедшего из Telegram: ни email, ни пароля у него нет. */
export function createTelegramUser(telegramId: string, username: string, photoUrl: string | null): number {
  const result = getDb()
    .prepare('INSERT INTO users (username, telegram_id, photo_url) VALUES (?, ?, ?)')
    .run(username, telegramId, photoUrl);
  return Number(result.lastInsertRowid);
}

/** Имя и аватарка в Telegram меняются — подтягиваем их при каждом входе. */
export function updateTelegramProfile(userId: number, username: string, photoUrl: string | null): void {
  getDb().prepare('UPDATE users SET username = ?, photo_url = ? WHERE id = ?').run(username, photoUrl, userId);
}

export interface NewExpense {
  userId: number;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  imagePath: string | null;
  qrCode: string | null;
  verified: boolean;
  flagged: boolean;
  flaggedReason: string | null;
  items: { name: string; price: number; category: string }[];
}

export function insertExpense(expense: NewExpense): number {
  const db = getDb();
  const tx = db.transaction((data: NewExpense) => {
    const result = db
      .prepare(
        `INSERT INTO expenses
          (user_id, amount, category, description, date, image_path, qr_code, verified, flagged, flagged_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.userId,
        data.amount,
        data.category,
        data.description,
        data.date,
        data.imagePath,
        data.qrCode,
        data.verified ? 1 : 0,
        data.flagged ? 1 : 0,
        data.flaggedReason,
      );
    const expenseId = Number(result.lastInsertRowid);
    const insertItem = db.prepare('INSERT INTO items (expense_id, name, price, category) VALUES (?, ?, ?, ?)');
    for (const item of data.items) {
      insertItem.run(expenseId, item.name, item.price, item.category);
    }
    return expenseId;
  });
  return tx(expense);
}

export interface ExpenseFilters {
  month?: string;
  category?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

export function listExpenses(userId: number, filters: ExpenseFilters = {}) {
  const clauses = ['e.user_id = ?'];
  const params: (string | number)[] = [userId];

  if (filters.month) {
    clauses.push("strftime('%Y-%m', e.date) = ?");
    params.push(filters.month);
  }
  if (filters.category) {
    clauses.push('e.category = ?');
    params.push(filters.category);
  }
  if (filters.from) {
    clauses.push('e.date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('e.date <= ?');
    params.push(filters.to);
  }
  if (filters.minAmount !== undefined) {
    clauses.push('e.amount >= ?');
    params.push(filters.minAmount);
  }
  if (filters.maxAmount !== undefined) {
    clauses.push('e.amount <= ?');
    params.push(filters.maxAmount);
  }
  if (filters.search) {
    clauses.push(
      '(lower_u(e.description) LIKE ? OR EXISTS (SELECT 1 FROM items i WHERE i.expense_id = e.id AND lower_u(i.name) LIKE ?))',
    );
    const pattern = `%${filters.search.toLowerCase()}%`;
    params.push(pattern, pattern);
  }

  const expenses = getDb()
    .prepare(`SELECT e.* FROM expenses e WHERE ${clauses.join(' AND ')} ORDER BY e.date DESC, e.id DESC`)
    .all(...params) as ExpenseRow[];

  return expenses.map((expense) => ({ ...expense, items: listItems(expense.id) }));
}

export const listItems = (expenseId: number) =>
  getDb().prepare('SELECT * FROM items WHERE expense_id = ?').all(expenseId) as ItemRow[];

export const getExpense = (userId: number, expenseId: number) =>
  getDb().prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(expenseId, userId) as
    | ExpenseRow
    | undefined;

export function deleteExpense(userId: number, expenseId: number): boolean {
  const db = getDb();
  db.prepare('DELETE FROM items WHERE expense_id IN (SELECT id FROM expenses WHERE id = ? AND user_id = ?)').run(
    expenseId,
    userId,
  );
  return db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(expenseId, userId).changes > 0;
}

export function updateExpense(
  userId: number,
  expenseId: number,
  patch: { amount?: number; category?: string; description?: string | null; date?: string },
): boolean {
  const fields = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (fields.length === 0) return false;
  const setSql = fields.map(([key]) => `${key} = ?`).join(', ');
  const params = fields.map(([, value]) => value as string | number | null);
  return (
    getDb()
      .prepare(`UPDATE expenses SET ${setSql} WHERE id = ? AND user_id = ?`)
      .run(...params, expenseId, userId).changes > 0
  );
}

export function dayUsage(userId: number, date: string) {
  const db = getDb();
  const today = db
    .prepare('SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND date = ?')
    .get(userId, date) as { count: number; total: number };
  const history = db
    .prepare('SELECT COUNT(*) AS count, COALESCE(AVG(amount), 0) AS average FROM expenses WHERE user_id = ? AND date < ?')
    .get(userId, date) as { count: number; average: number };
  return {
    receiptsToday: today.count,
    amountToday: today.total,
    historicalAverage: history.average,
    historicalCount: history.count,
  };
}

/** Сводка за месяц (YYYY-MM). Флагованные чеки в рейтинг не идут. */
export function monthSummary(userId: number, month: string) {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS receipts
       FROM expenses WHERE user_id = ? AND strftime('%Y-%m', date) = ? AND flagged = 0`,
    )
    .get(userId, month) as { total: number; receipts: number };

  const byCategory = db
    .prepare(
      `SELECT category, SUM(amount) AS total FROM expenses
       WHERE user_id = ? AND strftime('%Y-%m', date) = ? AND flagged = 0
       GROUP BY category ORDER BY total DESC`,
    )
    .all(userId, month) as { category: string; total: number }[];

  const byDay = db
    .prepare(
      `SELECT date, SUM(amount) AS total FROM expenses
       WHERE user_id = ? AND strftime('%Y-%m', date) = ? AND flagged = 0
       GROUP BY date ORDER BY date`,
    )
    .all(userId, month) as { date: string; total: number }[];

  const topItems = db
    .prepare(
      `SELECT i.name, SUM(i.price) AS total, COUNT(*) AS count
       FROM items i JOIN expenses e ON e.id = i.expense_id
       WHERE e.user_id = ? AND strftime('%Y-%m', e.date) = ? AND e.flagged = 0
       GROUP BY lower_u(i.name) ORDER BY total DESC LIMIT 5`,
    )
    .all(userId, month) as { name: string; total: number; count: number }[];

  return { ...totals, byCategory, byDay, topItems };
}

export function dailySeries(userId: number, days: number) {
  return getDb()
    .prepare(
      `SELECT date, SUM(amount) AS total FROM expenses
       WHERE user_id = ? AND date >= date('now', ?) AND flagged = 0
       GROUP BY date ORDER BY date`,
    )
    .all(userId, `-${days} days`) as { date: string; total: number }[];
}

export function expenseIntegrity(userId: number) {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS totalCount,
              COALESCE(SUM(verified), 0) AS verifiedCount,
              COALESCE(SUM(flagged), 0) AS flaggedCount
       FROM expenses WHERE user_id = ?`,
    )
    .get(userId) as { totalCount: number; verifiedCount: number; flaggedCount: number };
}

export const getIncome = (userId: number) =>
  getDb().prepare('SELECT * FROM income WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) as
    | {
        type: string;
        amount: number;
        frequency: string;
        next_income_date: string | null;
        last_income_date: string | null;
        schedule_data: string | null;
      }
    | undefined;

export function upsertIncome(
  userId: number,
  income: {
    type: string;
    amount: number;
    frequency: string;
    nextIncomeDate: string | null;
    lastIncomeDate: string | null;
    scheduleData: unknown;
  },
): void {
  const db = getDb();
  db.prepare('DELETE FROM income WHERE user_id = ?').run(userId);
  db.prepare(
    `INSERT INTO income (user_id, type, amount, frequency, next_income_date, last_income_date, schedule_data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    income.type,
    income.amount,
    income.frequency,
    income.nextIncomeDate,
    income.lastIncomeDate,
    income.scheduleData ? JSON.stringify(income.scheduleData) : null,
  );
}

export function saveRating(userId: number, rating: number, verifiedCount: number, totalCount: number): void {
  getDb()
    .prepare(
      `INSERT INTO leaderboard_ratings (user_id, rating, verified_expenses_count, total_expenses_count, last_updated)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         rating = excluded.rating,
         verified_expenses_count = excluded.verified_expenses_count,
         total_expenses_count = excluded.total_expenses_count,
         last_updated = CURRENT_TIMESTAMP`,
    )
    .run(userId, rating, verifiedCount, totalCount);
}

export function friendIds(userId: number): number[] {
  return (getDb().prepare('SELECT friend_id FROM friends WHERE user_id = ?').all(userId) as { friend_id: number }[]).map(
    (row) => row.friend_id,
  );
}

export function addFriend(userId: number, friendId: number): void {
  getDb().prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)').run(userId, friendId);
}

// ---------- Уведомления ----------

export const getNotifySettings = (userId: number) =>
  getDb().prepare('SELECT notify_enabled, notify_hour FROM users WHERE id = ?').get(userId) as
    | { notify_enabled: number; notify_hour: number }
    | undefined;

export function setNotifySettings(userId: number, enabled: boolean, hour: number): void {
  getDb()
    .prepare('UPDATE users SET notify_enabled = ?, notify_hour = ? WHERE id = ?')
    .run(enabled ? 1 : 0, hour, userId);
}

/** Кому в этот час слать вечернюю сводку. */
export const usersToNotify = (hour: number) =>
  getDb()
    .prepare(
      'SELECT id, telegram_id FROM users WHERE notify_enabled = 1 AND notify_hour = ? AND telegram_id IS NOT NULL',
    )
    .all(hour) as { id: number; telegram_id: string }[];

// ---------- Регулярные траты ----------

export interface RecurringRow {
  id: number;
  user_id: number;
  name: string;
  amount: number;
  category: string;
  day_of_month: number;
  active: number;
}

export const listRecurring = (userId: number) =>
  getDb().prepare('SELECT * FROM recurring WHERE user_id = ? ORDER BY day_of_month').all(userId) as RecurringRow[];

export function addRecurring(
  userId: number,
  data: { name: string; amount: number; category: string; dayOfMonth: number },
): number {
  const result = getDb()
    .prepare('INSERT INTO recurring (user_id, name, amount, category, day_of_month) VALUES (?, ?, ?, ?, ?)')
    .run(userId, data.name, data.amount, data.category, data.dayOfMonth);
  return Number(result.lastInsertRowid);
}

export const removeRecurring = (userId: number, id: number) =>
  getDb().prepare('DELETE FROM recurring WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;

export const toggleRecurring = (userId: number, id: number, active: boolean) =>
  getDb().prepare('UPDATE recurring SET active = ? WHERE id = ? AND user_id = ?').run(active ? 1 : 0, id, userId)
    .changes > 0;

/**
 * Создаёт траты по регулярным платежам, у которых в этом месяце наступил день списания.
 * Повторный вызов ничего не дублирует — за это отвечает уникальный индекс.
 */
export function materializeRecurring(userId: number, now = new Date()): number {
  const db = getDb();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  let created = 0;

  for (const rule of listRecurring(userId)) {
    if (!rule.active) continue;
    // 31-е число в коротком месяце становится последним днём месяца.
    const day = Math.min(rule.day_of_month, daysInMonth);
    if (day > today) continue;

    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const exists = db
      .prepare('SELECT 1 FROM expenses WHERE user_id = ? AND recurring_id = ? AND date = ?')
      .get(userId, rule.id, date);
    if (exists) continue;

    const result = db
      .prepare(
        `INSERT INTO expenses (user_id, amount, category, description, date, verified, flagged, recurring_id)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?)`,
      )
      .run(userId, rule.amount, rule.category, rule.name, date, rule.id);
    db.prepare('INSERT INTO items (expense_id, name, price, category) VALUES (?, ?, ?, ?)').run(
      Number(result.lastInsertRowid),
      rule.name,
      rule.amount,
      rule.category,
    );
    created += 1;
  }

  return created;
}

/** Отметка «сводку за этот день уже отправили» — защита от повторов при перезапуске бота. */
export function markNotified(userId: number, date: string): boolean {
  const result = getDb()
    .prepare('INSERT OR IGNORE INTO notify_log (user_id, date) VALUES (?, ?)')
    .run(userId, date);
  return result.changes > 0;
}
