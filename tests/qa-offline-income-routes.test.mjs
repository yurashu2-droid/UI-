import * as containmentViews from '../src/containment-guidance.js';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { createHash } from "node:crypto";
import { parseFragment } from "parse5";
import { Editor } from "../src/editor.js";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import V from "../src/components.js";
import * as StorySession from "../src/story/session.js";
import { createRunPersistence } from "../src/persistence.js";
import { createLabBattleController } from "../src/lab-audience-control.js";
import * as appGuidance from "../src/app-guidance.js";
import * as navigation from "../src/navigation-guidance.js";
import * as conversion from "../src/conversion-guidance.js";
import { targetCaption } from "../src/catalog/target-caption.js";
const routePath = new URL("../src/income-route-guidance.ts", import.meta.url);
const incomeRoutes = existsSync(routePath) ? await import(routePath.href) : {};

// DOM-boundary checks execute production inspector, event listener, Editor,
// save and story transaction code. Rendering unrelated panels is adapted.
// These are not browser pixel, focus, native-select or accessibility acceptance.
// Removing the app command, safety guards, commit/save bridge or route binding
// must fail behavior assertions below; no assertions depend on stub call values.
const app = readFileSync(process.env.UI_RAID_QA_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
const extract = name => {
  const found = app.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"))?.[0];
  assert.ok(found, `production ${name}`); return found;
};
const options = app.match(/^const editor = new UIRaidEditor.Editor\([^]*?^\}\);/m)?.[0];
const change = app.match(/^document.addEventListener\("change",[^]*?^\}\);/m)?.[0];
assert.ok(options); assert.ok(change);
const rules = app.slice(app.indexOf("const KIND:"), app.indexOf("function shortDesc("));
const routeHelpers = ["incomeRouteEditingAllowed", "setIncomeRouteFromControl"].filter(name => app.includes(`function ${name}(`)).map(extract).join("\n");
const placementHelpers = ["bindSidechannelPlacementControls"].filter(name => app.includes(`function ${name}(`)).map(extract).join("\n");
const compiled = transformSync(`${rules}\n${routeHelpers}\n${placementHelpers}\n${["save", "renderStorageNotice", "labPressureCapacity", "selectionCard", "renderSide", "commitStorySession"].map(extract).join("\n")}\n${options}\n${change}\nglobalThis.editor=editor;`, {loader:"ts",target:"es2022"}).code;
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
  get isConnected() { return !!this.ownerDocument.body?.contains(this); }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(value) { value ? this.setAttribute("disabled", "") : this.attributes.delete("disabled"); }
  get options() { return this.children.filter(n => n.tagName === "OPTION"); }
  get selectedIndex() {
    if(this._selectedNone)return -1;
    const index=this.options.findIndex(n=>n.hasAttribute("selected"));return index<0&&this.options.length?0:index;
  }
  set selectedIndex(index) { this._selectedNone=index<0;this.options.forEach((n,i)=>i===index?n.setAttribute("selected",""):n.attributes.delete("selected")); }
  get selectedOptions() { return this.selectedIndex<0?[]:[this.options[this.selectedIndex]]; }
  get value() {
    if(this.tagName==="SELECT")return this.selectedOptions[0]?.value??"";
    return this._value??this.getAttribute("value")??"";
  }
  set value(value) {
    if(this.tagName==="SELECT")this.selectedIndex=this.options.findIndex(n=>n.value===String(value));
    else this._value=String(value);
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
    if(this.children.some(node=>node.contains(this.ownerDocument.activeElement)))this.ownerDocument.activeElement=this.ownerDocument.body;
    for (const node of this.children) node.parentElement = null;
    this.children = []; this._text = ""; this.append(...nodes);
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  set innerHTML(html) {
    const convert = node => {
      if (!node.tagName) return null;
      const element = this.ownerDocument.createElement(node.tagName);
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

class SelectAdapter extends ElementAdapter {}
class InputAdapter extends ElementAdapter {}

function host(t, {mode="lab", story=false, secondType="am_oneclick", sourceType="ab_mail", extra=[]}={}) {
  const globals=["document","Element","HTMLElement","HTMLInputElement","HTMLSelectElement"];
  const prior=new Map(globals.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const listeners=new Map();
  const doc={
    addEventListener(type, fn) { if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn); },
    createElement(tag) { const Type=tag.toLowerCase()==="select"?SelectAdapter:tag.toLowerCase()==="input"?InputAdapter:ElementAdapter;return new Type(tag,this); },
    querySelector(selector) { return this.body.querySelector(selector); },
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
  };
  doc.body=doc.createElement("body");doc.activeElement=doc.body;
  globalThis.document=doc;for(const name of globals.slice(1))globalThis[name]=name==="HTMLSelectElement"?SelectAdapter:name==="HTMLInputElement"?InputAdapter:ElementAdapter;
  t.after(()=>{for(const [name,d]of prior)d?Object.defineProperty(globalThis,name,d):delete globalThis[name];});
  for(const id of ["inspector","undo-button","redo-button","modal","player-body"]){const n=doc.createElement(id==="modal"?"dialog":"section");n.id=id;doc.body.append(n);}
  let session=null;
  if(story) {const result=StorySession.commandStorySession(StorySession.createStorySession(),{type:"name-page",name:"Route audit"});assert.equal(result.ok,true);session=result.session;}
  const run=session?structuredClone(session.run):R.newRun(mode);
  run.owned=[C.makeItem("am_cart","p1",32,32),C.makeItem(sourceType,"p2",320,32,144,32),C.makeItem(secondType,"p3",472,32),...extra];
  run.nextId=4+extra.length;
  // Fixture grants inventory directly; this does not claim those items can be
  // acquired at this story stage or assess balance/acquisition difficulty.
  assert.ok(run.owned.every(p=>!C.placed(p)||C.canPlace(run.owned,p,p.x,p.y,p.w,p.h)));
  assert.equal(R.validateRun(run),true);
  if(session){const updated=StorySession.updateStoryBuild(session,run);assert.equal(updated.ok,true,updated.error);session=updated.session;}
  const values=new Map(),writes=[],toasts=[];let reject=false;
  const storage={getItem:key=>values.get(key)??null,setItem(key,value){if(reject)throw Error("disk full");values.set(key,value);writes.push([key,value]);}};
  const runPersistence=createRunPersistence(storage,"qa-route-");
  const storyPersistence=StorySession.createStorySessionPersistence(storage);
  let context;
  context=vm.createContext({
    ...appGuidance,...navigation,...conversion,...incomeRoutes,...containmentViews,targetCaption,
    UIRaidEditor:{Editor},E,C,D,P:D.PARTS,R,StorySession,V:{...V,render(){}},
    run,storyActive:story,storySession:session,storyPersistence,runPersistence,
    incomeRouteBinding:null,sidechannelPlacementBindings:new Map(),memory:{},profileStore:null,profileProblem:"",profileWrites:Promise.resolve(),
    saveOK:true,saveProblem:"",settling:false,pendingStorySettlement:null,battle:null,preview:false,view:"self",clone:structuredClone,
    document:doc,Element:ElementAdapter,HTMLElement:ElementAdapter,HTMLSelectElement:SelectAdapter,HTMLInputElement:InputAdapter,
    $:selector=>doc.querySelector(selector),esc:V.esc,skinPicker:()=>"",synergyPanel:()=>"",
    opponentCard:()=>'<section id="enemy-thumbnail"></section>',appOpponent:()=>({faction:"google",pageName:"Other",decor:[]}),appEnemyBoard:()=>[],
    render(){context.renderSide();},renderShop(){},renderCoach(){},afterBuildChange(){},scheduleFit(){},mountAudienceLabControl(){},
    toast:message=>toasts.push(message),labBattleController:createLabBattleController(),window:{confirm:()=>false},
  });
  vm.runInContext(compiled,context);context.save();context.editor.select(["p2"]);
  return {c:context,doc,values,writes,toasts,storage,editor:context.editor,
    item:id=>context.run.owned.find(p=>p.id===id),
    control:()=>doc.querySelector("#sel-income-route"),
    select(ids=["p2"]){context.editor.select(ids);},
    change(value,el=doc.querySelector("#sel-income-route")){assert.ok(el,"production inspector renders income route selector");el.value=value;for(const fn of listeners.get("change")??[])fn({target:el});},
    stored:()=>JSON.parse(values.get(story?StorySession.STORY_SAVE_KEY:"qa-route-"+mode)),
    key:(key,target=doc.body,props={})=>{for(const fn of listeners.get("keydown")??[])fn({key,target,ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,preventDefault(){},...props});},
    reject(value){reject=value;},
  };
}

const optionsOf=control=>control.children.map(n=>({value:n.value,text:n.textContent,disabled:n.disabled,selected:n.hasAttribute("selected")}));

test("QA: actual inspector changes explicit nearby route through commit and durable Undo/Redo",t=>{
  const h=host(t),before=structuredClone(h.c.run);
  assert.ok(h.control(),"production inspector renders income route selector");
  assert.equal(h.control().value,"");
  assert.deepEqual(optionsOf(h.control()).map(x=>x.value),["","p3","p1"]);
  h.change("p1");
  assert.equal(h.item("p2").routeTo,"p1");
  assert.equal(h.stored().owned.find(p=>p.id==="p2").routeTo,"p1");
  assert.equal(h.editor.history.length,1);assert.equal(h.editor.future.length,0);
  assert.deepEqual(h.c.run,{...before,owned:before.owned.map(p=>p.id==="p2"?{...p,routeTo:"p1"}:p)});
  const writes=h.writes.length;h.change("p1");assert.equal(h.writes.length,writes);assert.equal(h.editor.history.length,1);
  h.key("z");assert.deepEqual(h.c.run,before);assert.equal(h.stored().owned.find(p=>p.id==="p2").routeTo,undefined);
  h.key("y");assert.equal(h.item("p2").routeTo,"p1");assert.equal(h.stored().owned.find(p=>p.id==="p2").routeTo,"p1");
  h.select();h.change("");assert.equal(Object.hasOwn(h.item("p2"),"routeTo"),false);assert.equal(h.editor.history.length,2);
});

const stateOf=h=>JSON.stringify({run:h.c.run,history:h.editor.history,future:h.editor.future,values:[...h.values],writes:h.writes,toasts:h.toasts});
const unchanged=(h,fn,label)=>{const before=stateOf(h);fn();assert.equal(stateOf(h),before,label);};

for(const [label,block]of [
  ["preview",h=>{h.c.preview=true;}],
  ["settlement",h=>{h.c.settling=true;}],
  ["pending story settlement",h=>{h.c.pendingStorySettlement={};}],
  ["battle",h=>{h.c.battle={player:{info:E.analyze(h.c.run.owned),parts:[],capacity:26}};}],
  ["enemy view",h=>{h.c.view="enemy";}],
  ["non-build",h=>{h.c.run.phase="battle";}],
  ["main dialog",h=>{h.doc.querySelector("#modal").open=true;}],
  ["another open dialog",h=>{const n=h.doc.createElement("dialog");n.open=true;h.doc.body.append(n);}],
]) test(`QA: route event is inert in ${label}`,t=>{
  const h=host(t),control=h.control();assert.ok(control);block(h);
  unchanged(h,()=>h.change("p1",control));
  h.c.renderSide();assert.ok(h.control()?.disabled,"inspector route control is read-only in blocked context");
});

test("QA: detached, forged, duplicate and selection-stale route controls cannot commit",t=>{
  const h=host(t),old=h.control();assert.ok(old);
  h.c.renderSide();assert.equal(old.isConnected,false);unchanged(h,()=>h.change("p1",old),"detached old select");
  const forged=h.doc.createElement("select");forged.id="sel-income-route";forged.dataset.sourceId="p2";
  forged.innerHTML='<option value="">Auto</option><option value="p1">Forged</option>';
  h.doc.body.append(forged);unchanged(h,()=>h.change("p1",forged),"forged outside inspector");
  const inspector=h.doc.querySelector("#inspector");forged.remove();inspector.append(forged);
  inspector.children=[forged,...inspector.children.filter(n=>n!==forged)];
  unchanged(h,()=>h.change("p1",forged),"forged duplicate before real current control");forged.remove();
  const control=h.control();h.editor.selection=new Set(["p1"]);unchanged(h,()=>h.change("p1",control),"stale selection");
  h.editor.selection=new Set(["p2","p1"]);unchanged(h,()=>h.change("p1",control),"multiple selection");
  h.editor.selection=new Set(["p2","missing"]);unchanged(h,()=>h.change("p1",control),"two IDs with one missing selection");
  h.editor.selection=new Set(["p2"]);control.dataset.sourceId="p1";unchanged(h,()=>h.change("p1",control),"tampered bound source");
});

test("QA: fresh candidate validation rejects moved, stashed, nonconsumer, missing and self targets",t=>{
  const h=host(t);assert.ok(h.control());
  for(const invalid of ["missing","p2"]){unchanged(h,()=>h.change(invalid),invalid);}
  const control=h.control();h.item("p1").x=32;h.item("p1").y=500;
  unchanged(h,()=>h.change("p1",control),"geometry changed without rerender");
  h.item("p1").x=null;h.item("p1").y=null;unchanged(h,()=>h.change("p1",control),"target stashed without rerender");
  h.item("p1").x=32;h.item("p1").y=32;h.item("p1").type="ab_link";
  unchanged(h,()=>h.change("p1",control),"target no longer consumer");
  h.c.run.owned=h.c.run.owned.filter(p=>p.id!=="p1");unchanged(h,()=>h.change("p1",control),"target no longer owned");
});

test("QA: unavailable saved target stays visible; malformed blank cannot silently select Auto",t=>{
  const h=host(t);h.change("p1");h.editor.commit(()=>R.move(h.c.run,"p1",null,null));h.select();
  const control=h.control();assert.equal(control.value,"p1");
  const saved=optionsOf(control).find(n=>n.value==="p1");assert.ok(saved.disabled);assert.ok(saved.selected);
  assert.match(saved.text,/利用不可|未配置|現在選べ|対象外|範囲外|使え/);
  unchanged(h,()=>h.change("not-an-option",control),"invalid select value becomes empty with no selected option");
  assert.equal(control.value,"p1","rejected malformed selection restores the still-saved preference");
  h.c.renderSide();h.change("");assert.equal(Object.hasOwn(h.item("p2"),"routeTo"),false,"actual Auto option clears saved preference");
  h.key("z");assert.equal(h.item("p2").routeTo,"p1");h.select();
  assert.equal(h.control().value,"p1");
});

test("QA: source/target stash and distance preserve preference; restored availability resumes it",t=>{
  const h=host(t);h.change("p1");
  const route=()=>E.analyze(h.c.run.owned).relations.filter(r=>r.kind==="conversion"&&r.from==="p2").map(r=>r.to);
  assert.deepEqual(route(),["p1"]);
  h.editor.commit(()=>R.move(h.c.run,"p1",32,500));h.select();
  assert.equal(h.item("p2").routeTo,"p1");assert.equal(h.control().value,"p1");assert.deepEqual(route(),["p3"]);
  h.editor.commit(()=>R.move(h.c.run,"p1",null,null));h.select();assert.equal(h.item("p2").routeTo,"p1");
  h.editor.commit(()=>R.move(h.c.run,"p1",32,32));h.select();assert.deepEqual(route(),["p1"]);
  h.editor.commit(()=>R.move(h.c.run,"p2",null,null));h.select();
  assert.equal(h.item("p2").routeTo,"p1");assert.equal(h.control().value,"p1");assert.equal(h.control().disabled,true);assert.deepEqual(route(),[]);
  unchanged(h,()=>h.change(""),"stashed source cannot clear route");
  h.editor.commit(()=>R.move(h.c.run,"p2",320,32));h.select();assert.equal(h.control().disabled,false);assert.deepEqual(route(),["p1"]);
  assert.equal(h.stored().owned.find(p=>p.id==="p2").routeTo,"p1");
});

test("QA: producer-only selector preserves permissively valid non-earner imported routes",t=>{
  const h=host(t,{sourceType:"ab_link"});h.item("p2").routeTo="p1";
  assert.equal(R.validateRun(h.c.run),true);h.c.save();h.select();
  assert.equal(h.control(),null);assert.equal(h.item("p2").routeTo,"p1");assert.equal(h.stored().owned.find(p=>p.id==="p2").routeTo,"p1");
  h.item("p2").routeTo="p3";h.item("p3").type="ab_link";
  assert.equal(R.validateRun(h.c.run),true,"owned nonconsumer still valid under existing permissive contract");
  h.c.save();h.select();assert.equal(h.item("p2").routeTo,"p3");assert.equal(h.control(),null);
  for(const id of ["p1","p3"]){h.select([id]);assert.equal(h.control(),null);}
});

for(const story of [false,true])test(`QA: ${story?"story":"ordinary"} route persistence reports stale journal without overwriting newer save`,t=>{
  const h=host(t,{story}),key=story?StorySession.STORY_SAVE_KEY:"qa-route-lab";
  const newer=h.stored();(story?newer.run:newer).page.name="Newer other tab";
  if(story)newer.story.pageName="Newer other tab";
  h.values.set(key,JSON.stringify(newer));const raw=h.values.get(key);h.change("p1");
  assert.equal(h.item("p2").routeTo,"p1","local editable preference stays available for backup");
  assert.equal(h.values.get(key),raw,"newer durable record is untouched");assert.equal(h.c.saveOK,false);
  assert.match(h.c.saveProblem,/別の画面/);assert.match(h.doc.querySelector("#storage-notice").textContent,/別の画面/);
  assert.equal(h.toasts.some(x=>/保存しました|保存済み|saved/i.test(x)),false);
  assert.equal(h.editor.history.length,1,"local edit remains undoable");
});

test("QA: normal story route edits keep history; next real delivery commit establishes new baseline",t=>{
  const h=host(t,{story:true});h.c.storySession.inbox.push({id:"qa-route-delivery",type:"ab_link",reason:"loot"});h.c.save();
  h.change("p1");assert.equal(h.editor.history.length,1);assert.equal(h.stored().run.owned.find(p=>p.id==="p2").routeTo,"p1");
  h.key("z");assert.equal(h.item("p2").routeTo,undefined);assert.equal(h.editor.future.length,1);
  h.key("y");assert.equal(h.item("p2").routeTo,"p1");
  const before=h.c.run.owned.length,result=StorySession.collectStoryDelivery(h.c.storySession,"qa-route-delivery");
  assert.equal(result.ok,true,result.error);assert.equal(result.session.run.owned.length,before+1);
  h.c.commitStorySession(result.session);assert.equal(h.editor.history.length,0);assert.equal(h.editor.future.length,0);
  const durable=h.stored();h.key("z");h.key("y");assert.deepEqual(h.stored(),durable);assert.equal(h.item("p2").routeTo,"p1");
});

test("QA: pressure recipient is offered only under explicit lab pressure and retained when disabled",t=>{
  const h=host(t,{secondType:"go_jobs"});assert.ok(h.control());
  assert.deepEqual(optionsOf(h.control()).map(n=>n.value),["","p1"]);
  assert.equal(h.c.labBattleController.choose("server-pressure-v1",{mode:"lab",storyActive:false,battleActive:false}),true);
  h.c.renderSide();assert.deepEqual(optionsOf(h.control()).map(n=>n.value),["","p1","p3"]);h.change("p3");
  const stale=h.control();h.c.labBattleController.reset();unchanged(h,()=>h.change("p3",stale),"pressure disabled without rerender");h.c.renderSide();assert.equal(h.control().value,"p3");assert.ok(optionsOf(h.control()).find(n=>n.value==="p3").disabled);assert.equal(h.item("p2").routeTo,"p3");
  assert.equal(h.c.labBattleController.choose("server-pressure-v1",{mode:"lab",storyActive:false,battleActive:false}),true);h.c.renderSide();
  assert.equal(optionsOf(h.control()).find(n=>n.value==="p3").disabled,false);
  h.c.storyActive=true;h.c.renderSide();assert.ok(optionsOf(h.control()).find(n=>n.value==="p3").disabled);
  h.c.storyActive=false;h.c.run.mode="campaign";h.c.renderSide();assert.ok(optionsOf(h.control()).find(n=>n.value==="p3").disabled);
});

test("QA: route option identities stay safe, canonical, distinct and unmutated for hostile/long labels",t=>{
  const h=host(t);const labels=['<img src=x onerror="bad()">&\'"','同じ名前'.repeat(25),'\u202eSink\nname\u0000'];
  for(const label of labels){
    h.item("p1").label=h.item("p3").label=label;const before=JSON.stringify(h.c.run);h.c.renderSide();
    const control=h.control(),options=optionsOf(control);assert.equal(options.length,3);
    for(const id of ["p1","p3"])assert.equal(options.find(n=>n.value===id).text,targetCaption(h.item(id)));
    assert.equal(control.querySelector("img"),null);assert.equal(control.querySelector("[onerror]"),null);
    assert.equal(JSON.stringify(h.c.run),before);
  }
});

function routeBoard(preference="",secondType="am_oneclick") {
  const source=C.makeItem("ab_mail","source",320,32,144,32);if(preference)source.routeTo=preference;
  return [C.makeItem("am_cart","left",32,32),source,C.makeItem(secondType,"right",472,32)];
}
for(const combatVersion of ["combat-v2","combat-v3","combat-v4"])for(const preference of ["","left","right","missing"])
  test(`QA: extracted routing preserves pre-change ${combatVersion} event ledger (${preference||"Auto"})`,()=>{
    const b=new E.Battle(routeBoard(preference),[],{playerCapacity:Infinity,enemyHp:10000,combatVersion});
    const events=[];for(let i=0;i<260;i++)events.push(...b.step(.05));
    // Measured before incomeRouteCandidates/isIncomeProducer extraction.
    const expected=preference==="left"?"432664a60002a4e25dc2b822dc8de800920f70ab159eb629331e26b6c2229546":"a9d42da633c6c55798bdd11571c19a4650ab81b19924c7589728375932b70e25";
    assert.equal(createHash("sha256").update(JSON.stringify({events,metrics:b.metrics,player:b.player.income,enemy:b.enemy.hp})).digest("hex"),expected);
    const earned=events.filter(e=>e.kind==="income"&&e.side==="player").reduce((n,e)=>n+e.value,0);
    const routed=events.filter(e=>e.kind==="conversion"&&e.side==="player"&&e.action==="route").reduce((n,e)=>n+e.value,0);
    const spent=events.filter(e=>e.kind==="conversion"&&e.side==="player"&&e.action==="spend").reduce((n,e)=>n+e.value,0);
    assert.equal(earned,b.player.income);assert.equal(routed,b.metrics.player.routed);assert.equal(spent,b.metrics.player.spent);
    assert.equal(earned,routed+b.metrics.player.unconverted);
    assert.equal(routed,spent+b.player.parts.reduce((n,p)=>n+p.charge,0));
  });

for(const type of ["yt_tip","ad_popup","go_jobs"])test(`QA: full chosen ${type} receiver cannot spill surplus to another nearby receiver`,()=>{
  const pressure=type==="go_jobs";
  const b=new E.Battle(routeBoard("right",type),[],{playerCapacity:26,enemyCapacity:26,enemyHp:10000,...(pressure?{experimentalRules:"server-pressure-v1"}:{})});
  const source=b.player.parts.find(p=>p.id==="source"),right=b.player.parts.find(p=>p.id==="right"),left=b.player.parts.find(p=>p.id==="left");
  if(type==="yt_tip")b.player.shield=60;
  b._earn(b.player,b.enemy,source,10);
  assert.equal(b.player.income,10);assert.equal(right.charge,6);assert.equal(left.charge,0);
  assert.equal(b.metrics.player.routed,6);assert.equal(b.metrics.player.unconverted,4);assert.equal(b.metrics.player.spent,0);
  b._earn(b.player,b.enemy,source,2);
  assert.equal(b.player.income,12);assert.equal(right.charge,6);assert.equal(left.charge,0);
  assert.equal(b.metrics.player.routed,6);assert.equal(b.metrics.player.unconverted,6);assert.equal(b.metrics.player.spent,0);
});

test("QA: real route changes preserve focused selector without stealing focus from other controls",t=>{
  const h=host(t),old=h.control();assert.ok(old);old.focus();h.change("p1");
  assert.equal(old.isConnected,false);assert.ok(h.doc.activeElement===h.control(),"focus follows replacement route selector");
  const before=JSON.stringify(h.c.run);h.key("ArrowRight",h.doc.activeElement,{ctrlKey:false});assert.equal(JSON.stringify(h.c.run),before,"select focus prevents arrow moving source");
  const other=h.doc.createElement("input");h.doc.body.append(other);other.focus();h.change("p3");
  assert.ok(h.doc.activeElement===other,"background programmatic change cannot steal another input's focus");
  const render=h.c.render;h.control().focus();
  h.c.render=()=>{render();other.focus();};h.change("p1");
  assert.ok(h.doc.activeElement===other,"focus moved during rerender must remain on new destination");
});

test("QA: render-bound route control cannot edit a replacement run with coincident IDs",t=>{
  const h=host(t),control=h.control();assert.ok(control);
  h.c.run=structuredClone(h.c.run);
  unchanged(h,()=>h.change("p1",control),"old node is still connected but belongs to different run");
});

test("QA: sell and fuse retain existing route deletion with ordinary editor Undo restoration",t=>{
  const buy=C.makeItem("am_buy","p4",32,140);
  const h=host(t,{extra:[buy]});h.change("p1");
  h.editor.commit(()=>R.sell(h.c.run,"p1"));assert.equal(h.item("p2").routeTo,undefined);
  h.key("z");assert.equal(h.item("p2").routeTo,"p1");h.select();
  let fused;h.editor.commit(()=>{fused=R.fuse(h.c.run);return true;});
  assert.equal(fused.length,1);assert.equal(fused[0].item.type,"am_oneclick");
  assert.equal(h.item("p2").routeTo,undefined,"consumed target ID is cleared, not silently retargeted to fusion output");
  assert.equal(h.stored().owned.find(p=>p.id==="p2").routeTo,undefined);
  h.key("z");assert.equal(h.item("p2").routeTo,"p1");assert.ok(h.item("p1"));
});

test("QA: import validator stays permissive while missing/self routes remain invalid",()=>{
  const run=R.newRun("lab");run.owned=routeBoard().map((p,i)=>({...p,id:`p${i+1}`}));run.nextId=4;
  run.owned[1].routeTo="p1";assert.equal(R.validateRun(run),true);
  run.owned[0].type="ab_link";run.owned[0].x=null;run.owned[0].y=null;
  assert.equal(R.validateRun(run),true,"owned nonconsumer stashed target remains importable");
  for(const id of ["p2","missing",""]){run.owned[1].routeTo=id;assert.equal(R.validateRun(run),false,id);}
});

test("QA: producer predicate and candidate order exactly match former engine contracts",()=>{
  assert.equal(typeof E.isIncomeProducer,"function");assert.equal(typeof E.incomeRouteCandidates,"function");
  const consumers=new Set(["am_cart","am_oneclick","ad_popup","yt_tip"]);
  for(const d of Object.values(D.PARTS))assert.equal(E.isIncomeProducer({type:d.id}),(d.tags.includes("economy")&&!consumers.has(d.id))||["gov_submit","gov_onestop"].includes(d.id),d.id);
  for(const type of ["missing","constructor","__proto__","toString"])assert.equal(E.isIncomeProducer({type}),false);
  const [left,source,right]=routeBoard(),near={source:["left"],right:["source"]};
  const before=JSON.stringify([left,source,right]);
  assert.deepEqual(E.incomeRouteCandidates([left,source,right],near,source).map(p=>p.id),["right","left"]);
  assert.equal(JSON.stringify([left,source,right]),before);
  // Equal-distance ties use geometry/type/size, never ID order. Reverse input
  // and cosmetic identity order deliberately while retaining the same result.
  const a=C.makeItem("am_cart","z",32,32,280,100),b=C.makeItem("am_cart","a",488,32,280,100);
  const middle=C.makeItem("ab_mail","s",360,66,80,32),both={s:["z","a"]};
  assert.deepEqual(E.incomeRouteCandidates([b,middle,a],both,middle).map(p=>p.id),["z","a"]);
});

test("QA: saved missing, self or nonconsumer preferences remain explicit display state without mutation",()=>{
  const {incomeRouteGuidance,renderIncomeRouteGuidance}=incomeRoutes;
  assert.equal(typeof incomeRouteGuidance,"function");
  for(const target of ["missing","source","plain"]){
    const board=routeBoard(target);board.push(C.makeItem("ab_link","plain",32,200));
    const source=board.find(p=>p.id==="source"),before=structuredClone(board);
    const info=E.analyze(board),view=incomeRouteGuidance(source,info,{owned:board,editable:true});
    assert.equal(view.saved.id,target);assert.equal(view.saved.available,false);assert.equal(view.effective.id,"right");
    const fragment=parseFragment(renderIncomeRouteGuidance(view));
    const walk=node=>[node,...(node.childNodes??[]).flatMap(walk)];
    const selected=walk(fragment).filter(n=>n.tagName==="option"&&n.attrs.some(a=>a.name==="selected"));
    assert.equal(selected.length,1);assert.equal(selected[0].attrs.find(a=>a.name==="value").value,target);
    assert.ok(selected[0].attrs.some(a=>a.name==="disabled"));assert.deepEqual(board,before);
  }
});

test("QA: old expedition selector uses the same actual commit/save path",t=>{
  const h=host(t,{mode:"campaign"});h.change("p1");
  assert.equal(h.c.saveOK,true);assert.equal(h.stored().mode,"campaign");assert.equal(h.stored().owned.find(p=>p.id==="p2").routeTo,"p1");
  h.key("z");assert.equal(h.stored().owned.find(p=>p.id==="p2").routeTo,undefined);
  h.key("y");assert.equal(h.stored().owned.find(p=>p.id==="p2").routeTo,"p1");
});

test("QA: stale pressure option and newly stashed source are rejected before a transaction",t=>{
  const h=host(t,{secondType:"go_jobs"});
  assert.equal(h.c.labBattleController.choose("server-pressure-v1",{mode:"lab",storyActive:false,battleActive:false}),true);
  h.c.renderSide();h.change("p1");const control=h.control();
  h.c.labBattleController.reset();unchanged(h,()=>h.change("p3",control),"stale enabled job option is no longer a fresh candidate");
  h.item("p2").x=null;h.item("p2").y=null;
  unchanged(h,()=>h.change("",control),"still-connected old source control may not erase stash preference");
  assert.equal(h.item("p2").routeTo,"p1");
});

test("QA: long route captions use existing full-width themed select constraints",t=>{
  const h=host(t);h.item("p1").label="Long receiver identity ".repeat(5);h.c.renderSide();
  const control=h.control();
  assert.equal(control.classList.contains("select-input"),true,"native select uses existing full-width theme class");
  assert.match(control.getAttribute("style")??"",/max-width\s*:\s*100%/);
  assert.match(control.getAttribute("style")??"",/min-width\s*:\s*0(?:[;\s]|$)/);
  const css=readFileSync(new URL("../src/styles/game.css",import.meta.url),"utf8");
  assert.match(css,/\.text-input,\.select-input\{[^}]*width:100%/);
  assert.match(css,/\*\{box-sizing:border-box\}/);
  assert.equal(optionsOf(control).find(n=>n.value==="p1").text,targetCaption(h.item("p1")),"layout constraint does not drop recipient identity");
});
