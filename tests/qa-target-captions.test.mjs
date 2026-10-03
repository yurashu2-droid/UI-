import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import Effects from '../src/effects.js';
import {applyCombatFeedback,combatFeedback} from '../src/catalog/combat-feedback.js';
import {targetCaption} from '../src/catalog/target-caption.js';
import {onlineReplayState,applyOnlineReplayFeedback,onlineEventText} from '../src/online/replay.js';

// Production mutations this suite catches: canonical-only captions at any caller,
// wrong-side lookup for reused IDs, stale retained text, and unescaped HTML logs.
function fixture() {
  const boards=['player','enemy'].map((side,index)=>[
    {...C.makeItem('gh_transfer','upper',24,24,320,112),label:`${side}-main.zip`},
    {...C.makeItem('gh_transfer','lower',24,300,320,112),label:`${side}-docs.zip`},
    C.makeItem('go_cache','cache',360,index?300:24),
    C.makeItem('am_newsletter','news',600,420,280,60),
    C.makeItem('ad_popup','popup',600,500,280,88),
  ]);
  for(const board of boards)for(const item of board)assert.equal(C.canPlace(board,item,item.x,item.y),true,item.id);
  return new E.Battle(...boards,{playerHp:10000,enemyHp:10000,playerCapacity:99,enemyCapacity:99});
}
function textField() {
  const field={textContent:'',title:''};
  Object.defineProperty(field,'innerHTML',{set(){throw new Error('untrusted target captions must stay in textContent');}});
  return field;
}
function nativeHost(id) {
  const target=textField(),state=textField(),classes=new Set(),vars=new Map();
  const cover={querySelector(){return null;},style:{setProperty(){}},remove(){}};
  return {dataset:{id},target,state,classes,vars,
    classList:{toggle(key,active){active?classes.add(key):classes.delete(key);},add(key){classes.add(key);},remove(key){classes.delete(key);}},
    style:{setProperty(key,value){vars.set(key,value);}},
    querySelector(selector){return selector==='.cache-target'?target:selector==='.popup-state, .cache-state'?state:selector===':scope > .native-popup-cover'?cover:null;},
  };
}
function nativeBoards(battle) {
  return Object.fromEntries(['player','enemy'].map(side=>{
    const hosts=new Map(battle[side].parts.map(part=>[part.id,nativeHost(part.id)]));
    return [side,{hosts,style:{setProperty(){}},prepend(){},querySelector(selector){return hosts.get(selector.match(/^\[data-id="(.*)"\]$/)?.[1])??null;},querySelectorAll(){return [...hosts.values()];}}];
  }));
}
function battleSnapshot(battle) {
  return JSON.stringify({ticks:battle.ticks,parts:[battle.player.parts,battle.enemy.parts],states:[...battle.states.player,...battle.states.enemy],metrics:battle.metrics});
}
function mainProjection(battle,boards) {
  const previous=globalThis.document;
  globalThis.document={querySelector(selector){return /^#(player|enemy)-frame$/.test(selector)?{classList:{toggle(){}},querySelector(){return null;}}:null;}};
  const fx=Object.create(Effects.prototype);
  Object.assign(fx,{part(side,id){return boards[side].hosts.get(id);},renderLog(){}});
  try {fx.update(battle);} finally {globalThis.document=previous;}
}
function replayProjection(battle,boards) {
  applyOnlineReplayFeedback({querySelector(selector){return boards[selector.includes('"self"')?'player':'enemy'];}},battle);
}
function assertInitial(boards) {
  assert.equal(boards.player.hosts.get('cache').target.textContent,'対象：player-main.zip（ZIPファイル転送）');
  assert.equal(boards.enemy.hosts.get('cache').target.textContent,'対象：enemy-docs.zip（ZIPファイル転送）');
  assert.equal(boards.player.hosts.get('popup').state.title,'対象：enemy-main.zip（ZIPファイル転送）');
  assert.equal(boards.enemy.hosts.get('popup').state.title,'対象：player-main.zip（ZIPファイル転送）');
}
function exerciseProjection(battle,boards,project) {
  const before=battleSnapshot(battle);
  project();project();assertInitial(boards);
  assert.equal(battleSnapshot(battle),before,'presentation cannot change targets, charge, clocks or metrics');
  const upper=battle.player.parts.find(part=>part.id==='upper');
  const hostile='\u202e<img src=x onerror="bad()">\u2069\n資料';
  upper.label=hostile;
  project();
  const expected='対象：<img src=x onerror="bad()"> 資料（ZIPファイル転送）';
  assert.equal(boards.player.hosts.get('cache').target.textContent,expected);
  assert.equal(boards.enemy.hosts.get('popup').state.title,expected);
  upper.label='資料'.repeat(39)+'甲A';project();
  assert.equal(boards.player.hosts.get('cache').target.textContent,`対象：${upper.label}（ZIPファイル転送）`);
  upper.label='foreign';upper.type='constructor';project();
  assert.equal(boards.player.hosts.get('cache').target.textContent,'対象：foreign（UI）');
  upper.type='gh_transfer';
  const state=battle.states.player.get('cache');
  for(const missing of [undefined,'not-a-real-id']) {
    state.target=missing;project();
    assert.equal(boards.player.hosts.get('cache').target.textContent,'接続対象なし');
    assert.equal(boards.player.hosts.get('cache').target.title,'接続対象なし');
  }
  battle.states.player.delete('cache');project();
  assert.equal(boards.player.hosts.get('cache').target.textContent,'接続対象なし');
  battle.states.player.set('cache',state);
  state.target='lower';project();
  assert.equal(boards.player.hosts.get('cache').target.textContent,'対象：player-docs.zip（ZIPファイル転送）');
  battle.states.enemy.get('popup').target='missing';project();
  assert.equal(boards.enemy.hosts.get('popup').state.title,'接続対象なし');
}

for(const [name,project] of [['Effects.update',mainProjection],['online replay feedback',replayProjection]]) {
  test(`QA: actual ${name} resolves cross-side duplicate IDs and replaces hostile, long and missing target captions`,()=>{
    const battle=fixture(),boards=nativeBoards(battle);
    exerciseProjection(battle,boards,()=>project(battle,boards));
  });
}

test('QA: actual URL-raid tick host uses the same side-aware captions, safely repeats and aborts',async()=>{
  const source=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
  const start=source.indexOf('async function playRaidChallenge('),end=source.indexOf('async function raidPanel(',start);
  assert.ok(start>=0&&end>start);
  const battle=fixture(),boards=nativeBoards(battle),status=textField();
  let tick,removed=0,disconnected=0;
  const live={className:'',innerHTML:'',remove(){removed++;},querySelector(selector){return selector==='[data-raid-live="player"]'?boards.player:selector==='[data-raid-live="enemy"]'?boards.enemy:status;}};
  const context={D,P:D.PARTS,targetCaption,applyCombatFeedback,combatFeedback,run:{},profileStore:null,
    prepareRaidChallenge(){return {battle,blueprint:{},battleId:'qa-caption-raid',snapshot:{owned:[],page:{theme:'mixed'}}};},
    registerRaidBlueprint:async()=>{},V:{render(){}},R:{pageDecor(){return [];}},createRaidEnemy(){return [];},renderRaidAppearance(){},
    document:{createElement(type){return type==='section'?live:{style:{}};}},
    ResizeObserver:class{observe(){}disconnect(){disconnected++;}},performance:{now(){return 0;}},
    requestAnimationFrame(callback){tick=callback;return 1;},cancelAnimationFrame(){},setTimeout(){},
  };
  vm.runInNewContext(transformSync(source.slice(start,end),{loader:'ts',target:'es2022'}).code,context);
  const controller=new AbortController();
  const promise=context.playRaidChallenge({prepend(){}},{},controller.signal);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof tick,'function');
  try {exerciseProjection(battle,boards,()=>tick(0));}
  finally {controller.abort();await assert.rejects(promise,/対戦表示を閉じました/);}
  assert.equal(removed,1);assert.equal(disconnected,1);
  const after=boards.player.hosts.get('cache').target.textContent;
  battle.player.parts.find(part=>part.id==='lower').label='should not render after abort';tick(0);
  assert.equal(boards.player.hosts.get('cache').target.textContent,after);
});

const walk=node=>[node,...(node.childNodes??[]).flatMap(walk)];
const content=node=>node.value??(node.childNodes??[]).map(content).join('');
test('QA: actual main control events escape editable target labels and identify the event target',()=>{
  const battle=fixture(),fx=Object.create(Effects.prototype);
  Object.assign(fx,{lines:{player:[],enemy:[]},part(){return null;},pulse(){}});
  const part=battle.player.parts.find(part=>part.id==='upper');
  part.label='<img src=x onerror="bad()"> & release.zip';
  for(const action of ['blocked','cover','release']) {
    fx.lines={player:[],enemy:[]};
    fx.emit({kind:'control',side:'enemy',id:'popup',target:'player',to:'upper',action,time:3},battle);
    const html=[...fx.lines.player,...fx.lines.enemy].join('');
    const parsed=parseFragment(html);
    assert.ok(content(parsed).includes(`${part.label}（ZIPファイル転送）`),action);
    assert.equal(walk(parsed).some(node=>node.tagName==='img'||node.attrs?.some(attr=>attr.name.startsWith('on'))),false,action);
    assert.ok(!content(parsed).includes('enemy-main.zip'),action);
  }
});

test('QA: online control text identifies the actual protected, covered or released part without HTML encoding',()=>{
  const battle=fixture(),target=battle.player.parts.find(part=>part.id==='upper');
  target.label='<b>main.zip</b>';
  for(const action of ['blocked','cover','release']) {
    const text=onlineEventText({kind:'control',side:'enemy',id:'popup',target:'player',to:'upper',action,time:3},battle);
    assert.ok(text.includes(`${target.label}（ZIPファイル転送）`),action);
    assert.match(text,/あなた/);assert.ok(!text.includes('enemy-main.zip'));
  }
  const source=readFileSync(new URL('../src/online/panel.ts',import.meta.url),'utf8');
  assert.match(source,/log\.textContent\s*=\s*replayLog\.join\(/,'the actual online panel must keep plain control text out of HTML');
});

test('QA: legal real-time control events retain their original target IDs while live captions describe those targets',()=>{
  const battle=fixture(),untouched=fixture(),boards=nativeBoards(battle);
  const events=[],control=[];
  for(let tick=0;tick<480;tick++) {
    const actual=battle.step(.05),expected=untouched.step(.05);
    assert.deepEqual(actual,expected);events.push(...actual);
    mainProjection(battle,boards);replayProjection(battle,boards);
    for(const event of actual.filter(event=>event.kind==='control'&&['blocked','cover','release'].includes(event.action))) {
      control.push(event);
      assert.equal(event.to,'upper');
      assert.ok(onlineEventText(event,battle).includes(`${event.target}-main.zip（ZIPファイル転送）`));
    }
  }
  assert.equal(control.filter(event=>event.action==='blocked'&&event.target==='player').length,2);
  assert.equal(control.filter(event=>event.action==='blocked'&&event.target==='enemy').length,0);
  assert.deepEqual(battle.metrics,untouched.metrics);
  assert.equal(battleSnapshot(battle),battleSnapshot(untouched));
  assert.ok(events.some(event=>event.kind==='control'&&event.action==='cache-ready'));
  assertInitial(boards);
  const replay=onlineReplayState(battle);
  assert.equal(replay.find(part=>part.side==='self'&&part.id==='cache').feedback.targetText,'対象：player-main.zip（ZIPファイル転送）');
});

test('QA: online refill text names its actual protected target, but detached or missing target events stay honest',()=>{
  const battle=fixture();
  let ready;
  for(let tick=0;tick<240&&!ready;tick++)ready=battle.step(.05).find(event=>event.kind==='control'&&event.action==='cache-ready'&&event.side==='player');
  assert.ok(ready,'the real blocked popup consumes cache and later refills it');
  assert.equal(ready.to,'upper');
  assert.match(onlineEventText(ready,battle),/player-main\.zip（ZIPファイル転送）/);
  for(const to of ['cache','missing']) {
    const text=onlineEventText({...ready,to},battle);
    assert.match(text,/再充填/);
    assert.ok(!text.includes('player-main.zip'));
    assert.ok(!text.includes('キャッシュ済み')&&!text.includes('undefined'));
    assert.ok(!text.includes('（キャッシュ'));
  }
  for(const action of ['blocked','cover','release']) {
    const event={kind:'control',side:'enemy',id:'popup',target:'player',to:'missing',action,time:3};
    const text=onlineEventText(event,battle);
    assert.ok(text.length>0);assert.ok(!text.includes('undefined'));
    const fx=Object.create(Effects.prototype);
    Object.assign(fx,{lines:{player:[],enemy:[]},part(){return null;},pulse(){}});
    assert.doesNotThrow(()=>fx.emit(event,battle));
    assert.ok(![...fx.lines.player,...fx.lines.enemy].join('').includes('undefined'));
  }
});
