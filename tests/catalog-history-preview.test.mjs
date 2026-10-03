import test from 'node:test';
import assert from 'node:assert/strict';
const history=await import('../src/catalog/history-render.js').catch(()=>({}));

test('history panel shows one native revision and a local restore control',()=>{
  assert.equal(typeof history.historyPartMarkup,'function');
  const html=history.historyPartMarkup('変更履歴・版を復元');
  assert.equal((html.match(/class="history-entry"/g)||[]).length,1);
  assert.match(html,/最新1件/);assert.match(html,/ページ共有の履歴/);
  assert.match(html,/type="button"[^>]*data-ui="history-restore"/);
  assert.doesNotMatch(html,/<form|<a|href=|src=|onclick=/i);
});
test('history panel escapes editable labels rather than creating active markup',()=>{
  assert.equal(typeof history.historyPartMarkup,'function');
  const html=history.historyPartMarkup('<img src=x onerror="bad()">');
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|onerror="/);
});
test('history projection distinguishes eligible pending damage from a consumed revision',()=>{
  assert.equal(typeof history.historyFeedback,'function');
  const pending=history.historyFeedback({sourceName:'変更差分',loss:22,recoverable:11,recordAt:40,expiresAt:140,consumed:false},80);
  assert.equal(pending.source,'変更差分');assert.match(pending.status,/11/);assert.match(pending.expiry,/3.0秒/);
  assert.equal(pending.available,true);
  const used=history.historyFeedback({sourceName:'変更差分',loss:22,recoverable:0,recordAt:40,expiresAt:140,consumed:true},80);
  assert.equal(used.available,false);assert.match(used.status,/使用済み/);assert.doesNotMatch(used.expiry,/秒/);
  const expired=history.historyFeedback({sourceName:'変更差分',loss:22,recoverable:11,recordAt:40,expiresAt:140,consumed:false},140);
  assert.equal(expired.available,false);assert.match(expired.status,/期限切れ/);
});

test('history controls start disabled and stay bound to the engine-derived availability',()=>{
  assert.match(history.historyPartMarkup('変更履歴'),/<button[^>]*\bdisabled\b/);
  assert.equal(typeof history.applyHistoryFeedback,'function');
  const fields=new Map(['.history-time','.history-source','.history-recovery','.history-expiry'].map(key=>[key,{textContent:''}]));
  const control={disabled:true,title:''};
  const panel={classList:{toggle(){}},querySelector(key){return key==='[data-ui="history-restore"]'?control:fields.get(key);}};
  history.applyHistoryFeedback(panel,history.historyFeedback({sourceName:'<unsafe>',loss:22,recoverable:11,recordAt:40,expiresAt:140,consumed:false},80));
  assert.equal(control.disabled,false);assert.equal(fields.get('.history-source').textContent,'<unsafe>');
  assert.equal('innerHTML' in fields.get('.history-source'),false);
  history.applyHistoryFeedback(panel,history.historyFeedback(null,80));
  assert.equal(control.disabled,true);assert.match(control.title,/被害.*ありません/);
});
