import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { haptic } from '../telegram';
import { CloseIcon } from './Icons';

interface Rule {
  id: number;
  name: string;
  amount: number;
  category: string;
  day_of_month: number;
  active: number;
}

const CATEGORIES = ['Связь', 'Подписки', 'Жильё', 'Транспорт', 'Еда', 'Другое'];

/**
 * Регулярные траты: связь, подписки, аренда.
 * В свой день месяца превращаются в обычную трату — руками вбивать не нужно.
 */
export function Recurring({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Подписки');
  const [day, setDay] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const load = () => api.recurring().then(setRules).catch((loadError: Error) => setError(loadError.message));

  useEffect(() => {
    void load();
  }, []);

  const monthlyTotal = rules
    .filter((rule) => rule.active)
    .reduce((sum, rule) => sum + rule.amount, 0);

  const add = async () => {
    try {
      await api.addRecurring({
        name: name.trim(),
        amount: Number(amount.replace(',', '.')),
        category,
        dayOfMonth: Number(day),
      });
      haptic('success');
      setName('');
      setAmount('');
      setError(null);
      await load();
      onChanged();
    } catch (addError) {
      haptic('error');
      setError((addError as Error).message);
    }
  };

  const toggle = async (rule: Rule) => {
    await api.toggleRecurring(rule.id, !rule.active);
    await load();
    onChanged();
  };

  const remove = async (rule: Rule) => {
    await api.deleteRecurring(rule.id);
    await load();
    onChanged();
  };

  return (
    <div className="sheet">
      <div className="sheet-inner">
        <div className="sheet-head">
          <h2>Регулярные траты</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <CloseIcon size={22} />
          </button>
        </div>

        <section className="card">
          <h2>Каждый месяц</h2>
          {rules.length === 0 && (
            <p className="muted">
              Сюда идут связь, подписки, аренда — то, что списывается само. В свой день они
              появятся в тратах без твоего участия.
            </p>
          )}

          <ul className="recurring-list">
            {rules.map((rule) => (
              <li key={rule.id} className={`recurring-row${rule.active ? '' : ' off'}`}>
                <div>
                  <div className="recurring-name">{rule.name}</div>
                  <div className="recurring-meta">
                    {rule.category} · {rule.day_of_month} числа
                  </div>
                </div>
                <span className="recurring-amount">{Math.round(rule.amount).toLocaleString('ru-RU')}р</span>
                <div style={{ display: 'flex', gap: 'var(--s1)' }}>
                  <button type="button" className="link" onClick={() => toggle(rule)}>
                    {rule.active ? 'пауза' : 'вкл'}
                  </button>
                  <button type="button" className="link danger" onClick={() => remove(rule)}>
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {rules.length > 0 && (
            <p className="muted">
              Итого обязательных: <strong>{Math.round(monthlyTotal).toLocaleString('ru-RU')}р</strong> в месяц
            </p>
          )}
        </section>

        <section className="card recurring-form">
          <h2>Добавить</h2>
          <label>
            <span className="field-label">Что это</span>
            <input
              id="recurring-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Связь, Яндекс Плюс, аренда…"
            />
          </label>

          <div className="row">
            <label>
              <span className="field-label">Сумма</span>
              <input
                id="recurring-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="450"
              />
            </label>
            <label>
              <span className="field-label">Число</span>
              <input
                id="recurring-day"
                inputMode="numeric"
                value={day}
                onChange={(event) => setDay(event.target.value.replace(/\D/g, '').slice(0, 2))}
              />
            </label>
          </div>

          <div className="field">
            <span className="field-label">Категория</span>
            <div className="chips">
              {CATEGORIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`chip-button${category === item ? ' active' : ''}`}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <button
            type="button"
            className="big-button"
            onClick={add}
            disabled={!name.trim() || !Number(amount.replace(',', '.'))}
          >
            Добавить
          </button>
          <p className="muted">
            Если число уже прошло в этом месяце, трата появится сразу — и дальше будет повторяться
            каждый месяц.
          </p>
        </section>
      </div>
    </div>
  );
}
