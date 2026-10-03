import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import {readFileSync} from 'node:fs';
import V from '../src/components.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import Effects from '../src/effects.js';
import {targetCaption} from '../src/catalog/target-caption.js';

const nodes=node=>[node,...(node.childNodes??[]).flatMap(nodes)];
for(const [type,replayType,stateSelector] of [['wk_article','wk_reference','.reference-state'],['x_post','x_quote','.quote-state']]){
  test(`actual ${replayType} caption and escaped log identify the real labeled original`,()=>{
    for(const label of ['Original <img src=x onerror=bad()> & notes','長'.repeat(79)+'甲']) {
    const source=C.makeItem(type,'original',24,24),replay=C.makeItem(replayType,'replay',24,176);
    source.label=label;
    const board=[source,replay];assert.ok(board.every(p=>C.canPlace(board,p,p.x,p.y,p.w,p.h)));
    const battle=new E.Battle(board,[],{playerHp:10000,enemyHp:10000,playerCapacity:20}),events=[];
    for(let i=0;i<180&&!events.some(e=>e.kind==='echo');i++)events.push(...battle.step(.05));
    const event=events.find(e=>e.kind==='echo');assert.ok(event);assert.equal(event.to,source.id);
    const state={textContent:''},host={querySelector:key=>key===stateSelector?state:null},logs=[];
    const fx={part:(_,id)=>id===replay.id?host:null,reduced:true,name:Effects.prototype.name,
      float(){},log:(_,html)=>logs.push(html)};
    const before=structuredClone({parts:battle.player.parts,metrics:battle.metrics,states:battle.states,ticks:battle.ticks});
    Effects.prototype.emit.call(fx,event,battle);
    assert.ok(state.textContent.includes(targetCaption(source)), 'native replay text must retain the editable label');
    assert.equal(state.title,state.textContent,'full caption remains available when visual status is clipped');
    assert.equal(logs.length,1);assert.ok(logs[0].includes(V.esc(targetCaption(source))));
    const parsed=nodes(parseFragment(logs[0]));assert.equal(parsed.some(n=>n.tagName==='img'),false);
    assert.ok(parsed.some(n=>n.tagName==='b'),'preserve the existing bold combat-name markup');
    assert.deepEqual({parts:battle.player.parts,metrics:battle.metrics,states:battle.states,ticks:battle.ticks},before);
    }
  });
}

// Source-level containment contract, not measured browser layout acceptance.
test('quote target status has a single-line ellipsis budget for long editable labels',()=>{
  const css=readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8');
  const rule=css.match(/\.quote-state\s*\{([^}]+)\}/)?.[1]??'';
  assert.match(rule,/display:\s*block/);assert.match(rule,/max-width:\s*100%/);
  assert.match(rule,/white-space:\s*nowrap/);assert.match(rule,/overflow:\s*hidden/);
  assert.match(rule,/text-overflow:\s*ellipsis/);assert.match(rule,/line-height:\s*12px/);
});
