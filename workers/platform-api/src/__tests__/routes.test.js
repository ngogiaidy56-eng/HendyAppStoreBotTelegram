import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFeatureApi } from '../routes/features.js';

test('unknown feature route is not intercepted', async () => {
  const request = new Request('https://api.example.test/api/not-a-feature');
  const result = await routeFeatureApi(request, {}, new URL(request.url));
  assert.equal(result, null);
});

test('feature API path rejects unimplemented method without database access', async () => {
  const request = new Request('https://api.example.test/api/referral', { method: 'DELETE' });
  const result = await routeFeatureApi(request, {}, new URL(request.url));
  assert.equal(result, null);
});
