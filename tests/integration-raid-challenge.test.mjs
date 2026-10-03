import test from 'node:test';
import assert from 'node:assert/strict';
import R from '../src/run.js';
import { createFixtureRaid } from '../src/raid/fixtures.js';
import * as Challenge from '../src/raid-challenge.js';

test('a URL challenge uses an immutable copy and never spends campaign lives or cash', async()=>{
  assert.equal(typeof Challenge.prepareRaidChallenge,'function');
  const run=R.newRun('lab'), before=structuredClone(run), bp=await createFixtureRaid('archive');
  const prepared=Challenge.prepareRaidChallenge(run,bp);
  run.owned[0].label='changed after publication';
  for(let i=0;i<1201&&!prepared.battle.result;i++)prepared.battle.step(.05);
  assert.ok(prepared.battle.result);
  assert.equal(prepared.battle.player.board[0].label,before.owned[0].label);
  assert.equal(run.cash,before.cash); assert.equal(run.lives,before.lives); assert.equal(run.stage,before.stage);
  assert.equal(prepared.blueprint.captureId,bp.captureId);
});
test('an empty page cannot enter a URL battle',async()=>{
  assert.equal(typeof Challenge.prepareRaidChallenge,'function');
  const run=R.newRun('campaign'),bp=await createFixtureRaid('archive');
  assert.throws(()=>Challenge.prepareRaidChallenge(run,bp),/攻撃/);
});
