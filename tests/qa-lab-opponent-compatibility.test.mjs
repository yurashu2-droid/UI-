import test from "node:test";
import assert from "node:assert/strict";
import R from "../src/run.js";
import D from "../src/data.js";
import V from "../src/components.js";
import * as Lab from "../src/buildlab.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import { BUILDS } from "../src/builds.js";
import { createDeferredMount } from "../src/feature-loader.js";
import { roundRobinAsync } from "../src/buildlab-async.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Frozen continuation baseline, captured before adding b_search_documents.
// Lab saves persist only the numeric stage, so order is part of save compatibility.
const existingIds = [
  "retro", "gov", "google", "amazon", "youtube",
  "b_video", "b_cart", "b_text", "b_links", "b_fort", "b_echo",
  "b_fort_native", "b_documents_heavy", "b_video_checkout",
  "site_twitter_classic", "site_x", "site_wikipedia", "site_github", "site_niconico", "site_reddit",
  "site_yahoo_portal", "site_steam_store", "site_wayback", "site_twitch",
  "site_google_docs", "site_soundcloud", "site_stackoverflow", "site_google_reader", "site_rakuten",
  "site_github_releases", "site_hacker_news", "site_google_maps", "site_geocities", "site_bandcamp", "site_govuk",
];

test("QA: all 40 established laboratory opponent indices preserve saved meaning with only the reviewed notebook appended", () => {
  const reviewedIds=[...existingIds,"site_trello","site_gmail","site_calendar","site_figma","site_slack"];
  const currentIds=R.labEnemies().map(enemy=>enemy.id);
  assert.deepEqual(currentIds.slice(0,reviewedIds.length),reviewedIds);
  assert.deepEqual(currentIds.slice(reviewedIds.length),["site_notion"]);
  for (const [index,id] of [...reviewedIds,"site_notion"].entries()) {
    const run=R.newRun("lab");run.stage=index;
    const restored=JSON.parse(JSON.stringify(run));
    assert.equal(R.validateRun(restored),true);
    assert.equal(R.opponent(restored).id,id,`saved laboratory index ${index}`);
  }
});

test("QA: player-only compact presets load without becoming shifted laboratory opponents", () => {
  for (const id of ["b_search_documents", "b_navigation_replay"]) {
  const build=BUILDS.find(b=>b.id===id);
  assert.ok(build);
  assert.equal(build.labOpponent,false);
  const run=R.newRun("lab",build.id);
  assert.equal(run.owned.length,build.layout.length);
  assert.deepEqual(run.owned.map(item=>[item.type,item.x,item.y,item.w,item.h]),build.layout.map(row=>row.slice(0,5)));
  assert.equal(R.validateRun(JSON.parse(JSON.stringify(run))),true);
  assert.equal(R.labEnemies().some(enemy=>enemy.id===build.id),false);
  }
});

function appFunction(name, nextName) {
  const source=readFileSync(new URL("../src/app.ts",import.meta.url),"utf8");
  const from=source.indexOf("function "+name+"("),to=source.indexOf("function "+nextName+"(",from);
  assert.ok(from>=0&&to>from);
  return transformSync(source.slice(from,to),{loader:"ts",target:"es2022"}).code;
}

test("QA: generated compact build cards expose player loading without invalid enemy actions", async () => {
  let markup="", calculations=0;
  const document={};
  class HostElement extends ElementAdapter {
    get isConnected(){return this===document.body||!!this.parentElement?.isConnected;}
  }
  document.createElement=tag=>new HostElement(document,tag);
  document.body=document.createElement("body");document.activeElement=document.body;
  const modal={open:true},allElements=node=>[node,...node.children.flatMap(allElements)];
  const source=readFileSync(new URL("../src/app.ts",import.meta.url),"utf8");
  const deferredSource=source.match(/^function deferredModalFeature[^]*?^}/m)?.[0];
  assert.ok(deferredSource,"actual deferred feature declaration");
  const context={BUILDS,Lab,D,document,createDeferredMount,AbortController,
    esc:V.esc,modalHead:()=>"",modalFeatureDispose:undefined,
    openModal(html){markup=html;document.body.innerHTML=html;},
    $(selector){if(selector==="#modal")return modal;const found=allElements(document.body).find(node=>node.getAttribute("id")===selector.slice(1));assert.ok(found,selector);return found;},
    loadMatrixModule:async()=>({roundRobinAsync(...args){calculations++;return roundRobinAsync(...args);}}),
    window:{setTimeout,clearTimeout},
  };
  const book=appFunction("buildBook","settings").replace('import("./buildlab-async.js")','loadMatrixModule()');
  vm.runInNewContext(transformSync(deferredSource,{loader:"ts",target:"es2022"}).code+book+"\nbuildBook(); modalFeatureDispose();",context);
  // This test owns card generation. Execute the real deferred seam, then close
  // before delivery; full real matrix/table lifecycle is covered by its host test.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calculations,0,"closed card-only probe must not calculate the matrix");
  const all=node=>[node,...(node.childNodes??[]).flatMap(all)];
  const nodes=all(parseFragment(markup));
  const attr=(node,key)=>node.attrs?.find(a=>a.name===key)?.value;
  for (const id of ["b_search_documents", "b_navigation_replay"]) {
    assert.ok(nodes.some(node=>attr(node,"data-build-load")===id));
    assert.equal(nodes.some(node=>attr(node,"data-build-foe")===id),false);
  }
  assert.ok(nodes.some(node=>attr(node,"data-build-foe")==="b_cart"),"established enemy actions remain available");
});

test("QA: stale or unknown build enemy actions cannot silently change the selected opponent", () => {
  const run=R.newRun("lab");run.stage=19;
  let saves=0;
  const context={run,battle:null,R,BUILDS,closeModal(){},save(){saves++;},render(){},toast(){},switchMode(){throw Error("unexpected mode switch");}};
  vm.runInNewContext(appFunction("loadBuild","buildBook"),context);
  for(const id of ["b_search_documents","b_navigation_replay","removed-old-build"]){
    context.invalid=id;
    vm.runInNewContext("loadBuild(undefined,invalid);",context);
    assert.equal(run.stage,19,"unavailable target must leave saved selection unchanged");
    assert.equal(saves,0);
  }
  vm.runInNewContext('loadBuild(undefined,"b_cart");',context);
  assert.equal(R.opponent(run).id,"b_cart");
  assert.equal(saves,1);
  context.run=R.newRun("campaign");context.run.stage=3;
  const campaign=JSON.stringify(context.run);
  for(const id of ["b_search_documents","b_navigation_replay","removed-old-build"]){
    context.invalid=id;
    vm.runInNewContext("loadBuild(undefined,invalid);",context);
    assert.equal(JSON.stringify(context.run),campaign,"unavailable enemy cannot switch away from a campaign");
    assert.equal(saves,1);
  }
});
