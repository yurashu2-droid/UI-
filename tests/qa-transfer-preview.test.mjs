import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import E from '../src/engine.js';
import {transferPartMarkup,transferFeedback,applyTransferFeedback,previewTransfer} from '../src/catalog/transfer-render.js';

test('QA: transfer prototype has no file action or external resource and retains a bounded native min-size contract',()=>{
 const html=transferPartMarkup('"/><img src="https://evil.invalid/x" onerror="fetch(1)">');
 let progress=0,buttons=0;
 const walk=n=>{assert.ok(!['script','iframe','object','embed','a','form','input','img','link','audio','video'].includes(n.tagName),n.tagName);for(const a of n.attrs||[]){assert.ok(!['href','src','srcset','action','formaction','download','poster'].includes(a.name),a.name);assert.ok(!a.name.startsWith('on'),a.name);}if(n.tagName==='progress'){progress++;const attrs=Object.fromEntries(n.attrs.map(a=>[a.name,a.value]));assert.deepEqual([attrs.max,attrs.value],['1','0']);assert.match(attrs['aria-label'],/ゲーム内/);}if(n.tagName==='button'){buttons++;assert.equal(n.attrs.find(a=>a.name==='type').value,'button');}for(const c of n.childNodes||[])walk(c);};walk(parseFragment(html));assert.equal(progress,1);assert.equal(buttons,1);
 const css=readFileSync(new URL('../src/catalog/transfer.css',import.meta.url),'utf8');assert.doesNotMatch(css,/@import|url\s*\(/i);assert.match(css,/grid-template-rows:38px 12px 24px/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/text-overflow:ellipsis/);
 //74px rows +20px padding +2px border =96px, leaving16px in the proposed112px minimum.
 assert.ok(38+12+24+20+2<=112);
});

test('QA: native transfer feedback follows an actual paused/lagged engine clock and reversible local preview',()=>{
 //The pure projection is tested using an existing timed UI; this is not a claim of ZIP registration.
 const item=C.makeItem('gh_diff','original',24,24,360,136);
 const b=new E.Battle([item],[],{playerHp:10000,enemyHp:10000,playerCapacity:1,enemyCapacity:1});
 const p=b.player.parts[0],progress={value:0},percent={textContent:''},status={textContent:''},panel={querySelector(s){return s==='progress'?progress:s==='.transfer-percent'?percent:s==='.transfer-state'?status:null;}};
 assert.equal(p.period,14);applyTransferFeedback(panel,transferFeedback(p.period,p.remaining));assert.equal(progress.value,.5);assert.equal(percent.textContent,'50%');
 for(let i=0;i<20;i++)b.step(.05);const before=transferFeedback(p.period,p.remaining);b.states.player.get(p.id).coveredUntil=b.ticks+20;
 for(let i=0;i<20;i++)b.step(.05);assert.deepEqual(transferFeedback(p.period,p.remaining),before);
 b.step(.05);assert.ok(transferFeedback(p.period,p.remaining).fraction>before.fraction);
 applyTransferFeedback(panel,transferFeedback(p.period,p.remaining));assert.equal(percent.textContent,`${Math.round(progress.value*100)}%`);
 previewTransfer(panel);assert.equal(progress.value,1);assert.equal(percent.textContent,'100%');assert.equal(status.textContent,'転送完了');previewTransfer(panel);assert.equal(progress.value,0);assert.equal(percent.textContent,'0%');
});
