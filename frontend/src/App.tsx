import { useCallback, useEffect, useRef, useState } from 'react';
import { api, clearToken, getToken, setToken, type ParsedReceipt, type Rating } from './api/client';
import { BottomNav, type NavItem } from './components/BottomNav';
import { CameraScanner } from './components/CameraScanner';
import { ExpenseList } from './components/ExpenseList';
import { Home } from './components/Home';
import { ChartIcon, ReceiptIcon, SettingsIcon } from './components/Icons';
import { Privacy } from './components/Privacy';
import { RatingInfo } from './components/RatingInfo';
import { Recurring } from './components/Recurring';
import { ReceiptEditor } from './components/ReceiptEditor';
import { Settings } from './components/Settings';
import { Logo } from './components/Logo';
import { Login } from './pages/Login';
import {
  APP_NAME,
  applyAccent,
  applyTheme,
  loadSettings,
  saveSettings,
  type Settings as SettingsType,
} from './settings';
import {
  initTelegram,
  isTelegram,
  onTelegramThemeChange,
  startParam,
  telegramColorScheme,
  useBackButton,
  webApp,
} from './telegram';

type Tab = 'home' | 'expenses' | 'settings';

const TABS: NavItem<Tab>[] = [
  { id: 'home', label: 'Главная', icon: <ChartIcon /> },
  { id: 'expenses', label: 'Траты', icon: <ReceiptIcon /> },
  { id: 'settings', label: 'Настройки', icon: <SettingsIcon /> },
];

const tabIndex = (tab: Tab) => TABS.findIndex((item) => item.id === tab);

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [checkingTelegram, setCheckingTelegram] = useState(isTelegram());
  const [username, setUsername] = useState('');
  const [tab, setTab] = useState<Tab>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsType>(loadSettings);

  // Слои поверх приложения: камера, редактор чека, политика.
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState<{ parsed: ParsedReceipt; preview: string } | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [ratingInfo, setRatingInfo] = useState<Rating | null | 'loading'>(null);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  const previousTab = useRef<Tab>('home');
  const direction = tabIndex(tab) >= tabIndex(previousTab.current) ? 'forward' : 'back';
  useEffect(() => {
    previousTab.current = tab;
  }, [tab]);

  const updateSettings = useCallback((patch: Partial<SettingsType>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // Тема применяется всегда — и в браузере, и внутри Telegram.
  // В режиме «Авто» подхватываем тему мессенджера и следим за её сменой.
  useEffect(() => {
    const sync = () => applyTheme(settings.theme, telegramColorScheme());
    sync();
    return settings.theme === 'system' ? onTelegramThemeChange(sync) : undefined;
  }, [settings.theme]);

  useEffect(() => applyAccent(settings.accent), [settings.accent]);

  useEffect(() => {
    initTelegram();
    const app = webApp();
    if (!app?.initData) return;

    api
      .loginTelegram(app.initData)
      .then((result) => {
        setToken(result.token);
        setUsername(result.user.username);
        setAuthed(true);
      })
      .then(() => {
        // Пришёл по ссылке-приглашению — сразу добавляем друг друга в лидерборд.
        const param = startParam();
        const match = param?.match(/^ref_(\d+)$/);
        if (match) void api.addFriendById(Number(match[1])).catch(() => {});
      })
      .catch((error: Error) => setAuthError(error.message))
      .finally(() => setCheckingTelegram(false));
  }, []);

  useEffect(() => {
    if (!authed || username) return;
    api
      .me()
      .then((user) => setUsername(user.username))
      .catch(() => {
        clearToken();
        setAuthed(false);
      });
  }, [authed, username]);

  // Системная «назад» закрывает верхний слой, а с вкладки уводит на главную.
  useEffect(() => {
    const layerOpen = scanning || draft !== null || privacyOpen || recurringOpen || ratingInfo !== null;
    if (layerOpen) {
      return useBackButton(() => {
        if (ratingInfo !== null) setRatingInfo(null);
        else if (privacyOpen) setPrivacyOpen(false);
        else if (recurringOpen) setRecurringOpen(false);
        else if (draft) setDraft(null);
        else setScanning(false);
      });
    }
    return useBackButton(tab === 'home' ? null : () => setTab('home'));
  }, [tab, scanning, draft, privacyOpen, recurringOpen, ratingInfo]);

  if (checkingTelegram) {
    return (
      <main className="app">
        <p className="muted center">Открываю трекер…</p>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="app">
        {authError && <p className="error center">Telegram не пустил: {authError}</p>}
        <Login
          onAuth={() => {
            setAuthed(true);
            refresh();
          }}
        />
      </main>
    );
  }

  return (
    <>
      <main className={`app${isTelegram() ? ' in-telegram' : ''}`}>
        <header className="app-header">
          <h1 aria-label={APP_NAME}>
            <Logo className="app-logo" />
          </h1>
          <div className="app-header-right">
            <span className="muted">{username}</span>
          </div>
        </header>

        <div className="screen" key={tab} data-direction={direction}>
          {tab === 'home' && (
            <Home
              refreshKey={refreshKey}
              onChanged={refresh}
              onScan={() => setScanning(true)}
              settings={settings}
            />
          )}
          {tab === 'expenses' && <ExpenseList refreshKey={refreshKey} onChanged={refresh} />}
          {tab === 'settings' && (
            <Settings
              settings={settings}
              onChange={updateSettings}
              onOpenPrivacy={() => setPrivacyOpen(true)}
              onOpenRecurring={() => setRecurringOpen(true)}
              onOpenRatingInfo={() => {
                setRatingInfo('loading');
                api
                  .rating()
                  .then(setRatingInfo)
                  .catch(() => setRatingInfo(null));
              }}
              onLogout={() => {
                clearToken();
                setAuthed(false);
              }}
              username={username}
              inTelegram={isTelegram()}
            />
          )}
        </div>

        <BottomNav items={TABS} active={tab} onChange={setTab} />
      </main>

      {scanning && (
        <CameraScanner
          onClose={() => setScanning(false)}
          onDone={(parsed, preview) => {
            setScanning(false);
            setDraft({ parsed, preview });
          }}
        />
      )}

      {draft && (
        <ReceiptEditor
          parsed={draft.parsed}
          preview={draft.preview}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            setTab('home');
            refresh();
          }}
        />
      )}

      {privacyOpen && <Privacy onClose={() => setPrivacyOpen(false)} />}

      {recurringOpen && <Recurring onClose={() => setRecurringOpen(false)} onChanged={refresh} />}

      {ratingInfo !== null && (
        <RatingInfo
          rating={ratingInfo === 'loading' ? null : ratingInfo}
          averageMonthly={settings.averageMonthly}
          onClose={() => setRatingInfo(null)}
        />
      )}
    </>
  );
}
