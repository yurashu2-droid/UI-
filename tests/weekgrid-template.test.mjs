import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import {resources} from '../src/buildlab.js';

const catalogue=await import('../src/catalog/calendar-templates.js').catch(()=>({}));
const render=await import('../src/catalog/calendar-render.js').catch(()=>({}));
const template=()=>{const t=catalogue.CALENDAR_TEMPLATES?.[0];assert.ok(t,'WEEKGRID template exists');return t;};
const boardOf=()=>template().layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`week-${i}`,x,y,w,h),label:label||''}));
const part=(board,type)=>board.find(p=>p.type===type);
const moved=(board,x,y)=>{const result=structuredClone(board),wish=part(result,'am_wish');assert.equal(C.moveMany(result,[wish.id],x-wish.x,y-wish.y),true);return result;};
const resource=board=>resources(board.map(p=>[p.type,p.x,p.y,p.w,p.h]));
const walk=node=>[node,...(node.childNodes??[]).flatMap(walk)];
const css=()=>{try{return readFileSync(new URL('../src/catalog/calendar.css',import.meta.url),'utf8');}catch{return '';}};
function meter(board){
 const b=new E.Battle(board,[C.makeItem('ab_link','opponent',0,0,192,32)],{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12}),events=[],checkpoints={};
 for(let tick=1;tick<=480;tick++){events.push(...b.step(.05));if([134,440,480].includes(tick))checkpoints[tick]={damage:b.metrics.player.hpDamage,healing:b.metrics.player.healing,shielding:b.metrics.player.shielding};}
 return{b,events,checkpoints};
}

test('WEEKGRID is four legal existing controls at $20/CPU8 with no real calendar or parent',()=>{
 const t=template(),board=boardOf(),r=resource(board);
 assert.equal(t.id,'site_calendar');assert.equal(t.faction,'calendar');assert.equal(t.status,'experimental');assert.match(t.pageName,/WEEKGRID/);assert.match(t.name,/Google Calendar風/);
 assert.deepEqual(t.admin,[]);assert.equal(t.fee,0);assert.equal(t.reward,0);
 assert.deepEqual(board.map(p=>p.type),['go_search','am_wish','go_lucky','yt_notify']);
 assert.deepEqual([r.parts,r.acquisitionValue,r.load,r.footprint,r.legal],[4,20,8,25600,true]);assert.deepEqual(r.experimental,[]);
 assert.equal(Object.values(D.PARTS).some(p=>p.faction==='calendar'),false);
 assert.ok(t.references.includes('https://support.google.com/calendar/answer/6110849?co=GENIE.Platform%3DDesktop&hl=en'));
 assert.deepEqual(E.analyze(board).parents,{});for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y),p.type);
});

test('moving Wish changes local button speed into search form and culture power without changing healing per pulse',()=>{
 const board=boardOf(),search=part(board,'go_search'),wish=part(board,'am_wish'),lucky=part(board,'go_lucky'),bell=part(board,'yt_notify');
 const original=meter(board),linked=meter(moved(board,456,236));
 assert.deepEqual(original.b.player.info.groups.map(g=>[g.kind,g.items]),[['button-group',[wish.id,lucky.id]]]);
 assert.deepEqual(linked.b.player.info.groups.map(g=>[g.kind,g.items]),[['search-form',[search.id,wish.id]]]);
 assert.deepEqual(original.b.player.info.near[search.id],[]);assert.deepEqual(linked.b.player.info.near[search.id],[wish.id]);
 assert.deepEqual([original.b.player.info.mods[wish.id].speed,original.b.player.info.mods[lucky.id].speed],[1.12,1.12]);
 assert.deepEqual([linked.b.player.info.mods[wish.id].speed,linked.b.player.info.mods[lucky.id].speed,linked.b.player.info.mods[search.id].power],[1,1,1.3]);
 for(const trace of [original,linked]){
  assert.equal(trace.b.player.info.counts.google,2);assert.deepEqual(trace.b.player.info.sets,[]);assert.deepEqual(trace.b.player.info.near[bell.id],[]);
  assert.ok(trace.events.filter(e=>e.kind==='heal'&&e.side==='player').every(e=>e.value===5));
  assert.ok(trace.events.filter(e=>e.kind==='shield'&&e.side==='player').every(e=>e.id===bell.id&&e.value===5));
  assert.equal(trace.b.player.lag,1);assert.equal(trace.b.player.income,0);assert.equal(trace.b.metrics.player.replays,0);
 }
 const damage=(trace,id)=>trace.events.filter(e=>e.kind==='damage'&&e.side==='player'&&e.id===id);
 assert.ok(damage(original,search.id).every(e=>e.value===8));assert.ok(damage(linked,search.id).every(e=>e.value===13));
 assert.equal(damage(original,lucky.id).find(e=>e.value===18).time,6.25);assert.equal(damage(linked,lucky.id).find(e=>e.value===18).time,7);
 assert.deepEqual(original.checkpoints[134],{damage:46,healing:10,shielding:10});assert.deepEqual(linked.checkpoints[134],{damage:38,healing:5,shielding:10});
 assert.deepEqual(original.checkpoints[440],{damage:138,healing:25,shielding:30});assert.deepEqual(linked.checkpoints[440],{damage:150,healing:20,shielding:30});
 assert.deepEqual(original.checkpoints[480],{damage:152,healing:25,shielding:30});assert.deepEqual(linked.checkpoints[480],{damage:181,healing:25,shielding:30});
 assert.deepEqual([original.b.metrics.player.naturalAttacks,linked.b.metrics.player.naturalAttacks],[17,16]);
 assert.deepEqual(meter(moved(moved(board,456,236),560,236)).events,original.events);
});

