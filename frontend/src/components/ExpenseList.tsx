import { useEffect, useState } from 'react';
import { api, type Expense } from '../api/client';

const CATEGORIES = ['', 'Еда', 'Напитки', 'Одежда', 'Электроника', 'Быт', 'Транспорт', 'Другое'];

export function ExpenseList({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .expenses({ category, search, from, to, minAmount, maxAmount })
      .then(setExpenses)
      .catch((loadError: Error) => setError(loadError.message));
  }, [refreshKey, category, search, from, to, minAmount, maxAmount]);

  const remove = async (id: number) => {
    await api.deleteExpense(id);
    onChanged();
  };

  const editAmount = async (expense: Expense) => {
    const raw = window.prompt('Новая сумма чека', String(expense.amount));
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return;
    await api.updateExpense(expense.id, { amount });
    onChanged();
  };

  return (
    <section className="card">
      <h2>Мои траты</h2>

      <div className="filters">
        <input placeholder="Поиск по товару" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {option || 'Все категории'}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <input
          placeholder="от, р"
          inputMode="numeric"
          value={minAmount}
          onChange={(event) => setMinAmount(event.target.value)}
        />
        <input
          placeholder="до, р"
          inputMode="numeric"
          value={maxAmount}
          onChange={(event) => setMaxAmount(event.target.value)}
        />
      </div>

      {error && <p className="error">{error}</p>}
      {expenses.length === 0 && <p className="muted">Пока пусто. Загрузи первый чек.</p>}

      <ul className="expense-list">
        {expenses.map((expense) => (
          <li key={expense.id}>
            <div className="expense-head">
              <span className="expense-date">{expense.date}</span>
              <span className="tag">{expense.category}</span>
              {expense.verified === 1 && <span className="tag ok">верифицирован</span>}
              {expense.flagged === 1 && <span className="tag warn">{expense.flagged_reason ?? 'подозрительно'}</span>}
              <span className="expense-amount">{expense.amount.toLocaleString('ru-RU')}р</span>
            </div>
            {expense.items.length > 0 && (
              <div className="expense-items">
                {expense.items.map((item) => `${item.name} — ${item.price}р`).join(' · ')}
              </div>
            )}
            <div className="expense-actions">
              <button type="button" className="link" onClick={() => editAmount(expense)}>
                изменить сумму
              </button>
              <button type="button" className="link danger" onClick={() => remove(expense.id)}>
                удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
