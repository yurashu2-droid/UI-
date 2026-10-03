import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import {RATE_LIMIT} from '../src/combat-rules.js';
import {combatFeedback,applyCombatFeedback} from '../src/catalog/combat-feedback.js';
import {previewCatalogueAction} from '../src/catalog/preview.js';

const nodes=root=>[root,...(root.childNodes??[]).flatMap(nodes)];
const classNode=(root,name)=>nodes(root).find(n=>n.attrs?.some(a=>a.name==='class'&&a.value.split(' ').includes(name)));
const attr=(node,name)=>node?.attrs?.find(a=>a.name===name)?.value;
const text=node=>node?.value??(node?.childNodes??[]).map(text).join('');
const runtime={coveredUntil:0,immuneUntil:0,cache:true,cacheAt:0,target:'zip'};
function host(){
 const fields=new Map(['.cache-target','.support-feedback','.rate-budget','.rate-total'].map(key=>[key,{textContent:'',title:''}]));
 const status={textContent:'',title:''},support={title:''};
 const meter={value:-1,max:0,hidden:false,attrs:new Map(),setAttribute(k,v){this.attrs.set(k,v);}};
 return{fields,status,support,meter,classList:{toggle(){}},querySelector(key){if(key===':scope > .native-popup-cover')return null;if(key==='.popup-state, .cache-state')return status;if(key==='.native-support')return support;if(key==='.rate-budget-meter')return meter;return fields.get(key)??null;}};
}

test('native cache names its single protected target, while support has an in-button waiting state',()=>{
 const cache=parseFragment(V.markup(C.makeItem('go_cache','cache'))),support=parseFragment(V.markup(C.makeItem('yt_tip','tip')));
 assert.match(text(classNode(cache,'cache-target')),/戦闘中.*対象/);
 assert.ok(classNode(support,'support-copy'));
 assert.match(text(classNode(support,'support-feedback')),/\$3.*シールド/);
 assert.equal(nodes(support).filter(n=>n.tagName==='button').length,1);
 assert.equal(nodes(support).some(n=>['input','form','a'].includes(n.tagName)),false);
});

test('429 renders a native page-shared resource meter with honest pre-battle unknown state',()=>{
 const root=parseFragment(V.markup(C.makeItem('gov_rate_limit','rate'))),meter=classNode(root,'rate-budget-meter');
 assert.equal(meter?.tagName,'meter');assert.equal(attr(meter,'max'),String(RATE_LIMIT.capacity));
 assert.match(attr(meter,'aria-label'),/ページ共有/);assert.equal(attr(meter,'hidden'),'');
 assert.equal(text(classNode(root,'rate-budget')),'—');assert.match(text(root),/共有枠/);
 assert.match(text(root),/非貫通/);assert.match(text(root),/毎秒24/);
});

test('tick projection updates safe target text and removes stale target names',()=>{
 const el=host();applyCombatFeedback(el,combatFeedback('go_cache',0,80,runtime,'<img src=x onerror=bad()>',0));
 assert.equal(el.fields.get('.cache-target').textContent,'対象：<img src=x onerror=bad()>');
 assert.equal('innerHTML' in el.fields.get('.cache-target'),false);
 applyCombatFeedback(el,combatFeedback('go_cache',0,80,{...runtime,cache:false,cacheAt:160},'',0));
 assert.equal(el.fields.get('.cache-target').textContent,'接続対象なし');assert.match(el.status.textContent,/4.0秒/);
 applyCombatFeedback(el,combatFeedback('go_cache',0,160,{...runtime,cache:true},'ZIP転送',0));
 assert.equal(el.status.textContent,'準備完了');assert.equal(el.fields.get('.cache-target').textContent,'対象：ZIP転送');
});

