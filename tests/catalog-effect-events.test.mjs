import test from "node:test";
import assert from "node:assert/strict";
import Effects from "../src/effects.js";

test("rate-limit events activate the defender's native notice and an explanatory log", () => {
  const documentBefore = globalThis.document;
  const mediaBefore = globalThis.matchMedia;
  const classes = new Set();
  const notice = { offsetWidth: 280, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
  globalThis.document = { querySelector(selector) { return selector === "#effect-layer" ? {} : selector.includes('data-id="guard"') ? notice : null; } };
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const fx = new Effects();
    const battle = { elapsed: 2, player: { parts: [{ id: "guard", type: "gov_rate_limit" }] }, enemy: { parts: [{ id: "link", type: "ab_link" }] } };
    fx.emit({ kind: "rate-limit", side: "player", id: "guard", from: "link", value: 4, remaining: 20, time: 2 }, battle);
    assert.ok(classes.has("is-rate-limited"));
    assert.match(fx.lines.player.join(""), /アクセス整理/);
    assert.match(fx.lines.player.join(""), /4/);
    assert.equal(fx.lines.enemy.length, 0);
  } finally { globalThis.document = documentBefore; globalThis.matchMedia = mediaBefore; }
});

test("comment replay renders safe text and bounds concurrent native comments", () => {
  const documentBefore = globalThis.document, mediaBefore = globalThis.matchMedia;
  const comments = [];
  const surface = {
    clientWidth: 400,
    ownerDocument: { createElement() {
      const n = { className: "", textContent: "", scrollWidth: 180, style: { top: "", setProperty() {} }, classList: { add() {} }, remove() { const i = comments.indexOf(n); if (i >= 0) comments.splice(i, 1); } };
      return n;
    } },
    querySelectorAll() { return [...comments]; }, append(n) { comments.push(n); },
  };
  globalThis.document = { querySelector() { return {}; } };
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const fx = new Effects();
    assert.equal(typeof fx.comment, "function");
    const player = { querySelector() { return surface; } };
    for (let i = 0; i < 6; i++) fx.comment(player, '<img src=x onerror="bad()">');
    assert.equal(comments.length, 4);
    assert.ok(comments.every((n) => n.textContent === '<img src=x onerror="bad()">'));
    assert.ok(comments.every((n) => !('innerHTML' in n)));
  } finally { globalThis.document = documentBefore; globalThis.matchMedia = mediaBefore; }
});

test('all canonical video sources use video-shaped battle packets', () => {
  const oldDocument=globalThis.document, oldMedia=globalThis.matchMedia;
  globalThis.document={querySelector(){return {};},createElement(){return {className:'',innerHTML:''};}};
  globalThis.matchMedia=()=>({matches:true});
  try {
    const fx=new Effects();
    for(const type of ['yt_play','yt_embed','nc_player']) assert.match(fx.packet(type).innerHTML,/pk-video/,type);
  } finally {globalThis.document=oldDocument;globalThis.matchMedia=oldMedia;}
});

test('history events update the one-record native view without duplicating normal heal logs',()=>{
  const oldDocument=globalThis.document,oldMedia=globalThis.matchMedia;
  const fields=new Map(['.history-time','.history-source','.history-recovery','.history-expiry'].map(k=>[k,{textContent:''}]));
  const button={disabled:true,title:''};
  const panel={classList:{toggle(){}},querySelector(k){return k==='[data-ui="history-restore"]'?button:fields.get(k);}};
  const host={querySelector(k){return k==='.native-version-history'?panel:null;}};
  globalThis.document={querySelector(selector){return selector==='#effect-layer'?{}:host;}};
  globalThis.matchMedia=()=>({matches:true});
  let record={sourceName:'変更差分',loss:22,recoverable:11,recordAt:40,expiresAt:140,consumed:false};
  try{
    const fx=new Effects();
    const battle={ticks:80,elapsed:4,player:{parts:[{id:'history',type:'go_history'}]},historyView(){return record;}};
    fx.emit({kind:'history',side:'player',id:'history',action:'record',value:0,time:4},battle);
    assert.equal(button.disabled,false);assert.match(fields.get('.history-recovery').textContent,/11/);
    assert.equal(fx.lines.player.length,0);
    record={...record,recoverable:0,consumed:true};
    fx.emit({kind:'history',side:'player',id:'history',action:'restore',value:11,time:4},battle);
    assert.equal(button.disabled,true);assert.match(fields.get('.history-recovery').textContent,/使用済み/);
    assert.equal(fx.lines.player.length,0,'normal heal event already owns the heal log');
  }finally{globalThis.document=oldDocument;globalThis.matchMedia=oldMedia;}
});

