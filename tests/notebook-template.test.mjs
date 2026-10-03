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

// Actual canonical parts/fixed ticks and parsed native markup, not browser pixel QA.
const catalogue=await import('../src/catalog/notebook-templates.js').catch(()=>({}));
const render=await import('../src/catalog/notebook-render.js').catch(()=>({}));
const template=()=>{assert.equal(catalogue.NOTEBOOK_TEMPLATES?.length,1,'LEAFNOTE exists');return catalogue.NOTEBOOK_TEMPLATES[0];};
const boardOf=()=>template().layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`note-${i}`,x,y,w,h),label:label||''}));
const resource=board=>resources(board.filter(C.placed).map(p=>[p.type,p.x,p.y,p.w,p.h]));
const moveTo=(board,y)=>{const next=structuredClone(board),p=next[1];assert.equal(C.moveMany(next,[p.id],0,y-p.y),true);return next;};
const walk=node=>[node,...(node.childNodes??[]).flatMap(walk)];
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const limiter=()=>[C.makeItem('gov_rate_limit','limiter',648,100)];
function meter(board,opponent=[],{reverse=false,ticks=480,hp=10000,phase=0}={}){
 assert.equal(resource(board).legal,true);assert.equal(resource(opponent).legal,true);
 const b=new E.Battle(reverse?opponent:board,reverse?board:opponent,{playerHp:hp,enemyHp:hp,playerCapacity:12,enemyCapacity:12,playerAdmin:[],enemyAdmin:[]}),who=reverse?'enemy':'player',foe=reverse?'player':'enemy',events=[];
 // Diagnostic clock offset only; never saved or applied by the template.
 if(phase)for(const p of b[who].parts)if(p.period)p.remaining+=phase;
 for(let i=0;i<ticks&&!b.result;i++)events.push(...b.step(.05));
 return{b,who,foe,events,side:b[who],metrics:b.metrics[who]};
}

test('LEAFNOTE has four ordinary parts with exact legal $14/load4 geometry',()=>{
 const t=template(),board=boardOf(),r=resource(board);
 assert.deepEqual([t.id,t.faction,t.status],['site_notion','notebook','experimental']);assert.match(t.pageName,/LEAFNOTE/);assert.match(t.name,/Notion風/);
 assert.deepEqual([t.hp,t.fee,t.reward,t.admin],[440,0,0,[]]);assert.deepEqual(board.map(p=>p.type),['ab_link','ab_link','ab_link','gov_font']);
 assert.deepEqual([r.parts,r.acquisitionValue,r.load,r.footprint,r.legal,r.experimental],[4,14,4,28832,true,[]]);
 for(const p of board){assert.notEqual(D.PARTS[p.type].faction,'notebook');assert.equal(p.w,t.layout[board.indexOf(p)][3]);assert.equal(p.h,t.layout[board.indexOf(p)][4]);}
 assert.ok(t.references.includes('https://www.notion.com/help/navigate-with-the-sidebar'));assert.ok(t.references.includes('https://www.notion.com/help/wikis-and-verified-pages'));
});

test('moving the same rail link trades nav cadence for the main links whitespace slot',()=>{
 const original=boardOf(),moved=moveTo(original,520),a=E.analyze(original),b=E.analyze(moved);
 assert.deepEqual(a.navigation,{entries:3,slowdown:1,highlightedLinks:['note-0','note-1']});assert.deepEqual(b.navigation,{entries:3,slowdown:1,highlightedLinks:['note-0','note-2']});
 assert.deepEqual(a.groups.map(g=>[g.kind,g.items]),[['nav-menu',['note-0','note-1']]]);assert.deepEqual(b.groups,[]);assert.deepEqual(a.parents,{});assert.deepEqual(b.parents,{});
 for(const info of[a,b]){close(info.freeRatio,1-28832/(960*680));assert.equal(info.mods['note-2'].power,1.5);assert.equal(info.mods['note-3'].speed,1);}
 close(a.mods['note-0'].speed,1.15*1.15);close(a.mods['note-1'].speed,1.15*1.15);
 for(const id of['note-0','note-1','note-2'])close(b.mods[id].speed,1.15);
 assert.deepEqual(resource(original),resource(moved));assert.deepEqual(moved.map(({x,y,...p})=>p),original.map(({x,y,...p})=>p));
});

