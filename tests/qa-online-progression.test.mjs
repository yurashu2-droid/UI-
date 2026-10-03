import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArenaService } from "../server/arena/service.js";
import R from "../src/run.js";

// These are explicitly test-only prior-round checkpoints. There are no demo
// opponents or test hooks in production. Both loadouts use legal geometry,
// initial cash10, real purchases, capacity12 and rule-derived HP; the player
// traverses all tested rounds through the real authoritative commands.
const strong = ["ab_link", "ab_nav"], weak = ["ab_link"];
function checkpoint(stage, types) {
  const run = R.newRun("campaign", "mixed");
  run.stage = stage; run.wins = stage; run.cash = 10;
  run.shop = types.map(type => ({ type, sold: false }));
  for (const type of types) assert.equal(R.purchase(run, type).ok, true);
  for (let i = 0; i < run.owned.length; i++) assert.equal(R.move(run, run.owned[i].id, i ? 224 : 32, 24), true);
  assert.equal(R.validateRun(JSON.parse(JSON.stringify(run))), true);
  return run;
}
function setup(rounds, opponents) {
  const dir = mkdtempSync(join(tmpdir(), "qa-arena-progression-")), filePath = join(dir, "store.json");
  let service = new ArenaService({ filePath });
  const player = service.openSession(), ghosts = Array.from({ length: rounds }, () => service.openSession());
  service.close();
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  data.runs[player.view.online.id].state.shop = strong.map(type => ({ type, sold: false }));
  ghosts.forEach((ghost, stage) => { data.runs[ghost.view.online.id].state = checkpoint(stage, opponents); });
  writeFileSync(filePath, JSON.stringify(data));
  service = new ArenaService({ filePath });
  let n = 0;
  const command = (token, kind, extra = {}) => service.command(token, { commandId: `progression-${++n}`, expectedRevision: service.view(token).revision, kind, ...extra });
  ghosts.forEach(ghost => command(ghost.token, "publish"));
  return { service, player, command,
    reopen(mutator) {
      service.close();
      const stored=JSON.parse(readFileSync(filePath,"utf8"));
      mutator(stored);
      writeFileSync(filePath,JSON.stringify(stored));
      service=new ArenaService({filePath}); this.service=service;
    },
    cleanup() { service.close(); rmSync(dir, { recursive:true, force:true }); } };
}
function prepare({ player, service, command }, types) {
  for (const type of types) command(player.token, "purchase", { type });
  const items = service.view(player.token).run.owned.map((p,i) => ({ id:p.id, x:i?224:32, y:24, w:p.w, h:p.h }));
  command(player.token, "placement", { items });
}

test("QA: all eight online rounds reach complete using authoritative commands", () => {
  const ctx = setup(8, weak);
  try {
    prepare(ctx, strong);
    for (let stage = 0; stage < 8; stage++) {
      const match = ctx.command(ctx.player.token, "match");
      assert.equal(match.match.round, stage);
      assert.equal(match.match.winner, "player", `test-only weak opponent at round ${stage}`);
      const settled = ctx.command(ctx.player.token, "settle", { matchId:match.match.id });
      assert.equal(settled.run.history.length, stage + 1);
      assert.equal(settled.run.phase, "reward");
      const next = ctx.command(ctx.player.token, "claim", { matchId:match.match.id, choice:null });
      assert.equal(next.run.stage, stage + 1);
      assert.equal(next.run.lives, 3);
      assert.equal(next.run.wins, stage + 1);
      assert.equal(next.run.phase, stage === 7 ? "complete" : "build");
    }
    assert.throws(() => ctx.command(ctx.player.token, "match"), /RUN_LOCKED/);
    const fresh = ctx.command(ctx.player.token, "new-run");
    assert.equal(fresh.run.stage, 0); assert.equal(fresh.run.lives, 3); assert.equal(fresh.run.cash, 10);
    assert.equal(fresh.run.history.length, 0);
  } finally { ctx.cleanup(); }
});

