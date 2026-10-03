import test from 'node:test';
import assert from 'node:assert/strict';
import V from '../src/components.js';
import C from '../src/document.js';
import { arenaCatalogDefinition, fingerprintJson } from '../src/online/catalog.js';
const ui=await import('../src/catalog/server-pressure-render.js').catch(()=>({}));

test('job panel is a local native table with funding, running, and rejected rows',()=>{
 const html=V.markup(C.makeItem('go_jobs','jobs',24,24));
 assert.match(html,/<table/);assert.match(html,/収益待ち/);assert.match(html,/実行/);assert.match(html,/拒否/);assert.match(html,/state-charge/);assert.doesNotMatch(html,/<iframe|https?:|fetch|XMLHttpRequest/);
});
test('pressure feedback distinguishes paid rejection and CPU from viewer HP',()=>{
 assert.equal(typeof ui.pressureFeedback,'function');
 const feedback=ui.pressureFeedback(23,26,{work:6,cap:12,nextExpiry:4.25});
 assert.match(feedback.cpuText,/23 \+ 6.*26/);assert.match(feedback.expiryText,/4.3/);
 const state=ui.jobFeedback(true,3,{attempts:3,blocked:2,accepted:6},1.2);
 assert.match(state.chargeText,/3/);assert.match(state.blockedText,/2.*支払い済み/);
 assert.match(ui.jobFeedback(false,0,undefined,0).stateText,/実験ルール/);
});
test('lab-only job panel does not alter authoritative catalog fingerprint',async()=>{
 assert.equal(arenaCatalogDefinition().parts.go_jobs,undefined);
 assert.equal(await fingerprintJson(arenaCatalogDefinition()),'5ae7f15b99800961281723849d5c74b681c7cff3b6f4d92879f9be6323db6ece');
});

test('actual pressure HUD labels real HP and updates CPU/expiry independently',async()=>{
 const original=globalThis.Path2D;globalThis.Path2D=class{};const {default:Traffic}=await import('../src/traffic.js');if(original===undefined)delete globalThis.Path2D;else globalThis.Path2D=original;
 const t=Object.create(Traffic.prototype),hp={innerHTML:''},bar={style:{}},cpu={textContent:''},expiry={textContent:''},fill={style:{}};
 const frame={querySelector:s=>s==='.health-meta'?hp:s==='.health-track i'||s==='.health-track b'?bar:s==='.pressure-cpu'?cpu:s==='.pressure-expiry'?expiry:s==='.pressure-track i'?fill:null,querySelectorAll:()=>[]};
 Object.assign(t,{battle:{pressure:{},player:{hp:75,maxHp:100,shield:0,income:0},enemy:{hp:100,maxHp:100,shield:0,income:0}},base:{player:50,enemy:50},counts:()=>({player:37,enemy:50,hub:0})});
 const doc=globalThis.document;globalThis.document={querySelector:s=>s==='#player-frame'?frame:null};try{t.hud();}finally{globalThis.document=doc;}
 ui.applyPressureFeedback(frame,23,26,{work:6,cap:12,nextExpiry:4});
 assert.match(hp.innerHTML,/閲覧者HP.*75.*100/);assert.equal(bar.style.width,'75%');assert.match(cpu.textContent,/23 \+ 6.*26/);assert.equal(fill.style.width,'50%');
});