test('finite 24-second packet and cadence trade reverses with one native429 in both seats',()=>{
 for(const reverse of[false,true])for(const[i,board]of[boardOf(),moveTo(boardOf(),520)].entries())for(const limited of[false,true]){
  const t=meter(board,limited?limiter():[],{reverse});assert.equal(t.b.result,null);assert.equal(t.b.combatVersion,'combat-v4');assert.equal(t.side.lag,1);
  assert.equal(t.metrics.hpDamage,limited?[138,142.5][i]:[342,322.5][i]);assert.equal(t.metrics.naturalAttacks,[51,45][i]);
  assert.equal(t.metrics.replays,0);assert.equal(t.metrics.healing,0);assert.equal(t.metrics.shielding,0);assert.equal(t.side.income,0);assert.equal(t.side.shield,0);
  const shots=t.events.filter(e=>e.kind==='damage'&&e.side===t.who),values=limited?[[3,3,2],[3,0,6.5]][i]:[[7,7,6],[7,4,10.5]][i];
  for(let n=0;n<3;n++)assert.ok(shots.filter(e=>e.id===`note-${n}`).every(e=>e.value===values[n]&&!e.pierce));
  if(limited)assert.equal(t.b.metrics[t.foe].rateLimited,[204,180][i]);
 }
});

test('429 preference is a finite-window example and ordinary damage still falls substantially',()=>{
 for(const reverse of[false,true])for(const[ticks,expected]of[[134,[38,38]],[240,[70,76]]])for(const[i,board]of[boardOf(),moveTo(boardOf(),520)].entries()){
  const t=meter(board,limiter(),{reverse,ticks});assert.equal(t.metrics.hpDamage,expected[i]);assert.ok(t.metrics.hpDamage<meter(board,[],{reverse,ticks}).metrics.hpDamage);
 }
 // A deliberately later opening cuts a different set of packets at the same endpoint.
 for(const[i,board]of[boardOf(),moveTo(boardOf(),520)].entries())for(const phase of[-.25,.25]){
  const a=meter(board,limiter(),{phase}),b=meter(board,limiter(),{phase,reverse:true});assert.equal(a.metrics.hpDamage,b.metrics.hpDamage);assert.deepEqual(a.metrics,b.metrics);
  assert.equal(a.metrics.hpDamage,i?142.5:phase>0?132:138);
 }
});

test('a legal same-price same-load supported three-link control beats both placements in both seats',()=>{
 const peer=[C.makeItem('gov_font','font',24,96,208,32),...[48,144,184].map((y,i)=>C.makeItem('ab_link',`peer-${i}`,24,y,192,32))];
 assert.deepEqual([resource(peer).acquisitionValue,resource(peer).load,resource(peer).footprint,resource(peer).legal],[14,4,25088,true]);
 for(const reverse of[false,true])for(const[i,board]of[boardOf(),moveTo(boardOf(),520)].entries()){
  const t=meter(board,peer,{reverse,ticks:1201,hp:440});assert.equal(t.b.result.winner,t.foe);close(t.b.elapsed,25.2);assert.equal(t.b[t.foe].hp,[78,96][i]);
 }
});

test('repeated moves restore exact engine traces while overlapping placement is rejected',()=>{
 const initial=boardOf();let next=initial;for(let i=0;i<4;i++)next=moveTo(moveTo(next,520),240);assert.deepEqual(next,initial);assert.deepEqual(meter(next).events,meter(initial).events);
 assert.deepEqual(meter([...initial].reverse()).events,meter(initial).events);
 const invalid=structuredClone(initial);assert.equal(C.moveMany(invalid,['note-1'],0,-40),false);assert.deepEqual(invalid,initial);
});

