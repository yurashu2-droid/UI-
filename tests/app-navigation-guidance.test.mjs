import * as containmentViews from '../src/containment-guidance.js';
import * as incomeRoutes from '../src/income-route-guidance.js';
import * as conversionViews from '../src/conversion-guidance.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import C from '../src/document.js';import D from '../src/data.js';import E from '../src/engine.js';import R from '../src/run.js';
import * as guidance from '../src/app-guidance.js';
import * as navigation from '../src/navigation-guidance.js';
const source=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
function compiled(name){const found=source.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'));assert.ok(found);return transformSync(found[0],{loader:'ts',target:'es2022'}).code;}
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function render(name,board,selected){
  const info=E.analyze(board),context={D,P:D.PARTS,E,R,...guidance,...navigation,...conversionViews, ...incomeRoutes, ...containmentViews, incomeRouteEditingAllowed:()=>false,info,selected,run:R.newRun('campaign'),battle:null,storyActive:false,
    labPressureCapacity:()=>null,working:()=>true,KIND:{attack:'攻撃'},GROUP_BONUS:{},esc:escape,connectText:()=>'',skinPicker:()=>'',favicon:()=>'',hints:()=>[],isFaction:key=>Object.hasOwn(D.FACTIONS,key)};
  vm.runInNewContext(compiled(name)+`\noutput=${name}(${name==='selectionCard'?'[selected],info':'info'});`,context);return context.output;
}

test('actual page synergy exposes navigation whitespace tiers only for placed attack navigation',()=>{
  const link=C.makeItem('ab_link','blue',32,32);link.label='<nav target>';
  const html=render('synergyPanel',[link]);
  assert.match(html,/リンクの余白加算/);assert.match(html,/基礎値 \+3/);assert.match(html,/&lt;nav target&gt;/);
  assert.doesNotMatch(render('synergyPanel',[C.makeItem('am_buy','buy',32,32)]),/リンクの余白加算/);
  link.x=null;link.y=null;assert.doesNotMatch(render('synergyPanel',[link]),/リンクの余白加算/);
  const nonBlue=render('synergyPanel',[C.makeItem('ab_nav','nav',32,32)]);
  assert.match(nonBlue,/基礎値 \+0/);assert.match(nonBlue,/対象の青リンクは未配置/);
});

test('actual selected navigation detail distinguishes inventory and does not open a duplicate full-page block',()=>{
  const link=C.makeItem('ab_link','held',null,null),html=render('selectionCard',[link],link);
  assert.match(html,/<details class="sel-more"><summary>このUIの余白加算<\/summary>/);
  assert.match(html,/このUIは未配置：余白加算 \+0/);
  assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
  const buy=C.makeItem('am_buy','buy',32,32);assert.doesNotMatch(render('selectionCard',[buy],buy),/このUIの余白加算/);
});

test('actual side-panel rendering uses the current battle analysis for legacy coverage',()=>{
  const run=R.newRun('campaign');run.owned=Array.from({length:3},(_,i)=>C.makeItem('ab_link',`link${i}`,32+i*208,32,192,32));
  for(const version of ['combat-v2','combat-v3','combat-v4']){
    const battle=new E.Battle(run.owned,[],{combatVersion:version}),nodes=new Map();let selectedInfo,synergyInfo;
    const node=()=>({innerHTML:'',disabled:false,querySelector:()=>({})});
    const context={D,P:D.PARTS,E,R,C,run,battle,storyActive:false,preview:false,labPressureCapacity:()=>null,sidechannelPlacementBindings:new Map(),
      HTMLSelectElement:class {},editor:{selected:()=>[run.owned[0]],history:[],future:[]},$:key=>{if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);},
      selectionCard:(_,info)=>{selectedInfo=info;return '';},synergyPanel:info=>{synergyInfo=info;return '';},opponentCard:()=>'',
      appOpponent:()=>({faction:'retro',pageName:'Test',decor:[]}),appEnemyBoard:()=>[],V:{header:()=>'',render(){}},scheduleFit(){}};
    vm.runInNewContext(compiled('bindSidechannelPlacementControls')+compiled('renderSide')+'\nrenderSide();',context);
    assert.equal(selectedInfo,battle.player.info,'inspector must use battle-authoritative analysis');
    assert.equal(synergyInfo,battle.player.info);
    assert.equal(navigation.navigationGuidance(synergyInfo).targets.length,version==='combat-v2'?3:2);
  }
});
