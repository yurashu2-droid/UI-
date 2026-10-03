import test from 'node:test';
import assert from 'node:assert/strict';
import R from '../src/run.js';
import C from '../src/document.js';
import E from '../src/engine.js';

function fullRewardRun() {
  const run=R.newRun('campaign');
  run.owned=[C.makeItem('ab_link','p1',32,24)];run.nextId=2;run.phase='battle';
  const battle=new E.Battle(run.owned,[C.makeItem('ab_link','e1',32,24)],{playerHp:1000,enemyHp:1});
  for(let i=0;i<1201&&!battle.result;i++)battle.step(.05);
  assert.equal(R.settleBattle(run,battle).ok,true);
  assert.equal(run.phase,'reward');
  run.owned=Array.from({length:64},(_,i)=>C.makeItem('ab_link','p'+(i+1)));
  run.nextId=65;
  assert.equal(R.validateRun(run),true);
  return run;
}
test('a full campaign inventory preserves the chosen reward and advances once',()=>{
  const run=fullRewardRun();
  const choice=run.pending.loot.find(x=>!x.startsWith('admin:'));
  const result=R.claimLoot(run,choice);
  assert.equal(result.ok,true);
  assert.equal(result.pending,true);
  assert.equal(run.owned.length,64);
  assert.equal(run.pendingInventory.length,1);
  assert.equal(run.pendingInventory[0].type,choice);
  assert.equal(run.stage,1);
  assert.equal(R.validateRun(JSON.parse(JSON.stringify(run))),true);
  assert.equal(R.claimLoot(run,choice).ok,false);
  assert.equal(run.pendingInventory.length,1);
});
test('a preserved campaign reward moves into inventory only when room is available',()=>{
  assert.equal(typeof R.collectOverflow,'function');
  const run=fullRewardRun(),choice=run.pending.loot.find(x=>!x.startsWith('admin:'));
  R.claimLoot(run,choice);
  const item=run.pendingInventory[0];
  assert.equal(R.collectOverflow(run,item.id).ok,false);
  R.sell(run,run.owned[0].id);
  assert.equal(R.collectOverflow(run,item.id).ok,true);
  assert.equal(run.owned.length,64);
  assert.equal(run.pendingInventory.length,0);
  assert.ok(run.owned.some(p=>p.id===item.id));
  assert.equal(R.collectOverflow(run,item.id).ok,false);
  assert.equal(R.validateRun(run),true);
});
