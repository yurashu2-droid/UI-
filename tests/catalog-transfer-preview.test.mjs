import test from 'node:test';
import assert from 'node:assert/strict';
const transfer=await import('../src/catalog/transfer-render.js').catch(()=>({}));

test('transfer renderer exposes an escaped filename and a local native zero progress control',()=>{
 assert.equal(typeof transfer.transferPartMarkup,'function');const html=transfer.transferPartMarkup('<img src=x>');
 assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img|<iframe|<script|<a\b|<form\b/);
 assert.match(html,/<progress[^>]+max="1"[^>]+value="0"/);assert.match(html,/data-ui="transfer-preview"/);assert.match(html,/transfer-percent">0%/);assert.match(html,/実ファイルなし/);
});
test('transfer progress is bounded and comes only from the supplied native clock',()=>{
 assert.equal(typeof transfer.transferFeedback,'function');
 assert.deepEqual(transfer.transferFeedback(8,4),{fraction:.5,percent:50,status:'次の転送を準備'});
 assert.deepEqual(transfer.transferFeedback(8,0),{fraction:1,percent:100,status:'転送完了'});
 for(const [period,remaining,expected] of [[8,20,0],[8,-2,1],[0,0,0],[Infinity,1,0],[8,NaN,0]])assert.equal(transfer.transferFeedback(period,remaining).fraction,expected);
 assert.deepEqual(transfer.transferFeedback(8,4),transfer.transferFeedback(8,4));
});
test('native progress and percentage update together and local preview is reversible',()=>{
 assert.equal(typeof transfer.applyTransferFeedback,'function');assert.equal(typeof transfer.previewTransfer,'function');
 const progress={value:0},percent={textContent:''},status={textContent:''};
 const host={querySelector(s){return s==='progress'?progress:s==='.transfer-percent'?percent:s==='.transfer-state'?status:null;}};
 transfer.applyTransferFeedback(host,transfer.transferFeedback(8,4));assert.equal(progress.value,.5);assert.equal(percent.textContent,'50%');assert.equal(status.textContent,'次の転送を準備');
 transfer.previewTransfer(host);assert.equal(progress.value,1);assert.equal(percent.textContent,'100%');assert.equal(status.textContent,'転送完了');
 transfer.previewTransfer(host);assert.equal(progress.value,0);assert.equal(percent.textContent,'0%');assert.equal(status.textContent,'次の転送を準備');
});

test('transfer does not announce 100 percent while any native preparation time remains',()=>{
 assert.equal(transfer.transferFeedback(8,.001).percent,99);
 assert.equal(transfer.transferFeedback(8,0).percent,100);
});
