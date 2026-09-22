export const CATEGORIES: Record<string, string[]> = {
  'Еда': [
    'хлеб', 'батон', 'молоко', 'яйц', 'мясо', 'куриц', 'фарш', 'рыба', 'сыр',
    'масло', 'овощ', 'фрукт', 'яблок', 'банан', 'картоф', 'помидор', 'огурец',
    'колбас', 'сосиск', 'йогурт', 'творог', 'крупа', 'рис', 'гречк', 'макарон',
    'сахар', 'соль', 'мук', 'печень', 'шоколад', 'конфет', 'томат', 'лепеш', 'батон',
    'салат', 'банан', 'груш', 'лук', 'морков', 'курин', 'котлет', 'пельмен',
  ],
  'Напитки': [
    'кола', 'сок', 'вода', 'кофе', 'чай', 'квас', 'лимонад', 'энергетик', 'энерг',
    'пиво', 'вино', 'нап.', 'напит', 'морс', 'компот',
  ],
  'Одежда': ['рубашк', 'футболк', 'штан', 'джинс', 'куртк', 'обувь', 'кроссовк', 'носк', 'платье', 'свитер'],
  'Электроника': ['наушник', 'кабель', 'зарядк', 'монитор', 'мышь', 'клавиатур', 'телефон', 'ноутбук', 'флешк', 'powerbank'],
  'Быт': ['порошок', 'мыло', 'шампун', 'паста', 'салфетк', 'бумаг', 'губк', 'пакет', 'моющ'],
  'Транспорт': ['бензин', 'проезд', 'метро', 'такси', 'дизель', 'аи-9', 'аи-1'],
};

export const DEFAULT_CATEGORY = 'Другое';

/** Товар → категория по словарю ключевых слов. Не совпал — «Другое». */
export function categorize(itemName: string): string {
  const name = itemName.toLowerCase().replace(/ё/g, 'е');
  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some((keyword) => name.includes(keyword.replace(/ё/g, 'е')))) {
      return category;
    }
  }
  return DEFAULT_CATEGORY;
}

/** Категория всего чека — та, на которую пришлась наибольшая сумма. */
export function dominantCategory(items: { price: number; category: string }[]): string {
  if (items.length === 0) return DEFAULT_CATEGORY;
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.category, (totals.get(item.category) ?? 0) + item.price);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