test('disconnected and near-but-misaligned Wish distinguish calendar artwork, adjacency and actual form grammar',()=>{
 const board=boardOf(),distant=meter(moved(board,504,340)),misaligned=meter(moved(board,456,238)),search=part(board,'go_search'),wish=part(board,'am_wish');
 assert.deepEqual(distant.b.player.info.groups,[]);assert.deepEqual(distant.b.player.info.near[wish.id],[]);assert.equal(distant.b.metrics.player.hpDamage,146);
 assert.deepEqual(misaligned.b.player.info.groups,[]);assert.deepEqual(misaligned.b.player.info.near[search.id],[wish.id]);assert.equal(misaligned.b.metrics.player.hpDamage,160);
 assert.equal(misaligned.b.player.info.mods[search.id].power,1);
 assert.ok(misaligned.events.filter(e=>e.kind==='damage'&&e.side==='player'&&e.id===search.id).every(e=>e.value===10));
 assert.deepEqual(resource(moved(board,504,340)),resource(board));assert.deepEqual(resource(moved(board,456,238)),resource(board));
});

test('larger event rectangles with preserved real geometry neither gain timing nor lose output through whitespace',()=>{
 const board=boardOf();
 for(const b of [board,moved(board,456,236)]){
  const large=b.map(p=>p.type==='yt_notify'?p:{...p,h:72});assert.equal(resource(large).legal,true);assert.equal(resource(large).footprint,44288);
  assert.deepEqual(meter(large).events,meter(b).events);assert.deepEqual(meter([...b].reverse()).events,meter(b).events);
 }
});

test('the same-price supported-link control defeats both connection choices in either seat',()=>{
 const peer=[...Array.from({length:5},(_,i)=>C.makeItem('ab_link',`link-${i}`,16+i*112,72,96,24)),C.makeItem('gov_font','font',16,112,544,32)];
 assert.deepEqual([resource(peer).acquisitionValue,resource(peer).load,resource(peer).legal],[20,6,true]);
 for(const [board,remaining] of [[boardOf(),328],[moved(boardOf(),456,236),309],[moved(boardOf(),504,340),334]])for(const reverse of [false,true]){
  const b=new E.Battle(reverse?peer:board,reverse?board:peer,{playerHp:440,enemyHp:440,playerCapacity:12,enemyCapacity:12,playerAdmin:[],enemyAdmin:[]});
  for(let tick=0;tick<1201&&!b.result;tick++)b.step(.05);
  assert.equal(b.result?.winner,reverse?'player':'enemy');assert.equal(b.elapsed,19.6);assert.equal(reverse?b.player.hp:b.enemy.hp,remaining);assert.equal(b.player.lag,1);assert.equal(b.enemy.lag,1);
 }
});

