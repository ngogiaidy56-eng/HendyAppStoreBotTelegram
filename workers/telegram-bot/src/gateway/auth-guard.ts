export function isAdmin(telegramId: string|number, env: {ADMIN_TELEGRAM_IDS?:string}) {
  return (env.ADMIN_TELEGRAM_IDS || '').split(',').map(x=>x.trim()).filter(Boolean).includes(String(telegramId));
}
