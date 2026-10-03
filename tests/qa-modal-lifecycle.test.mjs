import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";

// Dialog event adapter with a queued native close notification. It deliberately
// does not claim to render a browser or approve actual pixels/interactions.
function modalHost() {
  const queued = [], events = new Map();
  const dialog = {
    open:false,
    classList:{remove(){},add(){}},
    addEventListener(type, handler) { events.set(type, handler); },
    showModal() { this.open = true; },
    close() { if (!this.open) return; this.open = false; queued.push(()=>events.get("close")?.({target:this})); },
  };
  const content = {innerHTML:""};
  const context = {pendingStorySettlement:null, $: selector => selector === "#modal" ? dialog : content};
  const text = readFileSync(new URL("../src/app.ts", import.meta.url),"utf8");
  const source = text.slice(text.indexOf("let modalFeatureDispose:"),text.indexOf("/* ---------- Isolated story profile"));
  assert.ok(source.includes('addEventListener("close"'));
  const js = transformSync(source,{loader:"ts",target:"es2022"}).code;
  vm.runInNewContext(js + `\nglobalThis.host = {openModal,closeModal,install(dispose){modalFeatureDispose=dispose;}};`,context);
  return {...context.host,dialog,flushClose(){while(queued.length)queued.shift()();}};
}

test("QA: queued close from a battle result must not dispose the immediately reopened story hub", () => {
  const host = modalHost();
  let oldDisposed = 0, hubDisposed = 0;
  host.openModal("battle result");
  host.install(()=>oldDisposed++);
  // Production story-result-hub does leaveBattle(); openStoryHub() in one click.
  // leaveBattle calls closeModal; openStoryHub reopens and installs its disposer.
  host.closeModal();
  host.openModal("new story hub");
  host.install(()=>hubDisposed++);
  assert.equal(oldDisposed,1);
  host.flushClose();
  assert.equal(host.dialog.open,true);
  assert.equal(hubDisposed,0,"the prior dialog's queued event must not disable the new hub's buttons");
  host.closeModal();host.flushClose();
  assert.equal(hubDisposed,1,"the hub still disposes once when it itself closes");
});
