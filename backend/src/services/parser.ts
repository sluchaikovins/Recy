import { categorize, dominantCategory } from './categorizer.js';

export interface ParsedItem {
  name: string;
  price: number;
  category: string;
}

export interface ParsedReceipt {
  items: ParsedItem[];
  total: number;
  date: string;
  category: string;
  qrCode: string | null;
  /** Сумма позиций разошлась с итогом — значит, OCR что-то потерял или переврал. */
  itemsMismatch: boolean;
}

/**
 * Строки, которые точно не товары: реквизиты, служебные поля, вежливости.
 * Границы слов заданы явно — \b в JavaScript не понимает кириллицу.
 */
const JUNK_WORDS = [
  'инн', 'кпп', 'огрн', 'ооо', 'ип', 'фн', 'фд', 'фп', 'ндс', 'тел', 'касса', 'кассир',
  'смена', 'смену', 'чек', 'адрес', 'спасибо', 'сдача', 'терминал', 'карта', 'оплата',
  'приход', 'номер', 'дисконт', 'бонус', 'скидка', 'товарный', 'покупка', 'итог',
  // адресная строка магазина: числа в ней есть, товаров нет
  'ул', 'улица', 'проспект', 'просп', 'шоссе', 'переулок', 'пер', 'дом',
];
const JUNK = new RegExp(
  `(?<![\\p{L}])(${JUNK_WORDS.join('|')})(?![\\p{L}])|www|http|ждём|ждем|без сдачи`,
  'iu',
);

/**
 * Дата, время, номер телефона: числа тут есть, а цены нет.
 * Важно не поймать сюда «45.50» — это цена, а не время, поэтому
 * время требует двоеточия, а дата — трёх частей.
 */
const TIME_LIKE = /^[^\p{L}]*(\d{1,2}:\d{2}(:\d{2})?|\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\+?\d[\d\s()-]{8,})[^\p{L}]*$/u;

/** Строка с итогом. \b не работает с кириллицей, поэтому граница проверяется явно. */
const TOTAL_RE = /^(итого|итог|всего|к оплате|сумма|наличными|безналичными|картой|total)(?![\p{L}])/iu;
/** Промежуточная сумма до скидок — не итог чека, но ориентир. */
const SUBTOTAL_RE = /^(подытог|подытог:|пред\S*итог)/iu;

const DATE_RE = /(\d{2})[.\-/](\d{2})[.\-/](\d{4})|(\d{4})-(\d{2})-(\d{2})/;
const QR_RE = /\bt=\d{8}T\d{4,6}&s=[\d.]+&fn=\d+&i=\d+&fp=\d+&n=\d/;

/**
 * Tesseract на чеках путает похожие символы. В числовом контексте
 * эти замены безопасны и заметно поднимают долю прочитанных цен.
 */
function fixDigits(value: string): string {
  return value
    .replace(/[OoОо]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/[Зз]/g, '3')
    .replace(/[Бб]/g, '6')
    .replace(/[Ss]/g, '5');
}

/** Длинная цепочка цифр — это ИНН, ФН, номер ККТ или чека, но не цена. */
const LONG_NUMBER = /\d{8,}/;

/**
 * Достаёт цену из строки — берём последнее число, потому что в строке
 * товара перед ценой стоят количество и цена за единицу.
 *
 * Цена обязана быть с копейками. Голые целые числа отбрасываем: на кассовом
 * чеке всё печатается как 69.99, а целыми выглядят коды товаров, номера
 * и адреса — именно из них парсер раньше собирал фантастические суммы.
 */
function extractPrice(line: string): number | null {
  if (LONG_NUMBER.test(line.replace(/[\s ]/g, ''))) return null;

  // Объём и вес в названии — не цена: «НАП.ЯБЛ.ОСВ.0,95Л», «ТОМАТЫ 165Г».
  const cleaned = line.replace(/\d+[.,]?\d*\s*(мл|кг|гр|л|г|шт)(?![\p{L}])/giu, ' ');

  // Три цифры после разделителя — обычная ошибка OCR («350.060»), берём первые две.
  const matches = [...cleaned.matchAll(/(\d[\d  ]*)[.,](\d{2,3})(?!\d)/g)];
  if (matches.length === 0) return null;

  const last = matches[matches.length - 1];
  const value = Number(`${fixDigits(last[1]).replace(/[\s ]/g, '')}.${last[2].slice(0, 2)}`);

  return Number.isFinite(value) && value > 0 && value < 1_000_000 ? value : null;
}

