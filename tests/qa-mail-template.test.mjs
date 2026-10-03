import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../src/document.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';

const runFor=()=>{
 const template=SITE_TEMPLATES.find(t=>t.id==='site_gmail');
 assert.ok(template,'POSTROOM must be registered before its actual run is tested');
 return R.newRun('lab',template.id);
};
const part=(run,type)=>run.owned.find(p=>p.type===type);
const battle=(board,enemy=[])=>new E.Battle(board,enemy,{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12});
const trace=(board,enemy=[])=>{
 const b=battle(board,enemy),events=[];
 for(let tick=0;tick<480;tick++)events.push(...b.step(.05));
 return {b,events};
};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('QA: mail translation movement rejects collisions and restores exactly after repeated move, stash and reload',()=>{
 const run=runFor(),translator=part(run,'go_translate'),original=JSON.parse(JSON.stringify(run));
 const baseline=trace(run.owned),ownedIds=run.owned.map(p=>p.id);
 assert.equal(R.move(run,translator.id,592,200),false,'article collision must not change the source layout');
 assert.deepEqual(run,original);
 for(let repeat=0;repeat<2;repeat++)assert.equal(R.move(run,translator.id,216,136),true);
 const moved=JSON.parse(JSON.stringify(run));
 assert.equal(R.validateRun(moved),true);
 assert.deepEqual(moved.owned.map(p=>p.id),ownedIds);
 assert.equal(moved.page.theme,'mailroom');assert.equal(moved.page.templateId,'site_gmail');
 assert.equal(R.move(moved,translator.id,null,null),true);
 assert.equal(R.validateRun(moved),true);
 assert.deepEqual(moved.owned.filter(p=>p.x===null).map(p=>p.id),[translator.id],'inert pane cannot stash its contents with the translator');
 assert.deepEqual(E.analyze(moved.owned).relations.filter(r=>r.from===translator.id),[]);
 assert.equal(R.move(moved,translator.id,592,152),true);
 assert.deepEqual(moved.owned,original.owned);
 assert.deepEqual(trace(moved.owned).events,baseline.events);
 assert.deepEqual([moved.cash,moved.capacity,moved.admin],[original.cash,original.capacity,original.admin]);
});

test('QA: mail references replay only an existing natural article packet without compounding or piercing',()=>{
 for(const alternate of [false,true]){
  const run=runFor(),article=part(run,'wk_article'),reference=part(run,'wk_reference');
  if(alternate)assert.equal(R.move(run,part(run,'go_translate').id,216,136),true);
  const b=battle(run.owned),events=[];
  assert.equal(b.states.player.get(article.id).payload,undefined,'a decorative received message is not a combat payload');
  let natural=0,replayed=0,latestNatural;
  for(let tick=0;tick<480;tick++){
   const emitted=b.step(.05);events.push(...emitted);
   const fire=emitted.find(e=>e.kind==='fire'&&e.side==='player'&&e.id===article.id);
   if(!fire)continue;
   const damage=emitted.find(e=>e.kind==='damage'&&e.side==='player'&&e.id===article.id);
   assert.ok(damage);assert.equal(damage.pierce,false);
   if(fire.echo){
    assert.ok(latestNatural,'reference cannot invent the first article packet');
    assert.ok(emitted.some(e=>e.kind==='echo'&&e.id===reference.id&&e.to===article.id));
    near(damage.value,Math.round(latestNatural.value*.35*10)/10);
    assert.deepEqual(b.states.player.get(article.id).payload,latestNatural,'replay must not overwrite the last natural payload');
    replayed++;
   }else{
    latestNatural={...b.states.player.get(article.id).payload};
    near(damage.value,alternate?10:12.5);natural++;
   }
  }
  assert.deepEqual([natural,replayed,b.metrics.player.naturalAttacks],[5,4,57]);
  assert.deepEqual([b.player.load,b.player.lag,b.player.income,b.player.shield,b.metrics.player.healing,b.metrics.player.spent],[12,1,0,0,0,0]);
  const withoutSource=run.owned.map(p=>p.id===article.id?{...p,x:null,y:null}:p);
  const missing=trace(withoutSource);
  assert.equal(missing.events.some(e=>e.kind==='echo'),false,'a displayed reading-pane or reference label cannot substitute for its stashed article');
 }
});

test('QA: a genuinely financed popup suppresses covered mail replays and their later release uses the actual article',()=>{
 const run=runFor(),article=part(run,'wk_article'),reference=part(run,'wk_reference');
 const opponent=[C.makeItem('am_newsletter','income',24,24,280,60),C.makeItem('ad_popup','cover',24,100,280,88)];
 const {b,events}=trace(run.owned,opponent);
 assert.equal(b.states.enemy.get('cover').target,article.id);
 const covers=events.filter(e=>e.kind==='control'&&e.action==='cover');
 assert.deepEqual(covers.map(e=>[e.time,e.to]),[[3,article.id],[9,article.id],[15,article.id],[21,article.id]]);
 const echoes=events.filter(e=>e.kind==='echo'&&e.id===reference.id);
 assert.deepEqual(echoes.map(e=>e.time),[16.25,22.75]);
 assert.ok(echoes.every(e=>e.to===article.id));
 assert.ok(echoes.every(e=>!covers.some(c=>e.time>=c.time&&e.time<c.time+c.duration)));
 const replayPackets=echoes.map(e=>events.find(p=>p.kind==='damage'&&p.id===article.id&&p.time===e.time));
 assert.ok(replayPackets.every(p=>p.value===4.4&&p.pierce===false));
 assert.equal(b.metrics.player.replays,2);assert.equal(b.player.income,0);
});

test('QA: mail chrome and labels grant no hidden resources, grouping, or theme-specific combat effects',()=>{
 const run=runFor(),plain=JSON.parse(JSON.stringify(run));
 plain.page={name:'plain control',theme:'mixed'};
 for(const p of plain.owned)p.label='';
 assert.equal(R.capacity(run),R.capacity(R.newRun('lab')));assert.equal(run.capacity,undefined);
 assert.equal(run.cash,0);assert.deepEqual(run.admin,[]);
 assert.equal(run.owned.length,7);
 assert.deepEqual(E.analyze(run.owned).parents,{});assert.deepEqual(E.analyze(run.owned).groups,[]);
 assert.deepEqual(trace(run.owned).events,trace(plain.owned).events);
 assert.deepEqual(trace(run.owned).b.metrics,trace(plain.owned).b.metrics);
 assert.deepEqual(R.fuse(run),[],'fixed conversation labels do not provide a fusion ingredient');
});