test('ordinary move stash and save round trips preserve owned IDs labels costs and cash',()=>{
 const r=R.newRun('lab','blank');r.owned=boardOf().map((p,i)=>({...p,id:`p${i+1}`}));r.nextId=5;r.admin=[];
 const cash=r.cash,ids=r.owned.map(p=>p.id),labels=r.owned.map(p=>p.label);assert.equal(R.validateRun(JSON.parse(JSON.stringify(r))),true);
 assert.equal(R.move(r,'p2',24,520),true);let saved=JSON.parse(JSON.stringify(r));assert.equal(R.validateRun(saved),true);assert.deepEqual(E.analyze(saved.owned).navigation.highlightedLinks,['p1','p3']);
 assert.deepEqual(saved.owned.map(p=>p.id),ids);assert.deepEqual(saved.owned.map(p=>p.label),labels);assert.equal(resource(saved.owned).acquisitionValue,14);
 assert.equal(R.move(saved,'p2',null,null),true);assert.equal(saved.cash,cash);assert.equal(saved.owned.length,4);assert.equal(resource(saved.owned).acquisitionValue,11);assert.equal(resource(saved.owned).load,3);
 assert.equal(saved.owned.reduce((n,p)=>n+D.PARTS[p.type].price,0),14,'stashing is not a refund');
 assert.equal(R.move(saved,'p2',24,240),true);saved=JSON.parse(JSON.stringify(saved));assert.equal(R.validateRun(saved),true);assert.deepEqual(saved.owned,r.owned.map(p=>p.id==='p2'?{...p,y:240}:p));
});

test('original notebook chrome is fixed artwork without remote actions or fake controls',()=>{
 const t=template();assert.equal(typeof render.notebookHeader,'function');assert.equal(typeof render.notebookDecor,'function');assert.match(render.notebookHeader(),/LEAFNOTE/);assert.match(render.notebookHeader(),/Notion風.*非公式/);
 for(const html of[render.notebookHeader(),...t.decor.map(([kind])=>render.notebookDecor(kind))]){
  assert.ok(html);for(const node of walk(parseFragment(html))){assert.ok(!['button','input','select','textarea','form','a','script','iframe','img','audio','video','object','embed'].includes(node.tagName),node.tagName);for(const attr of node.attrs??[])assert.ok(!['src','srcset','href','action','formaction','data-ui','tabindex','contenteditable'].includes(attr.name)&&!attr.name.startsWith('on'),attr.name);}
 }
 assert.equal(render.notebookDecor('unknown'),'');assert.match(render.notebookDecor('notebook-rail-top'),/固定/);assert.match(render.notebookDecor('notebook-local-note'),/同期|送信/);
 assert.match(t.counterplay,/24秒/);assert.match(t.counterplay,/6\.7秒/);assert.match(t.counterplay,/最適|完成形/);assert.match(t.counterplay,/429/);assert.match(t.counterplay,/0\.25秒遅らせる.*132.*142\.5/);
});

test('all decoration clears the native parts and the advertised lower rail move slot',()=>{
 const slots=[...boardOf().map(p=>[p.x,p.y,p.w,p.h]),[24,520,160,32]],overlap=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
 for(const[kind,x,y,w,h]of template().decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,kind);for(const slot of slots)assert.equal(overlap([x,y,w,h],slot),false,kind);}
});

test('native blue links and font controls remain unchanged and escape hostile labels',()=>{
 for(const p of boardOf()){
  assert.equal(V.markup(p,{theme:'notebook'}),V.markup(p,{theme:'mixed'}));assert.equal(walk(parseFragment(V.markup({...p,label:'<script>alert("x")</script> & "quote"'},{theme:'notebook'}))).some(n=>n.tagName==='script'),false);
 }
 for(const p of boardOf().slice(0,3))assert.match(V.markup(p),/class="native-old-link" href="#" data-ui="link"/);
 assert.equal([...V.markup(boardOf()[3]).matchAll(/data-ui="font"/g)].length,3);
});

test('notebook CSS contains only local inert artwork and declared readable line heights',()=>{
 const source=readFileSync(new URL('../src/catalog/notebook.css',import.meta.url),'utf8');assert.match(source,/\.site-theme-notebook \.page-body/);assert.match(source,/pointer-events:\s*none/);assert.doesNotMatch(source,/\.native-|\.web-node|\.node-|\.container-slot|url\(|@import|@font-face/);
 const callout=template().decor.find(d=>d[0]==='notebook-callout');assert.ok(24+18+4+2*16<=callout[4]);
 assert.match(source,/\.notebook-callout p\s*\{[^}]*font:\s*10px\/16px/);
 const index=template().decor.find(d=>d[0]==='notebook-index'),rowLine=Number(source.match(/\.notebook-index ol\s*\{[^}]*font:\s*9px\/(\d+)px/)[1]);
 assert.ok(16+9+3*rowLine+12+1+10+16+5+32+7+52<=index[4],'declared index line boxes fit within the reserved rectangle');
});
