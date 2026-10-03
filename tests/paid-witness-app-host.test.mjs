import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { createDeferredMount } from '../src/feature-loader.js';
import { ElementAdapter } from './support/raid-dom-adapter.mjs';
import R from '../src/run.js';
import D from '../src/data.js';
import { BUILDS } from '../src/builds.js';

// Actual app/modal/deferred functions; DOM and module delivery are adapters.
// This is not a native-browser focus, keyboard, CSS or accessibility check.
const source = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL('../src/app.ts', import.meta.url), 'utf8');
const section = (a,b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const extract = name => {
  const match=source.match(new RegExp(`^function ${name}(?:<[^>]+>)?\\([^]*?^}`, 'm'));
  assert.ok(match, `actual production ${name} exists`); return match[0];
};
const script = transformSync([
  section('let modalFeatureDispose:', '/* ---------- Isolated story profile'),
  ...['deferredModalFeature','modalHead','canOpenPaidWitness','paidWitnessPanel','menu'].map(extract),
  source.match(/\$<HTMLDialogElement>\("#modal"\)\.addEventListener\("cancel", \(event\) => \{[^]*?^\}\);/m)[0],
  'function dispatchPaidEntry(){'+source.slice(source.indexOf('    case "m-paid-witness":'),source.indexOf('    case "m-sound":')).replace(/^/, 'switch("m-paid-witness"){')+'}}',
].join('\n').replace('import("./paid-witness-panel.js")', 'loadPaidPanel()'), {loader:'ts',target:'es2022'}).code;
const tick = () => new Promise(resolve=>setImmediate(resolve));
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const esc = value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function app(){
  const doc={}, closes=[],loads=[],styles=[],mounts=[],focus=[];
  class Element extends ElementAdapter {
    get isConnected(){return this===doc.body || !!this.parentElement?.isConnected;}
    contains(node){return node===this || this.children.some(c=>c.contains(node));}
    get disabled(){return this.getAttribute('disabled')!==null;}
    remove(){if(this.isConnected&&this.contains(doc.activeElement))doc.activeElement=doc.body;super.remove();}
    replaceChildren(...nodes){if(this.children.some(n=>n.contains(doc.activeElement)))doc.activeElement=doc.body;super.replaceChildren(...nodes);}
    focus(options){doc.activeElement=this;focus.push({node:this,options});}
    showModal(){this.open=true;}
    close(){if(!this.open)return;this.open=false;closes.push(()=>this.dispatch('close'));}
    async cancel(){let prevented=false;await this.dispatch('cancel',{preventDefault(){prevented=true;}});if(!prevented)this.close();}
  }
  doc.createElement=tag=>new Element(doc,tag);doc.body=doc.createElement('body');doc.activeElement=doc.body;
  const modal=doc.createElement('dialog'),content=doc.createElement('div'),outside=doc.createElement('button');
  modal.setAttribute('id','modal');content.setAttribute('id','modal-content');modal.append(content);doc.body.append(modal,outside);
  const walk=node=>[node,...node.children.flatMap(walk)];
  const $=sel=>sel.startsWith('#')?walk(doc.body).find(n=>n.getAttribute('id')===sel.slice(1)):doc.body.querySelector(sel);
  doc.getElementById=id=>$(`#${id}`)??null;
  const run=R.newRun('lab','mixed'),editor={run,drag:null,selection:new Set(['p1']),history:[{existing:true}],future:[{redo:true}]};
  const context={document:doc,createDeferredMount,Error,D,BUILDS,esc,$,run,editor,view:'self',storyActive:false,battle:null,preview:false,settling:false,pendingStorySettlement:null,
    KEY:'qa-paid-',fx:{reduced:false},localStorage:{getItem(){return null;},setItem(){throw Error('must not save');}},
    fetch(){throw Error('must not fetch');},renderSide(){},leaveBattle(){},setTimeout,
    loadPaidPanel(){const request=deferred();loads.push(request);return request.promise;},
  };
  vm.runInNewContext(script,context);
  const module={loadStyles(){const request=deferred();styles.push(request);return request.promise;},mountPaidWitnessPanel(host,options){
    const record={host,options,disposed:0};mounts.push(record);const p=doc.createElement('p');p.textContent='comparison content';host.replaceChildren(p);return{dispose(){record.disposed++;}};
  }};
  return{c:context,doc,modal,content,outside,loads,styles,mounts,focus,$,module,
    open:()=>context.dispatchPaidEntry(),close:()=>context.closeModal(),
    async flushClose(){while(closes.length)await closes.shift()();},
    async deliverModule(i=loads.length-1){loads[i].resolve(module);await tick();},
    async deliverStyles(i=styles.length-1){styles[i].resolve();await tick();},
  };
}
const invalid = {
  campaign:h=>h.c.run.mode='campaign', phase:h=>h.c.run.phase='battle', story:h=>h.c.storyActive=true,
  battle:h=>h.c.battle={}, preview:h=>h.c.preview=true, enemy:h=>h.c.view='enemy',
  settlement:h=>h.c.pendingStorySettlement={}, settling:h=>h.c.settling=true, drag:h=>h.c.editor.drag={},
  editor:h=>h.c.editor={...h.c.editor,run:R.newRun('lab','mixed')},
};
for(const [name,change] of Object.entries(invalid))test(`paid entry rejects ${name} without opening or importing`,async()=>{const h=app();change(h);h.open();await tick();assert.equal(h.modal.open??false,false);assert.equal(h.loads.length,0);});

test('menu advertises only the lab comparison and actual entry keeps current Run/editor and header focus',async()=>{
  const h=app(),run=h.c.run,editor=h.c.editor,before=JSON.stringify(run),history=JSON.stringify(editor.history),future=JSON.stringify(editor.future);
  h.c.menu();assert.ok(h.$('#m-paid-witness'));assert.match(h.$('#m-paid-witness').textContent,/同じ14個/);h.open();await tick();assert.equal(h.loads.length,1);
  const header=h.$('#paid-witness-heading'),close=header.querySelector('[data-close-modal]');close.focus();
  await h.deliverModule();assert.equal(h.mounts.length,0);await h.deliverStyles();assert.equal(h.mounts.length,1);
  assert.deepEqual(Object.keys(h.mounts[0].options),['isCurrent']);assert.equal(h.mounts[0].options.isCurrent(),true);
  assert.equal(h.doc.activeElement,close);assert.equal(header.isConnected,true);assert.equal(h.focus.length,1);
  assert.equal(h.c.run,run);assert.equal(h.c.editor,editor);assert.equal(JSON.stringify(run),before);assert.equal(JSON.stringify(editor.history),history);assert.equal(JSON.stringify(editor.future),future);
  h.close();assert.equal(h.mounts[0].disposed,1);assert.equal(h.mounts[0].options.isCurrent(),false);await h.flushClose();assert.equal(h.mounts[0].disposed,1);
  h.c.run.mode='campaign';h.c.menu();assert.equal(h.$('#m-paid-witness'),undefined);
});
for(const phase of ['module','styles'])for(const route of ['close','cancel','native-close','replace','run','editor','story'])for(const failure of [false,true])test(`late ${phase} ${failure?'failure':'success'} is inert after ${route}`,async()=>{
  const h=app();h.open();await tick();if(phase==='styles')await h.deliverModule();
  const host=h.$('#paid-witness-host'),before=host.textContent;
  if(route==='close')h.close();else if(route==='cancel')await h.modal.cancel();else if(route==='native-close')h.modal.close();else if(route==='replace')h.c.openModal('<p>replacement</p>');else if(route==='run')h.c.run=R.newRun('lab','mixed');else if(route==='editor')h.c.editor={...h.c.editor};else h.c.storyActive=true;
  h.outside.focus();const req=phase==='module'?h.loads[0]:h.styles[0];failure?req.reject(Error('obsolete')):req.resolve(phase==='module'?h.module:undefined);await tick();
  assert.equal(h.mounts.length,0);assert.equal(host.textContent,before);assert.equal(h.doc.activeElement,h.outside);if(phase==='module')assert.equal(h.styles.length,0);await h.flushClose();
});
test('load failure has explicit retry, but stale retry cannot import after source ownership changes',async()=>{
  const h=app();h.open();await tick();h.loads[0].reject(Error('offline'));await tick();const host=h.$('#paid-witness-host'),retry=host.querySelector('button');assert.match(host.textContent,/読み込めません/);assert.ok(retry);
  retry.onclick();await tick();assert.equal(h.loads.length,2);await h.deliverModule();await h.deliverStyles();assert.equal(h.mounts.length,1);
  h.close();h.open();await tick();h.loads[2].reject(Error('offline'));await tick();const stale=h.$('#paid-witness-host').querySelector('button');h.c.run=R.newRun('lab','mixed');stale.onclick();await tick();assert.equal(h.loads.length,3);
});
test('connected but closed or changed-owner mounted panel becomes permanently invalid',async()=>{
  for(const route of ['native-close','run','editor','story']){
    const h=app();h.open();await tick();await h.deliverModule();await h.deliverStyles();const m=h.mounts[0],run=h.c.run,editor=h.c.editor;
    if(route==='native-close')h.modal.close();else if(route==='run')h.c.run=R.newRun('lab','mixed');else if(route==='editor')h.c.editor={...editor};else h.c.storyActive=true;
    assert.equal(m.options.isCurrent(),false);assert.equal(m.disposed,1);h.c.run=run;h.c.editor=editor;h.c.storyActive=false;h.modal.open=true;assert.equal(m.options.isCurrent(),false);assert.equal(m.disposed,1);
  }
});
test('queued old close cannot dispose the reopened comparison',async()=>{
  const h=app();h.open();await tick();await h.deliverModule();await h.deliverStyles();h.close();h.open();await tick();await h.deliverModule();await h.deliverStyles();await h.flushClose();assert.equal(h.mounts[1].disposed,0);assert.equal(h.mounts[1].options.isCurrent(),true);h.close();
});

test('owned loading retry returns focus to the persistent Close without stealing other focus',async()=>{
  for(const owned of [true,false]){
    const h=app();h.open();await tick();h.loads[0].reject(Error('offline'));await tick();const retry=h.$('#paid-witness-host').querySelector('button'),close=h.$('#paid-witness-heading').querySelector('[data-close-modal]');
    if(owned)retry.focus();else h.outside.focus();const count=h.focus.length;retry.onclick();await tick();
    assert.equal(h.doc.activeElement,owned?close:h.outside);assert.equal(h.focus.length,count+(owned?1:0));if(owned)assert.equal(h.focus.at(-1).options.preventScroll,true);
    await h.deliverModule();await h.deliverStyles();assert.equal(h.doc.activeElement,owned?close:h.outside);h.close();
  }
});

test('only the focused current menu entry can hand focus to the persistent Close',async()=>{
  for(const owned of [true,false]){
    const h=app();h.c.menu();const entry=h.$('#m-paid-witness');if(owned)entry.focus();else h.outside.focus();const count=h.focus.length;h.open();await tick();const close=h.$('#paid-witness-heading').querySelector('[data-close-modal]');
    assert.equal(h.doc.activeElement,owned?close:h.outside);assert.equal(h.focus.length,count+(owned?1:0));if(owned)assert.equal(h.focus.at(-1).options.preventScroll,true);h.close();
  }
});
