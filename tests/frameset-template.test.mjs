import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {resources} from '../src/buildlab.js';

// Source/native-markup and real fixed-step contracts, not browser pixel QA.
const catalogue=await import('../src/catalog/design-canvas-templates.js').catch(()=>({}));
const render=await import('../src/catalog/design-canvas-render.js').catch(()=>({}));
const template=()=>{assert.equal(catalogue.DESIGN_CANVAS_TEMPLATES?.length,1,'FRAMESET exists');return catalogue.DESIGN_CANVAS_TEMPLATES[0];};
const boardOf=()=>template().layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`frame-${i}`,x,y,w,h),label:label||''}));
const part=(board,type)=>board.find(p=>p.type===type);
const movePdf=(board,y)=>{const next=structuredClone(board),pdf=part(next,'gov_pdf');assert.equal(C.moveMany(next,[pdf.id],0,y-pdf.y),true);return next;};
const resource=board=>resources(board.filter(C.placed).map(p=>[p.type,p.x,p.y,p.w,p.h]));
const pressure=()=>['ab_link','ab_link','ab_nav'].map((t,i)=>C.makeItem(t,`pressure-${i}`,20,20+i*80));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function meter(board,opponent=pressure(),ticks=480){
 const b=new E.Battle(board,opponent,{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12,playerAdmin:[],enemyAdmin:[]}),events=[];
 for(let tick=0;tick<ticks;tick++)events.push(...b.step(.05));return{b,events};
}
const walk=node=>[node,...(node.childNodes??[]).flatMap(walk)];

test('FRAMESET uses three ordinary native parts and a real nested parent at $16/CPU8',()=>{
 const t=template(),board=boardOf(),r=resource(board),info=E.analyze(board);
 assert.equal(t.id,'site_figma');assert.equal(t.faction,'designcanvas');assert.equal(t.status,'experimental');assert.match(t.pageName,/FRAMESET/);assert.match(t.name,/Figma風/);
 assert.deepEqual(t.admin,[]);assert.equal(t.fee,0);assert.equal(t.reward,0);
 assert.deepEqual(board.map(p=>p.type),['gov_form','ab_table','gov_pdf']);
 assert.deepEqual([r.parts,r.acquisitionValue,r.load,r.footprint,r.legal],[3,16,8,176640,true]);assert.deepEqual(r.experimental,[]);
 assert.equal(Object.values(D.PARTS).some(p=>p.faction==='designcanvas'),false);
 assert.deepEqual(info.parents,{'frame-1':'frame-0','frame-2':'frame-1'});assert.deepEqual(info.groups,[]);
 assert.ok(t.references.includes('https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma-Design'));
 for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y),p.type);
});

test('moving only the PDF exchanges a direct text child bonus for direct form speed',()=>{
 const nested=meter(boardOf()),direct=meter(movePdf(boardOf(),412));
 assert.deepEqual(direct.b.player.info.parents,{'frame-1':'frame-0','frame-2':'frame-0'});
 for(const trace of [nested,direct]){
  assert.equal(trace.b.player.info.mods['frame-1'].speed,1.2);assert.equal(trace.b.player.info.mods['frame-0'].speed,1);
  assert.equal(trace.b.player.lag,1);assert.equal(trace.b.player.income,0);assert.equal(trace.b.metrics.player.replays,0);assert.equal(trace.b.metrics.player.healing,0);assert.equal(trace.b.metrics.player.shieldWaste,0);
  assert.deepEqual(trace.b.player.info.groups,[]);
 }
 assert.equal(nested.b.player.info.mods['frame-2'].speed,1);assert.equal(direct.b.player.info.mods['frame-2'].speed,1.2);
 assert.deepEqual([nested.b.metrics.player.hpDamage,nested.b.metrics.player.shielding,nested.b.metrics.player.naturalAttacks],[72,112,4]);
 assert.deepEqual([direct.b.metrics.player.hpDamage,direct.b.metrics.player.shielding,direct.b.metrics.player.naturalAttacks],[90,82,5]);
 for(const [trace,tableValue,first] of [[nested,7,2.75],[direct,4,2.3]]){
  const shots=trace.events.filter(e=>e.side==='player'&&e.kind==='damage');assert.ok(shots.every(e=>e.id==='frame-2'&&e.value===18&&e.pierce));close(shots[0].time,first);
  assert.ok(trace.events.filter(e=>e.side==='player'&&e.kind==='shield'&&e.id==='frame-1').every(e=>e.value===tableValue));
 }
 assert.equal(resource(boardOf()).footprint,resource(movePdf(boardOf(),412)).footprint,'the same outer form occupies all nested space');
});

