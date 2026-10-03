import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import C from "../src/document.js";
import R from "../src/run.js";
import { RECIPES } from "../src/fusion.js";
import { simulateTargetPath } from "../scripts/paid-target-benchmark.js";
const expandedCounts=map=>Object.fromEntries([...map].filter(([,n])=>n!==0).sort(([a],[b])=>a.localeCompare(b)));

test("QA: paid target boards contain exactly purchased or rewarded inputs with every fusion consumed once",()=>{
  for(let seed=201;seed<=205;seed++)for(const policy of ["cart","cart-fused","fortress","documents"]) {
    const path=simulateTargetPath(seed,policy),inventory=new Map(),admins=new Set();
    const add=(type,n=1)=>{const next=(inventory.get(type)||0)+n;assert.ok(next>=0,`${seed}/${policy}: unowned fusion input ${type}`);inventory.set(type,next);};
    let partSpend=0,serverSpend=0,rerollSpend=0;
    for(const round of path.rounds) {
      const tx=path.transactions.filter(t=>t.round===round.round);
      assert.ok(tx.filter(t=>t.kind==="reroll").length<=3);
      for(const t of tx.filter(t=>t.kind==="buy"||t.kind==="reroll")) {
        assert.ok(t.cash>=0);
        if(t.kind==="reroll") {assert.equal(t.cost,R.REROLL);rerollSpend+=t.cost;continue;}
        assert.ok(t.offered.includes(t.type));
        if(t.type.startsWith("plan:")) {assert.equal(t.cost,R.PLANS[t.type.slice(5)].price);serverSpend+=t.cost;}
        else {assert.equal(t.cost,D.PARTS[t.type].price);assert.notEqual(D.PARTS[t.type].fused,true);partSpend+=t.cost;add(t.type);}
      }
      const actual=new Map();for(const p of round.board)actual.set(p.type,(actual.get(p.type)||0)+1);
      assert.deepEqual(expandedCounts(actual),expandedCounts(inventory),`${seed}/${policy}/round${round.round}: no injected or missing parts`);
      assert.deepEqual([...round.admin].sort(),[...admins].sort());
      assert.ok(round.board.filter(C.placed).every(p=>C.canPlace(round.board,p,p.x,p.y,p.w,p.h)));
      for(const t of tx.filter(t=>t.kind==="fusion"||t.kind==="loot")) {
        if(t.kind==="fusion") {
          const recipe=RECIPES.find(r=>r.into===t.type);assert.ok(recipe);
          assert.deepEqual([...t.from].sort(),[recipe.a,recipe.b].sort());
          for(const type of t.from)add(type,-1);
          add(t.type);
        } else {
          assert.ok(t.offered.includes(t.type));
          if(t.type.startsWith("admin:"))admins.add(t.type.slice(6));else add(t.type);
        }
      }
    }
    assert.equal(path.partSpend,partSpend);assert.equal(path.serverSpend,serverSpend);assert.equal(path.rerollSpend,rerollSpend);
    assert.equal(path.cash,10+path.rewards-partSpend-serverSpend-rerollSpend);
    assert.equal(path.blocked,null);
  }
});
