import test from 'node:test';
import assert from 'node:assert/strict';
import { hmacBytes, bytesToHex } from '../src/utils/crypto.js';
import { validateTelegramInitData } from '../src/auth/telegram.js';
import { signSession, verifySession } from '../src/auth/session.js';

const BOT_TOKEN = '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';
const SECRET = 'a-long-test-session-secret-with-at-least-32-chars';

async function makeInitData(user, botToken, authDate) {
  const params = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify(user), query_id: 'test-query' });
  const checkString = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k,v]) => `${k}=${v}`).join('\n');
  const secretKey = await hmacBytes('WebAppData', botToken);
  params.set('hash', bytesToHex(await hmacBytes(secretKey, checkString)));
  return params.toString();
}

test('Telegram initData signature validates and returns the user ID as a string', async () => {
  const now = 1_800_000_000;
  const data = await makeInitData({ id: 123456, first_name: 'Test' }, BOT_TOKEN, now - 10);
  const user = await validateTelegramInitData(data, BOT_TOKEN, 3600, now);
  assert.equal(user.id, '123456');
  assert.equal(user.first_name, 'Test');
});

test('Telegram initData rejects tampering', async () => {
  const now = 1_800_000_000;
  const data = await makeInitData({ id: 123456, first_name: 'Test' }, BOT_TOKEN, now - 10);
  await assert.rejects(() => validateTelegramInitData(data.replace('first_name%22%3A%22Test', 'first_name%22%3A%22Evil'), BOT_TOKEN, 3600, now));
});

test('Telegram initData rejects old data', async () => {
  const now = 1_800_000_000;
  const data = await makeInitData({ id: 123456 }, BOT_TOKEN, now - 4000);
  await assert.rejects(() => validateTelegramInitData(data, BOT_TOKEN, 3600, now), /expired/i);
});

test('Session token verifies, expires and rejects tampering', async () => {
  const now = 1_800_000_000;
  const token = await signSession({ telegramId: '123' }, SECRET, 300, now);
  assert.equal((await verifySession(token, SECRET, now + 1)).telegramId, '123');
  await assert.rejects(() => verifySession(token, SECRET, now + 301), /expired/i);
  const changed = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  await assert.rejects(() => verifySession(changed, SECRET, now + 1), /signature/i);
});

test('Session verification rejects malformed signature encoding as unauthorized', async () => {
  const now = 1_800_000_000;
  const token = await signSession({ telegramId: '123' }, SECRET, 300, now);
  const malformed = token.slice(0, token.lastIndexOf('.') + 1) + '%%%';
  await assert.rejects(() => verifySession(malformed, SECRET, now + 1), /signature/i);
});
