import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';

test('server description matches rounded starting/max HP rather than CPU capacity or rendered speed',()=>{
 const board=[C.makeItem('yt_play','p1',24,24,240,144),C.makeItem('yt_play','p2',288,24,240,144),C.makeItem('am_cart','p3',24,200,200,76)];for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y));
 for(const hp of [180,401,440]){const base=new E.Battle(board,[],{playerHp:hp,enemyHp:440,playerCapacity:12}),server=new E.Battle(board,[],{playerHp:hp,enemyHp:440,playerCapacity:12,playerAdmin:['server']});assert.equal(server.player.hp,Math.round(hp*1.25));assert.equal(server.player.maxHp,Math.round(hp*1.25));assert.equal(server.player.capacity,12);assert.equal(server.player.lag,base.player.lag);assert.deepEqual(server.player.parts.map(p=>p.period),base.player.parts.map(p=>p.period));}
 assert.match(D.ADMIN.server.desc,/閲覧者HP.*25%/);assert.match(D.ADMIN.server.desc,/CPU上限は変わらない/);assert.doesNotMatch(D.ADMIN.server.desc,/負荷の上限/);
});
test('SNS description matches no opening HP bonus and six-point healing at3s then every5s',()=>{
 const b=new E.Battle([],[],{playerHp:440,enemyHp:440,playerCapacity:12,playerAdmin:['sns']});assert.equal(b.player.hp,440);assert.equal(b.player.maxHp,440);b.player.hp=420;const events=[];for(let i=0;i<160;i++)events.push(...b.step(.05));const heals=events.filter(e=>e.kind==='admin'&&e.side==='player'&&e.admin==='sns');assert.deepEqual(heals.map(e=>[e.time,e.value]),[[3,6],[8,6]]);assert.equal(b.player.hp,432);
 const full=new E.Battle([],[],{playerHp:440,enemyHp:440,playerAdmin:['sns']});for(let i=0;i<60;i++)full.step(.05);assert.equal(full.player.hp,440);assert.equal(full.metrics.player.healing,0);assert.equal(full.metrics.player.overheal,6);
 assert.match(D.ADMIN.sns.desc,/初回3秒/);assert.match(D.ADMIN.sns.desc,/5秒ごと.*6回復/);assert.doesNotMatch(D.ADMIN.sns.desc,/閲覧者\s*\+10/);
});
