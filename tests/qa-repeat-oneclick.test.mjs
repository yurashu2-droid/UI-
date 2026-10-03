import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import C from '../src/document.js';
import E from '../src/engine.js';
import {board} from '../src/buildlab.js';
import {completedFusionBuilds} from '../scripts/completed-fusion-builds.js';
import {OneClickAblationBattle} from '../scripts/experiments/oneclick-ablation.js';
const dials={repeatCadence:{freeCopies:2,extraWeight:.25}};
const items=n=>Array.from({length:n},(_,i)=>C.makeItem('am_oneclick','o'+i,16+(i%3)*300,16+Math.floor(i/3)*180,128,40));
const foe=()=>[C.makeItem('ab_heading','enemy',16,16,224,42)];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function run(B,a,b,options,dial){const battle=dial===undefined?new B(a,b,options):new B(a,b,options,dial),events=[];while(!battle.result)events.push(...battle.step(.05));return {battle,events};}

test('QA repeat candidate preserves full one/two-copy traces with held copies and paid-engine capacities',()=>{
 const source=completedFusionBuilds().find(b=>b.entrant.id==='four-oneclick').entrant;
 const target=completedFusionBuilds().find(b=>b.entrant.id==='native-link-defense').entrant;
 for(const count of [1,2])for(const hp of [220,440,660])for(const capacity of [12,26,35])for(const admin of [[],['server','backup']]){
  let kept=0;const a=board(source.layout.filter(p=>p[0]!=='am_oneclick'||kept++<count),'a');
  a.push(C.makeItem('am_oneclick','held-a',null,null));a.push(C.makeItem('am_oneclick','held-b',null,null));
  const b=board(target.layout,'b'),opts={playerHp:hp,enemyHp:hp,playerCapacity:capacity,enemyCapacity:capacity,playerAdmin:admin,enemyAdmin:admin};
  const canonical=run(E.Battle,a,b,opts),probe=run(OneClickAblationBattle,a,b,opts,dials);
  assert.deepEqual(probe.events,canonical.events);assert.deepEqual(probe.battle.result,canonical.battle.result);
  assert.deepEqual(probe.battle.metrics,canonical.battle.metrics);assert.deepEqual(probe.battle.player.parts,canonical.battle.player.parts);
  assert.equal(probe.battle.player.income,canonical.battle.player.income);assert.equal(probe.battle.player.load,canonical.battle.player.load);
 }
});

test('QA pagewide count slows all natural clocks above two while preserving unrelated clocks and stats',()=>{
 for(const count of [2,3,4,5,6]){
  const a=items(count);a.push(C.makeItem('am_buy','buy',16,600,128,40));a.push(C.makeItem('am_cart','cart',400,560,200,100));
  const opts={playerHp:1000,enemyHp:1000,playerCapacity:12,enemyCapacity:12,combatVersion:"combat-v3"};
  const canonical=new E.Battle(a,foe(),opts),probe=new OneClickAblationBattle(a,foe(),opts,dials),factor=1+.25*Math.max(0,count-2);
  assert.equal(probe.player.load,canonical.player.load);assert.equal(probe.player.lag,canonical.player.lag);
  for(const part of probe.player.parts){const ref=canonical.player.parts.find(p=>p.id===part.id);const f=part.type==='am_oneclick'?factor:1;
   assert.equal(part.period,ref.period*f);assert.equal(part.remaining,ref.remaining*f);for(const key of ['power','speed','pierce','charge','damage','earned'])assert.equal(part[key],ref[key]);}
 }
 const f=n=>n/(1+.25*Math.max(0,n-2));for(let n=1;n<100;n++)assert.ok(f(n+1)>f(n));
});

test('QA repeat cadence leaves queued conversion charge, spend, hit and income exactly canonical',()=>{
 for(const admin of [[],['cdn','backup']])for(const charge of [3,6,9]){
  const opts={playerHp:1000,enemyHp:1000,enemyAdmin:admin};
  const original=new E.Battle(items(4),foe(),opts),probe=new OneClickAblationBattle(items(4),foe(),opts,dials);
  for(const b of [original,probe]){b.player.income=40;const p=b.player.parts[0];p.charge=charge;b.pendingHits=[];b._convert(b.player,b.enemy,p);const queue=b.pendingHits;b.pendingHits=null;queue.forEach(f=>f());}
  assert.equal(probe.enemy.hp,original.enemy.hp);assert.equal(probe.player.parts[0].charge,0);assert.deepEqual(probe.metrics,original.metrics);assert.equal(probe.player.income,40);assert.deepEqual(probe.events,original.events);
 }
});

test('QA zero-conversion diagnostic preserves ledger and scales queued conversion exactly once',()=>{
 const opts={playerHp:1000,enemyHp:1000};
 for(const dial of [{noConversionDamage:true},{conversion15:true}]){
  const b=new OneClickAblationBattle(items(4),foe(),opts,dial),p=b.player.parts[0];b.player.income=40;p.charge=6;
  b.pendingHits=[];b._convert(b.player,b.enemy,p);const queue=b.pendingHits;b.pendingHits=null;queue.forEach(f=>f());
  assert.equal(b.enemy.hp,dial.noConversionDamage?1000:970);assert.equal(p.charge,0);assert.equal(b.metrics.player.spent,6);assert.equal(b.player.income,40);
 }
});

test('QA canonical and empty probe retain all forty frozen v2/v3 result and event hashes',()=>{
 for(const version of ['combat-v2','combat-v3']){const fixture=JSON.parse(fs.readFileSync(new URL(`./fixtures/${version}.json`,import.meta.url),'utf8'));
  for(const sample of fixture.cases)for(const [B,dial] of [[E.Battle,undefined],[OneClickAblationBattle,{}]]){
   assert.equal(hash(sample.input),sample.inputHash);
   const {battle:b,events}=run(B,sample.input.playerBoard,sample.input.enemyBoard,{...sample.input.options,combatVersion:version},dial);
   assert.deepEqual({result:b.result,ticks:b.ticks,playerHp:b.player.hp,enemyHp:b.enemy.hp,eventsHash:hash(events)},sample.expected,`${version}/${sample.key}`);
  }
 }
});

test('QA explicit v2/v3 one-through-four-copy legacy cases retain frozen event/result hashes',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/oneclick-legacy-v2-v3.json',import.meta.url),'utf8'));
 assert.equal(fixture.cases.length,16);
 for(const sample of fixture.cases){assert.equal(hash(sample.input),sample.inputHash);const {battle:b,events}=run(E.Battle,sample.input.playerBoard,sample.input.enemyBoard,sample.input.options);
  assert.deepEqual({result:b.result,ticks:b.ticks,playerHp:b.player.hp,enemyHp:b.enemy.hp,eventsHash:hash(events),metricsHash:hash(b.metrics)},sample.expected,sample.key);
 }
});
