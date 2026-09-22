import jsQR from 'jsqr';
import type { PreparedImage } from './imagePrep.js';

export interface FiscalQr {
  raw: string;
  /** Точная сумма чека из фискального кода — ей можно верить больше, чем OCR. */
  total: number | null;
  /** Дата в формате YYYY-MM-DD. */
  date: string | null;
}

/**
 * Фискальный QR российского чека выглядит так:
 * t=20260911T1842&s=1330.00&fn=...&i=...&fp=...&n=1
 * В нём уже лежат точная сумма и время — это спасает, когда текст не читается.
 */
export function parseFiscalQr(value: string): FiscalQr | null {
  if (!/(^|&)s=[\d.]+/.test(value) || !/(^|&)t=\d{8}/.test(value)) return null;

  const params = new URLSearchParams(value.replace(/^.*?(t=\d{8})/, '$1'));
  const sum = Number(params.get('s'));
  const time = params.get('t') ?? '';
  const date = /^\d{8}/.test(time) ? `${time.slice(0, 4)}-${time.slice(4, 6)}-${time.slice(6, 8)}` : null;

  return {
    raw: value,
    total: Number.isFinite(sum) && sum > 0 ? sum : null,
    date,
  };
}

/** Ищет QR на фото. Пробует обычный и инвертированный вариант — чеки бывают бледные. */
export function findQr(image: PreparedImage): FiscalQr | null {
  for (const inversion of ['dontInvert', 'attemptBoth'] as const) {
    const found = jsQR(image.raw.data, image.raw.width, image.raw.height, { inversionAttempts: inversion });
    if (found?.data) {
      const parsed = parseFiscalQr(found.data);
      if (parsed) return parsed;
    }
  }
  return null;
}
