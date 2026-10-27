import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFlag, evaluateFlags, rolloutBucket } from '../src/evaluator.js';
test('rollout buckets are stable', () => { assert.equal(rolloutBucket('123','beta'), rolloutBucket('123','beta')); assert.notEqual(rolloutBucket('123','beta'), rolloutBucket('124','beta')); });
test('flags respect enabled and rollout percent', () => { assert.equal(evaluateFlag({key:'x',enabled:false}),false); assert.equal(evaluateFlag({key:'x',enabled:true,rolloutPercent:0},'u'),false); assert.equal(evaluateFlag({key:'x',enabled:true,rolloutPercent:100},'u'),true); const n=rolloutBucket('u','x'); assert.equal(evaluateFlag({key:'x',enabled:true,rolloutPercent:n},'u'),false); assert.equal(evaluateFlag({key:'x',enabled:true,rolloutPercent:n+1},'u'),true); });
test('flag maps evaluate each named feature', () => { assert.deepEqual(evaluateFlags([{key:'a',enabled:true},{key:'b',enabled:false}], 'u'),{a:true,b:false}); });
