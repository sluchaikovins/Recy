import { useState } from 'react';
import { api, type Item, type ParsedReceipt } from '../api/client';
import { haptic } from '../telegram';
import { CloseIcon } from './Icons';

const CATEGORIES = ['Еда', 'Напитки', 'Транспорт', 'Одежда', 'Электроника', 'Быт', 'Другое'];
const CUSTOM = '__custom__';

/**
 * Экран после успешного скана: человек правит распознанное и сохраняет.
 * Фото чека прикрепляется к трате — по нему потом можно проверить, что где куплено.
 */
export function ReceiptEditor({
  parsed,
  preview,
  onSaved,
  onClose,
}: {
  parsed: ParsedReceipt;
  preview: string | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Item[]>(parsed.items);
  const [date, setDate] = useState(parsed.date);
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

  const update = (index: number, patch: Partial<Item>) =>
    setItems((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.saveExpense({
        total,
        date,
        description: place.trim() || undefined,
        items: items.map((item) => ({ ...item, price: Number(item.price) || 0 })),
        imagePath: parsed.imagePath,
        qrCode: parsed.qrCode,
      });
      haptic('success');
      onSaved();
    } catch (saveError) {
      haptic('error');
      setError((saveError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet">
      <div className="sheet-inner">
        <div className="sheet-head">
          <h2>Проверь чек</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <CloseIcon size={22} />
          </button>
        </div>

        {preview && <img className="receipt-photo" src={preview} alt="Фото чека" />}

        <section className="card">
          <h2>Позиции</h2>
          <ul className="items-list">
            {items.map((item, index) => (
              <li key={index} className="item-row">
                <div>
                  <input
                    id={`item-name-${index}`}
                    value={item.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                    aria-label="Название товара"
                  />
                  {CATEGORIES.includes(item.category ?? 'Другое') ? (
                    <select
                      className="item-cat"
                      value={item.category ?? 'Другое'}
                      onChange={(event) =>
                        update(index, { category: event.target.value === CUSTOM ? '' : event.target.value })
                      }
                      aria-label="Категория"
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                      <option value={CUSTOM}>Своя категория…</option>
                    </select>
                  ) : (
                    <input
                      className="item-cat"
                      value={item.category ?? ''}
                      onChange={(event) => update(index, { category: event.target.value })}
                      placeholder="своя категория"
                      aria-label="Своя категория"
                      autoFocus
                    />
                  )}
                </div>
                <input
                  id={`item-price-${index}`}
                  className="price"
                  value={String(item.price)}
                  inputMode="decimal"
                  onChange={(event) => update(index, { price: Number(event.target.value.replace(',', '.')) || 0 })}
                  aria-label="Цена"
                />
                <button
                  type="button"
                  className="link danger"
                  onClick={() => setItems((current) => current.filter((_, position) => position !== index))}
                  aria-label="Удалить позицию"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="link"
            onClick={() => setItems((current) => [...current, { name: '', price: 0, category: 'Другое' }])}
          >
            + добавить позицию
          </button>

          <div className="total-row">
            <span className="muted">Итого</span>
            <span className="total-value">{total.toLocaleString('ru-RU')}р</span>
          </div>

          {parsed.itemsMismatch && (
            <p className="warn-note">
              Сумма позиций ({total.toLocaleString('ru-RU')}р) не сходится с итогом на чеке (
              {Math.round(parsed.total).toLocaleString('ru-RU')}р). Похоже, я что-то не дочитал —
              проверь цены или добавь недостающую строку.
            </p>
          )}
        </section>

        <section className="card">
          <h2>Детали</h2>
          <label>
            <span className="field-label">Дата</span>
            <input id="receipt-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span className="field-label">Где — необязательно</span>
            <input
              id="receipt-place"
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              placeholder="Пятёрочка, кофейня…"
            />
          </label>
          {parsed.qrCode ? (
            <p className="notice">
              QR фискального чека найден — трата пойдёт в лидерборд
              {parsed.fromQr ? ', сумма взята из него и точна' : ''}
            </p>
          ) : (
            <p className="muted">QR не найден: чек сохранится как неверифицированный</p>
          )}
        </section>

        {parsed.rotated && (
          <p className="warn-note">
            Чек был снят боком — я развернул его сам, но так распознаётся хуже.
            В следующий раз держи телефон так, чтобы строки шли сверху вниз.
          </p>
        )}

        {parsed.rawText && (
          <details className="advanced">
            <summary>Что я разглядел на чеке</summary>
            <pre className="ocr-raw">{parsed.rawText.trim() || 'Текст не распознан'}</pre>
            <p className="muted">
              Если тут каша — дело в снимке: нужен ровный свет, чек целиком в рамке и без складок.
            </p>
          </details>
        )}

        {error && <p className="error">{error}</p>}

        <button type="button" className="big-button" onClick={save} disabled={busy || items.length === 0}>
          {busy ? 'Сохраняю…' : `Сохранить ${Math.round(total).toLocaleString('ru-RU')}р`}
        </button>
      </div>
    </div>
  );
}
