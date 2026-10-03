import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import { createDeferredMount } from "../src/feature-loader.js";

// Execute production deferred host functions with an injected module-load boundary.
// HTML ancestry is parsed structurally; browser paint/focus remain unverified.
test("QA: actual online host retries a failed load, mounts once, and removes only its loading header", async () => {
  const text = readFileSync(new URL("../src/app.ts",import.meta.url),"utf8");
  const start=text.indexOf("function deferredModalFeature"),end=text.indexOf("async function playRaidChallenge");
  const source=text.slice(start,end).replace('import("./online/panel.js")','loadModule()');
  assert.ok(!source.includes('import("./online/panel.js")'));
  const el=()=>({children:[],textContent:"",querySelector:()=>null,setAttribute(){},replaceChildren(){this.children=[];},append(...nodes){this.children.push(...nodes);}});
  const host=el(),head=el();
  let markup="",attempts=0,mounts=0,removed=0,disposals=0;
  head.remove=()=>removed++;
  const context={createDeferredMount,document:{createElement:el},modalHead:()=>'<button data-close-modal>Close</button>',
    $:selector=>selector==="#online-feature-host"?host:selector==="#online-loading-head"?head:{classList:{add(){}}},
    openModal(html){markup=html;},closeModal(){},
    async loadModule(){if(++attempts===1)throw new Error("offline");return{loadStyles:async()=>{},mountOnlinePanel(target,options){assert.equal(target,host);assert.equal(options.baseUrl,"/api/arena");mounts++;return{dispose(){disposals++;}};}};},
  };
  vm.runInNewContext(transformSync(source,{loader:"ts",target:"es2022"}).code+"\nonlinePanel();",context);
  await new Promise(resolve=>setImmediate(resolve));
  const tree=parseFragment(markup);
  const elements=tree.childNodes.filter(node=>node.tagName);
  const get=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
  assert.deepEqual(elements.map(node=>get(node,"id")),["online-loading-head","online-feature-host"]);
  assert.equal(get(elements[1],"class"),undefined,"online content must not inherit generic modal-inner text styling");
  assert.equal(removed,0,"failed loading must retain an available close header");
  assert.match(host.children[0].textContent,/画面を読み込めません/);
  const retry=host.children.find(node=>node.textContent==="画面をもう一度読み込む");
  assert.ok(retry);retry.onclick();retry.onclick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(attempts,2);
  assert.equal(mounts,1);
  assert.equal(removed,1,"loaded arena owns its close control without a duplicate loading header");
  context.modalFeatureDispose();context.modalFeatureDispose();
  assert.equal(disposals,1);
});

test("QA: online host withholds mount across stylesheet failure and succeeds only after CSS retry readiness", async () => {
  const text = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts",import.meta.url),"utf8");
  const source = text.slice(text.indexOf("function deferredModalFeature"), text.indexOf("async function playRaidChallenge")).replace('import("./online/panel.js")','loadModule()');
  const el=()=>({children:[],textContent:"",querySelector:()=>null,setAttribute(){},replaceChildren(){this.children=[];},append(...nodes){this.children.push(...nodes);}});
  const host=el(),head=el(),styles=[];let mounts=0,removed=0;
  head.remove=()=>removed++;
  const context={createDeferredMount,document:{createElement:el},modalHead:()=>'<button data-close-modal>Close</button>',
    $:selector=>selector==="#online-feature-host"?host:selector==="#online-loading-head"?head:{classList:{add(){}}},
    openModal(){},closeModal(){},
    async loadModule(){return {loadStyles(){return new Promise((resolve,reject)=>styles.push({resolve,reject}));},mountOnlinePanel(){mounts++;return{dispose(){}};}};},
  };
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  vm.runInNewContext(transformSync(source,{loader:"ts",target:"es2022"}).code+"\nonlinePanel();",context);
  await tick();assert.equal(mounts,0,"module delivery alone cannot mount an unstyled online panel");assert.equal(styles.length,1);assert.equal(removed,0);
  styles[0].reject(new Error("CSS unavailable"));await tick();assert.equal(mounts,0);assert.equal(removed,0);
  const retry=host.children.find(node=>node.textContent==="画面をもう一度読み込む");assert.ok(retry);retry.onclick();retry.onclick();await tick();
  assert.equal(styles.length,2,"duplicate retry still shares one readiness request");assert.equal(mounts,0);
  styles[1].resolve();await tick();assert.equal(mounts,1);assert.equal(removed,1);
});
