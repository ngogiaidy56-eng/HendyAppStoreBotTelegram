export class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_ERROR') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export async function readJson(request, maxBytes = 64 * 1024) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new HttpError(413, 'Request body too large', 'BODY_TOO_LARGE');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new HttpError(413, 'Request body too large', 'BODY_TOO_LARGE');
  try { return { value: raw ? JSON.parse(raw) : {}, raw }; }
  catch { throw new HttpError(400, 'Invalid JSON body', 'INVALID_JSON'); }
}

export function assertString(value, field, maxLength = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new HttpError(400, `Invalid ${field}`, 'INVALID_FIELD');
  }
  return value.trim();
}

export function nowSeconds() { return Math.floor(Date.now() / 1000); }

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
