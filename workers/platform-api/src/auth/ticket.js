import { hmacBytes, bytesToBase64Url, base64UrlToBytes } from '../utils/crypto.js';
import { HttpError, nowSeconds } from '../utils/http.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function signDownloadTicket(releaseId, secret, ttlSeconds = 300, now = nowSeconds()) {
  if (!secret || secret.length < 32) throw new HttpError(503, 'SESSION_SECRET is not configured', 'SESSION_NOT_CONFIGURED');
  const payload = bytesToBase64Url(enc.encode(JSON.stringify({ type: 'download', releaseId, iat: now, exp: now + Math.min(Math.max(ttlSeconds, 30), 600) })));
  const signature = bytesToBase64Url(await hmacBytes(secret, payload));
  return `${payload}.${signature}`;
}

export async function verifyDownloadTicket(ticket, releaseId, secret, now = nowSeconds()) {
  if (typeof ticket !== 'string' || ticket.length > 2048 || !secret || secret.length < 32) throw new HttpError(401, 'Download ticket is invalid', 'INVALID_TICKET');
  const parts = ticket.split('.');
  if (parts.length !== 2) throw new HttpError(401, 'Download ticket is invalid', 'INVALID_TICKET');
  const expected = bytesToBase64Url(await hmacBytes(secret, parts[0]));
  let a; let b;
  try { a = base64UrlToBytes(parts[1]); b = base64UrlToBytes(expected); }
  catch { throw new HttpError(401, 'Download ticket is invalid', 'INVALID_TICKET'); }
  if (a.length !== b.length) throw new HttpError(401, 'Download ticket is invalid', 'INVALID_TICKET');
  let diff = 0; for (let i=0;i<a.length;i++) diff |= a[i] ^ b[i];
  if (diff !== 0) throw new HttpError(401, 'Download ticket is invalid', 'INVALID_TICKET');
  let payload;
  try { payload = JSON.parse(dec.decode(base64UrlToBytes(parts[0]))); } catch { throw new HttpError(401, 'Download ticket is invalid', 'INVALID_TICKET'); }
  if (payload.type !== 'download' || payload.releaseId !== releaseId || typeof payload.exp !== 'number' || payload.exp <= now || payload.iat > now + 60) {
    throw new HttpError(401, 'Download ticket has expired or is invalid', 'INVALID_TICKET');
  }
  return payload;
}
