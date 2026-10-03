import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import {combatFeedback,applyCombatFeedback} from '../src/catalog/combat-feedback.js';

const captions=await import('../src/catalog/target-caption.js').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND')return {};
  throw error;
});
const caption=part=>{
  assert.equal(typeof captions.targetCaption,'function','native feedback needs a shared plain-text target caption');
  return captions.targetCaption(part);
};
const zip=(id,label,y=24)=>({...C.makeItem('gh_transfer',id,24,y,320,112),label});
const nodes=root=>[root,...(root.childNodes??[]).flatMap(nodes)];

test('target captions distinguish the labels already visible on same-type native parts',()=>{
  const a=zip('a','release-main.zip'),b=zip('b','release-docs.zip');
  assert.ok(V.markup(a).includes(a.label));assert.ok(V.markup(b).includes(b.label));
  assert.equal(caption(a),'release-main.zip（ZIPファイル転送）');
  assert.equal(caption(b),'release-docs.zip（ZIPファイル転送）');
});

test('missing, blank and canonical labels retain useful fallback without exposing IDs',()=>{
  assert.equal(caption(undefined),'');assert.equal(caption(null),'');
  for(const label of ['', ' \t\n ', D.PARTS.gh_transfer.name, undefined, null]){
    assert.equal(caption({...zip('private-id',label)}),D.PARTS.gh_transfer.name);
  }
  for(const type of ['missing-part','constructor','__proto__','toString']){
    assert.equal(caption({type,label:'',id:'private-id'}),'UI');
    assert.equal(caption({type,label:'local copy',id:'private-id'}),'local copy（UI）');
  }
});

test('captions flatten whitespace and remove controls and directional overrides',()=>{
  assert.equal(caption(zip('a',' \t資料\n  A\r\n.zip  ')),'資料 A .zip（ZIPファイル転送）');
  assert.equal(caption(zip('a','\u0000\u0007\u007f\u0080\u009f\u061c\u200e\u200f\u202a資料\u202e.zip\u202c\u2066\u2069')),'資料.zip（ZIPファイル転送）');
  assert.equal(caption(zip('a','👩‍💻の資料.zip')),'👩‍💻の資料.zip（ZIPファイル転送）');
  assert.equal(caption(zip('a','\u0000\u202e\u2069')),'ZIPファイル転送');
});

test('all accepted eighty-unit labels keep their distinguishing suffix',()=>{
  const prefix='資料'.repeat(39);
  for(const suffix of ['甲A','乙B']){
    const label=prefix+suffix;
    assert.equal(label.length,80);
    assert.equal(caption(zip('a',label)),`${label}（ZIPファイル転送）`);
  }
});

test('out-of-contract labels are bounded without splitting Unicode code points',()=>{
  const label='🚀'.repeat(90),part=Object.freeze(zip('a',label));
  const result=caption(part),visible=result.slice(0,result.indexOf('（'));
  assert.equal(visible,'🚀'.repeat(79)+'…');
  assert.equal(Array.from(visible).length,80);
  assert.equal(result.endsWith('（ZIPファイル転送）'),true);
  assert.equal(part.label,label);
});

test('untrusted labels remain plain text through the existing native feedback sink',()=>{
  const label='<img src=x onerror="bad()"> & \'copy\'',part=zip('a',label),name=caption(part);
  assert.equal(name,`${label}（ZIPファイル転送）`);
  const field={textContent:'',title:''};
  const host={classList:{toggle(){}},querySelector(selector){return selector==='.cache-target'?field:null;}};
  applyCombatFeedback(host,combatFeedback('go_cache',0,0,{cache:true,cacheAt:0,coveredUntil:0,immuneUntil:0},name,0));
  assert.equal(field.textContent,`対象：${name}`);assert.equal(field.title,`対象：${name}`);
  assert.equal('innerHTML' in field,false);
  assert.equal(nodes(parseFragment(V.markup(part))).some(node=>node.tagName==='img'),false);
});

test('legal duplicate-target battles name the exact protected ZIP without changing combat',()=>{
  for(const cacheY of [24,300]){
    const board=[zip('upper-zip','release-main.zip'),zip('lower-zip','release-docs.zip',300),C.makeItem('go_cache','cache',360,cacheY)];
    const enemy=[C.makeItem('am_newsletter','news',24,24,280,60),C.makeItem('ad_popup','pop',24,100,280,88)];
    for(const items of [board,enemy])for(const part of items)assert.equal(C.canPlace(items,part,part.x,part.y),true,part.id);
    const original=JSON.stringify({board,enemy});
    const battle=new E.Battle(board,enemy,{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12});
    const cacheState=battle.states.player.get('cache'),popupState=battle.states.enemy.get('pop');
    const expectedId=cacheY===24?'upper-zip':'lower-zip';
    assert.equal(cacheState.target,expectedId);assert.equal(popupState.target,'upper-zip');
    const target=battle.player.parts.find(part=>part.id===cacheState.target);
    const snapshot=JSON.stringify({parts:battle.player.parts,state:[...battle.states.player],ticks:battle.ticks});
    const feedback=combatFeedback('go_cache',0,battle.ticks,cacheState,caption(target),battle.player.shield);
    assert.equal(feedback.targetText,`対象：${cacheY===24?'release-main.zip':'release-docs.zip'}（ZIPファイル転送）`);
    assert.equal(JSON.stringify({parts:battle.player.parts,state:[...battle.states.player],ticks:battle.ticks}),snapshot);
    const events=[];for(let tick=0;tick<480;tick++)events.push(...battle.step(.05));
    const controls=events.filter(event=>event.kind==='control'&&['blocked','cover'].includes(event.action));
    assert.ok(controls.every(event=>event.to==='upper-zip'));
    assert.deepEqual(controls.map(event=>[event.action,event.time]),cacheY===24?[
      ['blocked',3],['cover',9],['blocked',15],['cover',21],
    ]:[['cover',3],['cover',9],['cover',15],['cover',21]]);
    assert.equal(battle.metrics.player.prevented,cacheY===24?2:0);
    assert.equal(JSON.stringify({board,enemy}),original);
  }
});
