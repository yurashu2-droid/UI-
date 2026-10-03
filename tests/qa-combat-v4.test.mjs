import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createHash} from 'node:crypto';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import D from '../src/data.js';import C from '../src/document.js';import E from '../src/engine.js';import R from '../src/run.js';
import {instantSearchSupport} from '../src/app-guidance.js';
import {navigationGuidance,renderNavigationGuidance} from '../src/navigation-guidance.js';
import {OneClickAblationBattle} from '../scripts/experiments/oneclick-ablation.js';
import {ArenaService} from '../server/arena/service.js';
import {verifyOnlineReplay,createOnlineReplayBattle} from '../src/online/replay.js';
import {arenaCatalogDefinition,fingerprintJson} from '../src/online/catalog.js';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const parts=n=>Array.from({length:n},(_,i)=>C.makeItem('am_oneclick','p'+i,16+(i%3)*300,16+Math.floor(i/3)*160,128,40));
const dial={repeatCadence:{freeCopies:2,extraWeight:.25}};
function finish(b){const events=[];while(!b.result)events.push(...b.step(.05));return{result:b.result,events,metrics:b.metrics,playerHp:b.player.hp,enemyHp:b.enemy.hp,playerIncome:b.player.income,enemyIncome:b.enemy.income};}

test('QA historical probe pins omitted and explicitly undefined versions to v3 exactly once',()=>{
 for(const options of [{},{combatVersion:undefined}]){const p=new OneClickAblationBattle(parts(4),[],options,dial);assert.equal(p.combatVersion,'combat-v3');assert.ok(Math.abs(p.player.parts[0].period-3.6)<1e-10);}
 assert.throws(()=>new OneClickAblationBattle(parts(4),[],{combatVersion:'combat-v4'},dial),/Historical/);
});

test('QA canonical v4 equals the audited v3 counterfactual for all frozen repeated-copy inputs',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/oneclick-legacy-v2-v3.json',import.meta.url),'utf8'));
 for(const sample of fixture.cases.filter(c=>c.input.options.combatVersion==='combat-v3')){const i=sample.input,p=new E.Battle(i.playerBoard,i.enemyBoard,{...i.options,combatVersion:'combat-v4'}),q=new OneClickAblationBattle(i.playerBoard,i.enemyBoard,i.options,dial);assert.deepEqual(p.player.parts,q.player.parts);assert.deepEqual(p.enemy.parts,q.enemy.parts);assert.deepEqual(finish(p),finish(q),sample.key);}
});

test('QA actual inspector markup reports battle-equivalent natural cadence in campaign and lab',()=>{
 const source=fs.readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');let code=source.slice(source.indexOf('function selectionCard('),source.indexOf('// Each site culture gets'));
 code=code.replace(/\)!\./g,').').replace(/function selectionCard\(sel: Item\[\], info: EngineInfo\)/,'function selectionCard(sel, info)');
 for(const mode of ['campaign','lab'])for(const n of [1,2,3,4])for(const active of [false,true]){
  const run=R.newRun(mode);run.owned=parts(n);run.capacity=8;
  const capacity=active?10:mode==='lab'?Infinity:8;const battle=active?new E.Battle(run.owned,[],{playerCapacity:10}):null,info=E.analyze(run.owned),selected=[run.owned[0]];
  const context=vm.createContext({navigationGuidance,renderNavigationGuidance,instantSearchSupport,D,P:D.PARTS,E,R,run,battle,storyActive:false,labPressureCapacity:()=>null,working:()=>true,esc:s=>String(s??''),KIND:{attack:'attack'},GROUP_BONUS:{},skinPicker:()=>'',connectText:()=>'',selected,info});
  vm.runInContext(code+';output=selectionCard(selected,info);',context);
  const expected=E.naturalPeriod(selected[0],info,capacity).toFixed(2)+'秒ごと';assert.ok(context.output.includes(expected),`${mode}/${n}/${active}: expected ${expected}`);
  if(n>=3)assert.match(context.output,/自然発動間隔 ×1\.(25|50)/);
 }
});

test('QA supported legacy replays require both the recorded version and unmodified catalogue/event hashes',async()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/oneclick-legacy-v2-v3.json',import.meta.url),'utf8')),catalogHash=await fingerprintJson(arenaCatalogDefinition());
 for(const sample of fixture.cases){const i=sample.input,o=i.options,m={combatVersion:o.combatVersion,catalogHash,player:{items:i.playerBoard,hp:o.playerHp,capacity:o.playerCapacity,admin:o.playerAdmin},opponent:{items:i.enemyBoard,hp:o.enemyHp,capacity:o.enemyCapacity,admin:o.enemyAdmin},winner:sample.expected.result.winner,finalTick:sample.expected.ticks,replayHash:sample.expected.eventsHash};
  assert.deepEqual(await verifyOnlineReplay(m),{ok:true});assert.equal(createOnlineReplayBattle(m).combatVersion,o.combatVersion);assert.equal((await verifyOnlineReplay({...m,replayHash:'0'.repeat(64)})).code,'REPLAY_MISMATCH');assert.equal((await verifyOnlineReplay({...m,catalogHash:'0'.repeat(64)})).code,'CATALOG_MISMATCH');
  if(sample.key.includes('/4-copies/'))assert.equal((await verifyOnlineReplay({...m,combatVersion:'combat-v4'})).code,'REPLAY_MISMATCH');
 }
 assert.equal((await verifyOnlineReplay({combatVersion:'combat-future'})).code,'RULES_MISMATCH');
});

