import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import E from '../src/engine.js';
import C from '../src/document.js';

test('QA: server rounding and SNS capped healing copy hold on either seat without changing CPU clocks',()=>{
 const items=[C.makeItem('yt_play','p1',24,24,240,144),C.makeItem('yt_play','p2',288,24,240,144),C.makeItem('am_cart','p3',24,200,200,76)];
 for(const side of['player','enemy']){
  const options={playerHp:402,enemyHp:402,playerCapacity:12,enemyCapacity:12,[side+'Admin']:['server','sns']};
  const b=new E.Battle(items,items.map(p=>({...p,id:'e'+p.id})),options),s=b[side],other=b[side==='player'?'enemy':'player'];
  assert.equal(s.hp,503);assert.equal(s.maxHp,503);assert.equal(other.hp,402);assert.equal(s.capacity,12);assert.equal(s.lag,other.lag);assert.deepEqual(s.parts.map(p=>p.period),other.parts.map(p=>p.period));
 }
 for(const side of['player','enemy']){
  const b=new E.Battle([],[],{playerHp:402,enemyHp:402,[side+'Admin']:['sns']});assert.equal(b[side].hp,402);b[side].hp=398;const events=[];
  for(let i=0;i<260;i++)events.push(...b.step(.05));assert.deepEqual(events.filter(e=>e.kind==='admin'&&e.admin==='sns'&&e.side===side).map(e=>[e.time,e.value]),[[3,4],[8,0],[13,0]]);assert.equal(b[side].hp,402);assert.equal(b[side].maxHp,402);assert.equal(b.metrics[side].healing,4);assert.equal(b.metrics[side].overheal,14);
 }
 assert.match(D.ADMIN.server.desc,/四捨五入/);assert.match(D.ADMIN.server.desc,/CPU上限は変わらない/);assert.match(D.ADMIN.sns.desc,/初回3秒、以後5秒ごと/);assert.match(D.ADMIN.sns.desc,/開始時のHP加算はない/);
});

test('QA: combined admin display uses effective HP, removes opening SNS strength and labels server depletion on both seats',async()=>{
 const oldPath=globalThis.Path2D;globalThis.Path2D=class{};let Traffic;try{({default:Traffic}=await import('../src/traffic.js'));}finally{if(oldPath===undefined)delete globalThis.Path2D;else globalThis.Path2D=oldPath;}
 const {default:Effects}=await import('../src/effects.js');
 const b=new E.Battle([],[],{playerHp:402,enemyHp:402,playerCapacity:12,enemyCapacity:12,playerAdmin:['server','sns'],enemyAdmin:['server','sns']});
 const opening=[],traffic=Object.create(Traffic.prototype);Object.assign(traffic,{base:{player:0,enemy:0},cursors:[],fx:{log(...args){opening.push(args);}},stop(){this.cursors=[];},resize(){}});
 const oldRAF=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=()=>1;try{traffic.start(b);}finally{if(oldRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=oldRAF;}
 assert.deepEqual(traffic.base,{player:44,enemy:44});assert.equal(traffic.cursors.length,88);assert.deepEqual(opening,[]);assert.deepEqual([b.player.hp,b.enemy.hp,b.player.capacity,b.enemy.capacity],[503,503,12,12]);
 b.player.hp-=1.25;b.enemy.hp-=6;const logs=[],fx={traffic,adminPulse(){},log(side,html,time){logs.push({side,html,time});}};
 for(let i=0;i<160;i++)for(const e of b.step(.05))if(e.kind==='admin')Effects.prototype.emit.call(fx,e,b);
 assert.equal(logs.length,2);assert.match(logs[0].html,/1\.25 閲覧者HP回復/);assert.match(logs[1].html,/6 閲覧者HP回復/);assert.ok(logs.every(e=>e.time===3&&!/新規流入|\+10人/.test(e.html)));
 assert.match(traffic.metric('sns',b.player),/累計回復 1\.25 閲覧者HP/);assert.match(traffic.metric('sns',b.enemy),/累計回復 6 閲覧者HP/);
 const widgets={};for(const side of['player','enemy']){const attrs={},style={},metric={textContent:''};widgets[side]={attrs,style,metric,element:{dataset:{admin:'server'},querySelector(s){return s==='.aw-metric'?metric:s==='.v-load'?{setAttribute(k,v){attrs[k]=v;}}:null;},style:{setProperty(k,v){style[k]=v;}}}};}b.player.hp=251.5;
 const oldDocument=globalThis.document;globalThis.document={querySelector(s){const side=s==='#player-frame'?'player':s==='#enemy-frame'?'enemy':null;return side?{querySelector(){return null;},querySelectorAll(){return[widgets[side].element];}}:null;}};
 try{traffic.hud();}finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
 assert.match(widgets.player.metric.textContent,/251\.5 \/ 503/);assert.match(widgets.enemy.metric.textContent,/503 \/ 503/);assert.equal(widgets.player.attrs['aria-valuenow'],'50');assert.equal(widgets.enemy.attrs['aria-valuenow'],'0');for(const w of Object.values(widgets)){assert.match(w.attrs['aria-label'],/HPの減少率.*CPU負荷ではありません/);assert.match(w.attrs.title,/閲覧者HPの減少率/);assert.doesNotMatch(w.metric.textContent,/負荷/);}
});
