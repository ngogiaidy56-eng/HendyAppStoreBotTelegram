import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdminEvent } from '../src/realtime/ws-handler.js';
test('admin live events expose allowlisted metadata only',()=>{const result=normalizeAdminEvent({type:'audit',action:'release.activate',targetType:'release',targetId:'release-123',status:'recorded',at:1760000000,secret:'must-not-leak',details:{token:'must-not-leak'}});assert.deepEqual(result,{type:'audit',at:1760000000,action:'release.activate',targetType:'release',targetId:'release-123',status:'recorded'});assert.equal(JSON.stringify(result).includes('must-not-leak'),false);});
test('admin live events reject unknown types and statuses',()=>{assert.throws(()=>normalizeAdminEvent({type:'secret_dump',status:'recorded'}),/Unsupported live event type/);assert.throws(()=>normalizeAdminEvent({type:'queue',status:'execute_arbitrary_code'}),/Unsupported live event status/);});
