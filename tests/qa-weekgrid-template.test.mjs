import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {Editor} from '../src/editor.js';
import {createRunPersistence} from '../src/persistence.js';
import {previewCatalogueAction} from '../src/catalog/preview.js';
import {resources} from '../src/buildlab.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';

// This tests production registration/render/editor/persistence boundaries using
// a narrow DOM adapter. It is not pixel, real-browser click or accessibility QA.
const template=()=>{const found=SITE_TEMPLATES.find(t=>t.id==='site_calendar');assert.ok(found,'WEEKGRID must be registered in the real catalogue');return found;};
const runFor=()=>R.newRun('lab',template().id);
const part=(run,type)=>run.owned.find(p=>p.type===type);
const clone=value=>JSON.parse(JSON.stringify(value));
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const resource=board=>resources(board.map(p=>[p.type,p.x,p.y,p.w,p.h]));

test('QA: WEEKGRID appends as a theme without changing any of the 82 canonical combat definitions',()=>{
 const t=template(),run=runFor();
 assert.ok(SITE_TEMPLATES.length>=24);assert.equal(SITE_TEMPLATES.filter(t=>t.id==='site_calendar').length,1);assert.equal(SITE_TEMPLATES[22].id,'site_gmail');assert.equal(SITE_TEMPLATES[23].id,t.id);
 assert.ok(R.labEnemies().length>=38);assert.equal(R.labEnemies().filter(e=>e.id==='site_calendar').length,1);assert.equal(R.labEnemies()[36].id,'site_gmail');assert.equal(R.labEnemies()[37].id,t.id);
 assert.equal(Object.keys(D.PARTS).length,82);
 assert.equal(createHash('sha256').update(JSON.stringify(D.PARTS)).digest('hex'),'a949b4d8aa8f8b8b55f60fb827bb8e5c21f62219fccbc6da05fdd570189f5fb6');
 assert.equal(Object.values(D.PARTS).filter(p=>p.status==='experimental').length,28);
 assert.equal(Object.values(D.PARTS).some(p=>p.faction==='calendar'),false);
 assert.equal(run.page.theme,'calendar');assert.equal(run.page.templateId,t.id);
 assert.deepEqual(run.owned.map(p=>p.type),['go_search','am_wish','go_lucky','yt_notify']);
 const value=resource(run.owned);assert.deepEqual([value.acquisitionValue,value.load,value.footprint,value.legal],[20,8,25600,true]);
});

