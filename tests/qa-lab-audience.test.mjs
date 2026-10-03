import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import R from "../src/run.js";
import C from "../src/document.js";
import { createLabBattleController, mountAudienceLabControl } from "../src/lab-audience-control.js";
import { applyAudienceFeedback } from "../src/catalog/audience-feedback.js";
import { createFixtureRaid } from "../src/raid/index.js";
import { prepareRaidChallenge } from "../src/raid-challenge.js";
import * as S from "../src/story/session.js";
import { ArenaService } from "../server/arena/service.js";

const context={mode:"lab",storyActive:false,battleActive:false};
function build(mode="lab") {
  const run=R.newRun(mode);
  run.owned=[C.makeItem("yt_play","p1",24,24,560,280),C.makeItem("yt_sub","p2",592,24,184,40),C.makeItem("yt_ad","p3",592,80,160,48)];
  run.nextId=4;run.admin=[];
  assert.equal(R.validateRun(JSON.parse(JSON.stringify(run))),true);
  return run;
}
function dom() {
  const nodes=[];
  const doc={createElement(tag){const n={ownerDocument:doc,tagName:tag,children:[],events:{},attributes:{},value:"",append(...children){this.children.push(...children)},setAttribute(k,v){this.attributes[k]=v},addEventListener(k,v){this.events[k]=v}};nodes.push(n);return n;}};
  return {host:doc.createElement("div"),nodes};
}

test("QA: actual native selector handler enables a real lab battle and reset removes experimental feedback",()=>{
  const controller=createLabBattleController(),env=dom();let changes=0;
  mountAudienceLabControl(env.host,controller,()=>context,()=>changes++);
  const select=env.nodes.find(n=>n.tagName==="select");
  assert.equal(select.value,"standard");
  select.value="audience-v1";select.events.change();
  assert.equal(changes,1);
  const started=controller.start(build(),false);assert.equal(started.ok,true);
  assert.ok(started.battle.audience.player&&started.battle.audience.enemy);
  const events=[];
  for(let i=0;i<240&&!started.battle.result;i++)events.push(...started.battle.step(.05));
  assert.ok(events.some(e=>e.kind==="audience"),"native selection reaches live engine behavior");
  const children=[];
  const frame={ownerDocument:{createElement(){const n={setAttribute(){},remove(){children.splice(children.indexOf(n),1)}};return n;}},querySelector:()=>children[0]??null,insertBefore:n=>children.push(n)};
  applyAudienceFeedback(frame,started.battle.audience.player.snapshot(),started.battle.elapsed);
  assert.equal(children.length,1);
  controller.reset();
  const normal=controller.start(build(),false);assert.equal(normal.ok,true);
  assert.equal(normal.battle.audience,null);
  applyAudienceFeedback(frame,normal.battle.audience?.player.snapshot(),0);
  assert.equal(children.length,0);
});

test("QA: active laboratory selection cannot leak into campaign, story, URL challenge or saved data",async()=>{
  const controller=createLabBattleController();assert.equal(controller.choose("audience-v1",context),true);
  const campaign=controller.start(build("campaign"),false);assert.equal(campaign.ok,true);assert.equal(campaign.battle.audience,null);
  const forcedStory=controller.start(build(),true);assert.equal(forcedStory.ok,true);assert.equal(forcedStory.battle.audience,null);
  const urlRun=build(),bp=await createFixtureRaid("archive");
  const urlBattle=prepareRaidChallenge(urlRun,bp).battle;assert.equal(urlBattle.audience,null);
  let story=S.commandStorySession(S.createStorySession(),{type:"name-page",name:"Isolation QA"}).session;
  const run=build("campaign");run.page.name=story.story.pageName;
  const updated=S.updateStoryBuild(story,run);assert.equal(updated.ok,true);story=updated.session;
  const storyBattle=S.prepareStoryBattle(story,"qa-lab-isolation");assert.equal(storyBattle.ok,true);assert.equal(storyBattle.battle.audience,null);
  assert.doesNotMatch(JSON.stringify(urlRun),/audience-v1|audienceExperiment|experimentalRules/);
  assert.doesNotMatch(JSON.stringify(story),/audience-v1|audienceExperiment|experimentalRules/);
});

test("QA: authoritative online commands reject the local audience flag without changing a run",()=>{
  const dir=mkdtempSync(join(tmpdir(),"qa-lab-online-isolation-"));
  const server=new ArenaService({filePath:join(dir,"arena.json")});
  try {
    const session=server.openSession(),before=server.view(session.token);
    assert.throws(()=>server.command(session.token,{commandId:"qa-audience-injection",expectedRevision:before.revision,kind:"inbox",audienceExperiment:true}),/INVALID_COMMAND/);
    assert.deepEqual(server.view(session.token),before);
  } finally {server.close();rmSync(dir,{recursive:true,force:true});}
});
