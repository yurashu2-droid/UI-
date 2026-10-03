import test from "node:test";
import assert from "node:assert/strict";
import { AudienceState, AUDIENCE_RULES } from "../src/audience-experiment.js";
import E from "../src/engine.js";
import C from "../src/document.js";

test("QA: mixed audience exposure and retention operations conserve bounded loyalty and churn",()=>{
  const state=new AudienceState();
  let seed=20261002,tick=0,totalChurn=0;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<1000;i++) {
    tick+=Math.floor(rand()*60);state.advance(tick);
    if(rand()<.55) {
      for(let n=0;n<1+Math.floor(rand()*12);n++) {
        const loss=state.ad(`module-${Math.floor(rand()*16)}`,tick);
        assert.ok(loss>=0&&loss<=AUDIENCE_RULES.churnBurst);
        state.recordChurn(loss);totalChurn+=loss;
      }
    }
    for(let n=0;n<Math.floor(rand()*6);n++)state.view(tick);
    const before=state.snapshot(),hit=rand()*180,direct=hit*rand(),hp=rand()*200;
    const kept=state.retain(hit,direct,hp);
    assert.ok(kept.reduction>=0&&kept.reduction<=before.loyalty+1e-9);
    assert.ok(kept.reduction<=.25*(hit-direct)+1e-9);
    assert.ok(kept.actual>=0&&kept.actual<=kept.reduction+1e-9);
    assert.ok(Math.abs(kept.actual-(Math.min(hp,hit)-Math.min(hp,hit-kept.reduction)))<1e-8);
    const after=state.snapshot();
    assert.ok(Object.values(after).every(Number.isFinite));
    assert.ok(after.loyalty>=-1e-9&&after.loyalty<=AUDIENCE_RULES.loyaltyCapacity);
    assert.ok(after.freeExposure>=0&&after.freeExposure<=AUDIENCE_RULES.pageExposureCapacity);
    assert.ok(after.churnBudget>=0&&after.churnBudget<=AUDIENCE_RULES.churnBurst);
    assert.ok(Math.abs(after.loyaltyEarned-after.loyaltySpent-after.loyaltyExpired-after.loyalty)<1e-8);
    assert.ok(totalChurn<=AUDIENCE_RULES.churnBurst+(tick/20)*AUDIENCE_RULES.churnPerSecond+1e-8);
    assert.equal(after.churn,totalChurn);
  }
  state.advance(tick+AUDIENCE_RULES.loyaltyLifetimeTicks+1);
  assert.equal(state.snapshot().loyalty,0);
});

test("QA: explicit null and omitted audience variants produce identical canonical battle traces",()=>{
  const own=[C.makeItem("yt_play","p1",24,24,560,280),C.makeItem("yt_sub","p2",592,24,184,40),C.makeItem("yt_ad","p3",592,80,160,48)];
  const enemy=[C.makeItem("ab_link","e1",24,24,192,32),C.makeItem("ab_nav","e2",216,24,176,32)];
  const run=extra=>{
    const battle=new E.Battle(own,enemy,{playerHp:440,enemyHp:440,...extra}),events=[];
    while(!battle.result)events.push(...battle.step(.05));
    assert.equal(battle.audience,null);
    assert.ok(events.every(event=>event.kind!=="audience"));
    return {result:battle.result,events,hp:[battle.player.hp,battle.enemy.hp]};
  };
  assert.deepEqual(run({}),run({experimentalRules:null}));
});
