import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { haptic, isTelegram } from '../telegram';
import { ACCENTS, type Accent, type Settings as SettingsType, type ThemeMode, type Tone } from '../settings';

/**
 * Настройки устройства. Всё применяется сразу, без кнопки «Сохранить» —
 * человек видит результат и понимает, что произошло.
 */
export function Settings({
  settings,
  onChange,
  onOpenPrivacy,
  onOpenRecurring,
  onOpenRatingInfo,
  onLogout,
  username,
  inTelegram,
}: {
  settings: SettingsType;
  onChange: (patch: Partial<SettingsType>) => void;
  onOpenPrivacy: () => void;
  onOpenRecurring: () => void;
  onOpenRatingInfo: () => void;
  onLogout: () => void;
  username: string;
  inTelegram: boolean;
}) {
  // Уведомления хранит сервер: их читает бот, а не браузер.
  const [notifications, setNotifications] = useState<{ enabled: boolean; hour: number } | null>(null);

  useEffect(() => {
    api
      .notifications()
      .then(setNotifications)
      .catch(() => setNotifications({ enabled: false, hour: 20 }));
  }, []);

  const toggleNotifications = async () => {
    if (!notifications) return;
    const next = { ...notifications, enabled: !notifications.enabled };
    setNotifications(next);
    haptic('tap');
    try {
      await api.saveNotifications(next.enabled, next.hour);
    } catch {
      setNotifications(notifications);
    }
  };

  const changeHour = async (hour: number) => {
    if (!notifications) return;
    const next = { ...notifications, hour };
    setNotifications(next);
    await api.saveNotifications(next.enabled, hour).catch(() => setNotifications(notifications));
  };

  const exportData = async () => {
    const expenses = await api.expenses();
    const rows = [
      ['Дата', 'Категория', 'Сумма', 'Описание', 'Товары'].join(';'),
      ...expenses.map((expense) =>
        [
          expense.date,
          expense.category,
          expense.amount,
          (expense.description ?? '').replace(/;/g, ','),
          expense.items.map((item) => `${item.name} (${item.price})`).join(' + '),
        ].join(';'),
      ),
    ].join('\n');

    const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `траты-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="card">
        <h2>Вид</h2>
        <div className="settings-group">
          <div className="setting-row">
            <div>
              <div className="setting-title">Тема</div>
              <div className="setting-hint">Системная подстроится под телефон</div>
            </div>
            <Segmented<ThemeMode>
              value={settings.theme}
              options={[
                ['system', 'Авто'],
                ['light', 'Свет'],
                ['dark', 'Тьма'],
              ]}
              onChange={(theme) => onChange({ theme })}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-title">Цвет приложения</div>
              <div className="setting-hint">
                {ACCENTS.find((item) => item.id === settings.accent)?.label} · светлая и тёмная версия сразу
              </div>
            </div>
          </div>

          <div className="palette" role="group" aria-label="Цвет приложения">
            {ACCENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`swatch${settings.accent === item.id ? ' active' : ''}`}
                aria-label={item.label}
                aria-pressed={settings.accent === item.id}
                style={{ '--sw-light': item.light, '--sw-dark': item.dark } as React.CSSProperties}
                onClick={() => {
                  onChange({ accent: item.id as Accent });
                  haptic('tap');
                }}
              >
                <span />
              </button>
            ))}
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-title">Тон подписей</div>
              <div className="setting-hint">
                {settings.tone === 'fun' ? '«Святой. Как ты вообще живёшь»' : '«Траты в норме»'}
              </div>
            </div>
            <Segmented<Tone>
              value={settings.tone}
              options={[
                ['fun', 'С юмором'],
                ['plain', 'По делу'],
              ]}
              onChange={(tone) => onChange({ tone })}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-title">Вибрация</div>
              <div className="setting-hint">Отклик на нажатия внутри Telegram</div>
            </div>
            <Switch
              on={settings.haptics}
              onToggle={() => {
                onChange({ haptics: !settings.haptics });
                if (!settings.haptics) haptic('tap');
              }}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Уведомления</h2>
        <div className="settings-group">
          <div className="setting-row">
            <div>
              <div className="setting-title">Вечерняя сводка</div>
              <div className="setting-hint">
                {isTelegram() || notifications?.enabled
                  ? 'Бот напишет, сколько потрачено за день и сколько осталось до зарплаты'
                  : 'Приходит в Telegram — открой трекер через бота, чтобы включить'}
              </div>
            </div>
            <Switch on={Boolean(notifications?.enabled)} onToggle={toggleNotifications} />
          </div>

          {notifications?.enabled && (
            <div className="setting-row">
              <div>
                <div className="setting-title">Во сколько</div>
                <div className="setting-hint">По времени сервера</div>
              </div>
              <select
                id="notify-hour"
                style={{ width: 'auto' }}
                value={String(notifications.hour)}
                onChange={(event) => void changeHour(Number(event.target.value))}
              >
                {[9, 12, 15, 18, 20, 21, 22].map((hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Обязательные платежи</h2>
        <div className="setting-row">
          <div>
            <div className="setting-title">Регулярные траты</div>
            <div className="setting-hint">Связь, подписки, аренда — записываются сами раз в месяц</div>
          </div>
          <button type="button" className="ghost-button" onClick={onOpenRecurring}>
            Открыть
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Рейтинг</h2>
        <label>
          <span className="field-label">С какой суммой сравнивать траты за месяц</span>
          <input
            id="setting-average"
            inputMode="numeric"
            value={String(settings.averageMonthly)}
            onChange={(event) => onChange({ averageMonthly: Number(event.target.value.replace(/\D/g, '')) || 0 })}
          />
        </label>
        <p className="muted">
          По умолчанию 25 000р — примерная средняя трата. Поставь свою сумму, и рейтинг станет честнее
          лично для тебя.
        </p>

        <div className="setting-row">
          <div>
            <div className="setting-title">Как считается рейтинг</div>
            <div className="setting-hint">Формула и твой разбор по числам</div>
          </div>
          <button type="button" className="ghost-button" onClick={onOpenRatingInfo}>
            Открыть
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Данные</h2>
        <div className="settings-group">
          <div className="setting-row">
            <div>
              <div className="setting-title">Выгрузить траты</div>
              <div className="setting-hint">CSV, открывается в Excel и Google Таблицах</div>
            </div>
            <button type="button" className="ghost-button" onClick={exportData}>
              Скачать
            </button>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-title">Политика конфиденциальности</div>
              <div className="setting-hint">Что хранится и где</div>
            </div>
            <button type="button" className="ghost-button" onClick={onOpenPrivacy}>
              Открыть
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Аккаунт</h2>
        <div className="setting-row">
          <div>
            <div className="setting-title">{username}</div>
            <div className="setting-hint">{inTelegram ? 'Вход через Telegram' : 'Вход по почте'}</div>
          </div>
          {!inTelegram && (
            <button type="button" className="ghost-button" onClick={onLogout}>
              Выйти
            </button>
          )}
        </div>
      </section>

      <p className="muted center">Recy · версия 0.3</p>
    </>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={value === id ? 'active' : ''}
          aria-pressed={value === id}
          onClick={() => {
            onChange(id);
            haptic('tap');
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`switch${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label="Переключатель"
      onClick={onToggle}
    >
      <span />
    </button>
  );
}
