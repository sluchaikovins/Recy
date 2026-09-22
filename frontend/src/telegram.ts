/** Минимальная типизация того, чем мы реально пользуемся из Telegram WebApp SDK. */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  openTelegramLink: (url: string) => void;
  onEvent: (event: string, handler: () => void) => void;
  offEvent: (event: string, handler: () => void) => void;
  HapticFeedback?: { impactOccurred: (style: string) => void; notificationOccurred: (type: string) => void };
  MainButton: {
    text: string;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    setText: (text: string) => void;
    onClick: (handler: () => void) => void;
    offClick: (handler: () => void) => void;
  };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (handler: () => void) => void;
    offClick: (handler: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const webApp = (): TelegramWebApp | null => window.Telegram?.WebApp ?? null;

/** Внутри Telegram initData не пустой — по нему и отличаем мини-апп от обычного браузера. */
export const isTelegram = (): boolean => Boolean(webApp()?.initData);

/** Готовим окно мини-аппа: сообщаем Telegram о готовности и разворачиваем на весь экран. */
export function initTelegram(): void {
  const app = webApp();
  if (!app) return;

  app.ready();
  app.expand();

  // Тему здесь НЕ ставим: её решает выбор пользователя в настройках.
  // Цвета берём свои — у приложения собственная палитра, выбранная в настройках.
  document.documentElement.dataset.telegram = 'true';
}

/** Тема самого Telegram — нужна, когда пользователь выбрал «Авто». */
export const telegramColorScheme = (): 'light' | 'dark' | null => webApp()?.colorScheme ?? null;

/** Подписка на смену темы в мессенджере: сработает, когда телефон уходит в ночной режим. */
export function onTelegramThemeChange(handler: () => void): () => void {
  const app = webApp();
  if (!app?.onEvent) return () => {};
  app.onEvent('themeChanged', handler);
  return () => app.offEvent('themeChanged', handler);
}

/** Параметр из ссылки-приглашения: t.me/бот/app?startapp=ref_12 */
export const startParam = (): string | null => webApp()?.initDataUnsafe?.start_param ?? null;

/** Лёгкая вибрация на важных действиях — в браузере просто ничего не произойдёт. */
export function haptic(type: 'tap' | 'success' | 'error' = 'tap'): void {
  const feedback = webApp()?.HapticFeedback;
  if (!feedback) return;
  if (type === 'tap') feedback.impactOccurred('light');
  else feedback.notificationOccurred(type === 'success' ? 'success' : 'error');
}

/** Главная кнопка Telegram внизу экрана. Возвращает функцию, которая всё вернёт как было. */
export function useMainButton(text: string, handler: () => void, enabled = true): () => void {
  const app = webApp();
  if (!app) return () => {};

  app.MainButton.setText(text);
  app.MainButton.onClick(handler);
  if (enabled) app.MainButton.enable();
  else app.MainButton.disable();
  app.MainButton.show();

  return () => {
    app.MainButton.offClick(handler);
    app.MainButton.hide();
  };
}

export function useBackButton(handler: (() => void) | null): () => void {
  const app = webApp();
  if (!app) return () => {};

  if (!handler) {
    app.BackButton.hide();
    return () => {};
  }

  app.BackButton.onClick(handler);
  app.BackButton.show();

  return () => {
    app.BackButton.offClick(handler);
    app.BackButton.hide();
  };
}
