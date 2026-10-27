import { useEffect } from 'react';
export function useTelegram() {
  useEffect(() => { const webApp = (window as any).Telegram?.WebApp; webApp?.ready?.(); webApp?.expand?.(); }, []);
  return (window as any).Telegram?.WebApp || null;
}
