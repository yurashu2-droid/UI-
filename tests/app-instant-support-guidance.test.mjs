import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import * as guidance from '../src/app-guidance.js';
const item=(type,id,x,y,w,h)=>C.makeItem(type,id,x,y,w,h);
const board=()=>[item('go_instant','instant',32,32,420,44),item('ab_heading','heading',464,32,280,56),item('ab_link','link',464,104,192,32),item('ab_link','far',720,600,192,32)];

test('Instant Search support guidance names engine-linked text attacks rather than all nearby text',()=>{
  assert.equal(typeof guidance.instantSearchSupport,'function');
  const b=board(),info=E.analyze(b),before=structuredClone(info);
  assert.ok(b.every(p=>C.canPlace(b,p,p.x,p.y,p.w,p.h)));
  const view=guidance.instantSearchSupport(b[0],info);
  assert.equal(view.placed,true);assert.deepEqual(view.targets.map(t=>t.id),['heading']);
  assert.equal(info.mods.heading.power,1.45);assert.equal(info.mods.link.power,1);
  assert.equal(info.mods.instant.power,1.45,'self support remains distinct from outgoing targets');
  assert.deepEqual(info,before,'presentation cannot mutate combat analysis');
});

test('Instant Search guidance follows movement and inventory while preserving its own attack',()=>{
  assert.equal(typeof guidance.instantSearchSupport,'function');
  const b=board();b[0].y=472;
  const moved=E.analyze(b),view=guidance.instantSearchSupport(b[0],moved);
  assert.deepEqual(view.targets,[]);assert.equal(view.placed,true);assert.equal(moved.mods.instant.power,1.45);
  b[0].x=null;b[0].y=null;
  assert.deepEqual(guidance.instantSearchSupport(b[0],E.analyze(b)),{placed:false,targets:[]});
  assert.equal(guidance.instantSearchSupport(b[1],E.analyze(b)),null);
});

test('two connected Instant Searches list the real shared target without inventing stacked power',()=>{
  assert.equal(typeof guidance.instantSearchSupport,'function');
  const b=[...board().slice(0,2),item('go_instant','second',464,88,280,44)];
  assert.ok(b.every(p=>C.canPlace(b,p,p.x,p.y,p.w,p.h)));
  const info=E.analyze(b);
  for(const source of [b[0],b[2]])assert.deepEqual(guidance.instantSearchSupport(source,info).targets.map(t=>t.id),['heading']);
  assert.equal(info.mods.heading.power,1.45);
  assert.match(guidance.INSTANT_SEARCH_HELP,/自分/);assert.match(guidance.INSTANT_SEARCH_HELP,/45%/);
  assert.match(guidance.INSTANT_SEARCH_HELP,/重複/);
});

function renderSelection(p,info) {
  const source=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
  const functionSource=source.match(/^function selectionCard\([^]*?^}/m)?.[0];assert.ok(functionSource);
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const context={p,info,P:D.PARTS,D,E,R,battle:null,run:R.newRun('campaign'),storyActive:false,
    labPressureCapacity:()=>null,working:()=>true,KIND:{attack:'攻撃'},GROUP_BONUS:{},
    esc:escape,connectText:()=>guidance.INSTANT_SEARCH_HELP,skinPicker:()=>'',...guidance};
  vm.runInNewContext(transformSync(functionSource,{loader:'ts',target:'es2022'}).code+'\nglobalThis.output=selectionCard([p],info);',context);
  return context.output;
}

test('the actual selection card exposes linked targets and safely distinguishes disconnected support',()=>{
  const b=board();b[1].label='<img src=x onerror=alert(1)>';
  let html=renderSelection(b[0],E.analyze(b));
  assert.match(html,/接続している文字攻撃/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<img src=x/);assert.match(html,/重複/);
  b[0].y=472;html=renderSelection(b[0],E.analyze(b));
  assert.match(html,/ほかの文字攻撃には未接続/);assert.match(html,/自分/);
  assert.doesNotMatch(html,/今は働いていません/);
  b[0].x=null;b[0].y=null;html=renderSelection(b[0],E.analyze(b));
  assert.match(html,/未配置/);assert.doesNotMatch(html,/接続中|適用中/);
});
