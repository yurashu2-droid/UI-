import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import R from "../src/run.js";
import { BUILDS } from "../src/builds.js";
import * as S from "../src/story/session.js";
import { STORY_STAGES, ARCHIVE_COORDINATES } from "../src/story/content.js";

const clone = value => JSON.parse(JSON.stringify(value));
function ok(result) {
  assert.equal(result.ok, true, result.error);
  assert.equal(S.validateStorySession(result.session), true);
  return clone(result.session);
}
function begun() {
  return ok(S.commandStorySession(S.createStorySession(), {type:"name-page",name:"QA story page"}));
}
function armed() {
  const session=begun();
  // Explicit test-only legal commerce/video/document build, not a claim of stage1
  // acquisition. It traverses authored battles without changing their enemies or HP.
  const layout=[...BUILDS.find(b=>b.id==="b_cart").layout,
    ["gov_pdf",24,552,184,48],["gov_pdf",216,552,184,48],["gov_font",408,552,208,36]];
  session.run.owned=layout.map(([type,x,y,w,h,shape,label],i)=>Object.assign(C.makeItem(type,`p${i+1}`,x,y,w,h),shape?{shape}:{},label?{label}:{}));
  session.run.nextId=session.run.owned.length+1; session.run.capacity=200;
  assert.equal(S.validateStorySession(session),true);
  return session;
}
function finish(battle) {
  for(let i=0;i<3000&&!battle.result;i++)battle.step(.05);
  assert.ok(battle.result);
}

test("QA: all authored story battles, guaranteed fusion and ending link survive atomic save reload",()=>{
  const values=new Map([["ui-raid-studio-v3-campaign","unchanged legacy"],["ui-raid-online","unchanged online"]]);
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const store=S.createStorySessionPersistence(storage);
  const save=session=>{assert.equal(store.save(session).ok,true);return clone(store.load().session);};
  let session=save(armed());
  for(const [index,stage] of STORY_STAGES.entries()) {
    assert.equal(session.story.stageId,stage.id);
    if(stage.id==="delivery") {
      assert.deepEqual(session.protectedKitIds.map(id=>session.run.owned.find(p=>p.id===id).type).sort(),["ab_mail","am_coupon"]);
      const build=clone(session.run);
      const mail=build.owned.find(p=>session.protectedKitIds.includes(p.id)&&p.type==="ab_mail");
      const coupon=build.owned.find(p=>session.protectedKitIds.includes(p.id)&&p.type==="am_coupon");
      assert.equal(R.move(build,mail.id,24,616,224,32),true);
      assert.equal(R.move(build,coupon.id,248,616,280,36),true);
      session=ok(S.updateStoryBuild(session,build));
      const fusion=S.rehearseStoryFusion(session);
      session=save(ok(fusion));
      assert.equal(session.story.fusionWitnessed,true);
      assert.equal(fusion.fusions[0].item.type,"am_newsletter");
    }
    for(const encounter of stage.encounters) {
      const id=`qa-real-${encounter.id}`, prepared=S.prepareStoryBattle(session,id);
      assert.equal(prepared.ok,true,prepared.error);
      assert.equal(prepared.battle.enemy.maxHp,encounter.enemy.admin?.includes("server") ? Math.round(encounter.enemy.hp*1.25) : encounter.enemy.hp);
      assert.deepEqual(prepared.battle.enemy.parts.map(p=>p.type).sort(),encounter.enemy.layout.map(row=>row[0]).sort());
      session=save(prepared.session);
      finish(prepared.battle);
      assert.equal(prepared.battle.result.winner,"player",encounter.id);
      const settled=S.settleStoryBattle(session,id,prepared.battle);
      session=save(ok(settled));
      assert.equal(settled.summary.enemy,encounter.enemy.pageName);
      const again=S.settleStoryBattle(session,id,prepared.battle);
      assert.deepEqual(again.session,session);
      session=save(ok(S.claimStoryReward(session,null)));
    }
    session=save(ok(S.commandStorySession(session,{type:"collect-record"})));
    if(index<7)session=save(ok(S.commandStorySession(session,{type:"advance-stage"})));
  }
  for(const command of [{type:"open-archive",url:ARCHIVE_COORDINATES.url,date:ARCHIVE_COORDINATES.date},{type:"restore-archive"},{type:"place-ending-link"},{type:"visit-restored-page"}]) {
    session=save(ok(S.commandStorySession(session,command)));
    assert.deepEqual(S.commandStorySession(session,command).session,session);
  }
  assert.equal(session.story.phase,"complete");
  assert.equal(session.story.restoredVisits,1);
  assert.equal(session.run.owned.filter(p=>p.id===session.endingLinkId).length,1);
  assert.equal(session.run.owned.find(p=>p.id===session.endingLinkId).label,"あの人のホームページ");
  assert.equal(values.get("ui-raid-studio-v3-campaign"),"unchanged legacy");
  assert.equal(values.get("ui-raid-online"),"unchanged online");
});

