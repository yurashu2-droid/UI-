import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { createDeferredMount } from '../src/feature-loader.js';
import D from '../src/data.js';
import R from '../src/run.js';

// Execute exact app collection/deferred handlers with controlled async store/module
// boundaries. This does not establish browser file-dialog, focus or AT acceptance.
const app = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
const part = (from, to) => { const start=app.indexOf(from), end=app.indexOf(to,start); assert.ok(start>=0&&end>start); return app.slice(start,end); };
const code = transformSync(part('function deferredModalFeature<T>', 'function onlinePanel()') + part('async function collectionPanel()', 'function overflowPanel()'), {loader:'ts',target:'es2022'}).code.replace('import("./collection-backup-controls.js")', 'loadBackupControls()');
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
const flush = () => new Promise(resolve => setImmediate(resolve));
class Node {
  constructor(tag='div') { this.tagName=tag.toUpperCase(); this.children=[]; this.parentElement=null; this.attributes=new Map(); this._text=''; this.connected=false; }
  get isConnected() { return this.connected || !!this.parentElement?.isConnected; }
  get textContent() { return this._text + this.children.map(c=>c.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this._text=String(value); }
  append(...children) { for (const child of children) { child.parentElement=this; this.children.push(child); } }
  replaceChildren(...children) { for(const child of this.children)child.parentElement=null; this.children=[];this._text='';this.append(...children); }
  setAttribute(name,value) { this.attributes.set(name,String(value)); }
  getAttribute(name) { return this.attributes.get(name)??null; }
  querySelector() { return null; }
}
function fixture({list, blueprint, module}={}) {
  const modal=new Node('dialog'); modal.connected=true;modal.open=false;
  const hosts=new Map();const mounts=[],calls={renders:0,registrations:0,commits:0,disposals:0};
  const trophy={rewardId:'reward',captureId:'capture',componentId:'component',item:{type:'am_buy',w:150,h:44,appearanceId:'skin',provenanceId:'source'}};
  let trophies=[];
  const store={listTrophies:()=>list?.()??Promise.resolve(trophies),getBlueprint:()=>blueprint?.()??Promise.resolve({source:{name:'Test source'},components:[{componentId:'component',appearance:{}}]})};
  const doc={body:modal,activeElement:modal,createElement:tag=>new Node(tag)};
  const moduleValue={mountCollectionBackupControls(host,options){const handle={host,options,dispose(){calls.disposals++;}};mounts.push(handle);return handle;}};
  const loadBackupControls=()=>module??Promise.resolve(moduleValue);
  const api=new Function('document','createDeferredMount','D','R','profileStore','loadBackupControls','mounts','calls','hosts','modal',`
    let modalFeatureDispose;
    let run=R.newRun('lab','mixed'),battle=null;
    const P=D.PARTS,toast=()=>{},save=()=>{},render=()=>calls.renders++,modalHead=()=>'';
    const editor={selected:()=>[],commit(fn){calls.commits++;return fn();}};
    const registerRaidBlueprint=async()=>{calls.registrations++;return {ok:true};};
    const renderRaidAppearance=(host)=>{host.textContent='captured preview';};
    function $(selector){if(selector==='#modal')return modal;const h=hosts.get(selector);if(!h)throw Error(selector);return h;}
    function closeModal(){modalFeatureDispose?.();modalFeatureDispose=undefined;modal.open=false;}
    function openModal(html){closeModal();modal.replaceChildren();hosts.clear();modal.open=true;for(const match of html.matchAll(/id="([^"\\s]+)"/g)){const host=document.createElement('div');hosts.set('#'+match[1],host);modal.append(host);}}
    ${code}
    return {open:collectionPanel,close:closeModal,get run(){return run;},replaceStore(){profileStore={};},get currentDisposer(){return modalFeatureDispose;}};
  `)(doc,createDeferredMount,D,R,store,loadBackupControls,mounts,calls,hosts,modal);
  return {...api,open:api.open,close:api.close,api,modal,hosts,mounts,calls,moduleValue,trophy,setTrophies:items=>{trophies=items;}};
}

test('actual empty collection mounts separate lazy backup controls without hiding the empty-state guidance',async()=>{
  const f=fixture();await f.open();await flush();
  assert.equal(f.mounts.length,1);assert.ok(f.hosts.has('#collection-backup-host'));
  assert.match(f.hosts.get('#collection-feature-host').textContent,/まだ持ち帰ったUIはありません/);
  assert.equal(f.mounts[0].options.isCurrent(),true);
  const css=readFileSync(new URL('../src/styles/features.css',import.meta.url),'utf8');
  assert.match(css,/\.collection-backup \.modal-footer\s*\{[^}]*flex-wrap:\s*wrap/);
});

test('collection close suppresses late optional module mounting and delayed list delivery even while old dialog nodes remain connected',async()=>{
  const loading=deferred(),listing=deferred();const f=fixture({list:()=>listing.promise,module:loading.promise});
  const work=f.open();await flush();const old=f.hosts.get('#collection-feature-host');f.close();
  assert.equal(old.isConnected,true,'native close need not detach the modal content');
  listing.resolve([f.trophy]);loading.resolve(f.moduleValue);await work;await flush();
  assert.equal(f.mounts.length,0);assert.equal(f.calls.registrations,0);assert.equal(old.children.length,0);
});

test('restored collection refreshes only its current list and registry without reopening the dialog or mutating the run',async()=>{
  const f=fixture();await f.open();await flush();const before=structuredClone(f.api.run),controls=f.mounts[0];
  assert.ok(controls,'backup controls must be available before restore');
  const oldHost=f.hosts.get('#collection-feature-host');f.setTrophies([f.trophy]);
  await controls.options.onRestored({added:1,unchanged:0},()=>true);
  assert.equal(f.hosts.get('#collection-feature-host'),oldHost);assert.equal(f.mounts.length,1);
  assert.equal(oldHost.children.length,1);assert.equal(f.calls.registrations,1);assert.equal(f.calls.renders,1);
  assert.deepEqual(f.api.run,before);
});

test('closed collection ignores restored callback and stale trophy action',async()=>{
  const f=fixture();f.setTrophies([f.trophy]);await f.open();await flush();
  const controls=f.mounts[0],old=f.hosts.get('#collection-feature-host');assert.ok(controls);
  const action=old.children[0].children.at(-1);f.close();
  await controls.options.onRestored({added:1,unchanged:0},()=>true);action.onclick();
  assert.equal(f.calls.disposals,1);assert.equal(f.calls.renders,0);assert.equal(f.calls.commits,0);
  assert.equal(controls.options.isCurrent(),false);
});

test('replacement collection keeps newer list when an old capture read completes',async()=>{
  const capture=deferred();let reads=0;
  const f=fixture({blueprint:()=>++reads===1?capture.promise:Promise.resolve(undefined)});f.setTrophies([f.trophy]);
  const first=f.open();await flush();const old=f.hosts.get('#collection-feature-host');
  f.setTrophies([]);await f.open();await flush();const current=f.hosts.get('#collection-feature-host');
  capture.resolve({source:{name:'late'},components:[]});await first;await flush();
  assert.equal(old.children.length,0);assert.match(current.textContent,/まだ持ち帰ったUIはありません/);assert.equal(f.calls.registrations,0);
});
