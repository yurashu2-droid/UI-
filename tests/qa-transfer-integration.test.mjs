import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import Effects from '../src/effects.js';

const item=(t,id,x,y,w,h)=>C.makeItem(t,id,x,y,w,h);
test('QA: latest ZIP fire replaces the previous completion/reuse display without changing progress',()=>{
 const classes=new Set(),node={classList:{add(c){classes.add(c);},remove(c){classes.delete(c);}},querySelector(){throw new Error('activation must not change native progress');}},fx={flag(el,c){el.classList.add(c);}};
 Effects.prototype.act.call(fx,node,'gh_transfer',true);assert.ok(classes.has('is-transfer-reused'));
 Effects.prototype.act.call(fx,node,'gh_transfer',false);assert.ok(classes.has('is-transfer-complete'));assert.equal(classes.has('is-transfer-reused'),false,'old reuse must not mask the newer natural completion');
 Effects.prototype.act.call(fx,node,'gh_transfer',true);assert.ok(classes.has('is-transfer-reused'));assert.equal(classes.has('is-transfer-complete'),false);
});

test('QA: saved transfer retains its real geometry and native markup but never enters production offers',()=>{
 const r=R.newRun('lab');r.owned=[item('gh_transfer','p1',24,24,320,112)];r.nextId=2;
 const saved=JSON.parse(JSON.stringify(r));assert.equal(R.validateRun(saved),true);assert.deepEqual(saved.owned[0],r.owned[0]);assert.ok(C.canPlace(saved.owned,saved.owned[0],24,24,320,112));
 assert.equal(V.markup(saved.owned[0],{theme:'forge'}),V.markup(saved.owned[0],{theme:'mixed'}));
 assert.match(V.markup(saved.owned[0]),/native-transfer/);assert.match(V.markup(saved.owned[0]),/実ファイルなし/);
 for(let seed=501;seed<=520;seed++)for(let stage=0;stage<8;stage++){const run=R.newRun('campaign');run.seed=seed;run.stage=stage;assert.ok(R.market(run).every(p=>p.type!=='gh_transfer'));if(seed===501){const battle=new E.Battle(r.owned,[],{playerHp:440,enemyHp:30});while(!battle.result)battle.step(.05);run.phase='battle';assert.equal(R.settleBattle(run,battle).ok,true);assert.ok(run.pending.loot.every(t=>t!=='gh_transfer'),'real settlement offer filter');}}
});

test('QA: real Effects.update and fire events project ZIP clock, cover and echo while revenue counts only originals',()=>{
 const board=[item('gh_transfer','zip',24,24,416,112),item('go_page','page',24,148,320,36),item('go_ads','ad',456,24,240,88)];
 const b=new E.Battle(board,[],{playerHp:10000,enemyHp:10000,playerCapacity:35,enemyCapacity:35});
 const p=b.player.parts.find(p=>p.id==='zip'),classes=new Set(),progress={value:0},percent={textContent:''},status={textContent:''};
 const cls={add(c){classes.add(c);},remove(c){classes.delete(c);},toggle(c,v){v?classes.add(c):classes.delete(c);}};
 const cover={querySelector(){return null;},style:{setProperty(){}},remove(){}},panel={querySelector(s){return s==='progress'?progress:s==='.transfer-percent'?percent:s==='.transfer-state'?status:null;}};
 const host={classList:cls,style:{setProperty(){}},querySelector(s){return s==='.native-transfer'?panel:s===':scope > .native-popup-cover'?cover:null;}};
 const frame={classList:{toggle(){}},querySelector(){return null;}};
 const beforeDocument=globalThis.document;
 globalThis.document={querySelector(s){return s==='#player-frame'?frame:null;}};
 const fx={part(side,id){return side==='player'&&id==='zip'?host:null;},syncTransfer:Effects.prototype.syncTransfer,act:Effects.prototype.act,flag(el,c){el.classList.add(c);},pulse(){},renderLog(){}};
 const close=(a,z)=>assert.ok(Math.abs(a-z)<1e-8,`${a} vs ${z}`);let frozen;
 try{
  Effects.prototype.update.call(fx,b);assert.equal(progress.value,.5);
  for(let i=0;i<640;i++){
   if(b.ticks===100){b.states.player.get('zip').coveredUntil=120;frozen=p.remaining;}
   const events=b.step(.05);
   for(const e of events.filter(e=>e.kind==='fire'&&e.id==='zip')){const clock=p.remaining;Effects.prototype.emit.call(fx,e,b);assert.equal(p.remaining,clock,'native feedback cannot reset the engine clock');assert.ok(classes.has(e.echo?'is-transfer-reused':'is-transfer-complete'));}
   Effects.prototype.update.call(fx,b);close(progress.value,Math.max(0,Math.min(1,1-p.remaining/p.period)));
   if(b.ticks>100&&b.ticks<=120){assert.equal(p.remaining,frozen);assert.equal(classes.has('is-covered'),b.ticks<120);}
  }
  assert.equal(p.fires,4);assert.equal(b.metrics.player.naturalAttacks,4);assert.equal(b.metrics.player.replays,4);assert.equal(b.player.income,4,'text ads can earn for natural ZIP attacks, never for copies');assert.equal(p.damage,180);
 }finally{globalThis.document=beforeDocument;}
});
