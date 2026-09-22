import type { Rating } from '../api/client';

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')}р`;

export function ShopaholicRating({ rating }: { rating: Rating }) {
  const filled = Math.round((rating.level / 10) * 20);

  return (
    <section className="card rating-card">
      <h2>ШОПОГОЛИК РЕЙТИНГ</h2>
      <div className="rating-value">
        {rating.level.toFixed(2)} <span>/ 10.00</span>
      </div>
      <div className="rating-status">{rating.status}</div>
      <div className="rating-bar" role="img" aria-label={`Рейтинг ${rating.level.toFixed(2)} из 10`}>
        <span style={{ width: `${(filled / 20) * 100}%` }} />
      </div>
      <dl className="rating-stats">
        <div>
          <dt>Месячные траты</dt>
          <dd>{money(rating.monthlySpent)}</dd>
        </div>
        <div>
          <dt>Средний чек</dt>
          <dd>{money(rating.averageReceipt)}</dd>
        </div>
        <div>
          <dt>Чеков за месяц</dt>
          <dd>{rating.receiptsCount}</dd>
        </div>
        <div>
          <dt>Базовый рейтинг</dt>
          <dd>{rating.baseLevel.toFixed(2)}</dd>
        </div>
      </dl>
      <p className="rating-message">{rating.message}</p>
    </section>
  );
}