test('detached PDF has neither bonus and repeated legal moves restore the exact engine trace',()=>{
 const initial=boardOf(),detached=movePdf(initial,44),trace=meter(detached);
 assert.deepEqual(trace.b.player.info.parents,{'frame-1':'frame-0'});assert.equal(trace.b.player.info.mods['frame-2'].speed,1);
 assert.deepEqual([trace.b.metrics.player.hpDamage,trace.b.metrics.player.shielding],[72,82]);assert.equal(resource(detached).footprint,190080);
 let board=initial;for(let i=0;i<3;i++)board=movePdf(movePdf(movePdf(board,412),44),254);
 assert.deepEqual(board,initial);assert.deepEqual(meter(board).events,meter(initial).events);assert.deepEqual(meter([...initial].reverse()).events,meter(initial).events);
 const invalid=structuredClone(initial),pdf=part(invalid,'gov_pdf');assert.equal(C.moveMany(invalid,[pdf.id],0,226-pdf.y),false,'a PDF crossing the table header is not legal containment');assert.deepEqual(invalid,initial);
});

test('the existing PDF keeps half piercing against real shield production in both parents',()=>{
 const defenders=[C.makeItem('gov_form','shield-0',16,16,280,200),C.makeItem('gov_form','shield-1',400,16,280,200)];
 assert.equal(resource(defenders).legal,true);
 for(const board of [boardOf(),movePdf(boardOf(),412)]){
  const first=meter(board,defenders,60).events.find(e=>e.kind==='damage'&&e.side==='player');
  assert.deepEqual([first.value,first.hit,first.blocked,first.pierce],[18,9,9,true]);
 }
 const quiet=meter(boardOf(),[]);assert.equal(quiet.b.player.shield,60);assert.equal(quiet.b.metrics.player.shielding,60);assert.equal(quiet.b.metrics.player.shieldWaste,52,'the 112 meter is not a promise of usable shield without incoming pressure');
});

test('a legal cheaper supported-link board defeats both parent choices in both seats',()=>{
 const peer=[C.makeItem('gov_font','font',32,96,208,32),C.makeItem('ab_link','link-0',32,48,192,32),C.makeItem('ab_link','link-1',32,144,192,32),C.makeItem('ab_link','link-2',32,184,192,32)];
 assert.deepEqual([resource(peer).acquisitionValue,resource(peer).load,resource(peer).footprint,resource(peer).legal],[14,4,25088,true]);
 for(const [board,remaining,time]of [[boardOf(),332,33.7],[movePdf(boardOf(),412),314,32]])for(const reverse of [false,true]){
  const b=new E.Battle(reverse?peer:board,reverse?board:peer,{playerHp:440,enemyHp:440,playerCapacity:12,enemyCapacity:12,playerAdmin:[],enemyAdmin:[]});
  for(let tick=0;tick<1201&&!b.result;tick++)b.step(.05);
  assert.equal(b.result?.winner,reverse?'player':'enemy');assert.equal(b.elapsed,time);assert.equal(reverse?b.player.hp:b.enemy.hp,remaining);assert.equal(b.player.lag,1);assert.equal(b.enemy.lag,1);
 }
});

