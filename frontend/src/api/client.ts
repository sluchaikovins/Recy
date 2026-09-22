export interface Item {
  id?: number;
  name: string;
  price: number;
  category?: string;
}

export interface Expense {
  id: number;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  verified: number;
  flagged: number;
  flagged_reason: string | null;
  items: Item[];
}

export interface ParsedReceipt {
  items: Item[];
  total: number;
  date: string;
  category: string;
  qrCode: string | null;
  /** Сумма пришла из фискального QR — ей можно верить больше, чем распознанному тексту. */
  fromQr?: boolean;
  /** Сумма позиций разошлась с итогом чека: OCR что-то потерял. */
  itemsMismatch?: boolean;
  /** Снимок пришлось развернуть — значит, чек сняли боком. */
  rotated?: boolean;
  imagePath: string;
  rawText: string;
}

export interface CycleInfo {
  amount: number;
  lastIncomeDate: string;
  nextIncomeDate: string;
  daysSinceIncome: number;
  daysUntilNextIncome: number;
  cycleDepth: number;
  remaining: number;
  perDayLeft: number;
  phase: string;
  phaseMessage: { title: string; text: string };
  forecastEndOfCycle: number;
}

export interface Rating {
  level: number;
  baseLevel: number;
  status: string;
  message: string;
  monthlySpent: number;
  receiptsCount: number;
  averageReceipt: number;
  averageDay: number;
  categoriesSpread: number;
  /** Во сколько обойдётся месяц при нынешнем темпе трат. */
  projectedMonth: number;
  cycle: CycleInfo | null;
}

export interface MonthStats {
  month: string;
  total: number;
  receipts: number;
  byCategory: { category: string; total: number }[];
  byDay: { date: string; total: number }[];
  topItems: { name: string; total: number; count: number }[];
  averageReceipt: number;
  averageDay: number;
  comparison: { previousMonthTotal: number; deltaPercent: number | null };
  advice: string[];
}

export interface LeaderboardRow {
  userId: number;
  name: string;
  isMe: boolean;
  total: number;
  rating: number;
  status: string;
  eligible: boolean;
}

const TOKEN_KEY = 'expense-tracker-token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const isFormData = init.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Ошибка запроса (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  register: (username: string, email: string, password: string) =>
    request<{ token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ id: number; username: string; email: string | null; photo_url: string | null }>('/auth/me'),
  loginTelegram: (initData: string) =>
    request<{ token: string; user: { id: number; username: string; photoUrl: string | null }; isNew: boolean }>(
      '/auth/telegram',
      { method: 'POST', body: JSON.stringify({ initData }) },
    ),

  uploadReceipt: (file: File, qr?: string) => {
    const form = new FormData();
    form.append('file', file);
    // Код, пойманный камерой в видоискателе: он точнее того, что видно на снимке.
    if (qr) form.append('qr', qr);
    return request<ParsedReceipt>('/upload', { method: 'POST', body: form });
  },
  saveExpense: (payload: {
    total: number;
    date: string;
    items: Item[];
    imagePath?: string;
    qrCode?: string | null;
    description?: string;
    category?: string;
  }) => request<{ id: number; flagged: boolean; flaggedReason: string | null }>('/expenses', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  expenses: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
    return request<Expense[]>(`/expenses${query.toString() ? `?${query}` : ''}`);
  },
  deleteExpense: (id: number) => request<{ ok: true }>(`/expenses/${id}`, { method: 'DELETE' }),
  updateExpense: (id: number, patch: Partial<Pick<Expense, 'amount' | 'category' | 'description' | 'date'>>) =>
    request<{ ok: true }>(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  monthStats: (year: number, month: number) => request<MonthStats>(`/stats/month?year=${year}&month=${month}`),
  dailyStats: (days = 30) => request<{ date: string; total: number }[]>(`/stats/daily?days=${days}`),
  rating: () => request<Rating>('/rating/current'),

  income: () => request<{ income: unknown; cycle: CycleInfo | null }>('/income'),
  saveIncome: (payload: {
    type: string;
    amount: number;
    frequency: string;
    lastIncomeDate?: string | null;
    nextIncomeDate?: string | null;
  }) => request<{ cycle: CycleInfo | null }>('/income', { method: 'PUT', body: JSON.stringify(payload) }),

  recurring: () =>
    request<
      { id: number; name: string; amount: number; category: string; day_of_month: number; active: number }[]
    >('/recurring'),
  addRecurring: (payload: { name: string; amount: number; category: string; dayOfMonth: number }) =>
    request<{ id: number; createdNow: number }>('/recurring', { method: 'POST', body: JSON.stringify(payload) }),
  toggleRecurring: (id: number, active: boolean) =>
    request<{ ok: true }>(`/recurring/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  deleteRecurring: (id: number) => request<{ ok: true }>(`/recurring/${id}`, { method: 'DELETE' }),

  notifications: () => request<{ enabled: boolean; hour: number }>('/settings/notifications'),
  saveNotifications: (enabled: boolean, hour: number) =>
    request<{ enabled: boolean; hour: number }>('/settings/notifications', {
      method: 'PUT',
      body: JSON.stringify({ enabled, hour }),
    }),

  leaderboard: () => request<{ rows: LeaderboardRow[]; share: string }>('/leaderboard/friends'),
  addFriend: (username: string) =>
    request<{ ok: true; friend: { id: number; username: string } }>('/leaderboard/friends', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),
  addFriendById: (userId: number) =>
    request<{ ok: true }>('/leaderboard/friends', { method: 'POST', body: JSON.stringify({ userId }) }),
  appInfo: () => request<{ botUsername: string }>('/settings/app'),
};
