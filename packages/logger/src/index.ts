const SECRET_KEY = /token|secret|password|authorization|cookie|credential|private.?key/i;
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[REDACTED]' : redact(item)]));
  return value;
}
export function log(level: 'info'|'warn'|'error', event: string, fields: Record<string, unknown> = {}) {
  const payload = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...redact(fields) as Record<string, unknown> });
  if (level === 'error') console.error(payload); else if (level === 'warn') console.warn(payload); else console.log(payload);
}
