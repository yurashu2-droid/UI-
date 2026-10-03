import * as containmentViews from '../src/containment-guidance.js';
import * as incomeRoutes from '../src/income-route-guidance.js';
import * as conversionViews from '../src/conversion-guidance.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {parseFragment} from 'parse5';
import C from '../src/document.js';import D from '../src/data.js';import E from '../src/engine.js';import R from '../src/run.js';import V from '../src/components.js';
import * as guidance from '../src/app-guidance.js';import * as navigation from '../src/navigation-guidance.js';
const app=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
const source=app.match(/^function selectionCard\([^]*?^}/m)?.[0];assert.ok(source);
const compiled=transformSync(source,{loader:'ts',target:'es2022'}).code;
const walk=n=>[n,...(n.childNodes??[]).flatMap(walk)];
const text=n=>n.nodeName==='#text'?n.value:(n.childNodes??[]).map(text).join('');
const attr=(n,k)=>n.attrs?.find(a=>a.name===k)?.value;

test('actual inspector names the field as part identity without promising every native control changes visible text',()=>{
  for(const type of ['yt_speed','yt_play']){
    const selected=C.makeItem(type,'p1',32,32);selected.label='My <part> & "title"';
    const before=structuredClone(selected),context={P:D.PARTS,D,E,R,...guidance,...navigation,...conversionViews, ...incomeRoutes, ...containmentViews, incomeRouteEditingAllowed:()=>false,selected,info:E.analyze([selected]),
      battle:null,run:R.newRun('lab'),storyActive:false,working:()=>true,labPressureCapacity:()=>null,
      KIND:{passive:'補助',attack:'攻撃'},GROUP_BONUS:{},esc:V.esc,skinPicker:()=>'',connectText:()=>''};
    vm.runInNewContext(compiled+'\noutput=selectionCard([selected],info);',context);
    const nodes=walk(parseFragment(context.output)),input=nodes.find(n=>attr(n,'id')==='part-label');assert.ok(input);
    const label=nodes.find(n=>n.tagName==='label'&&walk(n).includes(input));assert.ok(label);
    assert.match(text(label),/部品ラベル/);assert.doesNotMatch(text(label),/表示テキスト/);
    assert.equal(attr(input,'maxlength'),'80');assert.equal(attr(input,'value'),selected.label);
    const explanation=nodes.find(n=>n.tagName==='p'&&/識別/.test(text(n)));assert.ok(explanation);
    assert.match(text(explanation),/対応するUI.*ページ.*文字/);
    assert.equal(nodes.some(n=>n.tagName==='part'),false);assert.deepEqual(selected,before);
  }
});
