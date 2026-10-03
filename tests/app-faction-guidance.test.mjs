import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import D from '../src/data.js';
const guidance=await import('../src/app-guidance.js');

test('only the five real legacy faction bonuses advertise a threshold and active state',()=>{
  assert.equal(typeof guidance.factionSetView,'function');
  for(const faction of ['youtube','amazon','google','retro','gov']) {
    const near=guidance.factionSetView(faction,2), active=guidance.factionSetView(faction,3);
    assert.equal(near.active,false);assert.equal(near.threshold,3);
    assert.match(near.nextHint,/セットまであと1$/);
    assert.match(near.status,/^3つで：/);
    assert.equal(active.active,true);assert.match(active.status,/^発動中：/);
    assert.equal(active.nextHint,undefined);
  }
});

test('experimental and template-only factions retain their no-bonus explanation without fake progress',()=>{
  assert.equal(typeof guidance.factionSetView,'function');
  const regular=new Set(['youtube','amazon','google','retro','gov']);
  for(const faction of [...Object.keys(D.FACTIONS).filter(f=>!regular.has(f)),'audio']) {
    for(const count of [0,2,3,9]) {
      const view=guidance.factionSetView(faction,count);
      assert.equal(view.active,false,faction);assert.equal(view.threshold,null,faction);
      assert.equal(view.nextHint,undefined,faction);
      assert.doesNotMatch(view.status,/発動中|3つで|セットまで/);
      assert.match(view.status,/補正なし|ボーナスなし/);
    }
  }
});

test('host consumes the faction presentation and includes the audio glyph (source contract)',()=>{
  const app=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
  assert.match(app,/factionSetView\(d\.faction, c\)\.nextHint/);
  assert.match(app,/factionSetView\(k, n\)/);
  assert.doesNotMatch(app,/if \(c === 2\) return/);
  assert.match(app,/audio:\s*"≈"/);
});

test('set celebration and publish/versus summaries only use actual active legacy bonuses',async()=>{
  assert.equal(typeof guidance.activeFactionSets,'function');
  const {default:C}=await import('../src/document.js');
  const {default:E}=await import('../src/engine.js');
  const board=[...Array(3)].flatMap((_,i)=>[
    C.makeItem('tw_post',`tw${i}`,24,i*200),C.makeItem('ab_link',`retro${i}`,720,i*80),
  ]);
  const info=E.analyze(board),before=structuredClone(info.counts);
  assert.deepEqual(guidance.activeFactionSets(info),[{faction:'retro',count:3}]);
  assert.deepEqual(info.counts,before);
  const app=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
  assert.ok((app.match(/activeFactionSets\(info\)/g)??[]).length>=3);
});

test('build catalogue inspection does not advertise an experimental triple as a set bonus',async()=>{
  const {inspect}=await import('../src/buildlab.js');
  const social=Array.from({length:3},(_,i)=>['tw_post',24,24+i*140,520,108]);
  const retro=Array.from({length:3},(_,i)=>['ab_link',24,24+i*64,192,32]);
  assert.deepEqual(inspect(social).sets,[]);
  assert.deepEqual(inspect(retro).sets,[`${D.FACTIONS.retro.name}×3`]);
});

test('generic build hints use the same supported-bonus policy (source contract)',()=>{
  const app=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
  const hints=app.slice(app.indexOf('function hints('),app.indexOf('/* ---------- Page frames'));
  assert.match(hints,/factionSetView\(f, n\)\.nextHint/);
  assert.doesNotMatch(hints,/if \(n === 2 && isFaction\(f\)\)/);
});
