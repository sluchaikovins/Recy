/**
 * Настройки живут в localStorage и применяются мгновенно.
 * Сервер про них не знает — это выбор конкретного устройства.
 */
export type ThemeMode = 'system' | 'light' | 'dark';
export type Tone = 'fun' | 'plain';
export type Accent = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'violet' | 'pink';

/** Подписи и образцы цвета для палитры в настройках. */
export const ACCENTS: { id: Accent; label: string; light: string; dark: string }[] = [
  { id: 'red', label: 'Красный', light: '#d8382a', dark: '#ff6a54' },
  { id: 'orange', label: 'Оранжевый', light: '#cf6a12', dark: '#f09a3f' },
  { id: 'yellow', label: 'Жёлтый', light: '#a07c0e', dark: '#e2b93f' },
  { id: 'green', label: 'Зелёный', light: '#12805c', dark: '#3ac292' },
  { id: 'cyan', label: 'Голубой', light: '#0e8da6', dark: '#45c3dc' },
  { id: 'blue', label: 'Синий', light: '#1e63c8', dark: '#6e9bff' },
  { id: 'violet', label: 'Фиолетовый', light: '#7443d1', dark: '#a98bff' },
  { id: 'pink', label: 'Розовый', light: '#cc3b79', dark: '#ff7fae' },
];

export interface Settings {
  theme: ThemeMode;
  accent: Accent;
  /** Тон подписей: с подколами или по-деловому. */
  tone: Tone;
  haptics: boolean;
  /** База нормализации рейтинга — «средняя трата» под себя. */
  averageMonthly: number;
  currency: string;
}

const KEY = 'expense-tracker-settings';

export const DEFAULTS: Settings = {
  theme: 'system',
  accent: 'red',
  tone: 'fun',
  haptics: true,
  averageMonthly: 25000,
  currency: '₽',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Приватный режим — просто работаем без сохранения.
  }
}

/** Цвет темы — тоже атрибут: CSS сам достанет светлый и тёмный вариант. */
export function applyAccent(accent: Accent): void {
  document.documentElement.dataset.accent = accent;
}

/**
 * Тему ставим атрибутом на <html>, дальше её разбирает CSS.
 *
 * «Авто» снаружи Telegram — это отсутствие атрибута: тогда работает
 * системная медиа-подсказка браузера. Внутри Telegram медиа-подсказки нет,
 * поэтому «Авто» подставляет тему мессенджера явно.
 */
export function applyTheme(theme: ThemeMode, telegramScheme: 'light' | 'dark' | null = null): void {
  const root = document.documentElement;

  if (theme !== 'system') {
    root.dataset.theme = theme;
    return;
  }

  if (telegramScheme) root.dataset.theme = telegramScheme;
  else delete root.dataset.theme;
}

/** Деловые аналоги шуточных статусов — для тех, кому не до подколов. */
const PLAIN_STATUS: Record<string, string> = {
  ЛЕГЕНДАРНЫЙ: 'ОЧЕНЬ ВЫСОКИЕ',
  КРИТИЧЕСКИЙ: 'ВЫСОКИЕ',
  СЕРЬЁЗНЫЙ: 'ПОВЫШЕННЫЕ',
  УМЕРЕННЫЙ: 'УМЕРЕННЫЕ',
  НОРМАЛЬНЫЙ: 'В НОРМЕ',
  ХОРОШИЙ: 'НИЗКИЕ',
  ОТЛИЧНЫЙ: 'НИЗКИЕ',
  СВЯТОЙ: 'МИНИМАЛЬНЫЕ',
};

export const statusLabel = (status: string, tone: Tone): string =>
  tone === 'fun' ? status : (PLAIN_STATUS[status] ?? status);

export const ratingTitle = (tone: Tone): string =>
  tone === 'fun' ? 'Шопоголик-рейтинг' : 'Рейтинг трат';

export const APP_NAME = 'Recy';

export function toneMessage(message: string, tone: Tone): string {
  if (tone === 'fun') return message;
  // В деловом тоне оставляем только цифру в скобках, без подколов.
  return message.match(/\(([\d.]+\/10\.00)\)/)?.[1] ?? '';
}