/** Строка из одних цифр и разделителей — продолжение товара, а не новый товар. */
function isNumericLine(line: string): boolean {
  const letters = (line.match(/\p{L}/gu) ?? []).length;
  const digits = (line.match(/\d/g) ?? []).length;
  return digits >= 2 && digits > letters;
}

function cleanName(raw: string): string {
  return raw
    // хвост с ценами и количеством
    .replace(/(\d[\d  ]*[.,\-]\d{2}.*)$/, '')
    .replace(/\d+[.,]?\d*\s*(шт|кг|гр|мл|л)(?![\p{L}])/giu, '')
    .replace(/[*xхX×]\s*\d+[.,]?\d*/g, '')
    // артикулы и коды в начале строки
    .replace(/^[\d\s.*#№-]{2,}/, '')
    .replace(/[^\p{L}\p{N}\s.%-]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    // висящие остатки разметки вроде «х» или «*» в конце названия
    .replace(/[\s.х*×-]+$/iu, '')
    .trim();
}

function parseDate(text: string): string {
  const match = text.match(DATE_RE);
  if (match) {
    const iso = match[4] ? `${match[4]}-${match[5]}-${match[6]}` : `${match[3]}-${match[2]}-${match[1]}`;
    const time = Date.parse(iso);
    // Чек из будущего или из прошлого века — почти наверняка ошибка распознавания.
    if (!Number.isNaN(time) && time < Date.now() + 86400000 && time > Date.parse('2000-01-01')) return iso;
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Разбирает сырой текст чека на позиции, итог и дату.
 *
 * Логика простая и потому устойчивая: строка считается товаром, если в ней
 * есть цена и осталось осмысленное название после чистки. Итог берётся из
 * строки «ИТОГО», а если её не видно — из суммы позиций.
 */
export function parseReceipt(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items: ParsedItem[] = [];
  const totals: number[] = [];
  const subtotals: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    // Подытог проверяем первым: «ПОДЫТОГ» содержит в себе «ИТОГ».
    if (SUBTOTAL_RE.test(line)) {
      const price = extractPrice(line) ?? extractPrice(lines[index + 1] ?? '');
      if (price !== null) subtotals.push(price);
      continue;
    }

    if (TOTAL_RE.test(line)) {
      const price = extractPrice(line) ?? extractPrice(lines[index + 1] ?? '');
      if (price !== null) totals.push(price);
      continue;
    }

    if (JUNK.test(line) || TIME_LIKE.test(line)) continue;

    const name = cleanName(line);
    if (name.length < 3 || !/\p{L}{3}/u.test(name)) continue;

    // Цена бывает перенесена на следующую строку — тогда смотрим туда.
    let price = extractPrice(line);
    if (price === null) {
      const next = lines[index + 1];
      // На чеках сетевых магазинов название идёт строкой выше, а цены — ниже:
      //   ПЕЛЕШ.ТОМАТЫ С БАЗИЛ.165Г
      //   НДС 10%   85.99   1ШТ   85.99
      if (next && isNumericLine(next) && !TIME_LIKE.test(next)) {
        price = extractPrice(next);
        if (price !== null) index += 1;
      }
    }
    if (price === null) continue;

    items.push({ name, price, category: categorize(name) });
  }

  const itemsSum = Number(items.reduce((sum, item) => sum + item.price, 0).toFixed(2));

  // Итогу из чека верим больше, чем сумме позиций: OCR легко теряет строки
  // и так же легко принимает случайное число за цену.
  // Порядок доверия: строка ИТОГ → подытог до скидок → сумма позиций.
  const total =
    totals.length > 0 ? Math.max(...totals) : subtotals.length > 0 ? Math.max(...subtotals) : itemsSum;

  // Позиции, которые в сумме сильно превышают итог, — это мусор распознавания.
  const hasReliableTotal = totals.length > 0 || subtotals.length > 0;
  const sane = hasReliableTotal && itemsSum > total * 1.5 ? [] : items;

  const sum = Number(sane.reduce((accumulator, item) => accumulator + item.price, 0).toFixed(2));

  return {
    items: sane,
    total,
    date: parseDate(text),
    category: dominantCategory(sane),
    qrCode: text.match(QR_RE)?.[0] ?? null,
    // Расхождение больше рубля при непустом чеке — повод показать человеку предупреждение.
    itemsMismatch: sane.length > 0 && Math.abs(total - sum) > 1,
  };
}
