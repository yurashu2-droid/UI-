import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import {factionSetView} from '../src/app-guidance.js';

// Execute only the host's pure hints function from its current source. This does
// not load the whole app or claim real DOM/browser behavior.
const app=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
const body=app.match(/function hints\(info: EngineInfo\) \{([\s\S]*?)\n\}\n/)[1].replace(/: string/g,'');
const hints=new Function('info','D','P','NEEDS','working','isCtrl','isFaction','factionSetView',body);
function messages(type){
 const items=[0,1].map(i=>C.makeItem(type,`p${i}`,24,24+i*240));
 return hints(E.analyze(items),D,D.PARTS,{},()=>true,()=>false,f=>Object.hasOwn(D.FACTIONS,f),factionSetView);
}
test('QA: general host hints never promise a three-piece bonus to audio or social families',()=>{
 for(const type of ['tw_post','sc_track'])assert.ok(messages(type).every(text=>!text.includes('セット効果')),type);
 assert.ok(messages('ab_link').some(text=>text.includes('セット')), 'real retro bonus still has a next-part hint');
});
