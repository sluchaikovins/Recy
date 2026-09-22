/**
 * Оценивает, похож ли распознанный текст на нормально ориентированный чек.
 *
 * Считаем то, что на чеке обязано быть: русские слова, цены с копейками
 * и ключевые слова кассового чека. Перевёрнутый чек даёт почти нулевой счёт,
 * потому что Tesseract выдаёт на нём случайную латиницу.
 */
export function receiptScore(text: string): number {
  const russianWords = text.match(/[\p{Script=Cyrillic}]{3,}/gu)?.length ?? 0;
  const prices = text.match(/\d+[.,]\d{2}(?!\d)/g)?.length ?? 0;
  const anchors = (text.match(/итог|сумма|ндс|чек|касс|скидк|руб|оплат/gi) ?? []).length;

  return russianWords + prices * 2 + anchors * 5;
}
