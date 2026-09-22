export interface RatingBreakdown {
  rating: number;
  status: string;
  message: string;
  monthlySpent: number;
  receiptsCount: number;
  averageReceipt: number;
  averageDay: number;
}

/** Нейтральная середина шкалы: столько получает тот, кто тратит как все. */
export const NEUTRAL_RATING = 5;
/**
 * Пол шкалы для тех, у кого траты есть, но крошечные. Ноль выглядит как
 * поломка приложения, а не как оценка, поэтому самый экономный получает 1.00.
 */
const MIN_RATING = 1;

/**
 * Базовый рейтинг шопоголизма с точностью до сотых.
 *
 * Шкала устроена вокруг середины: 5.00 — это «тратишь как обычный человек».
 * Вдвое больше нормы даёт 7.50, вчетверо — потолок 10.00; вдвое меньше — 2.50.
 * Так шкала растёт плавно и не упирается в потолок с первой крупной покупки,
 * как это было при прямом делении на норму.
 *
 * Считаем не накопленную сумму, а темп: траты за месяц делим на прожитые дни
 * и разгоняем до полного месяца. Иначе первого числа любой человек выглядит
 * святым, а тридцатого — транжирой, просто потому что месяц кончается.
 */
export function calculateRating(
  monthlySpent: number,
  receiptsCount: number,
  categoriesSpread: number,
  averageMonthlySpent = 25000,
  daysPassed = 30,
  daysInMonth = 30,
): number {
  // Пока трат нет, судить не о чем — человек стоит ровно посередине шкалы.
  if (monthlySpent <= 0 || receiptsCount === 0) return NEUTRAL_RATING;

  const dailyPace = monthlySpent / Math.max(daysPassed, 1);
  const projected = dailyPace * daysInMonth;
  const ratio = projected / Math.max(averageMonthlySpent, 1);

  // Каждое удвоение трат добавляет 2.5 балла: 1× → 5.00, 2× → 7.50, 4× → 10.00.
  const base = NEUTRAL_RATING + (NEUTRAL_RATING * Math.log2(ratio)) / 2;

  // Частота и разнообразие лишь подкручивают результат, решают деньги.
  const receiptsPerDay = receiptsCount / Math.max(daysPassed, 1);
  const frequencyMultiplier = 1 + Math.min(receiptsPerDay / 2, 1) * 0.05;
  const spreadMultiplier = 1 + Math.min(Math.max(categoriesSpread - 3, 0) / 5, 1) * 0.05;

  const rating = base * frequencyMultiplier * spreadMultiplier;
  return Number(Math.min(Math.max(rating, MIN_RATING), 10).toFixed(2));
}

/**
 * «Живой» рейтинг: чем ближе конец зарплатного цикла, тем опаснее траты.
 * Множитель глубины цикла — от 0.8 (только получил) до 1.2 (последний день).
 */
export function calculateDynamicRating(
  baseRating: number,
  daysSinceIncome: number,
  daysUntilNextIncome: number,
): number {
  const cycleLength = daysSinceIncome + daysUntilNextIncome;
  const cycleDepth = cycleLength > 0 ? daysSinceIncome / cycleLength : 0;
  // Мягче, чем раньше: цикл уточняет картину, но не переворачивает её.
  const urgencyMultiplier = 0.9 + cycleDepth * 0.2;
  return Number(Math.min(Math.max(baseRating * urgencyMultiplier, 0), 10).toFixed(2));
}

const LEVELS: { min: number; status: string; message: string }[] = [
  { min: 9.5, status: 'ЛЕГЕНДАРНЫЙ', message: 'ЛЕГЕНДАРНЫЙ ШОПОГОЛИК. Твои траты = зарплата среднего инженера' },
  { min: 8, status: 'КРИТИЧЕСКИЙ', message: 'КРИТИЧЕСКИЙ. Банк плачет, ты смеёшься' },
  { min: 7, status: 'СЕРЬЁЗНЫЙ', message: 'СЕРЬЁЗНЫЙ. Ещё немного и рекорд' },
  { min: 6, status: 'УМЕРЕННЫЙ', message: 'УМЕРЕННЫЙ. Можно оптимизировать' },
  { min: 5, status: 'НОРМАЛЬНЫЙ', message: 'НОРМАЛЬНЫЙ. Но не расслабляйся' },
  { min: 4, status: 'ХОРОШИЙ', message: 'ХОРОШИЙ. Ты молод но разумен' },
  { min: 3, status: 'ОТЛИЧНЫЙ', message: 'ОТЛИЧНЫЙ. Монах с интернетом' },
  { min: 0, status: 'СВЯТОЙ', message: 'СВЯТОЙ. Как ты вообще живёшь' },
];

export function ratingStatus(rating: number): { status: string; message: string } {
  const level = LEVELS.find((item) => rating >= item.min) ?? LEVELS[LEVELS.length - 1];
  return { status: level.status, message: `${level.message} (${rating.toFixed(2)}/10.00)` };
}

export type CyclePhase = 'startOfCycle' | 'midCycle' | 'nearEnd' | 'almostOver' | 'overSpent';

export const CYCLE_MESSAGES: Record<CyclePhase, { title: string; text: string }> = {
  startOfCycle: { title: 'ДЕНЕЖНЫЙ ПРАЗДНИК', text: 'Только что получил зарплату. Трать с умом.' },
  midCycle: { title: 'ВСЁ НОРМАЛЬНО', text: 'Ты в норме. Следи за остатком.' },
  nearEnd: { title: 'ТРЕВОЖНЫЙ ЗВОНОЧЕК', text: 'Цикл заканчивается. Твой рейтинг растёт опасно.' },
  almostOver: { title: 'КРИЗИС', text: 'Остался последний день цикла. Ты боец.' },
  overSpent: { title: 'О НЕТ', text: 'Ты потратил больше чем получил. Это кредит теперь. F' },
};

export function cyclePhase(cycleDepth: number, spent: number, income: number): CyclePhase {
  if (income > 0 && spent > income) return 'overSpent';
  if (cycleDepth >= 0.9) return 'almostOver';
  if (cycleDepth >= 0.7) return 'nearEnd';
  if (cycleDepth <= 0.15) return 'startOfCycle';
  return 'midCycle';
}
