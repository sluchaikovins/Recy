import { config } from '../config.js';

export interface DayUsage {
  receiptsToday: number;
  amountToday: number;
  /** Средняя сумма чека за предыдущие дни — база для детекта аномалий. */
  historicalAverage: number;
  historicalCount: number;
}

export interface AntiCheatVerdict {
  allowed: boolean;
  flagged: boolean;
  reason: string | null;
}

/**
 * Лимиты + простая эвристика аномалий вместо ML: чек, который в 10 раз
 * больше привычного для юзера, помечается флагом (в рейтинг он не идёт).
 */
export function checkExpense(amount: number, usage: DayUsage): AntiCheatVerdict {
  if (usage.receiptsToday >= config.maxReceiptsPerDay) {
    return { allowed: false, flagged: true, reason: `Лимит ${config.maxReceiptsPerDay} чеков в день исчерпан` };
  }
  if (usage.amountToday + amount > config.maxAmountPerDay) {
    return { allowed: false, flagged: true, reason: `Лимит ${config.maxAmountPerDay}р трат в день превышен` };
  }
  if (usage.historicalCount >= 5 && usage.historicalAverage > 0 && amount > usage.historicalAverage * 10) {
    return { allowed: true, flagged: true, reason: 'Аномалия: сумма чека в 10+ раз выше обычной' };
  }
  return { allowed: true, flagged: false, reason: null };
}

/** ФНС-QR в чеке считаем подтверждением подлинности. */
export function isVerified(qrCode: string | null | undefined): boolean {
  return Boolean(qrCode && qrCode.length > 0);
}

export interface LeaderboardEligibility {
  verifiedCount: number;
  totalCount: number;
  flaggedCount: number;
}

/** Допуск в лидерборд: 10+ верифицированных, 80% верификации, максимум 10% флагов. */
export function canBeOnLeaderboard({ verifiedCount, totalCount, flaggedCount }: LeaderboardEligibility): boolean {
  if (totalCount === 0) return false;
  return verifiedCount >= 10 && verifiedCount / totalCount >= 0.8 && flaggedCount / totalCount <= 0.1;
}
