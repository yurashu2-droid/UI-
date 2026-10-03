import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewCatalogueAction} from '../src/catalog/preview.js';
import {applyCombatFeedback,combatFeedback} from '../src/catalog/combat-feedback.js';

test('QA: actual app cache preview prevents anchor navigation, stays outside battle, and live feedback replaces demo copy',()=>{
 //Execute only the actual handler in a controlled DOM adapter, not the app or a browser.
 const source=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8'),start=source.indexOf('function previewAction(e: MouseEvent)'),end=source.indexOf('  const kind = act.dataset.ui',start);assert.ok(start>=0&&end>start);
 const js=(source.slice(start,end)+'}').replace('(e: MouseEvent)','(e)').replaceAll('.closest<HTMLElement>(','.closest(');
 const state={textContent:'準備完了',title:''},attrs=new Map(),node={querySelector(s){return s==='.cache-state'||s==='.popup-state, .cache-state'?state:null;},classList:{toggle(){}},dataset:{id:'p1'}};
 const control={tagName:'A',dataset:{ui:'cache'},textContent:'保存済みのZIP表示',setAttribute(k,v){attrs.set(k,v);},closest(){return node;}};
 class Element{closest(s){return s==='[data-ui]'?control:s==='.browser-paper'?{}:null;}}
 let pulsed=0,prevented=0;
 const execute=(preview,battle)=>{
  const handler=new Function('Element','preview','battle','storyActive','storySession','fx','previewCatalogueAction',`${js};return previewAction;`)(Element,preview,battle,false,null,{pulse(){pulsed++;}},previewCatalogueAction);
  handler({target:new Element(),preventDefault(){prevented++;}});
 };
 execute(false,null);assert.equal(prevented,1);assert.equal(pulsed,0);assert.equal(state.textContent,'準備完了');
 const battle=Object.freeze({tick:80,charge:3,target:'zip'});execute(true,battle);assert.equal(prevented,2);assert.equal(pulsed,0);assert.equal(state.textContent,'準備完了');assert.deepEqual(battle,{tick:80,charge:3,target:'zip'});
 execute(true,null);assert.equal(prevented,3);assert.equal(pulsed,1);assert.equal(state.textContent,'表示のデモ');assert.equal(control.textContent,'保存済みのZIP表示');assert.match(attrs.get('title'),/外部ページや戦闘状態は変更しません/);
 applyCombatFeedback(node,combatFeedback('go_cache',0,80,{coveredUntil:0,immuneUntil:0,cache:true,cacheAt:80},'ZIP',0));assert.equal(state.textContent,'準備完了');assert.match(state.title,/ZIP/);
});
