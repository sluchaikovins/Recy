import type { Rating } from '../api/client';
import { CloseIcon } from './Icons';

/**
 * Объяснение рейтинга на живых числах пользователя: видно не только формулу,
 * но и что именно в его случае даёт результат.
 */
export function RatingInfo({
  rating,
  averageMonthly,
  onClose,
}: {
  rating: Rating | null;
  averageMonthly: number;
  onClose: () => void;
}) {
  const ratio = rating && averageMonthly > 0 ? rating.projectedMonth / averageMonthly : 0;

  return (
    <div className="sheet">
      <div className="sheet-inner">
        <div className="sheet-head">
          <h2>Как считается рейтинг</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <CloseIcon size={22} />
          </button>
        </div>

        <section className="card policy">
          <p>
            Рейтинг — оценка твоих трат по шкале до 10.00. Середина шкалы, 5.00, означает
            «тратишь как обычный человек». Пока трат нет, рейтинг стоит ровно там: судить не о чем.
          </p>

          <h3>Считается темп, а не сумма</h3>
          <p>
            Траты за месяц делятся на прожитые дни и разгоняются до полного месяца. Иначе первого
            числа любой выглядел бы святым, а тридцатого — транжирой просто потому, что месяц
            кончается. На главной эта цифра подписана: «при таком темпе за месяц выйдет столько-то».
          </p>

          <h3>Каждое удвоение — плюс 2.5 балла</h3>
          <ul>
            <li>Половина нормы ({Math.round(averageMonthly / 2).toLocaleString('ru-RU')}р) — около 2.50</li>
            <li>Норма ({averageMonthly.toLocaleString('ru-RU')}р) — 5.00</li>
            <li>Вдвое больше — 7.50</li>
            <li>Вчетверо больше — потолок 10.00</li>
          </ul>
          <p>Сумму сравнения можно поменять в настройках — тогда шкала подстроится под тебя.</p>

          <h3>Частота и разнообразие</h3>
          <p>
            Много мелких покупок и траты на всё подряд поднимают рейтинг, но слабо — не больше чем
            на 10% суммарно. Решают деньги, а не количество чеков.
          </p>

          <h3>Зарплатный цикл</h3>
          <p>
            Если указан доход, результат подкручивается на 10% в обе стороны: сразу после зарплаты
            тратить не так опасно, как в последний день перед ней. Поэтому рейтинг меняется каждый
            день, даже если ты ничего не покупал.
          </p>
        </section>

        {rating && (
          <section className="card">
            <h2>Твой расчёт сейчас</h2>
            <dl className="rating-stats">
              <div>
                <dt>Потрачено за месяц</dt>
                <dd>{Math.round(rating.monthlySpent).toLocaleString('ru-RU')}р</dd>
              </div>
              <div>
                <dt>Темп: выйдет за месяц</dt>
                <dd>{Math.round(rating.projectedMonth).toLocaleString('ru-RU')}р</dd>
              </div>
              <div>
                <dt>Это от нормы</dt>
                <dd>{ratio > 0 ? `${ratio.toFixed(2)}×` : '—'}</dd>
              </div>
              <div>
                <dt>Чеков · категорий</dt>
                <dd>
                  {rating.receiptsCount} · {rating.categoriesSpread}
                </dd>
              </div>
              <div>
                <dt>Без учёта цикла</dt>
                <dd>{rating.baseLevel.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Итог</dt>
                <dd>{rating.level.toFixed(2)}</dd>
              </div>
            </dl>
            {rating.cycle && (
              <p className="muted">
                Цикл пройден на {Math.round(rating.cycle.cycleDepth * 100)}%, поэтому базовая оценка
                умножена на {(0.9 + rating.cycle.cycleDepth * 0.2).toFixed(2)}.
              </p>
            )}
          </section>
        )}

        <section className="card">
          <h2>Что изменилось</h2>
          <p className="muted">
            Раньше шкала начиналась с нуля и делила траты на норму напрямую: любой человек в начале
            месяца висел около 0.00, а одна крупная покупка выбрасывала его в потолок. Теперь
            середина шкалы — норма, а растёт она удвоениями, поэтому движение видно на любом уровне.
          </p>
        </section>
      </div>
    </div>
  );
}
