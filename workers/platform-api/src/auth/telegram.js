import { hmacBytes, bytesToHex } from '../utils/crypto.js';
import { safeEqual } from '../utils/http.js';
import { HttpError, nowSeconds } from '../utils/http.js';

export async function validateTelegramInitData(initData, botToken, maxAgeSeconds = 86400, now = nowSeconds()) {
  if (typeof initData !== 'string' || !initData || initData.length > 16_384) {
    throw new HttpError(401, 'Telegram initData is missing or invalid', 'TELEGRAM_AUTH_INVALID');
  }
  if (!botToken) throw new HttpError(503, 'Telegram authentication is not configured', 'AUTH_NOT_CONFIGURED');
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const userString = params.get('user');
  const authDate = Number(params.get('auth_date'));
  if (!receivedHash || !/^[0-9a-f]{64}$/i.test(receivedHash) || !userString || !Number.isFinite(authDate)) {
    throw new HttpError(401, 'Telegram initData is malformed', 'TELEGRAM_AUTH_INVALID');
  }
  const checkString = [...params.entries()]
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  // Telegram spec: HMAC key is the literal WebAppData; message is the bot token.
  const secretKey = await hmacBytes('WebAppData', botToken);
  const calculatedHash = bytesToHex(await hmacBytes(secretKey, checkString));
  if (!safeEqual(calculatedHash.toLowerCase(), receivedHash.toLowerCase())) {
    throw new HttpError(401, 'Telegram initData signature is invalid', 'TELEGRAM_AUTH_INVALID');
  }
  if (authDate > now + 60 || now - authDate > maxAgeSeconds) {
    throw new HttpError(401, 'Telegram initData has expired', 'TELEGRAM_AUTH_EXPIRED');
  }
  let user;
  try { user = JSON.parse(userString); }
  catch { throw new HttpError(401, 'Telegram user payload is invalid', 'TELEGRAM_AUTH_INVALID'); }
  if (!user || (typeof user.id !== 'number' && typeof user.id !== 'string')) {
    throw new HttpError(401, 'Telegram user payload is invalid', 'TELEGRAM_AUTH_INVALID');
  }
  return { ...user, id: String(user.id), authDate };
}
