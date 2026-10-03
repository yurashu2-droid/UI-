import test from 'node:test';
import assert from 'node:assert/strict';
import E from '../src/engine.js';
import C from '../src/document.js';
import D from '../src/data.js';
import R from '../src/run.js';
import { createLabBattleController } from '../src/lab-audience-control.js';
const mod=await import('../src/server-pressure.js').catch(()=>({}));
const item=(type,id,x=24,y=24)=>C.makeItem(type,id,x,y);
const options={experimentalRules:'server-pressure-v1',playerCapacity:26,enemyCapacity:26,playerHp:10000,enemyHp:10000};
function battle(defense=[],extra={}){return new E.Battle([item('go_jobs','jobs')],defense,{...options,...extra});}
function ready(b){const p=b.player.parts[0];p.charge=6;p.remaining=.05;return p;}
function advance(b,seconds){const events=[];for(let i=0;i<seconds*20;i++)events.push(...b.step(.05));return events;}

test('server-pressure panel is placed experimental UI and finite capacity is mandatory',()=>{
 assert.equal(D.PARTS.go_jobs?.kind,'server-pressure');assert.equal(D.PARTS.go_jobs.price,7);assert.equal(D.PARTS.go_jobs.load,3);
 assert.equal(D.PARTS.go_jobs.status,'experimental');
 assert.throws(()=>new E.Battle([],[],{experimentalRules:'server-pressure-v1'}),/finite positive/i);
 assert.throws(()=>battle([],{enemyCapacity:0}),/finite positive/i);
});
test('queue shares a cap, retains original expiries, and clears in five seconds of silence',()=>{
 assert.equal(typeof mod.ServerPressure,'function');const q=new mod.ServerPressure();
 assert.equal(q.accept(6,10),6);assert.equal(q.accept(6,20),6);assert.equal(q.accept(6,30),0);assert.equal(q.work,12);
 assert.equal(q.expire(109),0);assert.equal(q.expire(110),6);assert.equal(q.work,6);
 assert.equal(q.accept(6,110),6);assert.equal(q.expire(120),6);assert.equal(q.work,6);
 assert.equal(q.expire(210),6);assert.equal(q.work,0);
});
test('natural funded wave spends once, adds bounded work, and is not organic engagement or damage',()=>{
 const b=battle([item('ab_link','target')]);const p=ready(b);const ev=b.step(.05);
 assert.equal(p.charge,3);assert.equal(p.fires,1);assert.equal(b.metrics.player.spent,3);
 assert.equal(b.pressure.enemy.work,6);assert.equal(b.player.income,0);assert.equal(b.player.bots,0);assert.equal(p.damage,0);
 assert.ok(ev.some(e=>e.kind==='server-pressure'&&e.action==='accepted'&&e.value===6));
 assert.ok(!ev.some(e=>e.kind==='damage'&&e.id==='jobs'));
 const before=b.pressure.enemy.work;b._replay(b.player,b.enemy,p,p,1);assert.equal(b.pressure.enemy.work,before);assert.equal(p.charge,3);
});
test('CAPTCHA and placed reCAPTCHA reject work but still consume actual charge',()=>{
 for(const extra of [{enemyAdmin:['captcha']},{}]){const b=battle(extra.enemyAdmin?[]:[item('go_recaptcha','defense')],extra);ready(b);const ev=b.step(.05);
 assert.equal(b.metrics.player.spent,3);assert.equal(b.pressure.enemy.work,0);assert.equal(b.player.parts[0].charge,3);
 assert.ok(ev.some(e=>e.kind==='server-pressure'&&e.action==='blocked'&&e.reason==='captcha'));assert.equal(b.player.income,0);}
});
test('unfunded and canonical panel activations do nothing; old routing does not divert into jobs',()=>{
 const b=battle();advance(b,5);assert.equal(b.pressure.enemy.work,0);assert.equal(b.metrics.player.spent,0);
 const old=new E.Battle([item('go_jobs','jobs'),item('go_ads','ad',24,150)],[],{playerHp:1000,enemyHp:1000});
 const p=ready(old);const ev=old.step(.05);assert.equal(old.pressure,null);assert.equal(p.charge,6);assert.ok(!ev.some(e=>e.kind==='server-pressure'));
 old._earn(old.player,old.enemy,old.player.parts.find(p=>p.id==='ad'),3);assert.equal(p.charge,6);
});
test('income routes exclusively with two-wave storage and conserved surplus',()=>{
 const b=new E.Battle([item('go_jobs','jobs',24,24),item('go_ads','ad',24,150),item('am_oneclick','buy',350,150)],[],options);
 const ad=b.player.parts.find(p=>p.id==='ad'),jobs=b.player.parts.find(p=>p.id==='jobs'),buy=b.player.parts.find(p=>p.id==='buy');ad.routeTo='jobs';
 b._earn(b.player,b.enemy,ad,10);assert.equal(jobs.charge,6);assert.equal(buy.charge,0);assert.equal(b.metrics.player.routed,6);assert.equal(b.metrics.player.unconverted,4);assert.equal(b.player.income,10);
});
test('pressure rescales natural progress and recovers with no clock reset or burst; HP and CPU are distinct',()=>{
 const b=battle([item('yt_play','target')],{enemyCapacity:5,enemyAdmin:['server']});const p=ready(b),target=b.enemy.parts[0];
 const original=target.period,initial=target.remaining;b.step(.05);const fraction=(initial-.05)/original;
 assert.ok(b.enemy.lag>1);assert.ok(Math.abs(target.remaining/target.period-fraction)<1e-9);assert.equal(b.enemy.load,5);assert.equal(b.enemy.capacity,5);assert.equal(b.enemy.maxHp,12500);
 p.charge=0;p.remaining=100;const before=target.fires;advance(b,5);assert.equal(b.pressure.enemy.work,0);assert.equal(b.enemy.lag,1);assert.equal(target.period,original);assert.ok(target.fires-before<4);
 assert.ok(b.enemy.lagLoss>0);
});
test('spare CPU absorbs queued work and rate limit/cache are not work defenses',()=>{
 for(const type of ['go_cache','gov_rate_limit']){const b=battle([item(type,'defense')]);ready(b);b.step(.05);assert.equal(b.pressure.enemy.work,6);assert.equal(b.enemy.lag,1);assert.equal(b.enemy.hp,b.enemy.maxHp);}
});
test('duplicate sources share page cap and blocked overflow is still paid',()=>{
 const b=new E.Battle([0,1,2].map(i=>item('go_jobs','j'+i,24,24+i*150)),[],options);
 for(const p of b.player.parts){p.charge=3;p.remaining=.05;}const ev=b.step(.05);
 assert.equal(b.pressure.enemy.work,12);assert.equal(b.metrics.player.spent,9);assert.equal(ev.filter(e=>e.kind==='server-pressure'&&e.action==='blocked'&&e.reason==='cap').length,1);
});
test('lab selector gates finite symmetric fixture and never carries into campaign or story',()=>{
 const c=createLabBattleController(),ctx={mode:'lab',storyActive:false,battleActive:false};assert.equal(c.choose('server-pressure-v1',ctx),true);
 const run=(mode='lab')=>{const r=R.newRun(mode);r.owned=[item('ab_link','attack')];return r;};
 const b=c.start(run(),false).battle;assert.equal(b.experimentalRules,'server-pressure-v1');assert.equal(b.player.capacity,26);assert.equal(b.enemy.capacity,26);
 assert.equal(c.start(run('campaign'),false).battle.pressure,null);assert.equal(c.start(run(),true).battle.pressure,null);
 c.reset();assert.equal(c.start(run(),false).battle.pressure,null);
});

