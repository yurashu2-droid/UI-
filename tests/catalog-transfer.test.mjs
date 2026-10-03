import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import {previewCatalogueAction} from '../src/catalog/preview.js';

test('registered ZIP transfer retains the reviewed ordinary slow-burst resource contract',()=>{
 const d=D.PARTS.gh_transfer;assert.ok(d);assert.equal(d.status,'experimental');assert.equal(d.faction,'forge');assert.equal(d.kind,'attack');assert.deepEqual([d.value,d.cd,d.price,d.load],[30,8,7,3]);assert.deepEqual(d.tags,['text','document','download']);assert.deepEqual([d.w,d.h,d.minW,d.minH],[416,112,320,112]);assert.ok(Object.isFrozen(d.tags));
 assert.match(d.desc,/貫通/);assert.match(d.desc,/原本/);const p=C.makeItem(d.id,'zip',24,24);p.label='<img src=x>';assert.match(V.markup(p),/native-transfer/);assert.match(V.markup(p),/&lt;img/);
});
test('real ZIP replay waits for natural payload and never adds natural fires or advertisement income',()=>{
 assert.ok(D.PARTS.gh_transfer);
 const board=[C.makeItem('gh_transfer','zip',24,24,416,112),C.makeItem('go_page','page',24,148,320,36),C.makeItem('go_ads','ad',456,24,240,88)];for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y));
 const b=new E.Battle(board,[],{playerHp:10000,enemyHp:10000,playerCapacity:35,enemyCapacity:35}),events=[];for(let i=0;i<640;i++)events.push(...b.step(.05));
 const hits=events.filter(e=>e.kind==='damage'&&e.id==='zip'),copies=events.filter(e=>e.kind==='fire'&&e.id==='zip'&&e.echo);
 assert.equal(hits[0].time,4);assert.equal(hits[0].value,30);assert.equal(copies[0].time,9);assert.equal(copies.length,4);assert.equal(b.player.parts.find(p=>p.id==='zip').fires,4);assert.equal(b.player.income,4);
 assert.equal(b.player.parts.find(p=>p.id==='zip').damage,180);
});
test('registered transfer preview remains a local reversible demonstration',()=>{
 assert.ok(D.PARTS.gh_transfer);const progress={value:0},percent={textContent:'0%'},status={textContent:''};const panel={querySelector(s){return s==='progress'?progress:s==='.transfer-percent'?percent:status;}};const node={querySelector(s){return s==='.native-transfer'?panel:null;}};
 const control={dataset:{ui:'transfer-preview'}};assert.equal(previewCatalogueAction(control,node),true);assert.equal(progress.value,1);assert.equal(percent.textContent,'100%');previewCatalogueAction(control,node);assert.equal(progress.value,0);
});