test('audio attacks travel as a waveform packet rather than a video or label pill',()=>{
  const oldDocument=globalThis.document,oldMedia=globalThis.matchMedia;
  globalThis.document={querySelector(){return {};},createElement(){return {className:'',innerHTML:''};}};globalThis.matchMedia=()=>({matches:true});
  try{const fx=new Effects();assert.match(fx.packet('sc_track').innerHTML,/pk-audio/);assert.doesNotMatch(fx.packet('sc_track').innerHTML,/pk-video|pk-pill/);}finally{globalThis.document=oldDocument;globalThis.matchMedia=oldMedia;}
});
test('audio activation presses its own local play control',()=>{
  const oldDocument=globalThis.document,oldMedia=globalThis.matchMedia,attrs=new Map(),classes=new Set();
  globalThis.document={querySelector(){return {};}};globalThis.matchMedia=()=>({matches:true});
  try{const fx=new Effects();const host={querySelector(){return {setAttribute(k,v){attrs.set(k,v);}};},classList:{add(c){classes.add(c);},remove(c){classes.delete(c);}}};fx.act(host,'sc_track');assert.equal(attrs.get('aria-pressed'),'true');assert.ok(classes.has('is-audio-playing'));}finally{globalThis.document=oldDocument;globalThis.matchMedia=oldMedia;}
});
test('audio waveform position follows the supplied battle clock and loops without wall-clock timers',()=>{
  const oldDocument=globalThis.document,oldMedia=globalThis.matchMedia,vars=new Map(),time={textContent:''};
  globalThis.document={querySelector(){return {};}};globalThis.matchMedia=()=>({matches:true});
  try{const fx=new Effects();assert.equal(typeof fx.syncAudio,'function');const host={querySelector(k){return k==='.audio-time'?time:{style:{setProperty(k,v){vars.set(k,v);}}};}};fx.syncAudio(host,96,1);assert.equal(time.textContent,'1:36');assert.equal(vars.get('--audio-position'),'0.5');fx.syncAudio(host,192,1);assert.equal(time.textContent,'0:00');assert.equal(vars.get('--audio-position'),'0');}finally{globalThis.document=oldDocument;globalThis.matchMedia=oldMedia;}
});

test('ZIP fire feedback distinguishes natural completion from replay without touching its clock',()=>{
 const flags=[],host={classList:{remove(){}},querySelector(){throw new Error('fire cannot reset progress');}};
 Effects.prototype.act.call({flag(_el,c){flags.push(c);}},host,'gh_transfer',false);assert.deepEqual(flags,['is-transfer-complete']);
 flags.length=0;Effects.prototype.act.call({flag(_el,c){flags.push(c);}},host,'gh_transfer',true);assert.deepEqual(flags,['is-transfer-reused']);
});
test('ZIP effect projects the remaining native clock and uses its own file packet',()=>{
 assert.equal(typeof Effects.prototype.syncTransfer,'function');
 const progress={value:0},percent={textContent:''},status={textContent:''};const panel={querySelector(s){return s==='progress'?progress:s==='.transfer-percent'?percent:status;}};const host={querySelector(s){return s==='.native-transfer'?panel:null;}};
 Effects.prototype.syncTransfer.call({},host,8,4);assert.equal(progress.value,.5);assert.equal(percent.textContent,'50%');Effects.prototype.syncTransfer.call({},host,8,4);assert.equal(progress.value,.5);
 const old=globalThis.document;globalThis.document={createElement(){return{className:'',innerHTML:''};}};
 try{assert.match(Effects.prototype.packet.call({},'gh_transfer').innerHTML,/pk-transfer.*ZIP/);}finally{globalThis.document=old;}
});
