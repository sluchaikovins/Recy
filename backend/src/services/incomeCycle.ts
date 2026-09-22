export interface IncomeRow {
  type: string;
  amount: number;
  frequency: string;
  next_income_date: string | null;
  last_income_date: string | null;
  schedule_data: string | null;
}

export interface CycleInfo {
  amount: number;
  lastIncomeDate: string;
  nextIncomeDate: string;
  daysSinceIncome: number;
  daysUntilNextIncome: number;
  cycleDepth: number;
}

const DAY = 24 * 60 * 60 * 1000;

const FREQUENCY_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  twice_monthly: 15,
  monthly: 30,
};

const toDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
const diffDays = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY);

/**
 * Восстанавливает текущий зарплатный цикл: когда получил в прошлый раз,
 * когда получит в следующий и насколько глубоко пользователь в цикле.
 */
export function buildCycle(income: IncomeRow | null, now = new Date()): CycleInfo | null {
  if (!income) return null;

  const cycleLength = FREQUENCY_DAYS[income.frequency] ?? 30;
  const today = toDate(toIso(now));

  let last = income.last_income_date ? toDate(income.last_income_date) : null;
  let next = income.next_income_date ? toDate(income.next_income_date) : null;

  if (!last && next) last = new Date(next.getTime() - cycleLength * DAY);
  if (!next && last) next = new Date(last.getTime() + cycleLength * DAY);
  if (!last || !next) {
    last = new Date(today.getTime() - (cycleLength / 2) * DAY);
    next = new Date(last.getTime() + cycleLength * DAY);
  }

  // Цикл мог уже прокрутиться несколько раз — доматываем до актуального.
  while (next.getTime() <= today.getTime()) {
    last = new Date(next);
    next = new Date(next.getTime() + cycleLength * DAY);
  }

  const daysSinceIncome = Math.max(diffDays(last, today), 0);
  const daysUntilNextIncome = Math.max(diffDays(today, next), 0);
  const span = daysSinceIncome + daysUntilNextIncome;

  return {
    amount: income.amount,
    lastIncomeDate: toIso(last),
    nextIncomeDate: toIso(next),
    daysSinceIncome,
    daysUntilNextIncome,
    cycleDepth: span > 0 ? Number((daysSinceIncome / span).toFixed(4)) : 0,
  };
}
