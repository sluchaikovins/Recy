import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { dailySeries, materializeRecurring, monthSummary } from '../db/queries.js';
import { config } from '../config.js';

export const statsRouter = Router();

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

const previousMonth = (year: number, month: number) =>
  month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);

statsRouter.get('/month', requireAuth, (req: AuthedRequest, res) => {
  const now = new Date();
  const year = Number(req.query.year ?? now.getFullYear());
  const month = Number(req.query.month ?? now.getMonth() + 1);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ error: 'Некорректный year/month' });
    return;
  }

  materializeRecurring(req.userId!);
  const current = monthSummary(req.userId!, monthKey(year, month));
  const previous = monthSummary(req.userId!, previousMonth(year, month));
  const daysInMonth = new Date(year, month, 0).getDate();
  // Для текущего месяца считаем по прожитым дням, для прошедших — по всему месяцу.
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const daysPassed = isCurrentMonth ? now.getDate() : daysInMonth;

  res.json({
    month: monthKey(year, month),
    total: current.total,
    receipts: current.receipts,
    byCategory: current.byCategory,
    byDay: current.byDay,
    topItems: current.topItems,
    averageReceipt: current.receipts > 0 ? Number((current.total / current.receipts).toFixed(2)) : 0,
    averageDay: Number((current.total / daysInMonth).toFixed(2)),
    comparison: {
      previousMonthTotal: previous.total,
      deltaPercent:
        previous.total > 0 ? Number((((current.total - previous.total) / previous.total) * 100).toFixed(1)) : null,
    },
    advice: buildAdvice(current, daysPassed),
  });
});

statsRouter.get('/daily', requireAuth, (req: AuthedRequest, res) => {
  const days = Math.min(Math.max(Number(req.query.days ?? 30), 1), 365);
  res.json(dailySeries(req.userId!, days));
});

/**
 * Советы по данным месяца.
 *
 * Правило одно: совет уместен, только если есть на что смотреть.
 * «Тратишь 25р в день на еду, может готовить дома» — издевательство,
 * а не совет, поэтому каждый порог проверяется явно.
 */
function buildAdvice(summary: ReturnType<typeof monthSummary>, daysPassed: number): string[] {
  // Суммы в тексте читаются тяжело без разделителей: 37013 против 37 013.
  const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')}р`;
  const advice: string[] = [];
  if (summary.total <= 0 || summary.receipts === 0) return advice;

  const perDay = summary.total / Math.max(daysPassed, 1);
  const projected = perDay * 30;

  // Еда: советуем готовить дома, только когда на неё правда уходит заметная доля.
  const food = summary.byCategory.find((row) => row.category === 'Еда');
  if (food && food.total >= 6000 && food.total / summary.total >= 0.35) {
    const foodPerDay = Math.round(food.total / Math.max(daysPassed, 1));
    advice.push(
      `Еда съедает ${Math.round((food.total / summary.total) * 100)}% бюджета — ${money(foodPerDay)} в день. ` +
        'Готовка дома заметно дешевле доставки.',
    );
  }

  // Крупная покупка: только если она реально выделяется на фоне месяца.
  const top = summary.topItems[0];
  if (top && top.total >= 3000 && top.total / summary.total >= 0.25) {
    advice.push(
      `«${top.name}» за ${money(top.total)} — это ${Math.round((top.total / summary.total) * 100)}% ` +
        'всех трат месяца. Одна покупка задала тон.',
    );
  }

  // Темп: полезно в начале месяца, когда сумма ещё мала, а привычка видна.
  if (daysPassed >= 3 && daysPassed <= 25 && projected > 0) {
    advice.push(`Тратишь ${money(perDay)} в день. При таком темпе за месяц выйдет ${money(projected)}.`);
  }

  // Много мелких чеков — это про импульсивные покупки, а не про сумму.
  const averageReceipt = summary.total / summary.receipts;
  if (summary.receipts >= 15 && averageReceipt < 500) {
    advice.push(
      `${summary.receipts} чеков по ${money(averageReceipt)} в среднем. ` +
        'Мелкие покупки незаметны поодиночке, но в сумме это весь бюджет.',
    );
  }

  return advice;
}