test("QA: canceled story match IDs cannot be reused and late outcomes cannot settle a retry",()=>{
  const started=S.prepareStoryBattle(armed(),"qa-cancelled");
  assert.equal(started.ok,true);
  const canceled=ok(S.commandStorySession(clone(started.session),{type:"cancel-encounter",matchId:"qa-cancelled"}));
  assert.equal(S.prepareStoryBattle(canceled,"qa-cancelled").ok,false);
  const retry=S.prepareStoryBattle(canceled,"qa-retry");assert.equal(retry.ok,true);
  finish(started.battle);
  const stale=S.settleStoryBattle(retry.session,"qa-cancelled",started.battle);
  assert.equal(stale.ok,false);
  assert.deepEqual(stale.session,retry.session);
});

test("QA: a full story inbox cannot report successful reward consumption with an invalid output save",()=>{
  const prepared=S.prepareStoryBattle(armed(),"qa-overflow");assert.equal(prepared.ok,true);
  finish(prepared.battle);
  const session=ok(S.settleStoryBattle(prepared.session,"qa-overflow",prepared.battle));
  session.run.owned=Array.from({length:64},(_,i)=>C.makeItem("ab_link",`p${i+1}`));session.run.nextId=65;
  // This is the explicit accepted-save limit, exercised as an imported boundary fixture.
  session.inbox=Array.from({length:128},(_,i)=>({id:`existing-${i}`,type:"ab_link",reason:"loot"}));
  assert.equal(S.validateStorySession(session),true);
  const before=clone(session), result=S.claimStoryReward(session,session.reward.choices[0]);
  assert.equal(result.ok,false,"a full inbox must leave the earned reward pending");
  assert.deepEqual(result.session,before);
  assert.deepEqual(session,before);
});

test("QA: a stale second story store cannot overwrite a newer earned battle state",()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const seed=S.createStorySessionPersistence(storage);
  assert.equal(seed.save(armed()).ok,true);
  const first=S.createStorySessionPersistence(storage), second=S.createStorySessionPersistence(storage);
  const initialA=clone(first.load().session), initialB=clone(second.load().session);
  const prepared=S.prepareStoryBattle(initialA,"qa-newer-earned-result");assert.equal(prepared.ok,true);
  finish(prepared.battle);
  const won=ok(S.settleStoryBattle(prepared.session,"qa-newer-earned-result",prepared.battle));
  assert.equal(first.save(won).ok,true);
  const currentRaw=values.get(S.STORY_SAVE_KEY);
  const staleBuild=clone(initialB.run);staleBuild.page.name="Stale editor name";
  const stale=ok(S.updateStoryBuild(initialB,staleBuild));
  assert.equal(second.save(stale).ok,false,"the second tab must reload instead of silently rolling back the first tab's earned state");
  assert.equal(values.get(S.STORY_SAVE_KEY),currentRaw);
  const refreshed=second.load();assert.equal(refreshed.status,"loaded");
  assert.deepEqual(refreshed.session.story.completedEncounters,won.story.completedEncounters);
  assert.equal(refreshed.session.run.cash,won.run.cash);
  const freshBuild=clone(refreshed.session.run);freshBuild.page.name="Refreshed editor name";
  assert.equal(second.save(ok(S.updateStoryBuild(refreshed.session,freshBuild))).ok,true);
  const saved=JSON.parse(values.get(S.STORY_SAVE_KEY));
  assert.deepEqual(saved.story.completedEncounters,won.story.completedEncounters);
  assert.equal(saved.run.cash,won.run.cash);
});