test('public move/store/save contracts preserve the nested inventory and ownership costs',()=>{
 const r=R.newRun('lab','blank');r.owned=boardOf().map((p,i)=>({...p,id:`p${i+1}`}));r.nextId=4;r.admin=[];
 const original=JSON.parse(JSON.stringify(r));assert.equal(R.validateRun(original),true);
 assert.equal(R.move(r,'p3',260,412),true);assert.deepEqual(E.analyze(r.owned).parents,{p2:'p1',p3:'p1'});
 assert.equal(R.validateRun(JSON.parse(JSON.stringify(r))),true);assert.equal(resource(r.owned).acquisitionValue,16);
 assert.equal(R.move(r,'p3',260,254),true);const cash=r.cash;
 assert.equal(R.move(r,'p1',null,null),true);assert.ok(r.owned.every(p=>p.x===null&&p.y===null));assert.equal(r.cash,cash);assert.equal(r.owned.length,3);
 assert.equal(R.move(r,'p3',260,44),true);assert.deepEqual([resource(r.owned).acquisitionValue,resource(r.owned).load,resource(r.owned).footprint],[7,3,13440]);
 assert.equal(r.owned.reduce((n,p)=>n+D.PARTS[p.type].price,0),16,'unplaced parents remain owned without refunds');assert.equal(R.validateRun(JSON.parse(JSON.stringify(r))),true);
});

test('original design-canvas chrome is explicitly fixed and never pretends to select or sync layers',()=>{
 const t=template();assert.equal(typeof render.designCanvasHeader,'function');assert.equal(typeof render.designCanvasDecor,'function');
 assert.match(render.designCanvasHeader(),/FRAMESET/);assert.match(render.designCanvasHeader(),/Figma風.*非公式/);
 for(const html of [render.designCanvasHeader(),...t.decor.map(([kind])=>render.designCanvasDecor(kind))]){
  assert.ok(html);for(const node of walk(parseFragment(html))){
   assert.ok(!['button','input','select','textarea','form','a','script','iframe','img','audio','video','object','embed'].includes(node.tagName),node.tagName);
   for(const attr of node.attrs??[])assert.ok(!['src','srcset','href','action','formaction','data-ui','tabindex'].includes(attr.name)&&!attr.name.startsWith('on'),attr.name);
  }
 }
 assert.equal(render.designCanvasDecor('unknown'),'');assert.match(render.designCanvasDecor('canvas-layers'),/初期.*固定|固定.*初期/);assert.match(render.designCanvasDecor('canvas-properties'),/固定/);
 assert.match(render.designCanvasDecor('canvas-local-note'),/同期|送信/);assert.match(t.counterplay,/50%/);assert.match(t.counterplay,/最適|完成形/);
});

test('canvas decoration leaves both native parents and every PDF move slot clear',()=>{
 const slots=[...boardOf().map(p=>[p.x,p.y,p.w,p.h]),[260,412,280,48],[260,44,280,48]];
 const overlap=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
 for(const[kind,x,y,w,h]of template().decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,kind);for(const slot of slots)assert.equal(overlap([x,y,w,h],slot),false,kind);}
});

test('FRAMESET preserves native table, fieldset and local PDF preview with hostile label escaping',()=>{
 for(const p of boardOf()){
  assert.equal(V.markup(p,{theme:'designcanvas'}),V.markup(p,{theme:'mixed'}));
  const root=parseFragment(V.markup({...p,label:'<script>alert("label")</script> & "quote"'},{theme:'designcanvas'}));assert.equal(walk(root).some(n=>n.tagName==='script'),false);
 }
 assert.match(V.markup(boardOf()[0]),/<fieldset class="native-form">/);assert.match(V.markup(boardOf()[1]),/<table class="native-table">/);assert.match(V.markup(boardOf()[2]),/href="#" data-ui="download"/);
});

test('canvas stylesheet styles only original inert chrome and reserves readable source line heights',()=>{
 const t=template(),source=readFileSync(new URL('../src/catalog/design-canvas.css',import.meta.url),'utf8');
 assert.match(source,/\.site-theme-designcanvas \.page-body/);assert.match(source,/radial-gradient/);assert.match(source,/pointer-events:\s*none/);
 assert.doesNotMatch(source,/\.native-|\.web-node|\.node-|\.container-slot|url\(|@import|@font-face/);
 const lesson=t.decor.find(d=>d[0]==='canvas-lesson');assert.ok(24+18+8+4*15<=lesson[4]);
 assert.match(source,/\.canvas-lesson p\s*\{[^}]*font:\s*10px\/15px/);
});
