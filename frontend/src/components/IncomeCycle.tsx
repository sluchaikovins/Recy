import { useState } from 'react';
import { api, type CycleInfo } from '../api/client';
import { haptic } from '../telegram';

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')}р`;

const TYPES = [
  { value: '5/2', label: '5/2' },
  { value: '2/2', label: 'Сменами' },
  { value: 'freelance', label: 'Сделки' },
  { value: 'study', label: 'Стипендия' },
  { value: 'other', label: 'Другое' },
];

/** Что означает введённая сумма — у каждого графика свой смысл. */
const PERIODS: Record<string, { value: string; label: string; hint: string }[]> = {
  '5/2': [
    { value: 'month', label: 'За месяц', hint: 'Вся зарплата за месяц' },
    { value: 'half', label: 'За полмесяца', hint: 'Аванс или вторая часть — значит, за месяц вдвое больше' },
  ],
  '2/2': [
    { value: 'shift', label: 'За смену', hint: 'Умножу на число смен в месяце' },
    { value: 'month', label: 'За месяц', hint: 'Сколько выходит суммарно' },
  ],
  freelance: [
    { value: 'deal', label: 'За сделку', hint: 'Умножу на число сделок в месяце' },
    { value: 'month', label: 'За месяц', hint: 'Средний доход, как выходит обычно' },
  ],
  study: [{ value: 'month', label: 'За месяц', hint: 'Стипендия за месяц' }],
  other: [{ value: 'month', label: 'За месяц', hint: 'Сколько выходит за месяц' }],
};

const FREQUENCIES = [
  { value: 'daily', label: 'Каждый день' },
  { value: 'weekly', label: 'Раз в неделю' },
  { value: 'twice_monthly', label: 'Дважды в месяц' },
  { value: 'monthly', label: 'Раз в месяц' },
];

/** Сколько раз в месяц повторяется то, что человек ввёл. */
const timesPerMonth = (period: string, count: number): number => {
  if (period === 'half') return 2;
  if (period === 'shift' || period === 'deal') return Math.max(count, 1);
  return 1;
};

export function IncomeCycle({ cycle, onSaved }: { cycle: CycleInfo | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('5/2');
  const [period, setPeriod] = useState('month');
  const [frequency, setFrequency] = useState('monthly');
  const [amount, setAmount] = useState('50000');
  const [count, setCount] = useState('15');
  const [lastIncomeDate, setLastIncomeDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const periods = PERIODS[type] ?? PERIODS.other;
  const activePeriod = periods.find((item) => item.value === period) ?? periods[0];
  const needsCount = activePeriod.value === 'shift' || activePeriod.value === 'deal';

  const entered = Number(amount.replace(/\s/g, '').replace(',', '.')) || 0;
  const monthly = Math.round(entered * timesPerMonth(activePeriod.value, Number(count) || 0));

  const changeType = (next: string) => {
    setType(next);
    // У нового графика свой набор периодов — берём первый подходящий.
    setPeriod((PERIODS[next] ?? PERIODS.other)[0].value);
    haptic('tap');
  };

  const save = async () => {
    try {
      await api.saveIncome({
        type,
        frequency,
        amount: monthly,
        lastIncomeDate,
      });
      setError(null);
      setOpen(false);
      haptic('success');
      onSaved();
    } catch (saveError) {
      haptic('error');
      setError((saveError as Error).message);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2>Твой цикл доходов</h2>
        <button type="button" className="link" onClick={() => setOpen((value) => !value)}>
          {open ? 'Скрыть' : cycle ? 'Изменить' : 'Настроить'}
        </button>
      </div>

      {cycle ? (
        <>
          <p className="cycle-phase">
            <strong>{cycle.phaseMessage.title}</strong> — {cycle.phaseMessage.text}
          </p>
          <ul className="cycle-facts">
            <li>Доход: {money(cycle.amount)} в месяц</li>
            <li>
              Получил {cycle.daysSinceIncome} дн. назад ({cycle.lastIncomeDate})
            </li>
            <li>
              Следующий через {cycle.daysUntilNextIncome} дн. ({cycle.nextIncomeDate})
            </li>
            <li>
              Осталось ~{money(cycle.remaining)} на {cycle.daysUntilNextIncome} дн. →{' '}
              {money(cycle.perDayLeft)}/день
            </li>
            <li>Прогноз рейтинга на конец цикла: {cycle.forecastEndOfCycle.toFixed(2)}</li>
          </ul>
          <div className="rating-bar">
            <span style={{ width: `${Math.round(cycle.cycleDepth * 100)}%` }} />
          </div>
          <p className="muted">Прошло {Math.round(cycle.cycleDepth * 100)}% цикла</p>
        </>
      ) : (
        <p className="muted">
          Расскажи про свой доход — рейтинг станет «живым» и будет меняться внутри цикла.
        </p>
      )}

      {open && (
        <div className="income-form">
          <div className="field">
            <span className="field-label">Как ты зарабатываешь</span>
            <div className="chips">
              {TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`chip-button${type === option.value ? ' active' : ''}`}
                  onClick={() => changeType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Сумма, которую введёшь, — это</span>
            <div className="chips">
              {periods.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`chip-button${activePeriod.value === option.value ? ' active' : ''}`}
                  onClick={() => setPeriod(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="setting-hint">{activePeriod.hint}</span>
          </div>

          <label>
            <span className="field-label">
              {activePeriod.value === 'shift'
                ? 'Сколько выходит за смену'
                : activePeriod.value === 'deal'
                  ? 'Средняя сумма за сделку'
                  : 'Сколько получаешь'}
            </span>
            <input
              id="income-amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ''))}
              inputMode="decimal"
            />
          </label>

          {needsCount && (
            <label>
              <span className="field-label">
                {activePeriod.value === 'shift' ? 'Смен в месяц' : 'Сделок в месяц'}
              </span>
              <input
                id="income-count"
                value={count}
                onChange={(event) => setCount(event.target.value.replace(/\D/g, '').slice(0, 3))}
                inputMode="numeric"
              />
            </label>
          )}

          <label>
            <span className="field-label">Как часто приходят деньги</span>
            <select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
              {FREQUENCIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="field-label">Когда получил в последний раз</span>
            <input
              id="income-date"
              type="date"
              value={lastIncomeDate}
              onChange={(event) => setLastIncomeDate(event.target.value)}
            />
          </label>

          {/* Человек сразу видит, что именно уйдёт в расчёт. */}
          <p className="income-summary">
            Получается <strong>{money(monthly)}</strong> в месяц
            {needsCount && entered > 0 && (
              <span className="muted">
                {' '}
                — {money(entered)} × {Number(count) || 0}
              </span>
            )}
          </p>

          {error && <p className="error">{error}</p>}

          <button type="button" className="big-button" onClick={save} disabled={monthly <= 0}>
            Сохранить
          </button>
        </div>
      )}
    </section>
  );
}