const camel = value => value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class ElementAdapter {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument;
    this.parentElement = null; this.children = []; this.attributes = new Map();
    this.dataset = {}; this.style = {setProperty(name, value) { this[name] = value; }};
    this.className = ""; this.id = ""; this.open = false; this._text = "";
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(" "); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(" "); },
      toggle: (name, force) => { const add = force ?? !this.classList.contains(name); this.classList[add ? "add" : "remove"](name); return add; },
    };
  }
  get title() { return this.getAttribute("title") ?? ""; }
  set title(value) { this.setAttribute("title", value); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
  get tabIndex() { const value = this.getAttribute("tabindex"); return value === null ? -1 : Number(value); }
  set tabIndex(value) { this.setAttribute("tabindex", String(value)); }
  get isContentEditable() {
    const value = this.getAttribute("contenteditable")?.toLowerCase();
    if (value === "false") return false;
    if (value === "" || value === "true" || value === "plaintext-only") return true;
    return this.parentElement?.isContentEditable ?? false;
  }
  setAttribute(name, value) {
    const text = String(value); this.attributes.set(name, text);
    if (name === "id") this.id = text;
    if (name === "class") this.className = text;
    if (name === "open") this.open = true;
    if (name.startsWith("data-")) this.dataset[camel(name.slice(5))] = text;
  }
  getAttribute(name) {
    if (name === "class") return this.className || null;
    if (name === "id") return this.id || null;
    if (name === "open") return this.open ? "" : null;
    if (name.startsWith("data-")) return this.dataset[camel(name.slice(5))] ?? null;
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node);
      node.parentElement = this; this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const node of this.children) node.parentElement = null;
    this.children = []; this._text = ""; this.append(...nodes);
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  set innerHTML(html) {
    const convert = node => {
      if (!node.tagName) return null;
      const element = new ElementAdapter(node.tagName, this.ownerDocument);
      for (const {name, value} of node.attrs || []) element.setAttribute(name, value);
      element._text = (node.childNodes || []).filter(child => child.nodeName === "#text").map(child => child.value).join("");
      element.append(...(node.childNodes || []).map(convert).filter(Boolean));
      return element;
    };
    this.replaceChildren(...parseFragment(html).childNodes.map(convert).filter(Boolean));
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  matches(selector) {
    return selector.split(",").some(part => {
      const chain = part.trim().split(/\s+/), simple = chain.pop();
      if (!simple) return false;
      const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      for (const [, id] of simple.matchAll(/#([\w-]+)/g)) if (this.id !== id) return false;
      for (const [, name] of simple.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
      for (const [, name, , value] of simple.matchAll(/\[([\w-]+)(?:=(['"]?)([^'"\]]*)\2)?\]/g)) {
        if (this.getAttribute(name) === null || value !== undefined && this.getAttribute(name) !== value) return false;
      }
      if (!chain.length) return true;
      if (chain.at(-1) === ">") { chain.pop(); return this.parentElement?.matches(chain.join(" ")) ?? false; }
      let ancestor = this.parentElement;
      while (ancestor) {
        if (ancestor.matches(chain.join(" "))) return true;
        ancestor = ancestor.parentElement;
      }
      return false;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector) {
    if (selector.startsWith(":scope > ")) return this.children.filter(child => child.matches(selector.slice(9)));
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return {left: 0, top: 0, width: 960, height: 680}; }
}


const app=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
const extract=name=>{const code=app.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'))?.[0];assert.ok(code,`real app ${name}`);return code;};
const editorOptions=app.match(/^const editor = new UIRaidEditor.Editor\([^]*?^\}\);/m)?.[0];
const changeListener=app.match(/^document.addEventListener\("change",[^]*?^\}\);/m)?.[0];
const submitListener=app.match(/^document.addEventListener\("submit",[^]*?^\}\);/m)?.[0];
assert.ok(editorOptions);assert.ok(changeListener);assert.ok(submitListener);
const appHost=transformSync(`${['save','frameMarkup','renderFrames','previewAction'].map(extract).join('\n')}\n${editorOptions}\n${changeListener}\n${submitListener}\nglobalThis.editor=editor;`,{loader:'ts',target:'es2022'}).code;
function fixture(t){
 const run=runFor(),globals=['document','Element','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLFormElement'];
 const old=new Map(globals.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const listeners=new Map();
 const doc={addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(listener);},createElement(tag){return new ElementAdapter(tag,this);},querySelector(selector){return this.body.querySelector(selector);},querySelectorAll(selector){return this.body.querySelectorAll(selector);}};
 doc.body=doc.createElement('body');doc.activeElement=doc.body;globalThis.document=doc;
 for(const name of globals.slice(1))globalThis[name]=ElementAdapter;
 t.after(()=>{for(const[name,descriptor]of old)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];});
 for(const id of ['player-frame','enemy-frame','page-window','scene','traffic-hub','modal']){const node=doc.createElement(id==='modal'?'dialog':'section');node.id=id;doc.body.append(node);}
 const values=new Map(),counts={build:0,pulse:0},messages=[];
 const persistence=createRunPersistence({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},'qa-weekgrid-');
 let context;
 context=vm.createContext({UIRaidEditor:{Editor},run,R,V,C,D,memory:{},runPersistence:persistence,clone:structuredClone,preview:false,battle:null,view:'self',storyActive:false,storySession:null,
 profileStore:null,saveOK:true,saveProblem:'',document:doc,Element:ElementAdapter,HTMLInputElement:ElementAdapter,HTMLSelectElement:ElementAdapter,HTMLFormElement:ElementAdapter,
 $:selector=>doc.querySelector(selector),render(){context.renderFrames();},renderStorageNotice(){},renderSide(){},renderShop(){},renderCoach(){},afterBuildChange(){counts.build++;},toast:message=>messages.push(message),previewCatalogueAction,fx:{pulse(){counts.pulse++;}},
 appOpponent:()=>R.opponent(context.run),appEnemyBoard:()=>R.enemyBoard(context.run),ENEMY_ERA:{},labPressureCapacity:()=>null,pressureMeterMarkup:()=>'',adminDock:()=>'',scheduleFit(){},esc:V.esc,icon:V.icon});
 vm.runInContext(appHost,context);context.renderFrames();
 return{doc,context,editor:context.editor,values,messages,counts,item:type=>part(context.run,type),node:type=>doc.querySelector(`#player-body .web-node[data-id="${part(context.run,type).id}"]`),stored:()=>persistence.load('lab'),
 change(label){const input=doc.createElement('input');input.id='part-label';input.value=label;for(const listener of listeners.get('change')??[])listener({target:input});},
 submit(form){const event={target:form,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const listener of listeners.get('submit')??[])listener(event);return event;}};
}

function trace(board,swapped=false){
 const foe=[C.makeItem('ab_link','meter-link',0,0,192,32)],side=swapped?'enemy':'player';
 const battle=new E.Battle(swapped?foe:board,swapped?board:foe,{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12,playerAdmin:[],enemyAdmin:[]}),events=[],snapshots={};
 for(let tick=1;tick<=480;tick++){events.push(...battle.step(.05));if(tick===134||tick===480)snapshots[tick/20]=clone(battle.metrics[side]);}
 return{battle,events:events.filter(e=>e.side===side),snapshots,side};
}

test('QA: actual calendar run accepts repeat moves, rejects collisions atomically, and round-trips its saved opponent',()=>{
 const run=runFor(),wish=part(run,'am_wish'),original=clone(run),baseline=trace(run.owned);
 assert.equal(R.move(run,wish.id,448-8,236),false);assert.deepEqual(run,original);
 assert.equal(C.moveMany(run.owned,[wish.id],-104,0),true);
 assert.equal(E.analyze(run.owned).groups.find(g=>g.kind==='search-form').items.includes(wish.id),true);
 for(let i=0;i<2;i++)assert.equal(R.move(run,wish.id,456,236),true);
 assert.equal(R.move(run,wish.id,null,null),true);
 assert.deepEqual(run.owned.filter(p=>p.x===null).map(p=>p.id),[wish.id],'visual day columns have no child ownership');
 assert.deepEqual(E.analyze(run.owned).groups,[]);
 assert.equal(R.move(run,wish.id,560,236),true);assert.deepEqual(run,original);assert.deepEqual(trace(run.owned).events,baseline.events);
 run.stage=37;const saved=clone(run);assert.equal(R.validateRun(saved),true);
 assert.equal(saved.page.theme,'calendar');assert.equal(saved.page.templateId,'site_calendar');assert.equal(R.opponent(saved).id,'site_calendar');
 assert.deepEqual(R.pageDecor(saved),template().decor);
 assert.deepEqual(R.enemyBoard(saved).map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]),run.owned.map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]));
 assert.deepEqual(R.fuse(saved),[]);assert.deepEqual([saved.cash,saved.admin,saved.capacity],[original.cash,original.admin,original.capacity]);
});

test('QA: the registered Wish movement separates adjacency power from real row grouping and natural cadence',()=>{
 const run=runFor(),wish=part(run,'am_wish'),search=part(run,'go_search'),lucky=part(run,'go_lucky'),bell=part(run,'yt_notify');
 const original=clone(run.owned),variants={lucky:original};
 for(const[name,x,y]of [['search',456,236],['misaligned',456,238],['disconnected',504,340]]){
  const board=clone(original);assert.equal(C.moveMany(board,[wish.id],x-wish.x,y-wish.y),true);variants[name]=board;
 }
 const expected={lucky:[46,10,152],search:[38,5,181],misaligned:[32,5,160],disconnected:[28,5,146]};
 for(const[name,board]of Object.entries(variants)){
  const info=E.analyze(board),result=trace(board),reverse=trace([...board].reverse()),swapped=trace(board,true);
  assert.deepEqual(resource(board),resource(original));assert.deepEqual(info.parents,{});
  assert.deepEqual([info.counts.google,info.counts.amazon,info.counts.youtube],[2,1,1]);
  assert.deepEqual([result.snapshots[6.7].hpDamage,result.snapshots[6.7].healing,result.snapshots[24].hpDamage],expected[name]);
  assert.deepEqual([result.snapshots[24].healing,result.snapshots[24].shielding,result.battle.player.income,result.battle.player.lag],[25,30,0,1]);
  assert.deepEqual(result.events,reverse.events);assert.deepEqual(result.snapshots,swapped.snapshots);
  assert.equal(result.events.some(e=>e.kind==='echo'||e.echo),false);
  const damages=id=>result.events.filter(e=>e.kind==='damage'&&e.id===id).map(e=>e.value);
  assert.ok(damages(search.id).every(v=>v==={lucky:8,search:13,misaligned:10,disconnected:8}[name]));
  assert.deepEqual(info.near[bell.id],[]);assert.equal(info.mods[bell.id].speed,1);assert.equal(info.mods[bell.id].power,1);
  assert.ok(result.events.filter(e=>e.kind==='heal').every(e=>e.value===5),'search-form power never enlarges Wish healing');
  const fires=id=>result.events.filter(e=>e.kind==='fire'&&e.id===id).map(e=>e.time);
  close(fires(search.id)[0],1.8);close(fires(bell.id)[0],2);close(fires(lucky.id)[0],name==='lucky'?1.25:1.4);close(fires(wish.id)[0],name==='lucky'?2.25:2.5);
  assert.equal(info.mods[wish.id].power,name==='search'?1.3:1);assert.equal(info.mods[lucky.id].speed,name==='lucky'?1.12:1);
  assert.deepEqual(info.groups.map(g=>g.kind),name==='lucky'?['button-group']:name==='search'?['search-form']:[]);
  if(name==='misaligned')assert.ok(info.near[search.id].includes(wish.id),'nearby culture survives the two-pixel row mismatch');
  if(name==='disconnected')assert.deepEqual(info.near[wish.id],[]);
 }
 for(const name of ['lucky','search']){
  const enlarged=variants[name].map(p=>p.id===bell.id?p:{...p,h:72});assert.ok(enlarged.every(p=>C.canPlace(enlarged,p,p.x,p.y)));
  assert.equal(resource(enlarged).footprint,44288);assert.deepEqual(trace(enlarged).events,trace(variants[name]).events,'extra artwork area is not the source of this tradeoff');
 }
});

test('QA: real calendar frame and decor stay inert while native controls retain their original markup',t=>{
 const h=fixture(t),run=h.context.run;
 const paper=h.doc.querySelector('#player-frame .browser-paper');assert.ok(paper.classList.contains('site-theme-calendar'));
 assert.match(paper.querySelector('.site-header').textContent,/WEEKGRID/);assert.match(V.header('calendar'),/Google Calendar.*非公式/);
 const decor=h.doc.querySelectorAll('#player-body .page-decor');assert.equal(decor.length,template().decor.length);
 for(const el of decor){
  assert.ok(el.children.length>0,'the real decor dispatcher must resolve every calendar token');
  assert.equal(el.querySelectorAll('button,input,select,textarea,form,a,script,iframe,img,audio,video,object,embed').length,0);
  for(const node of [el,...el.querySelectorAll('*')])for(const[name]of node.attributes)assert.ok(!['src','srcset','href','action','formaction','data-ui'].includes(name)&&!name.startsWith('on'));
 }
 for(const p of run.owned)assert.equal(V.markup(p,{theme:'calendar'}),V.markup(p,{theme:'mixed'}));
 assert.equal(h.node('go_search').querySelector('input').getAttribute('aria-label'),'検索キーワード');
 assert.equal(h.node('am_wish').querySelector('button').dataset.ui,'wish');assert.equal(h.node('yt_notify').querySelector('button').dataset.ui,'notify');assert.equal(h.node('go_lucky').querySelector('button').dataset.ui,'press');
 for(const control of h.doc.querySelectorAll('#player-body button,#player-body input'))assert.equal(control.tabIndex,-1);
 const css=readFileSync(new URL('../src/catalog/calendar.css',import.meta.url),'utf8');
 assert.match(css,/\.site-theme-calendar/);assert.match(css,/pointer-events:\s*none/);assert.doesNotMatch(css,/\.native-|\.web-node|\.node-/);
 assert.match(readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8'),/@import\s+['"]\.\.\/catalog\/calendar\.css['"]/);
});

test('QA: actual calendar label edits save, undo and redo without changing controls or combat',t=>{
 const h=fixture(t),before=clone(h.context.run),originalEvents=trace(before.owned).events;
 for(const type of ['go_search','am_wish','go_lucky','yt_notify']){
  const item=h.item(type),old=item.label,label=`<img src=x onerror="bad()"> & ${type}`;
  h.editor.selection=new Set([item.id]);h.change(label);
  assert.equal(h.item(type).label,label);assert.equal(h.stored().status,'loaded');assert.equal(h.stored().run.owned.find(p=>p.id===item.id).label,label);
  const node=h.node(type);assert.equal(node.getAttribute('aria-label'),`${label}（${D.PARTS[type].name}）`);assert.equal(node.querySelector('img'),null);
  if(type==='go_search')assert.equal(node.querySelector('input').getAttribute('value'),label);
  if(type==='am_wish'||type==='go_lucky')assert.ok(node.querySelector('button').textContent.includes(label));
  if(type==='yt_notify'){assert.equal(node.querySelector('button').dataset.ui,'notify');assert.ok(node.querySelector('.notification-dot'));}
  h.editor.undo();assert.equal(h.item(type).label,old);h.editor.redo();assert.equal(h.item(type).label,label);
 }
 const saved=clone(h.stored().run);assert.equal(R.validateRun(saved),true);assert.equal(saved.page.templateId,'site_calendar');assert.deepEqual(trace(saved.owned).events,originalEvents);
 h.context.run=saved;h.context.renderFrames();assert.equal(h.doc.querySelectorAll('#player-body .web-node').length,4);
 assert.deepEqual([saved.cash,saved.admin,saved.capacity],[before.cash,before.admin,before.capacity]);
});

test('QA: repeated native Wish, bell, Lucky and search previews remain local and do not save or alter combat',t=>{
 const h=fixture(t);h.context.preview=true;h.context.renderFrames();
 const before=clone(h.context.run),stored=[...h.values],history=h.editor.history.length;
 for(const type of ['am_wish','yt_notify']){
  const control=h.node(type).querySelector('button');assert.equal(control.tabIndex,0);
  for(const state of [true,false,true]){h.context.previewAction({target:control});assert.equal(control.classList.contains('is-on'),state);}
  h.context.battle={};h.context.previewAction({target:control});assert.equal(control.classList.contains('is-on'),true);h.context.battle=null;
 }
 const lucky=h.node('go_lucky').querySelector('button');for(let i=0;i<3;i++)h.context.previewAction({target:lucky});
 const form=h.node('go_search').querySelector('form');form.querySelector('input').value='架空の予定を探す';
 for(let i=0;i<2;i++)assert.equal(h.submit(form).defaultPrevented,true);
 assert.equal(h.messages.filter(m=>m.includes('ページ内の操作デモ')).length,2);
 assert.equal(form.getAttribute('action'),null);assert.equal(form.getAttribute('method'),null);
 h.change('blocked during preview');assert.deepEqual(h.context.run,before);assert.deepEqual([...h.values],stored);assert.equal(h.editor.history.length,history);
 assert.deepEqual(trace(h.context.run.owned).events,trace(before.owned).events);
 h.context.preview=false;h.context.renderFrames();assert.equal(h.node('am_wish').querySelector('button').classList.contains('is-on'),false);assert.equal(h.node('yt_notify').querySelector('button').classList.contains('is-on'),false);
 assert.equal(h.node('go_search').querySelector('input').getAttribute('value'),part(before,'go_search').label);
});

test('QA: real editor movement repaints only the actual composite and preserves inert dates through undo and reload',t=>{
 const h=fixture(t),before=clone(h.context.run),wish=h.item('am_wish'),search=h.item('go_search'),lucky=h.item('go_lucky');
 const decorText=()=>h.doc.querySelectorAll('#player-body .page-decor').map(el=>el.textContent);
 const originalDecor=decorText();
 const grouped=kind=>h.doc.querySelector(`#player-body .composite-${kind}`)?.children.map(node=>node.dataset.id);
 assert.deepEqual(grouped('button-group'),[wish.id,lucky.id]);assert.equal(grouped('search-form'),undefined);
 h.editor.select([wish.id]);h.editor.update({x:456,y:236});
 assert.equal(h.item('am_wish').x,456);assert.deepEqual(grouped('search-form'),[search.id,wish.id]);assert.equal(grouped('button-group'),undefined);
 assert.deepEqual(decorText(),originalDecor);assert.equal(h.stored().run.owned.find(p=>p.id===wish.id).x,456);
 h.editor.undo();assert.deepEqual(h.context.run,before);assert.deepEqual(grouped('button-group'),[wish.id,lucky.id]);
 h.editor.redo();assert.deepEqual(grouped('search-form'),[search.id,wish.id]);assert.deepEqual(decorText(),originalDecor);
 h.context.run=clone(h.stored().run);assert.equal(R.validateRun(h.context.run),true);h.context.renderFrames();
 assert.deepEqual(grouped('search-form'),[search.id,wish.id]);assert.deepEqual(decorText(),originalDecor);
 assert.deepEqual(h.context.run.owned.filter(p=>p.id!==wish.id),before.owned.filter(p=>p.id!==wish.id));
});
