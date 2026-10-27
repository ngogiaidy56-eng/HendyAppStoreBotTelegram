export async function getState(env: {DB:D1Database}, telegramId: string) {
  return env.DB.prepare('SELECT state_json,updated_at FROM user_states WHERE telegram_id=?').bind(telegramId).first<{state_json:string;updated_at:number}>();
}
export async function setState(env: {DB:D1Database}, telegramId:string, state:unknown) {
  const now=Math.floor(Date.now()/1000);
  await env.DB.prepare(`INSERT INTO user_states(telegram_id,state_json,updated_at) VALUES(?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`).bind(telegramId,JSON.stringify(state),now).run();
}