test('date, time, event and calendar chrome are original inert samples with explicit scope',()=>{
 const t=template();assert.equal(typeof render.calendarHeader,'function');assert.equal(typeof render.calendarDecor,'function');
 assert.match(render.calendarHeader(),/WEEKGRID/);assert.match(render.calendarHeader(),/Google Calendar風.*非公式/);
 for(const html of [render.calendarHeader(),...t.decor.map(([kind])=>render.calendarDecor(kind))]){
  assert.ok(html);for(const node of walk(parseFragment(html))){
   assert.ok(!['button','input','select','textarea','form','a','script','iframe','img','audio','video','object','embed'].includes(node.tagName),node.tagName);
   for(const attr of node.attrs??[])assert.ok(!['src','srcset','href','action','formaction','data-ui','tabindex'].includes(attr.name)&&!attr.name.startsWith('on'),attr.name);
  }
 }
 assert.equal(render.calendarDecor('not-calendar'),'');assert.match(render.calendarDecor('calendar-toolbar'),/固定/);
 assert.match(render.calendarDecor('calendar-local-note'),/同期/);assert.match(render.calendarDecor('calendar-local-note'),/予定.*保存|保存.*予定/);
 const lesson=render.calendarDecor('calendar-lesson');assert.match(lesson,/30%/);assert.match(lesson,/\+2/);assert.match(lesson,/回復.*5/);assert.match(t.counterplay,/早|序盤/);
});

test('calendar decor leaves all native controls and described move slots clear inside 960×680',()=>{
 const t=template(),slots=[...boardOf().map(p=>[p.x,p.y,p.w,p.h]),[456,236,136,40],[456,238,136,40],[504,340,136,40]];
 const overlaps=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
 for(const [kind,x,y,w,h]of t.decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,kind);for(const slot of slots)assert.equal(overlaps([x,y,w,h],slot),false,kind);}
});

test('WEEKGRID keeps the native search, Wish, Lucky and Bell markup with label escaping',()=>{
 for(const p of boardOf()){
  assert.equal(V.markup(p,{theme:'calendar'}),V.markup(p,{theme:'mixed'}));
  const html=V.markup({...p,label:'<script>alert("label")</script> & "quote"'},{theme:'calendar'});assert.equal(walk(parseFragment(html)).some(n=>n.tagName==='script'),false);
 }
 assert.match(V.markup(boardOf()[0]),/<form[^>]+data-ui="search"/);assert.doesNotMatch(V.markup(boardOf()[0]),/\baction=/);
 assert.match(V.markup(boardOf()[1]),/data-ui="wish"/);assert.match(V.markup(boardOf()[2]),/data-ui="press"/);assert.match(V.markup(boardOf()[3]),/data-ui="notify"/);
});

test('calendar CSS paints inert grid chrome without native-part overrides or remote assets',()=>{
 template();const source=css();assert.ok(source,'calendar stylesheet exists');
 assert.match(source,/\.site-theme-calendar \.page-body::before/);assert.match(source,/pointer-events:\s*none/);assert.match(source,/repeating-linear-gradient/);
 assert.doesNotMatch(source,/\.native-|\.web-node|\.node-|url\(|@import|@font-face/);
 assert.match(source,/\.calendar-event/);assert.match(source,/\.calendar-mini-month/);assert.match(source,/\.calendar-day/);
 const lesson=source.match(/\.calendar-lesson\s*\{([^}]+)\}/)?.[1]??'';assert.match(lesson,/padding:\s*8px 12px/);
 assert.ok(16+18+4+3*14<=template().decor.find(d=>d[0]==='calendar-lesson')[4],'title plus three14px lines fit the source-level lesson height');
});

test('fixed calendar event copy stays within the explicitly budgeted native-size slots',()=>{
 template();for(const kind of ['calendar-event-review','calendar-event-note','calendar-event-reading']){
  const paragraph=walk(parseFragment(render.calendarDecor(kind))).find(n=>n.tagName==='p');assert.ok(paragraph);
  for(const node of paragraph.childNodes??[])if(node.nodeName==='#text')assert.ok(node.value.length<=22,`${kind}: ${node.value.length} characters exceed the source-level 22-character line budget`);
 }
 const source=css(),event=source.match(/\.calendar-event\s*\{([^}]+)\}/)?.[1]??'';
 assert.match(event,/padding:\s*5px 9px/);assert.match(source,/\.calendar-event > p\s*\{[^}]*font:\s*9px\/14px/);
 for(const [kind,lines] of [['calendar-event-review',1],['calendar-event-note',2],['calendar-event-reading',2]]){
  const height=template().decor.find(d=>d[0]===kind)[4];assert.ok(10+14+1+11+8+lines*14<=height,kind);
 }
});

test('hour-label gutter has no extra vertical decoration through its transparent text boxes',()=>{
 template();assert.doesNotMatch(css(),/\.site-theme-calendar \.page-body::after/,'the grid border at216px is sufficient; avoid a second line crossing184..216px hour labels');
});
