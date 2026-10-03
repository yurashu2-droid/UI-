import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import C from '../src/document.js';
import E from '../src/engine.js';
import Effects from '../src/effects.js';
import {historyFeedback,applyHistoryFeedback} from '../src/catalog/history-render.js';

const record={sourceName:'保存する変更',loss:20,recoverable:10,recordAt:0,expiresAt:100,consumed:false};
const states=['empty','recoverable','used','expired','unneeded'];
function panel(){
  const fields=new Map(['.history-time','.history-source','.history-recovery','.history-expiry'].map(key=>[key,{textContent:''}]));
  const button={disabled:true,title:''},classes=new Set(),changes=[];
  const root={classList:{toggle(name,on){if(classes.has(name)!==on)changes.push([name,on]);on?classes.add(name):classes.delete(name);}},querySelector(key){return key==='[data-ui="history-restore"]'?button:fields.get(key);}};
  return {root,fields,button,classes,changes,host:{querySelector(selector){return selector==='.native-version-history'?root:null;}}};
}
const apply=(p,r=record,tick=0)=>applyHistoryFeedback(p.root,historyFeedback(r,tick));
const assertState=(p,state)=>{
  for(const s of states)assert.equal(p.classes.has(`is-history-${s}`),s===state,`exclusive ${s} for ${state}`);
};

// A missing or misclassified lifecycle state must fail, independently of the strings.
test('history projection gives exact lifecycle reasons without changing eligibility or wording',()=>{
  for(const [r,tick,state] of [
    [null,0,'empty'],[record,99,'recoverable'],[record,100,'expired'],
    [{...record,consumed:true},100,'used'],[{...record,recoverable:0},99,'unneeded'],
  ]){
    const view=historyFeedback(r,tick);
    assert.equal(view.state,state);assert.equal(view.available,state==='recoverable');
  }
  assert.match(historyFeedback(record,99).status,/復元可能 \+10/);
  assert.match(historyFeedback(record,100).status,/期限切れ/);
  assert.match(historyFeedback({...record,recoverable:0},99).status,/回復不要/);
});

test('first history observation never implies a prior restore or expiry transition',()=>{
  for(const [r,tick,state] of [[null,0,'empty'],[record,99,'recoverable'],[record,100,'expired'],[{...record,consumed:true},0,'used'],[{...record,recoverable:0},0,'unneeded']]){
    const p=panel();apply(p,r,tick);assertState(p,state);
    assert.equal(p.classes.has('is-history-closing'),false);
  }
});

for(const [name,next,tick] of [['used',{...record,consumed:true},20],['expired',record,100],['unneeded',{...record,recoverable:0},20]]){
  test(`observed recoverable to ${name} contracts only once across repeated frame updates`,()=>{
    const p=panel();apply(p,record,1);apply(p,next,tick);assertState(p,name);
    assert.equal(p.classes.has('is-history-closing'),true);assert.equal(p.button.disabled,true);
    const changes=p.changes.length;
    for(let frame=0;frame<120;frame++)apply(p,next,tick);
    assert.equal(p.changes.length,changes,'unchanged frames must not remove or re-add the animation class');
  });
}

test('new recoverable revisions cancel old contractions without a fake refill or consumption',()=>{
  const p=panel();apply(p);apply(p,{...record,consumed:true},20);
  assert.equal(p.classes.has('is-history-closing'),true);
  const newer={...record,sourceName:'<img src=x onerror=bad()>',recordAt:30,expiresAt:130,loss:4,recoverable:2};
  apply(p,newer,30);assertState(p,'recoverable');assert.equal(p.classes.has('is-history-closing'),false);
  assert.equal(p.button.disabled,false);assert.equal(p.fields.get('.history-source').textContent,newer.sourceName);
  assert.match(p.fields.get('.history-recovery').textContent,/復元可能 \+2/);
  assert.equal('innerHTML' in p.fields.get('.history-source'),false);
  const changes=p.changes.length;
  apply(p,{...newer,recordAt:31,expiresAt:131,loss:6,recoverable:3},31);
  assert.equal(p.changes.length,changes);assert.match(p.fields.get('.history-recovery').textContent,/復元可能 \+3/);
  apply(p,null,32);assertState(p,'empty');assert.equal(p.classes.has('is-history-closing'),false);
});

test('shared real engine record drives both history markers through consumption, healing and exact expiry',()=>{
  const battle=new E.Battle([C.makeItem('go_history','h1',24,24),C.makeItem('go_history','h2',312,24),C.makeItem('gov_notice','heal',24,180)],[C.makeItem('go_lucky','attack',24,24)],{playerHp:300,enemyHp:300});
  const views=[panel(),panel()],sync=()=>views.forEach(p=>Effects.prototype.syncHistory.call({},p.host,battle,'player'));
  const hit=value=>battle._hit(battle.enemy,battle.player,battle.enemy.parts[0],value,0);
  sync();views.forEach(p=>assertState(p,'empty'));
  hit(20);sync();views.forEach(p=>assertState(p,'recoverable'));
  battle._activate(battle.player,battle.enemy,battle.player.parts[0]);sync();views.forEach(p=>assertState(p,'used'));
  hit(2);sync();views.forEach(p=>assertState(p,'recoverable'));
  for(let i=0;i<5;i++)battle._activate(battle.player,battle.enemy,battle.player.parts.find(p=>p.id==='heal'));
  assert.equal(battle.player.hp,battle.player.maxHp);sync();views.forEach(p=>assertState(p,'unneeded'));
  hit(10);sync();views.forEach(p=>assertState(p,'recoverable'));
  battle.ticks=99;sync();views.forEach(p=>assertState(p,'recoverable'));
  battle.ticks=100;sync();views.forEach(p=>assertState(p,'expired'));
  assert.equal(battle.historyView('player').consumed,false,'expiry must not be mislabeled as consumption');
});

// Declared stylesheet contract only; browser timing, pixels and playback remain unverified.
test('history declares shape transitions and reduced-motion overrides without replay keyframes',()=>{
  const css=readFileSync(new URL('../src/catalog/history.css',import.meta.url),'utf8');
  assert.match(css,/\.history-entry>i:before\s*\{[^}]*height:\s*7px/);
  assert.match(css,/\.native-version-history:is\([^)]*is-history-expired[^)]*\) \.history-entry>i:before\s*\{[^}]*height:\s*2px/);
  assert.match(css,/\.history-entry>i:after\s*\{[^}]*height:\s*0/);
  assert.match(css,/\.is-history-recoverable \.history-entry>i:after\s*\{[^}]*height:\s*28px/);
  assert.match(css,/\.is-history-closing \.history-entry>i:before\s*\{[^}]*transition:[^}]*height\s+80ms/);
  assert.match(css,/\.is-history-closing \.history-entry>i:after\s*\{[^}]*transition:[^}]*height\s+220ms/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^]*?\.is-history-closing[^]*?transition:\s*none/);
  for(const state of ['expired','unneeded'])assert.match(css,new RegExp(`\\.is-history-${state}[^}]*\\.history-recovery[^}]*color:\\s*#616f7b`));
  assert.doesNotMatch(css,/@keyframes|z-index|position:\s*fixed|opacity:/);
});
