import { useEffect, useState } from 'react';
import { api, type MonthStats, type Rating } from '../api/client';
import { statusLabel, toneMessage, type Settings } from '../settings';
import { CategoryDonut, DailyChart } from './Charts';
import { RatingWave } from './RatingWave';
import { CameraIcon } from './Icons';
import { IncomeCycle } from './IncomeCycle';
import { QuickAdd } from './QuickAdd';
import { FriendsLeaderboard } from './FriendsLeaderboard';

const money = (value: number, currency: string) => `${Math.round(value).toLocaleString('ru-RU')}${currency}`;

/**
 * Главный экран. Порядок блоков = порядок вопросов в голове:
 * «что сделать» (снять чек) → «как у меня дела» (рейтинг) → «куда ушло» → «кто ещё».
 */
export function Home({
  refreshKey,
  onChanged,
  onScan,
  settings,
}: {
  refreshKey: number;
  onChanged: () => void;
  onScan: () => void;
  settings: Settings;
}) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [daily, setDaily] = useState<{ date: string; total: number }[]>([]);
  /** Сколько трат всего — по нему решаем, пустой ли трекер. */
  const [totalExpenses, setTotalExpenses] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    const now = new Date();
    Promise.all([
      api.rating(),
      api.monthStats(now.getFullYear(), now.getMonth() + 1),
      api.dailyStats(30),
      api.expenses(),
    ])
      .then(([ratingData, statsData, dailyData, allExpenses]) => {
        setRating(ratingData);
        setStats(statsData);
        setDaily(dailyData);
        setTotalExpenses(allExpenses.length);
        setError(null);
      })
      .catch((loadError: Error) => setError(loadError.message));
  }, [refreshKey]);

  const scanBlock = (
    <section className="card scan-card">
      <button type="button" className="scan-button" onClick={onScan}>
        <span className="scan-icon">
          <CameraIcon size={30} />
        </span>
        <span className="scan-title">Сканировать чек</span>
        <span className="scan-hint">Наведи камеру — распознаю товары сам</span>
      </button>
      <div className="scan-alt">
        <button type="button" className="ghost-button" onClick={() => setManualOpen((open) => !open)}>
          {manualOpen ? 'Свернуть ручной ввод' : 'Ввести сумму вручную'}
        </button>
      </div>
      {manualOpen && (
        <QuickAdd
          onSaved={() => {
            setManualOpen(false);
            onChanged();
          }}
        />
      )}
    </section>
  );

  if (error) return <p className="error center">{error}</p>;
  if (!rating || !stats) return <p className="muted center">Загружаю…</p>;

  // Пусто — только когда трат нет вообще. Раньше сюда попадал и тот случай,
  // когда чек сохранился с датой прошлого месяца: запись есть, а главная
  // показывала «пока пусто».
  if (totalExpenses === 0) {
    return (
      <>
        {scanBlock}
        <section className="card empty-state">
          <h2>Здесь появится твой рейтинг</h2>
          <p className="muted">
            Сними первый чек — разложу покупки по категориям, посчитаю рейтинг и скажу, на сколько
            дней хватит денег до зарплаты.
          </p>
        </section>
      </>
    );
  }

  const currency = settings.currency;
  const weekTotal = daily.slice(-7).reduce((sum, point) => sum + point.total, 0);
  const todayTotal = daily.find((point) => point.date === new Date().toISOString().slice(0, 10))?.total ?? 0;
  const message = toneMessage(rating.message, settings.tone);

  return (
    <>
      {scanBlock}

      <section className="card rating-card">
        <h2>{settings.tone === 'fun' ? 'Шопоголик-рейтинг' : 'Рейтинг трат'}</h2>
        <div className="rating-value-wrap">
          <RatingWave />
          <div className="rating-value">
            {rating.level.toFixed(2)} <span>/ 10.00</span>
          </div>
        </div>
        <div className="rating-status">{statusLabel(rating.status, settings.tone)}</div>
        <div className="rating-bar">
          <span style={{ width: `${rating.level * 10}%` }} />
        </div>
        <dl className="rating-stats">
          <div>
            <dt>За месяц</dt>
            <dd>{money(rating.monthlySpent, currency)}</dd>
          </div>
          <div>
            <dt>Средний чек</dt>
            <dd>{money(rating.averageReceipt, currency)}</dd>
          </div>
          <div>
            <dt>Чеков</dt>
            <dd>{rating.receiptsCount}</dd>
          </div>
          <div>
            <dt>Без учёта цикла</dt>
            <dd>{rating.baseLevel.toFixed(2)}</dd>
          </div>
        </dl>
        {message && <p className="rating-message">{message}</p>}

        {rating.receiptsCount === 0 && (
          <p className="muted">
            В этом месяце трат ещё нет — рейтинг стоит посередине шкалы. Прошлые чеки никуда
            не делись, они на вкладке «Траты».
          </p>
        )}

        {rating.receiptsCount > 0 && rating.projectedMonth > 0 && (
          <p className="muted">
            При таком темпе за месяц выйдет ~{money(rating.projectedMonth, currency)}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Сводка</h2>
        <div className="summary">
          <div>
            <span className="summary-label">За день</span>
            <span className="summary-value">{money(todayTotal, currency)}</span>
          </div>
          <div>
            <span className="summary-label">За неделю</span>
            <span className="summary-value">{money(weekTotal, currency)}</span>
          </div>
          <div>
            <span className="summary-label">За месяц</span>
            <span className="summary-value">{money(stats.total, currency)}</span>
          </div>
          <div>
            <span className="summary-label">Прошлый месяц</span>
            <span className="summary-value">
              {money(stats.comparison.previousMonthTotal, currency)}
              {stats.comparison.deltaPercent !== null && (
                <em className={stats.comparison.deltaPercent > 0 ? 'up' : 'down'}>
                  {stats.comparison.deltaPercent > 0 ? '+' : ''}
                  {stats.comparison.deltaPercent}%
                </em>
              )}
            </span>
          </div>
        </div>
      </section>

      <IncomeCycle cycle={rating.cycle} onSaved={onChanged} />

      <section className="card">
        <h2>Расходы за 30 дней</h2>
        <DailyChart data={daily} />
      </section>

      <section className="card">
        <h2>Куда ушли деньги</h2>
        <CategoryDonut data={stats.byCategory.slice(0, 6)} />
      </section>

      {stats.topItems.length > 0 && (
        <section className="card">
          <h2>Топ покупок месяца</h2>
          <ol className="top-items">
            {stats.topItems.map((item) => (
              <li key={item.name}>
                {item.name} — {money(item.total, currency)}
              </li>
            ))}
          </ol>
        </section>
      )}

      <FriendsLeaderboard refreshKey={refreshKey} />

      {stats.advice.length > 0 && settings.tone === 'fun' && (
        <section className="card">
          <h2>Советы</h2>
          <ul className="advice">
            {stats.advice.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
