import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  telegram_id TEXT UNIQUE,
  photo_url TEXT,
  notify_enabled INTEGER DEFAULT 0,
  notify_hour INTEGER DEFAULT 20,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Регулярные траты: связь, подписки, аренда. Раз в месяц превращаются в обычную трату.
CREATE TABLE IF NOT EXISTS recurring (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  category TEXT,
  day_of_month INTEGER NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount DECIMAL(10, 2),
  category TEXT,
  description TEXT,
  date DATE,
  image_path TEXT,
  qr_code TEXT,
  verified BOOLEAN DEFAULT FALSE,
  flagged BOOLEAN DEFAULT FALSE,
  flagged_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  expense_id INTEGER NOT NULL,
  name TEXT,
  price DECIMAL(10, 2),
  category TEXT,
  FOREIGN KEY(expense_id) REFERENCES expenses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS income (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT,
  amount DECIMAL(10, 2),
  frequency TEXT,
  next_income_date DATE,
  last_income_date DATE,
  schedule_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS income_history (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount DECIMAL(10, 2),
  date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS leaderboard_ratings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  rating DECIMAL(4, 2),
  verified_expenses_count INTEGER,
  total_expenses_count INTEGER,
  last_updated TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, friend_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(friend_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_date ON expenses(user_id, date);
CREATE INDEX IF NOT EXISTS idx_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_items_expense ON items(expense_id);
CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring(user_id, active);

CREATE TABLE IF NOT EXISTS notify_log (
  user_id INTEGER NOT NULL,
  date DATE NOT NULL,
  PRIMARY KEY (user_id, date)
);
`;

export type DB = Database.Database;

let db: DB | null = null;

export function initDb(dbPath = config.dbPath): DB {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  // SQLite LOWER() умеет только ASCII — для кириллицы регистрируем свою функцию.
  instance.function('lower_u', { deterministic: true }, (value: unknown) =>
    value == null ? null : String(value).toLowerCase(),
  );
  instance.exec(SCHEMA);
  migrate(instance);
  return instance;
}

/** Догоняет базы, созданные до появления входа через Telegram. */
function migrate(instance: DB): void {
  const columns = (instance.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(
    (column) => column.name,
  );
  if (!columns.includes('telegram_id')) {
    instance.exec('ALTER TABLE users ADD COLUMN telegram_id TEXT');
    instance.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id)');
  }
  if (!columns.includes('photo_url')) {
    instance.exec('ALTER TABLE users ADD COLUMN photo_url TEXT');
  }
  if (!columns.includes('notify_enabled')) {
    instance.exec('ALTER TABLE users ADD COLUMN notify_enabled INTEGER DEFAULT 0');
    instance.exec('ALTER TABLE users ADD COLUMN notify_hour INTEGER DEFAULT 20');
  }

  const expenseColumns = (instance.prepare('PRAGMA table_info(expenses)').all() as { name: string }[]).map(
    (column) => column.name,
  );
  if (!expenseColumns.includes('recurring_id')) {
    instance.exec('ALTER TABLE expenses ADD COLUMN recurring_id INTEGER');
  }
  // Одна регулярная трата — одна запись в месяц, даже если приложение открыли десять раз.
  instance.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_once ON expenses(user_id, recurring_id, date) WHERE recurring_id IS NOT NULL',
  );
}

export function getDb(): DB {
  if (!db) db = initDb();
  return db;
}

/** Используется в тестах, чтобы работать с in-memory базой. */
export function setDb(instance: DB): void {
  db = instance;
}
