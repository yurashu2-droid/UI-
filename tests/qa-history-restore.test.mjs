import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../src/document.js';
import {VersionRestoreBattle} from '../scripts/experiments/version-restore.js';
import {historyFeedback} from '../src/catalog/history-render.js';
const config = {fraction:.5,cap:12,cooldown:5,includePierce:false,zeroClears:true,stopAtOverload:false};
const make = (extra=[], options={}) => new VersionRestoreBattle([
  C.makeItem('gov_notice','r1',24,104,280,112),
  C.makeItem('gov_notice','r2',312,104,280,112),
  ...extra,
], [C.makeItem('go_lucky','hit',24,24,208,44)],
{playerHp:100,enemyHp:100,...options}, {config:{...config},slots:{player:['r1','r2'],enemy:[]}});
const restore = f => f.player.parts.find(p=>p.id==='r1');

test('QA: native history and effect use the same half-open five-second expiry',()=>{
  for(const age of [99,100,101]) {
    const f=make(); f._hit(f.enemy,f.player,f.enemy.parts[0],20,0);f.ticks=age;
    const view=historyFeedback({sourceName:'hit',loss:20,recoverable:10,recordAt:0,expiresAt:100,consumed:false},age);
    f._activate(f.player,f.enemy,restore(f));
    assert.equal(f.player.hp>80,view.available,`age ${age}: UI and engine disagree`);
    assert.equal(f.player.hp,age<100?90:80);
  }
});

test('QA: 512 independent mixed hits conserve actual ordinary loss, caps, shield and CDN',()=>{
  let random=0x127ab;const next=()=>((random=(Math.imul(random,1664525)+1013904223)>>>0)/2**32);
  for(let i=0;i<512;i++){
    const cdn=i%2===0,limiter=i%3===0;
    const f=make(limiter?[C.makeItem('gov_rate_limit','limit',600,104,200,80)]:[],{playerHp:300,playerAdmin:cdn?['cdn']:[]});
    const shield=next()*40,value=next()*120,pierce=[0,.3,.5,1][i%4];
    f.player.shield=shield; const effective=value*(cdn?.88:1),direct=effective*pierce;
    const rejected=limiter?Math.min(4,effective-direct,24):0;
    const blocked=Math.min(shield,effective-direct-rejected);
    const ordinary=Math.max(0,effective-rejected-blocked-direct);
    const expectedGain=Math.min(12,ordinary*.5);
    f._hit(f.enemy,f.player,f.enemy.parts[0],value,pierce);
    const hp=f.player.hp;f._activate(f.player,f.enemy,restore(f));
    assert.ok(Math.abs(f.player.hp-hp-expectedGain)<1e-8,`hit ${i}`);
    const after=f.player.hp; f._activate(f.player,f.enemy,f.player.parts.find(p=>p.id==='r2'));
    assert.equal(f.player.hp,after);assert.ok(f.restoreStats.player.consumed<=1);
    assert.ok(f.restoreStats.player.restored<=f.restoreStats.player.eligibleTotal*.5+1e-8);
    assert.ok(f.player.hp<=300);
  }
});

test('QA: restoration preparation cannot consume damage from the same fixed tick',()=>{
  const f=make(),r=restore(f),attack=f.enemy.parts[0];
  r.remaining=.05;f.player.parts.find(p=>p.id==='r2').remaining=100;
  attack.remaining=.05;
  f.step(.05);const loss=100-f.player.hp;
  assert.ok(loss>0);assert.equal(r.healed,0);assert.equal(f.lastLoss.player.tick,1);
  r.remaining=.05;attack.remaining=100;f.step(.05);
  assert.equal(r.healed,Math.min(12,loss*.5));assert.equal(f.restoreStats.player.consumed,1);
});

test('QA: admin, lag and overload do not mint records, but post-45 UI hits may',()=>{
  const f=make([], {playerHp:2000,enemyHp:2000,playerCapacity:1});
  for(const side of [f.player,f.enemy])for(const p of side.parts)p.remaining=1000;
  f._hit(f.enemy,f.player,{damage:0},20,0,'troll');assert.equal(f.lastLoss.player,null);
  f.ticks=899;f.elapsed=44.95;f.step(.05);assert.equal(f.lastLoss.player,null);
  f.ticks=909;f.elapsed=45.45;f.step(.05);assert.equal(f.lastLoss.player,null);
  f._hit(f.enemy,f.player,f.enemy.parts[0],20,0);assert.equal(f.lastLoss.player.eligible,20);
  const before=f.player.hp;f._activate(f.player,f.enemy,restore(f));assert.equal(f.player.hp,before+10);
});

test('QA: fully piercing or shielded latest hit blocks stale burst reuse and death stays final',()=>{
  for(const mode of ['pierce','shield','lethal']) {
    const f=make();f._hit(f.enemy,f.player,f.enemy.parts[0],30,0);
    if(mode==='shield'){f.player.shield=40;f._hit(f.enemy,f.player,f.enemy.parts[0],20,0);}
    else f._hit(f.enemy,f.player,f.enemy.parts[0],mode==='lethal'?500:20,mode==='pierce'?1:0);
    const before=f.player.hp;f._activate(f.player,f.enemy,restore(f));
    assert.equal(f.player.hp,before);assert.equal(restore(f).fires,0);
  }
});

test('QA: history preview preserves text-only labels and clears availability across used, expired and empty states',async()=>{
  const {applyHistoryFeedback}=await import('../src/catalog/history-render.js');
  const fields=new Map(['.history-time','.history-source','.history-recovery','.history-expiry'].map(k=>[k,{textContent:''}]));
  const button={disabled:true,title:''},classes=new Set();
  const panel={classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}},querySelector(key){return key==='[data-ui="history-restore"]'?button:fields.get(key);}};
  const record={sourceName:'<img src=x onerror=bad()>',loss:20,recoverable:10,recordAt:0,expiresAt:100,consumed:false};
  applyHistoryFeedback(panel,historyFeedback(record,99));assert.equal(button.disabled,false);
  assert.equal(fields.get('.history-source').textContent,record.sourceName);
  for(const field of fields.values())assert.equal('innerHTML' in field,false);
  applyHistoryFeedback(panel,historyFeedback({...record,consumed:true},99));
  assert.equal(button.disabled,true);assert.equal(classes.has('is-history-used'),true);
  applyHistoryFeedback(panel,historyFeedback(record,100));assert.equal(button.disabled,true);
  assert.equal(classes.has('is-history-used'),false);assert.match(fields.get('.history-recovery').textContent,/期限切れ/);
  applyHistoryFeedback(panel,historyFeedback(null,101));assert.equal(button.disabled,true);
  assert.match(fields.get('.history-time').textContent,/履歴なし/);
});