test("QA: three online losses reach gameover exactly once and allow a fresh run", () => {
  const ctx = setup(3, strong);
  try {
    prepare(ctx, weak);
    for (let loss = 1; loss <= 3; loss++) {
      const matched = ctx.command(ctx.player.token, "match");
      assert.equal(matched.match.winner, "enemy");
      const settled = ctx.command(ctx.player.token, "settle", { matchId:matched.match.id });
      assert.equal(settled.run.lives, 3 - loss);
      assert.equal(settled.run.history.length, loss);
      assert.equal(settled.run.phase, loss === 3 ? "gameover" : "build");
      const repeat = ctx.command(ctx.player.token, "settle", { matchId:matched.match.id });
      assert.equal(repeat.run.lives, 3 - loss);
      assert.equal(repeat.run.history.length, loss);
    }
    assert.throws(() => ctx.command(ctx.player.token, "match"), /RUN_LOCKED/);
    const fresh = ctx.command(ctx.player.token, "new-run");
    assert.equal(fresh.run.stage, 0); assert.equal(fresh.run.lives, 3);
    assert.equal(fresh.run.history.length, 0);
  } finally { ctx.cleanup(); }
});

test("QA: an assigned old-version win can settle and claim its frozen reward after restart", () => {
  const ctx=setup(1,weak);
  try {
    prepare(ctx,strong);
    const assigned=ctx.command(ctx.player.token,"match").match;
    assert.equal(assigned.winner,"player");
    const choice=assigned.rewardChoices.find(x=>!x.startsWith("admin:"));
    assert.ok(choice);
    const template=structuredClone(assigned.rewardItems[choice]);
    // Isolated release-migration fixture: no outcomes or rewards are altered.
    // The persisted run simply predates the currently deployed rules/catalogue.
    ctx.reopen(data=>{
      data.runs[ctx.player.view.online.id].combatVersion="qa-prior-combat";
      data.runs[ctx.player.view.online.id].catalogHash="qa-prior-catalog";
    });
    assert.equal(ctx.service.view(ctx.player.token).online.requiresNewRun,true);
    const settled=ctx.command(ctx.player.token,"settle",{matchId:assigned.id});
    assert.equal(settled.run.phase,"reward");
    assert.deepEqual(settled.run.pending.loot,assigned.rewardChoices);
    const claimed=ctx.command(ctx.player.token,"claim",{matchId:assigned.id,choice});
    const item=claimed.run.owned.at(-1);
    assert.deepEqual({...item,id:template.id},template);
    assert.equal(claimed.run.history.length,1);
    assert.equal(claimed.run.stage,1);
    assert.throws(()=>ctx.command(ctx.player.token,"match"),/VERSION_MISMATCH/);
    const fresh=ctx.command(ctx.player.token,"new-run");
    assert.equal(fresh.online.requiresNewRun,false);
    assert.equal(fresh.run.stage,0);
  } finally {ctx.cleanup();}
});

test("QA: three draws consume exactly three lives without awarding wins or rating", () => {
  const ctx=setup(3,weak);
  try {
    prepare(ctx,weak);
    const rating=ctx.service.view(ctx.player.token).online.rating;
    for(let round=0;round<3;round++) {
      const matched=ctx.command(ctx.player.token,"match");
      assert.equal(matched.match.winner,"draw");
      const settled=ctx.command(ctx.player.token,"settle",{matchId:matched.match.id});
      assert.equal(settled.run.lives,2-round);
      assert.equal(settled.run.wins,0);
      assert.equal(settled.online.rating,rating);
      assert.equal(settled.run.history.length,round+1);
      assert.equal(settled.run.phase,round===2?"gameover":"build");
      assert.equal(settled.run.pending,null);
    }
  } finally {ctx.cleanup();}
});

test("QA: loot retries and a conflicting choice cannot grant two rewards", () => {
  const ctx=setup(1,weak);
  try {
    prepare(ctx,strong);
    const match=ctx.command(ctx.player.token,"match").match;
    const settled=ctx.command(ctx.player.token,"settle",{matchId:match.id});
    const [choice,other]=settled.run.pending.loot;
    const request={commandId:"qa-loot-idempotency",expectedRevision:settled.revision,kind:"claim",matchId:match.id,choice};
    const first=ctx.service.command(ctx.player.token,request);
    const expected=structuredClone(first.run);
    assert.deepEqual(ctx.service.command(ctx.player.token,request).run,expected);
    assert.throws(()=>ctx.service.command(ctx.player.token,{...request,choice:other}),/COMMAND_ID_REUSED/);
    assert.deepEqual(ctx.command(ctx.player.token,"claim",{matchId:match.id,choice:other}).run,expected);
    assert.equal(expected.stage,1);
    assert.equal(expected.history.length,1);
  } finally {ctx.cleanup();}
});

