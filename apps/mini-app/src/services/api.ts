const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const SESSION_KEY = 'hendy_session';

export type ApiOptions = {
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
};

export function getSession(): string {
  return sessionStorage.getItem(SESSION_KEY) || '';
}

export function setSession(value: string): void {
  if (value) sessionStorage.setItem(SESSION_KEY, value);
  else sessionStorage.removeItem(SESSION_KEY);
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('accept', 'application/json');
  const token = getSession();
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET', headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.error?.message || `Yêu cầu thất bại (${response.status})`);
  return data as T;
}

export async function signIn(): Promise<any> {
  const initData = (window as any).Telegram?.WebApp?.initData || '';
  if (!initData) throw new Error('Hãy mở ứng dụng từ Telegram để xác thực an toàn.');
  const response = await api<{ token: string; user: any }>('/api/auth/telegram', { method: 'POST', body: { initData } });
  setSession(response.token);
  return response.user;
}

export const featureApi = api;
