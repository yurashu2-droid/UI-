import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
const view=await import('../src/catalog/etag-render.js').catch(()=>({}));

test('ETag-inspired status prototype is unregistered and initial markup invents no battle record',()=>{
 assert.equal(typeof view.etagPartMarkup,'function');assert.equal(D.PARTS.go_etag,undefined);
 const html=view.etagPartMarkup('再取得ガード');assert.match(html,/ETag風/);assert.match(html,/戦闘情報を待機/);assert.match(html,/共有 —/);assert.doesNotMatch(html,/304|HPを|<button|<input|<form|<script|<iframe|\bsrc=|\bhref=/i);
 const unsafe=view.etagPartMarkup('<img src=x onerror="alert(1)">');assert.doesNotMatch(unsafe,/<img/);assert.match(unsafe,/&lt;img/);
});
test('status feedback accepts only finite live budget and reports actual prevention without implying HP gain',()=>{
 assert.equal(typeof view.etagFeedback,'function');const blank=view.etagFeedback(null);assert.equal(blank.active,false);assert.equal(blank.budgetText,'共有 —');
 const live=view.etagFeedback({capacity:12,remaining:8.75,last:{sourceName:'ZIP <source>',prevented:3.25}});assert.equal(live.active,true);assert.equal(live.remaining,8.75);assert.equal(live.capacity,12);assert.equal(live.sourceText,'ZIP <source>');assert.equal(live.preventedText,'前回の軽減 3.2');assert.equal(live.budgetText,'共有 8.7 / 12');
 assert.equal(view.etagFeedback({capacity:12,remaining:99}).remaining,12);assert.equal(view.etagFeedback({capacity:12,remaining:-3}).remaining,0);
 for(const bad of [{capacity:NaN,remaining:3},{capacity:12,remaining:Infinity},{capacity:0,remaining:0}])assert.equal(view.etagFeedback(bad).active,false);
 assert.equal(view.etagFeedback({capacity:12,remaining:.04,last:{sourceName:'small',prevented:.03}}).preventedText,'前回の軽減 <0.1');
});
test('native status updates use textContent and exact meter values, with null resetting previous feedback',()=>{
 assert.equal(typeof view.applyEtagFeedback,'function');const classes=new Set(),nodes=Object.fromEntries(['.etag-source','.etag-prevented','.etag-budget-label','.etag-budget-meter'].map(s=>[s,{textContent:'',value:0,max:1}]));
 for(const node of Object.values(nodes))Object.defineProperty(node,'innerHTML',{set(){throw new Error('No HTML sink');}});
 const panel={classList:{toggle(k,on){on?classes.add(k):classes.delete(k);}},querySelector(s){return nodes[s]??null;}};
 const live=view.etagFeedback({capacity:12,remaining:2.75,last:{sourceName:'<svg onload=boom>',prevented:9.25}});view.applyEtagFeedback(panel,live);assert.equal(nodes['.etag-source'].textContent,'<svg onload=boom>');assert.equal(nodes['.etag-budget-meter'].value,2.75);assert.equal(nodes['.etag-budget-meter'].max,12);assert.equal(classes.has('has-replay-record'),true);
 view.applyEtagFeedback(panel,view.etagFeedback(null));assert.equal(nodes['.etag-source'].textContent,'戦闘情報を待機');assert.equal(nodes['.etag-budget-meter'].value,0);assert.equal(classes.has('has-replay-record'),false);
});