test("QA: expired guest identity cannot mutate or read its old assigned match", () => {
  const ctx=setup(1,weak);
  try {
    prepare(ctx,strong);
    const assigned=ctx.command(ctx.player.token,"match").match;
    ctx.reopen(data=>{
      const session=Object.values(data.sessions).find(s=>s.runId===ctx.player.view.online.id);
      session.expiresAt=Date.now()-1;
    });
    assert.throws(()=>ctx.service.view(ctx.player.token),/SESSION_EXPIRED/);
    assert.throws(()=>ctx.service.getMatch(ctx.player.token,assigned.id),/SESSION_EXPIRED/);
    assert.throws(()=>ctx.service.command(ctx.player.token,{commandId:"expired-claim",expectedRevision:0,kind:"settle",matchId:assigned.id}),/SESSION_EXPIRED/);
    assert.throws(()=>ctx.service.openSession(ctx.player.token),/SESSION_EXPIRED/,
      "reconnection must not silently discard an expired guest's progress");
    // Starting a new guest identity is a separate, explicit user action.
    const fresh=ctx.service.openSession();
    assert.notEqual(fresh.token,ctx.player.token);
    assert.notEqual(fresh.view.online.id,ctx.player.view.online.id);
    assert.equal(fresh.view.run.stage,0);
    assert.throws(()=>ctx.service.getMatch(fresh.token,assigned.id),/MATCH_NOT_OWNED/);
  } finally {ctx.cleanup();}
});

test("QA: malformed or forged placement payloads never modify authoritative inventory", () => {
  const ctx=setup(1,weak);
  try {
    prepare(ctx,strong);
    const before=structuredClone(ctx.service.view(ctx.player.token).run);
    const payload=()=>before.owned.map(p=>({id:p.id,x:p.x,y:p.y,w:p.w,h:p.h}));
    const mutations=[
      items=>items.slice(0,1),
      items=>[items[0],items[0]],
      items=>{items[0].id="p999999";return items;},
      items=>{items[0].type="yt_embed";return items;},
      items=>{items[0].appearanceId="appearance_"+"f".repeat(64);return items;},
      items=>{items[0].x=NaN;return items;},
      items=>{items[0].w=Infinity;return items;},
      items=>{items[0].x=null;return items;},
      items=>{items[0].x=-1;return items;},
      items=>{items[0].w=99999;return items;},
      items=>{items[0].routeTo=items[0].id;return items;},
      items=>{items[0].routeTo="p999999";return items;},
      items=>{items[0].routeTo={id:items[1].id};return items;},
      items=>{items[1].x=items[0].x;items[1].y=items[0].y;return items;},
    ];
    mutations.forEach((mutate,index)=>{
      assert.throws(()=>ctx.command(ctx.player.token,"placement",{items:mutate(payload())}),
        /INVALID_PLACEMENT|INVALID_COMMAND/,`malformed placement ${index}`);
      assert.deepEqual(ctx.service.view(ctx.player.token).run,before,`atomic rejection ${index}`);
    });
  } finally {ctx.cleanup();}
});

test("QA: explicit fusion cannot consume the same recipe inputs twice", () => {
  const ctx=setup(1,weak);
  try {
    // A legal, explicitly test-only mid-run checkpoint holding paid materials.
    ctx.reopen(data=>{
      const online=data.runs[ctx.player.view.online.id], run=R.newRun("campaign");
      run.stage=3;run.cash=20;
      run.shop=[{type:"go_search",sold:false},{type:"go_suggest",sold:false}];
      for(const type of ["go_search","go_suggest"])assert.equal(R.purchase(run,type).ok,true);
      assert.equal(R.move(run,run.owned[0].id,32,40),true);
      assert.equal(R.move(run,run.owned[1].id,32,84),true);
      assert.equal(R.validateRun(run),true); online.state=run;
    });
    const view=ctx.service.view(ctx.player.token), [a,b]=view.run.owned;
    assert.throws(()=>ctx.command(ctx.player.token,"fuse",{a:a.id,b:"p99999"}),/INVALID_FUSION/);
    assert.deepEqual(ctx.service.view(ctx.player.token).run,view.run);
    const body={commandId:"qa-fuse-fixed",expectedRevision:view.revision,kind:"fuse",a:a.id,b:b.id};
    const fused=ctx.service.command(ctx.player.token,body);
    assert.equal(fused.run.owned.length,1);assert.equal(fused.run.owned[0].type,"go_instant");
    assert.deepEqual(ctx.service.command(ctx.player.token,body).run,fused.run);
    assert.throws(()=>ctx.command(ctx.player.token,"fuse",{a:a.id,b:b.id}),/INVALID_FUSION/);
    assert.deepEqual(ctx.service.view(ctx.player.token).run,fused.run);
  } finally {ctx.cleanup();}
});
