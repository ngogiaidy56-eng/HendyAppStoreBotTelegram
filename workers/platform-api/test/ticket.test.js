import test from 'node:test';
import assert from 'node:assert/strict';
import { signDownloadTicket, verifyDownloadTicket } from '../src/auth/ticket.js';

const SECRET = 'test-only-download-signing-secret-long-enough';
test('download ticket binds release ID and expires', async () => {
  const now = 1_800_000_000;
  const ticket = await signDownloadTicket('release-123', SECRET, 300, now);
  const verified = await verifyDownloadTicket(ticket, 'release-123', SECRET, now + 5);
  assert.equal(verified.releaseId, 'release-123');
  await assert.rejects(() => verifyDownloadTicket(ticket, 'release-456', SECRET, now + 5));
  await assert.rejects(() => verifyDownloadTicket(ticket, 'release-123', SECRET, now + 301), /expired/i);
});

test('download ticket rejects tampering', async () => {
  const ticket = await signDownloadTicket('release-123', SECRET, 300, 1_800_000_000);
  const [payload, signature] = ticket.split('.');
  const tampered = `${payload}.${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`;
  await assert.rejects(() => verifyDownloadTicket(tampered, 'release-123', SECRET, 1_800_000_001));
});

test('download ticket rejects malformed signature encoding', async () => {
  const now = 1_800_000_000;
  const ticket = await signDownloadTicket('release-1', SECRET, 300, now);
  const malformed = ticket.slice(0, ticket.lastIndexOf('.') + 1) + '%%%';
  await assert.rejects(() => verifyDownloadTicket(malformed, 'release-1', SECRET, now + 1), /invalid/i);
});