test('QA v4 admission cannot match v3 snapshots while old pending settlement remains recoverable',()=>{
 const dir=mkdtempSync(join(tmpdir(),'qa-v4-upgrade-')),filePath=join(dir,'store.json');let arena=new ArenaService({filePath}),serial=0;
 const command=(s,kind,extra={})=>arena.command(s.token,{commandId:`qa-v4-${++serial}`,expectedRevision:arena.view(s.token).revision,kind,...extra});
 const prepare=s=>{const type=arena.view(s.token).run.shop.find(x=>D.PARTS[x.type]?.kind==='attack'&&D.PARTS[x.type].price<=10).type;command(s,'purchase',{type});const p=arena.view(s.token).run.owned[0];command(s,'placement',{items:[{id:p.id,x:16,y:16,w:p.w,h:p.h}]});command(s,'publish');};
 try{
  const old=arena.openSession();prepare(old);arena.close();let store=JSON.parse(fs.readFileSync(filePath,'utf8'));const id=old.view.online.id;store.runs[id].combatVersion='combat-v3';for(const s of Object.values(store.snapshots))if(s.ownerRunId===id)s.combatVersion='combat-v3';fs.writeFileSync(filePath,JSON.stringify(store));arena=new ArenaService({filePath});
  assert.equal(arena.view(old.token).online.requiresNewRun,true);assert.throws(()=>command(old,'publish'),/VERSION_MISMATCH/);
  const current=arena.openSession();prepare(current);assert.equal(command(current,'match').outcome.code,'NO_OPPONENT');
  const rival=arena.openSession();prepare(rival);const matched=command(current,'match');assert.equal(matched.match.combatVersion,'combat-v4');assert.equal(matched.match.opponent.combatVersion,'combat-v4');const pending=matched.match.id;
  arena.close();store=JSON.parse(fs.readFileSync(filePath,'utf8'));store.runs[current.view.online.id].combatVersion='combat-v3';store.matches[pending].combatVersion='combat-v3';fs.writeFileSync(filePath,JSON.stringify(store));arena=new ArenaService({filePath});
  assert.equal(arena.view(current.token).online.requiresNewRun,true);assert.throws(()=>command(current,'reroll'),/VERSION_MISMATCH/);const settled=command(current,'settle',{matchId:pending});assert.equal(settled.match.id,pending);if(settled.run.phase==='reward'){const claimed=command(current,'claim',{matchId:pending,choice:null});assert.equal(claimed.outcome.code,'CLAIMED');}const fresh=command(current,'new-run');assert.equal(fresh.online.requiresNewRun,false);assert.notEqual(fresh.online.id,current.view.online.id);
 }finally{arena.close();rmSync(dir,{recursive:true,force:true});}
});

test('QA a selected stash item never advertises an instantaneous natural attack',()=>{
 const source=fs.readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');let code=source.slice(source.indexOf('function selectionCard('),source.indexOf('// Each site culture gets')).replace(/\)!\./g,').').replace(/function selectionCard\(sel: Item\[\], info: EngineInfo\)/,'function selectionCard(sel, info)');
 const run=R.newRun('campaign');run.owned=[C.makeItem('am_oneclick','held',null,null)];
 const context=vm.createContext({navigationGuidance,renderNavigationGuidance,instantSearchSupport,D,P:D.PARTS,E,R,run,battle:null,storyActive:false,labPressureCapacity:()=>null,working:()=>false,esc:s=>String(s??''),KIND:{attack:'attack'},GROUP_BONUS:{},skinPicker:()=>'',connectText:()=>'',selected:run.owned,info:E.analyze(run.owned)});
 vm.runInContext(code+';output=selectionCard(selected,info);',context);assert.doesNotMatch(context.output,/0\.00秒ごと/);assert.match(context.output,/未配置/);
});

test('QA version-upgrade notice does not promise old snapshots remain in current matchmaking',()=>{
 const source=fs.readFileSync(new URL('../src/online/panel.ts',import.meta.url),'utf8'),start=source.indexOf('${s.phase === "complete"'),end=source.indexOf('\n       <h2>対戦履歴',start);
 assert.ok(start>=0&&end>start);const expression=source.slice(start,end).trim().slice(2,-1).replace(/view!/g,'view');
 const rendered=[];for(const requiresNewRun of [false,true]){
  const state={s:{phase:'complete',wins:3,history:[]},view:{online:{requiresNewRun,pendingMatchId:null}},busy:false};
  const ctx=vm.createContext({...state,locked:()=>false});vm.runInContext('output=('+expression+');',ctx);rendered.push(ctx.output);
  const blocked=vm.createContext({...state,locked:()=>true});vm.runInContext('output=('+expression+');',blocked);
  assert.match(blocked.output,/data-arena="new-run"\s+disabled/,'pending history locks replacement runs even after the network request stops');
 }
 assert.match(rendered[0],/保存ビルドは.*対戦候補に残ります/);assert.doesNotMatch(rendered[1],/対戦候補に残ります/);assert.match(rendered[1],/以前のルールの記録/);assert.match(rendered[1],/新しいランを始め/);
});
