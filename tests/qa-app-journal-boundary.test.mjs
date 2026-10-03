import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import R from "../src/run.js";

// Execute the actual application's save function in an isolated host. This tests
// the journal/mirror boundary, not browser interaction or visual acceptance.
function appSaveFunction() {
  const text = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  const declaration = text.match(/^function save\(\) \{[\s\S]*?(?=^function renderStorageNotice\(\))/m)?.[0];
  assert.ok(declaration, "application save entry point exists");
  return transformSync(declaration, {loader:"ts",target:"es2022"}).code;
}

test("QA: a rejected application journal write cannot queue a stale IndexedDB mirror overwrite", async () => {
  const run = R.newRun("campaign"), mirrorWrites = [];
  const context = {
    run, storyActive:false, storySession:null, memory:{}, saveOK:true, saveProblem:"", profileProblem:"",
    clone:structuredClone, runPersistence:{ save:()=>({ok:false,error:"Another tab saved newer progress"}) },
    profileStore:{ async saveRun(snapshot) { mirrorWrites.push(structuredClone(snapshot)); } },
    profileWrites:Promise.resolve(), renderStorageNotice(){},
  };
  vm.runInNewContext(appSaveFunction() + "\nsave();", context);
  await context.profileWrites;
  assert.equal(context.saveOK, false);
  assert.equal(context.saveProblem, "Another tab saved newer progress");
  assert.deepEqual(mirrorWrites, [], "rejected local state must never roll back the recovery mirror");
});

test("QA: read-latest recovery asks before replacing local edits and resumes the actual save path", async () => {
  const original = R.newRun("campaign"), newer = structuredClone(original);
  const offer = newer.shop.find(stock => !stock.sold && !stock.type.startsWith("plan:"));
  assert.equal(R.purchase(newer, offer.type).ok, true);
  const { createRunPersistence } = await import("../src/persistence.js");
  const prefix = "qa-host-reload-", values = new Map([[prefix + "campaign", JSON.stringify(original)]]);
  const storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const persistence = createRunPersistence(storage,prefix);
  const old = persistence.load("campaign").run;
  old.page.name = "Unsaved work in old tab";
  values.set(prefix + "campaign",JSON.stringify(newer));
  assert.equal(persistence.save(old).ok,false);
  let notice, confirmed = false, prompts = 0;
  function node(tag) {
    return {tag,style:{},children:[],textContent:"",setAttribute(){},
      append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},
      remove(){if(this===notice)notice=undefined;}};
  }
  const context = {
    run:old,storyActive:false,storySession:null,memory:{},saveOK:false,saveProblem:"Stale save",profileProblem:"",battle:null,
    clone:structuredClone,runPersistence:persistence,profileStore:null,profileWrites:Promise.resolve(),
    document:{querySelector:()=>notice,createElement:node,body:{append(value){notice=value;}}},
    window:{confirm(){prompts++;return confirmed;}},editor:{reset(){}},preview:true,view:"enemy",render(){},toast(){},
  };
  const source = readFileSync(new URL("../src/app.ts",import.meta.url),"utf8");
  const noticeFunction=source.match(/^function renderStorageNotice\(\) \{[\s\S]*?(?=^function toast\()/m)?.[0];
  assert.ok(noticeFunction);
  vm.runInNewContext(appSaveFunction()+transformSync(noticeFunction,{loader:"ts",target:"es2022"}).code+"\nrenderStorageNotice();",context);
  const reload=notice.children.find(child=>child.textContent==="最新の保存を読み直す");
  assert.ok(reload);
  const raw=values.get(prefix+"campaign");
  reload.onclick();
  assert.equal(prompts,1);
  assert.equal(context.run,old,"declining must retain the unsaved local edit");
  assert.equal(values.get(prefix+"campaign"),raw);
  confirmed=true;reload.onclick();
  assert.equal(prompts,2);
  assert.deepEqual(context.run,newer,"approval must restore the actual latest paid build");
  assert.equal(context.saveOK,true);
  assert.equal(context.preview,false);
  assert.equal(context.view,"self");
  assert.equal(notice,undefined);
  context.run.page.name="Edit after explicit refresh";
  vm.runInNewContext("save();",context);
  await context.profileWrites;
  assert.equal(context.saveOK,true);
  assert.deepEqual(JSON.parse(values.get(prefix+"campaign")).owned,newer.owned);
});
