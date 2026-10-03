import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { fortressCandidate } from "../src/balance-candidates.js";
import { BUILDS } from "../src/builds.js";
import { board, measureMatch, resources } from "../src/buildlab.js";

test("QA: limiter prevention conserves a bounded budget across mixed bursts and piercing", () => {
  const battle=new E.Battle([], [C.makeItem("gov_rate_limit","limiter",24,24)], {playerHp:100000,enemyHp:100000});
  let prevented=0;
  for(let i=0;i<500;i++) {
    if(i%3===0) battle.step(0.05);
    const value=[0.5,1,3,7,11,100][i%6], pierce=[0,0.25,0.5,1][i%4];
    const budget=battle.rateBudget.enemy, hp=battle.enemy.hp;
    battle._hit(battle.player,battle.enemy,{damage:0},value,pierce);
    const reduction=hp-battle.enemy.hp;
    const limit=value-reduction;
    assert.ok(limit>=-1e-8 && limit<=Math.min(4,value*(1-pierce),budget)+1e-8);
    assert.ok(reduction+1e-8>=value*pierce,"unshielded original piercing payload remains intact");
    assert.ok(battle.rateBudget.enemy>=-1e-8 && battle.rateBudget.enemy<=24+1e-8);
    prevented+=limit;
  }
  assert.ok(Math.abs(battle.metrics.enemy.rateLimited-prevented)<1e-6);
});

test("QA: limiter mirror is symmetric and independent of frame partition", () => {
  const base=BUILDS.find(b=>b.id==="b_fort"), candidate=fortressCandidate({...base,build:true});
  const finish=dt=>{
    const battle=new E.Battle(board(candidate.layout,"p"),board(candidate.layout,"e"),{playerHp:440,enemyHp:440,playerCapacity:56,enemyCapacity:56});
    while(!battle.result) {
      battle.step(dt);
      assert.ok(Math.abs(battle.player.hp-battle.enemy.hp)<1e-7);
      assert.ok(Math.abs(battle.rateBudget.player-battle.rateBudget.enemy)<1e-7);
    }
    assert.equal(battle.result.winner,"draw");
    return {result:battle.result,player:battle.metrics.player,enemy:battle.metrics.enemy};
  };
  assert.deepEqual(finish(0.2),finish(0.05));
});

test("QA: historical combat-v2 counter cycle remains reproducible at its labelled resource condition", () => {
  const entry=id=>({...BUILDS.find(b=>b.id===id),build:true});
  const original=entry("b_fort"), fort=fortressCandidate(original), links=entry("b_links"), echo=entry("b_echo");
  assert.ok(resources(fort.layout).acquisitionValue<=resources(original.layout).acquisitionValue);
  assert.ok(resources(fort.layout).load<=resources(original.layout).load);
  // This measured candidate cycle was established under v2. Pin its historical
  // version; it is not a claim that the newly promoted v3 keeps the same matchups.
  const conditions={hp:440,capacity:56,adminSlots:0,combatVersion:"combat-v2"};
  for(const [a,b] of [[fort,links],[echo,fort],[links,echo]]) {
    assert.equal(measureMatch(a,b,conditions).winner,"player");
    assert.equal(measureMatch(b,a,conditions).winner,"enemy");
  }
  const run=R.newRun("campaign");
  for(let stage=0;stage<R.ROUNDS;stage++)for(let reroll=0;reroll<20;reroll++) {
    run.stage=stage;run.rerolls=reroll;
    assert.ok(!R.market(run).some(s=>s.type==="gov_rate_limit"),"candidate must not be represented as generally obtainable");
  }
});
