import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { haptic, isTelegram, useMainButton } from '../telegram';

const CATEGORIES = [
  { name: 'Еда', icon: '🍎' },
  { name: 'Напитки', icon: '☕' },
  { name: 'Транспорт', icon: '🚌' },
  { name: 'Одежда', icon: '👕' },
  { name: 'Электроника', icon: '🎧' },
  { name: 'Быт', icon: '🧻' },
  { name: 'Другое', icon: '🛒' },
];

const isoDay = (shiftDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - shiftDays);
  return date.toISOString().slice(0, 10);
};

/**
 * Самый частый сценарий: вышел из магазина, вбил сумму, ткнул категорию, готово.
 * Три тапа, без фото и без ожидания OCR.
 */
export function QuickAdd({ onSaved }: { onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Еда');
  // «Другое» разворачивается в поле ввода: свои категории бывают нужнее готовых.
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [date, setDate] = useState(isoDay());
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = useMemo(() => Number(amount.replace(',', '.')), [amount]);
  const valid = Number.isFinite(value) && value > 0;

  const finalCategory = customOpen && custom.trim() ? custom.trim() : category;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveExpense({
        total: value,
        date,
        description: place.trim() || category,
        items: [{ name: place.trim() || finalCategory, price: value, category: finalCategory }],
        category: finalCategory,
      });
      haptic('success');
      setAmount('');
      setPlace('');
      onSaved();
    } catch (saveError) {
      haptic('error');
      setError((saveError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // В Telegram сохраняем главной кнопкой внизу — она всегда над клавиатурой.
  useEffect(() => useMainButton(valid ? `Записать ${Math.round(value)}р` : 'Введи сумму', save, valid),
    [valid, value, finalCategory, date, place, busy]);

  return (
    <section className="card quick-add">
      <h2>Новая трата</h2>

      <label className="amount-field">
        <span className="field-label">Сколько потратил</span>
        <div className="amount-input">
          <input
            id="quick-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
          />
          <span className="currency">₽</span>
        </div>
      </label>

      <div className="field">
        <span className="field-label">На что</span>
        <div className="chips">
          {CATEGORIES.map((item) => (
            <button
              key={item.name}
              type="button"
              className={`chip-button${category === item.name && !customOpen ? ' active' : ''}`}
              onClick={() => {
                setCategory(item.name);
                setCustomOpen(item.name === 'Другое' ? !customOpen : false);
                haptic('tap');
              }}
            >
              <span aria-hidden="true">{item.icon}</span> {item.name}
            </button>
          ))}
        </div>
      </div>

      {customOpen && (
        <label>
          <span className="field-label">Своя категория</span>
          <input
            id="custom-category"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="Спорт, подарки, лекарства…"
            autoFocus
          />
        </label>
      )}

      <div className="field">
        <span className="field-label">Когда</span>
        <div className="chips">
          <button
            type="button"
            className={`chip-button${date === isoDay() ? ' active' : ''}`}
            onClick={() => setDate(isoDay())}
          >
            Сегодня
          </button>
          <button
            type="button"
            className={`chip-button${date === isoDay(1) ? ' active' : ''}`}
            onClick={() => setDate(isoDay(1))}
          >
            Вчера
          </button>
          <input
            id="quick-date"
            className="date-input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </div>

      <label className="field">
        <span className="field-label">Где — необязательно</span>
        <input
          id="quick-place"
          value={place}
          onChange={(event) => setPlace(event.target.value)}
          placeholder="Пятёрочка, кофейня, заправка…"
        />
      </label>

      {error && <p className="error">{error}</p>}

      {!isTelegram() && (
        <button type="button" className="big-button" onClick={save} disabled={!valid || busy}>
          {valid ? `Записать ${Math.round(value)}р` : 'Введи сумму'}
        </button>
      )}
    </section>
  );
}
