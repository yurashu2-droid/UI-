import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {Editor} from '../src/editor.js';
import R from '../src/run.js';
import * as StorySession from '../src/story/session.js';

// Execute the real commit/save entry points with actual editor and persistence.
// Only rendering and the localStorage port are adapted; this is not browser QA.
const source=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
const declarations=['save','commitStorySession'].map(name=>{
  const found=source.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'));
  assert.ok(found); return found[0];
}).join('\n');
const compiled=transformSync(declarations,{loader:'ts',target:'es2022'}).code;
function host() {
  const values=new Map();let reject=false;
  const storage={getItem:key=>values.get(key)??null,setItem(key,value){if(reject)throw Error('disk full');values.set(key,value);}};
  const named=StorySession.commandStorySession(StorySession.createStorySession(),{type:'name-page',name:'History boundary'});
  assert.equal(named.ok,true);
  const context={StorySession,storyPersistence:StorySession.createStorySessionPersistence(storage),storySession:named.session,
    run:structuredClone(named.session.run),storyActive:true,clone:structuredClone,saveOK:true,saveProblem:'',
    renderStorageNotice(){},render(){},toast(){}};
  const editor=Object.assign(Object.create(Editor.prototype),{history:[],future:[],selection:new Set(),pending:null,drag:null,
    o:{getRun:()=>context.run,getOverlay:()=>null,enabled:()=>true,onChange:()=>context.save(),onToast(){},onSelect(){}}});
  context.editor=editor;vm.runInNewContext(compiled,context);context.save();
  return {c:context,values,reject(value){reject=value;},saved(){return JSON.parse(values.get(StorySession.STORY_SAVE_KEY));}};
}
function edits(c) {
  assert.equal(c.editor.commit(()=>R.purchase(c.run,'ab_link')),true);
  c.editor.select([c.run.owned[0].id]);
  c.editor.update({label:'Later edit'});
  assert.equal(c.run.owned[0].label,'Later edit');
  c.editor.undo();
  assert.ok(c.editor.history.length);assert.ok(c.editor.future.length);
}

test('app paid story reroll commits a new editor baseline so Undo cannot refund it',()=>{
  const h=host(),c=h.c;edits(c);
  const paid=StorySession.rerollStoryMarket(c.storySession);assert.equal(paid.ok,true);
  const before=c.run.cash;c.commitStorySession(paid.session);
  assert.equal(c.run.cash,before-R.REROLL);
  assert.equal(c.editor.history.length,0);assert.equal(c.editor.future.length,0);
  const expected=structuredClone(c.storySession);c.editor.undo();c.editor.redo();
  assert.deepEqual(c.storySession,expected);assert.deepEqual(h.saved(),expected);
});

test('app rejected story transaction leaves both history stacks and current edits available',()=>{
  const h=host(),c=h.c;edits(c);
  c.editor.select([c.run.owned[0].id]);
  const expected=structuredClone(c.storySession),run=c.run,history=structuredClone(c.editor.history),future=structuredClone(c.editor.future);
  const paid=StorySession.rerollStoryMarket(c.storySession);assert.equal(paid.ok,true);
  h.reject(true);assert.throws(()=>c.commitStorySession(paid.session),/保存できません/);
  assert.equal(c.run,run);assert.deepEqual(c.storySession,expected);
  assert.deepEqual(c.editor.history,history);assert.deepEqual(c.editor.future,future);
  assert.ok(c.editor.selection.has(c.run.owned[0].id));assert.deepEqual(h.saved(),expected);
  h.reject(false);c.editor.redo();assert.equal(c.run.owned[0].label,'Later edit');
});

test('app story-only commits and normal editor saves retain undo and redo',()=>{
  const h=host(),c=h.c;edits(c);
  const history=structuredClone(c.editor.history),future=structuredClone(c.editor.future);
  c.commitStorySession(structuredClone(c.storySession));
  assert.deepEqual(c.editor.history,history);assert.deepEqual(c.editor.future,future);
  c.editor.redo();assert.equal(c.run.owned[0].label,'Later edit');c.editor.undo();
  assert.equal(c.run.owned[0].label,'');assert.equal(c.run.owned.length,1);
});

test('app detects the canonical story run delta, not the temporary live battle phase',()=>{
  const h=host(),c=h.c;edits(c);
  const history=structuredClone(c.editor.history),future=structuredClone(c.editor.future);
  c.run.phase='battle'; // Production start() temporarily marks only the live run.
  c.commitStorySession(structuredClone(c.storySession));
  assert.deepEqual(c.editor.history,history);assert.deepEqual(c.editor.future,future);
  assert.equal(c.run.phase,'build');
});
