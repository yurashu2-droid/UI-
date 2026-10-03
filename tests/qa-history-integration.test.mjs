import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import Effects from '../src/effects.js';
import {simulatePath} from '../scripts/progression-benchmark.js';
const item=(type,id,x=24,y=24,w,h)=>C.makeItem(type,id,x,y,w,h);
const make=(extra=[],options={})=>new E.Battle([item('go_history','h'),...extra],[item('go_lucky','a')],{playerHp:300,enemyHp:300,...options});
const history=f=>f.player.parts.find(p=>p.id==='h');
const panel=()=>{
 const fields=new Map(['.history-time','.history-source','.history-recovery','.history-expiry'].map(k=>[k,{textContent:''}]));
 const button={disabled:true,title:''},classes=new Set();
 const root={classList:{toggle(k,on){on?classes.add(k):classes.delete(k);}},querySelector(k){return k==='[data-ui="history-restore"]'?button:fields.get(k);}};
 return {fields,button,classes,host:{querySelector(k){return k==='.native-version-history'?root:null;}}};
};

test('QA: real history conserves 512 mixed ordinary damage cases and duplicate controls consume once',()=>{
 let seed=0x51109;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let i=0;i<512;i++){
  const cdn=i%2===0,limiter=i%3===0;
  const f=make([item('go_history','h2',312,24),...(limiter?[item('gov_rate_limit','limiter',600,24)]:[])],{playerAdmin:cdn?['cdn']:[]});
  const value=rng()*150,pierce=[0,.3,.5,1][i%4],shield=rng()*50;
  f.player.shield=shield;
  const net=value*(cdn?.88:1),direct=net*pierce,rejected=limiter?Math.min(4,net-direct,24):0;
  const ordinary=Math.max(0,net-direct-rejected-Math.min(shield,net-direct-rejected));
  f._hit(f.enemy,f.player,f.enemy.parts[0],value,pierce);const before=f.player.hp;
  f._activate(f.player,f.enemy,history(f));
  const expected=Math.min(12,ordinary*.5);
  assert.ok(Math.abs(f.player.hp-before-expected)<1e-8,`case${i}`);
  const healed=f.player.hp;f._activate(f.player,f.enemy,f.player.parts.find(p=>p.id==='h2'));
  assert.equal(f.player.hp,healed);assert.equal(f.player.parts.find(p=>p.id==='h2').fires,0);
  assert.ok(f.metrics.player.healing<=ordinary*.5+1e-8);
 }
});

test('QA: real engine history drives both native copies through record, consume, overwrite and exact expiry',()=>{
 const f=make([item('go_history','h2',312,24)]),views=[panel(),panel()];
 const sync=()=>{for(const v of views)Effects.prototype.syncHistory.call({},v.host,f,'player');};
 sync();assert.ok(views.every(v=>v.button.disabled));
 f._hit(f.enemy,f.player,f.enemy.parts[0],30,0);sync();
 assert.ok(views.every(v=>!v.button.disabled&&/12/.test(v.fields.get('.history-recovery').textContent)));
 f._activate(f.player,f.enemy,history(f));sync();
 assert.ok(views.every(v=>v.button.disabled&&v.classes.has('is-history-used')));
 f._hit(f.enemy,f.player,f.enemy.parts[0],2,0);sync();
 assert.ok(views.every(v=>!v.button.disabled&&!v.classes.has('is-history-used')));
 assert.equal(f.historyView('player').loss,2);
 f.ticks=100;sync();assert.ok(views.every(v=>v.button.disabled&&/期限切れ/.test(v.fields.get('.history-recovery').textContent)));
 const before=f.player.hp;f._activate(f.player,f.enemy,history(f));assert.equal(f.player.hp,before);
 f._hit(f.enemy,f.player,f.enemy.parts[0],20,1);sync();assert.equal(f.historyView('player'),null);
 assert.ok(views.every(v=>v.button.disabled&&/履歴なし/.test(v.fields.get('.history-time').textContent)));
});

test('QA: Google set modifies the actual first restoration clock and per-page histories stay single-use',()=>{
 for(const count of [1,2,3]){
  const f=make(Array.from({length:count-1},(_,i)=>item('go_history',`h${i}`,312+i*300,24)));
  const h=history(f),expected=h.period*.5*(count>=3?.75:1);
  assert.equal(h.remaining,expected);f._hit(f.enemy,f.player,f.enemy.parts[0],30,0);
  f.enemy.parts[0].remaining=100;
  const eventTick=Math.ceil((expected-1e-9)*20);let restores=0;
  for(let t=1;t<=eventTick;t++){
   const events=f.step(.05);restores+=events.filter(e=>e.kind==='history'&&e.action==='restore').length;
   if(t<eventTick)assert.equal(restores,0);
  }
  assert.equal(restores,1);assert.equal(f.player.hp,282);
  assert.equal(f.player.parts.reduce((s,p)=>s+p.healed,0),12);
 }
});

