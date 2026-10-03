import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../src/document.js';
import E from '../src/engine.js';
const originalPath=globalThis.Path2D;
globalThis.Path2D=class {};
const {default:Traffic}=await import('../src/traffic.js');
if(originalPath===undefined)delete globalThis.Path2D;else globalThis.Path2D=originalPath;

function startTraffic(battle) {
  const logs=[],traffic=Object.create(Traffic.prototype),originalRAF=globalThis.requestAnimationFrame;
  Object.assign(traffic,{base:{player:0,enemy:0},cursors:[],fx:{log(...args){logs.push(args);}},stop(){this.cursors=[];},resize(){}});
  globalThis.requestAnimationFrame=()=>1;
  try{traffic.start(battle);}finally{if(originalRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=originalRAF;}
  return {traffic,logs};
}
const board=()=>[C.makeItem('ab_link','a',24,24,192,32),C.makeItem('ab_link','b',216,24,192,32)];
const battle=admin=>new E.Battle(board(),[],{playerHp:440,enemyHp:440,playerCapacity:12,playerAdmin:admin});

test('SNS does not add cosmetic opening cursors or advertise an opening HP bonus',()=>{
  const normal=battle([]),social=battle(['sns']),before=[social.player.hp,social.player.maxHp,social.player.capacity,social.player.income];
  const a=startTraffic(normal),b=startTraffic(social);
  assert.equal(b.traffic.base.player,a.traffic.base.player);
  assert.equal(b.traffic.cursors.length,a.traffic.cursors.length);
  assert.ok(b.logs.every(([,text,time])=>!(time===0&&/SNS.*\+10|SNS.*回復/.test(text))));
  assert.deepEqual([social.player.hp,social.player.maxHp,social.player.capacity,social.player.income],before);
});

test('server metric reports actual boosted HP without claiming CPU or load capacity',()=>{
  const b=battle(['server']),{traffic}=startTraffic(b);
  assert.equal(b.player.hp,550);assert.equal(b.player.capacity,12);
  const text=traffic.metric('server',b.player);
  assert.match(text,/閲覧者HP/);assert.match(text,/550\s*\/\s*550/);assert.match(text,/最大.*25%/);
  assert.doesNotMatch(text,/負荷|処理能力|CPU/);
});

test('SNS metric counts only clamped effective healing from actual 3s and 8s engine events',()=>{
  const b=battle(['sns']),{traffic}=startTraffic(b);
  assert.match(traffic.metric('sns',b.player),/累計回復 0.*閲覧者HP/);
  assert.match(traffic.metric('sns',b.player),/初回3秒.*5秒/);
  b.player.hp=438;
  const events=[];for(let i=0;i<160;i++)events.push(...b.step(.05));
  const heals=events.filter(e=>e.kind==='admin'&&e.admin==='sns');
  assert.deepEqual(heals.map(e=>[e.time,e.value]),[[3,2],[8,0]]);
  assert.match(traffic.metric('sns',b.player),/累計回復 2.*閲覧者HP/);
  assert.doesNotMatch(traffic.metric('sns',b.player),/人|流入|\+10/);
});

test('server display explicitly identifies the cosmetic meter as HP depletion',()=>{
  const b=battle(['server']),{traffic}=startTraffic(b);b.player.hp=275;
  const originalDocument=globalThis.document,attributes={},style={},metric={textContent:''};
  const meter={setAttribute(k,v){attributes[k]=String(v);}};
  const widget={dataset:{admin:'server'},style:{setProperty(k,v){style[k]=v;}},querySelector(s){return s==='.aw-metric'?metric:s==='.v-load'?meter:null;}};
  const frame={querySelector(){return null;},querySelectorAll(){return [widget];}};
  globalThis.document={querySelector(s){return s==='#player-frame'?frame:null;}};
  try{traffic.hud();}finally{globalThis.document=originalDocument;}
  assert.match(metric.textContent,/275\s*\/\s*550/);
  assert.match(attributes['aria-label']??'',/閲覧者HP.*減少/);
  assert.equal(attributes['aria-valuenow'],'50');assert.equal(attributes['aria-valuemax'],'100');
  assert.equal(style['--load'],'50%');
  assert.equal(b.player.hp,275);assert.equal(b.player.capacity,12);
});

test('structure-dependent cursor density is labelled as animation rather than a new combat bonus',()=>{
  const {logs}=startTraffic(battle([]));
  const opening=logs.filter(([,text,time])=>time===0&&/連結/.test(text));
  assert.ok(opening.length>0);
  assert.ok(opening.every(([,text])=>/演出/.test(text)&&!/導線ボーナス/.test(text)));
});
