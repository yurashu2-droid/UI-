import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import D from '../src/data.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {RELEASE_TEMPLATES} from '../src/catalog/releases-templates.js';
import {RELEASE_PROTECTION_TEMPLATES} from '../src/catalog/releases-protection-upgrade.js';
import {ElementAdapter} from './support/raid-dom-adapter.mjs';

const base=RELEASE_TEMPLATES[0], upgraded=RELEASE_PROTECTION_TEMPLATES[0];
test('Releases teaching upgrade replaces exactly one existing entry without changing gameplay or indices',()=>{
  assert.strictEqual(SITE_TEMPLATES[15],upgraded);
  assert.equal(SITE_TEMPLATES.length,28);
  assert.equal(SITE_TEMPLATES.filter(t=>t.id===base.id).length,1);
  assert.equal(R.labEnemies().length,42);
  assert.strictEqual(R.labEnemies()[29],upgraded);
  assert.deepEqual(Object.keys(upgraded),Object.keys(base));
  assert.deepEqual(Object.keys(base).filter(key=>JSON.stringify(base[key])!==JSON.stringify(upgraded[key])),['tip','counterplay','decor']);
  for(const key of Object.keys(base).filter(key=>!['tip','counterplay','decor'].includes(key)))assert.deepEqual(upgraded[key],base[key],key);
  assert.deepEqual(D.PRESETS[base.id].layout,base.layout);
  assert.equal(D.PRESETS[base.id].desc,upgraded.tip);
  const run=R.newRun('lab',base.id);run.stage=29;
  const restored=JSON.parse(JSON.stringify(run));
  assert.equal(R.validateRun(restored),true);
  assert.equal(R.opponent(restored).id,base.id);
  assert.deepEqual(R.pageDecor(restored),upgraded.decor);
  assert.deepEqual(R.enemyBoard(restored).map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]),restored.owned.map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]));
});

test('actual Releases render includes the registered inert lesson and original native controls',t=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,'document');
  const document={createElement(tag){return new ElementAdapter(this,tag);}};
  Object.defineProperty(globalThis,'document',{configurable:true,value:document});
  t.after(()=>{if(prior)Object.defineProperty(globalThis,'document',prior);else delete globalThis.document;});
  const host=document.createElement('div'),run=R.newRun('lab',base.id);
  V.render(host,run.owned,{theme:run.page.theme,decor:upgraded.decor});
  assert.ok(host.querySelector('.release-protection-lesson'));
  assert.match(host.querySelector('.release-protection-lesson').textContent,/192→192/);
  assert.match(host.querySelector('.release-protection-footer').textContent,/実ファイルの取得・送信は行いません/);
  assert.equal(host.querySelectorAll('.web-node').length,4);
  for(const p of run.owned)assert.equal(V.markup(p,{theme:'forge'}),V.markup(p,{theme:'mixed'}));
  for(const selector of ['.release-protection-cache-note','.release-protection-lesson','.release-protection-footer'])assert.equal(host.querySelector(selector).querySelectorAll('button,input,select,a,textarea,iframe,script').length,0);
  assert.match(readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8'),/@import ["']\.\.\/catalog\/releases-protection\.css["'];/);
});

test('historical teaching whitelist cannot conceal identity, combat or geometry changes',async()=>{
  const {withOriginalReleaseTeaching,withOriginalReleasePresetDescription}=await import('./helpers/original-release-teaching.mjs');
  assert.deepEqual(withOriginalReleaseTeaching(SITE_TEMPLATES,15)[15],base);
  assert.throws(()=>withOriginalReleaseTeaching(SITE_TEMPLATES,14));
  const shifted=[...SITE_TEMPLATES];[shifted[14],shifted[15]]=[shifted[15],shifted[14]];
  assert.throws(()=>withOriginalReleaseTeaching(shifted,15));
  for(const key of ['hp','fee','reward','layout','loot','admin','references']){
    const changed=structuredClone(SITE_TEMPLATES);
    changed[15][key]=typeof changed[15][key]==='number'?changed[15][key]+1:[...changed[15][key],'unexpected'];
    assert.notDeepEqual(withOriginalReleaseTeaching(changed,15)[15],base,key);
  }
  const changed=structuredClone(D.PRESETS);changed[base.id].layout[0][1]+=1;
  assert.notDeepEqual(withOriginalReleasePresetDescription(changed)[base.id].layout,base.layout);
});
