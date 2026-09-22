import { useState } from 'react';

/** Цвета категорий заданы в CSS и проверены на различимость при дальтонизме. */
export const CATEGORY_COLORS = [
  'var(--cat-1)',
  'var(--cat-2)',
  'var(--cat-3)',
  'var(--cat-4)',
  'var(--cat-5)',
  'var(--cat-6)',
];

export const colorFor = (index: number, category?: string) =>
  category === 'Другое' ? 'var(--cat-other)' : CATEGORY_COLORS[index % CATEGORY_COLORS.length];

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')}р`;
const dayLabel = (iso: string) => iso.slice(8, 10);

/**
 * Расходы по дням. Столбик = день, когда были траты; подписан только максимум —
 * числа на каждом столбике превращают график в таблицу.
 */
export function DailyChart({ data }: { data: { date: string; total: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);

  // Пустые дни выкидываем: десяток дыр между столбиками читается хуже,
  // чем плотный ряд реальных трат.
  const days = data.filter((point) => point.total > 0);

  if (days.length === 0) return <p className="muted">Пока нет трат за этот период</p>;

  const max = Math.max(...days.map((point) => point.total));
  const height = 120;
  const padBottom = 20;
  const barWidth = 14;
  const gap = 8;
  const contentWidth = days.length * barWidth + (days.length - 1) * gap;
  // Пока столбиков мало, группа стоит по центру, а не жмётся к левому краю.
  const width = Math.max(contentWidth, 200);
  const offset = (width - contentWidth) / 2;
  const peak = days.reduce((best, point, index) => (point.total > days[best].total ? index : best), 0);
  const labelStep = Math.ceil(days.length / 8);

  const scale = (value: number) => (value / max) * (height - padBottom - 16);

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Расходы по дням, максимум ${money(max)}`}
        onPointerLeave={() => setHover(null)}
      >
        <line x1="0" y1={height - padBottom} x2={width} y2={height - padBottom} stroke="var(--line)" strokeWidth="1" />

        {days.map((point, index) => {
          const barHeight = scale(point.total);
          const x = offset + index * (barWidth + gap);
          const active = hover === index;
          return (
            <g key={point.date}>
              <rect
                x={x - gap / 2}
                y={0}
                width={barWidth + gap}
                height={height - padBottom}
                fill="transparent"
                onPointerEnter={() => setHover(index)}
              />
              <rect
                x={x}
                y={height - padBottom - barHeight}
                width={barWidth}
                height={Math.max(barHeight, 3)}
                rx="4"
                fill={active || index === peak ? 'var(--accent)' : 'var(--cat-3)'}
                opacity={hover === null || active ? 1 : 0.45}
                pointerEvents="none"
              />
              {index % labelStep === 0 && (
                <text x={x + barWidth / 2} y={height - 6} textAnchor="middle" fontSize="8">
                  {dayLabel(point.date)}
                </text>
              )}
            </g>
          );
        })}

        {hover === null && (
          <text
            x={Math.min(Math.max(offset + peak * (barWidth + gap) + barWidth / 2, 24), width - 24)}
            y={height - padBottom - scale(days[peak].total) - 6}
            textAnchor="middle"
            fontSize="9"
            fill="var(--ink)"
          >
            {money(days[peak].total)}
          </text>
        )}
      </svg>

      {hover !== null && (
        <span
          className="chart-tip"
          style={{ left: `${((offset + hover * (barWidth + gap) + barWidth / 2) / width) * 100}%`, top: '-2px' }}
        >
          {days[hover].date.slice(8, 10)}.{days[hover].date.slice(5, 7)} · {money(days[hover].total)}
        </span>
      )}
    </div>
  );
}

/**
 * Кольцо по категориям: доля видна формой, а точные суммы — в легенде рядом,
 * поэтому цвет никогда не остаётся единственным носителем смысла.
 */
export function CategoryDonut({ data }: { data: { category: string; total: number }[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const sum = data.reduce((accumulator, row) => accumulator + row.total, 0);

  if (sum === 0) return <p className="muted">Пока нечего раскладывать по категориям</p>;

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="donut-row">
      <div className="donut">
        <svg viewBox="0 0 120 120" role="img" aria-label="Траты по категориям">
          {data.map((row, index) => {
            const fraction = row.total / sum;
            const length = Math.max(fraction * circumference - 2, 1); // 2px зазор между секторами
            const dash = `${length} ${circumference - length}`;
            const rotation = (offset / sum) * 360 - 90;
            offset += row.total;
            return (
              <circle
                key={row.category}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={colorFor(index, row.category)}
                strokeWidth={hover === row.category ? 16 : 13}
                strokeDasharray={dash}
                transform={`rotate(${rotation} 60 60)`}
                opacity={hover === null || hover === row.category ? 1 : 0.4}
                onPointerEnter={() => setHover(row.category)}
                onPointerLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        <div className="donut-center">
          <span className="donut-total">{money(hover ? (data.find((row) => row.category === hover)?.total ?? 0) : sum)}</span>
          <span className="donut-label">{hover ?? 'за месяц'}</span>
        </div>
      </div>

      <ul className="legend">
        {data.map((row, index) => (
          <li key={row.category} onPointerEnter={() => setHover(row.category)} onPointerLeave={() => setHover(null)}>
            <span className="dot" style={{ background: colorFor(index, row.category) }} />
            {row.category}
            <span className="num">{Math.round((row.total / sum) * 100)}% · {money(row.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