test('support exposes charge readiness and full-shield waiting without altering labels or spending',()=>{
 const el=host();
 for(const[charge,shield,expectation]of[[1.5,0,/受付中/],[3,0,/準備完了/],[6,60,/満杯.*待機/]]){
  applyCombatFeedback(el,combatFeedback('yt_tip',charge,0,undefined,'',shield));
  assert.match(el.fields.get('.support-feedback').textContent,expectation);
 }
 const control={dataset:{ui:'support'},attrs:new Map(),setAttribute(k,v){this.attrs.set(k,v);}};
 previewCatalogueAction(control,el);assert.match(el.fields.get('.support-feedback').textContent,/プレビュー.*決済なし/);
 applyCombatFeedback(el,combatFeedback('yt_tip',6,0,undefined,'',60));
 assert.match(el.fields.get('.support-feedback').textContent,/満杯.*待機/);
});

test('429 meter keeps exact simulation budget and identical shared values on duplicate panels',()=>{
 const items=[C.makeItem('gov_rate_limit','rate-a',24,24),C.makeItem('gov_rate_limit','rate-b',24,140)];
 const battle=new E.Battle(items,[C.makeItem('ab_link','link',24,24)],{playerHp:10000,enemyHp:10000});
 const a=host(),b=host();let sawSpend=false;
 for(let tick=0;tick<160;tick++){
  const events=battle.step(.05);if(events.some(e=>e.kind==='rate-limit'))sawSpend=true;
  const budget=battle.rateBudget.player,view=combatFeedback('gov_rate_limit',0,battle.ticks,undefined,'',battle.player.shield,{budget,limited:battle.metrics.player.rateLimited});
  applyCombatFeedback(a,view);applyCombatFeedback(b,view);
  assert.equal(a.meter.value,budget);assert.equal(b.meter.value,budget);assert.equal(a.meter.max,RATE_LIMIT.capacity);assert.equal(a.meter.hidden,false);
  assert.match(a.meter.attrs.get('aria-valuetext'),/ページ共有/);
 }
 assert.equal(sawSpend,true);assert.ok(battle.metrics.player.rateLimited>0);
});

test('missing or corrupt rate telemetry cannot pretend an empty or refilled budget',()=>{
 for(const rate of [undefined,{budget:NaN,limited:0},{budget:24,limited:Infinity}]){
  const el=host(),view=combatFeedback('gov_rate_limit',0,0,undefined,'',0,rate);applyCombatFeedback(el,view);
  assert.equal(el.meter.hidden,true);assert.equal(el.fields.get('.rate-budget').textContent,'—');assert.equal(el.fields.get('.rate-total').textContent,'—');
 }
 for(const[budget,expected]of[[-3,0],[30,24]]){
  const el=host();applyCombatFeedback(el,combatFeedback('gov_rate_limit',0,0,undefined,'',0,{budget,limited:0}));assert.equal(el.meter.value,expected);
 }
 assert.doesNotThrow(()=>applyCombatFeedback({classList:{toggle(){}},querySelector(){return null;}},combatFeedback('gov_rate_limit',0,0,undefined,'',0)));
});

test('native resource upgrade preserves escaped editable labels, catalogue count and compact line budgets',async()=>{
 for(const type of ['go_cache','yt_tip','gov_rate_limit']){
  const part=C.makeItem(type,type);part.label='<script>bad()</script>';const markup=V.markup(part);
  assert.match(markup,/&lt;script&gt;/);assert.doesNotMatch(markup,/<script>|\bonclick=|\bsrc=/);assert.equal(D.PARTS[type].status,'experimental');
 }
 const{SITE_TEMPLATES}=await import('../src/catalog/index.js');assert.equal(SITE_TEMPLATES.length,27);assert.equal(SITE_TEMPLATES[22].id,"site_gmail");assert.equal(SITE_TEMPLATES[23].id,"site_calendar");assert.equal(SITE_TEMPLATES[24].id,"site_figma");assert.equal(SITE_TEMPLATES[25].id,"site_slack");assert.equal(SITE_TEMPLATES[26].id,"site_notion");
 const css=readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8');
 assert.match(css,/\.cache-meta\s*\{[^}]*display:\s*flex/s);assert.match(css,/\.cache-target\s*\{[^}]*min-width:\s*0/s);
 assert.match(css,/\.support-feedback\s*\{[^}]*line-height:\s*12px/s);assert.match(css,/\.rate-budget-meter\s*\{[^}]*height:\s*6px/s);
});