test('QA: real history preparation excludes same-tick loss and server-only loss, but keeps late UI provenance',()=>{
 const f=make([], {playerHp:1000,enemyHp:1000,playerCapacity:1}),h=history(f),a=f.enemy.parts[0];
 h.remaining=.05;a.remaining=.05;f.step(.05);
 const loss=1000-f.player.hp;assert.ok(loss>0);assert.equal(h.healed,0);assert.equal(f.historyView('player').recordAt,1);
 h.remaining=.05;a.remaining=100;f.step(.05);assert.equal(h.healed,Math.min(12,loss*.5));
 f.history.player.revision=null;h.remaining=1000;f.ticks=899;f.elapsed=44.95;f.step(.05);
 assert.equal(f.historyView('player'),null);
 f._hit(f.enemy,f.player,{damage:0},10,0,'troll');assert.equal(f.historyView('player'),null);
 f.ticks=909;f.elapsed=45.45;f.step(.05);assert.equal(f.historyView('player'),null);
 f._hit(f.enemy,f.player,a,20,0);assert.equal(f.historyView('player').loss,20);
});

test('QA: real history mirrors preserve complete traces across frame partitions and identifier relabels',()=>{
 const layout=[item('go_history','h'),item('go_result','r',400,24),item('go_lucky','a',24,180),item('am_wish','w',312,180)];
 const run=(dt,renamed)=>{
  const board=layout.map((p,i)=>({...p,id:renamed?`new${i}`:p.id}));
  const f=new E.Battle(board,board,{playerHp:500,enemyHp:500}),events=[];
  while(!f.result)events.push(...f.step(dt));
  assert.equal(f.player.hp,f.enemy.hp);assert.equal(f.result.winner,'draw');
  return {result:f.result,hp:f.player.hp,metrics:f.metrics,events:events.map(e=>Object.fromEntries(Object.entries(e).filter(([k])=>!['id','from','to'].includes(k))))};
 };
 assert.deepEqual(run(.05,false),run(.2,false));assert.deepEqual(run(.05,false),run(.07,true));
});

test('QA: hypothetical holdout acquisitions debit catalogue prices and never leak into ordinary offers',()=>{
 for(let seed=201;seed<=205;seed++)for(const candidatePart of ['go_history','gov_notice','am_wish']){
  const r=simulatePath(seed,'guard',{candidateOffer:true,candidatePart});
  let ledger=0;const inventory=new Map(),admins=new Set();
  const add=type=>inventory.set(type,(inventory.get(type)||0)+1);
  const count=map=>Object.fromEntries([...map].sort(([a],[b])=>a.localeCompare(b)));
  for(const round of r.rounds){
   assert.ok(!round.choices.includes('loot:go_history'));
   for(const choice of round.choices)if(choice!=='reroll'&&!choice.startsWith('loot:'))ledger+=choice.startsWith('plan:')?R.PLANS[choice.slice(5)].price:D.PARTS[choice].price;
   for(const choice of round.choices)if(choice!=='reroll'&&!choice.startsWith('loot:')&&!choice.startsWith('plan:'))add(choice);
   const actual=new Map();for(const p of round.board)actual.set(p.type,(actual.get(p.type)||0)+1);
   assert.deepEqual(count(actual),count(inventory),'paid path cannot inject a free UI');
   assert.deepEqual([...round.admin].sort(),[...admins].sort());
   for(const choice of round.choices.filter(c=>c.startsWith('loot:'))){const type=choice.slice(5);if(type.startsWith('admin:'))admins.add(type.slice(6));else if(type!=='null')add(type);}
   if(round.offeredCandidate){assert.ok(round.round>=D.PARTS[candidatePart].price-3);assert.ok(round.forgoneOffer);}
   assert.ok(round.board.filter(C.placed).every(p=>C.canPlace(round.board,p,p.x,p.y,p.w,p.h)));
  }
  assert.equal(ledger,r.purchases);assert.equal(r.cash,10+r.rewards-r.purchases-r.rerollCost);assert.equal(r.blocked,null);
 }
 for(let seed=201;seed<=210;seed++)for(let stage=0;stage<8;stage++){
  const r=R.newRun('campaign');r.seed=seed;r.stage=stage;
  assert.ok(R.market(r).every(p=>p.type!=='go_history'));

 }
});