test('simultaneous funded waves are seat-symmetric, ID/order invariant, and frame-partition independent',()=>{
 const page=(prefix)=>[item('go_jobs',prefix+'j'),item('ab_counter',prefix+'counter',24,150),item('ab_nav',prefix+'nav',340,24)];
 const simulate=(renamed=false,reverse=false,chunks=[.05])=>{
  const a=page(renamed?'zz':'a'),d=page(renamed?'aa':'d');
  if(reverse){a.reverse();d.reverse();}
  const b=new E.Battle(a,d,{...options,playerCapacity:5,enemyCapacity:5});
  for(const side of [b.player,b.enemy]){const p=side.parts.find(p=>p.type==='go_jobs');p.charge=6;p.remaining=.05;}
  let i=0;while(b.ticks<200)b.step(chunks[i++%chunks.length]);
  const normalize=s=>({hp:s.hp,lag:s.lag,income:s.income,parts:s.parts.map(p=>({type:p.type,remaining:p.remaining,fires:p.fires,charge:p.charge,watch:p.watch}))});
  assert.deepEqual(normalize(b.player),normalize(b.enemy));
  assert.equal(b.player.parts.find(p=>p.type==='ab_counter').watch,0,'bot jobs never notify income counter');
  return {player:normalize(b.player),enemy:normalize(b.enemy),metrics:b.metrics,queued:b.pressure.player.work};
 };
 assert.deepEqual(simulate(),simulate(true,true));assert.deepEqual(simulate(),simulate(false,false,[.02,.03,.15]));
});
test('partial allowance is accepted without refreshing older work and expiry boundary admits a new wave',()=>{
 const q=new mod.ServerPressure();q.accept(5,0);assert.equal(q.accept(6,20),6);assert.equal(q.accept(6,40),1);
 assert.deepEqual(q.lots.map(l=>l.expires),[100,120,140]);assert.equal(q.expire(100),5);assert.equal(q.accept(6,100),5);
 assert.equal(q.expire(200),12);assert.equal(q.work,0);
});
test('combined base plus incoming overload uses one 12HP/s cap and backup still works',()=>{
 const b=battle(Array.from({length:6},(_,i)=>({...item('yt_play','target'+i),x:24+(i%3)*280,y:24+Math.floor(i/3)*180,w:240,h:144})),{enemyCapacity:.001,enemyHp:10,enemyAdmin:['backup']});ready(b);
 const ev=advance(b,.5);assert.equal(b.enemy.lagLoss,12);assert.equal(b.enemy.hp,3);assert.equal(b.enemy.adminState.restored,true);
 assert.equal(ev.filter(e=>e.kind==='lag'&&e.side==='enemy').length,1);
});
test('explicit tight/spare fixtures apply symmetric capacities and stale selections cannot change them',()=>{
 const c=createLabBattleController(),ctx={mode:'lab',storyActive:false,battleActive:false};
 for(const [variant,cap] of [['server-pressure-tight',15],['server-pressure-spare',38]]){
  assert.equal(c.choose(variant,ctx),true);assert.equal(c.choose('standard',{...ctx,battleActive:true}),false);
  const r=R.newRun('lab');r.owned=[item('ab_nav','a')];const b=c.start(r,false).battle;assert.equal(b.player.capacity,cap);assert.equal(b.enemy.capacity,cap);
 }
});

test('cache recharge and ordinary natural clocks preserve equal progress at intake and expiry',()=>{
 const b=battle([item('go_cache','cache'),item('ab_link','normal',400,24)],{enemyCapacity:3});const jobs=ready(b);
 const [cache,normal]=['cache','normal'].map(id=>b.enemy.parts.find(p=>p.id===id));
 for(const p of [cache,normal]){p.period=8;p.remaining=8;}
 const state=b.states.enemy.get('cache');state.cache=false;state.cacheAt=160;
 b.step(.05);jobs.charge=0;jobs.remaining=100;
 assert.ok(Math.abs(cache.remaining-normal.remaining)<1e-9);
 advance(b,5);assert.equal(b.pressure.enemy.work,0);assert.ok(Math.abs(cache.remaining-normal.remaining)<1e-9,`${cache.remaining} vs ${normal.remaining}`);
});

test('temporary pressure never changes independent administrator clock times',()=>{
 const b=battle([item('ab_link','target')],{enemyCapacity:1,enemyAdmin:['sns']});ready(b);b.enemy.hp=9000;
 const events=advance(b,8);assert.deepEqual(events.filter(e=>e.kind==='admin'&&e.side==='enemy'&&e.admin==='sns').map(e=>e.time),[3,8]);
});
