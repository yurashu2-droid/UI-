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
import {COMMUNITY_TEMPLATES} from '../src/catalog/community-templates.js';
import {communityDecor} from '../src/catalog/community-render.js';

// Source and production-engine contracts, never browser/pixel acceptance.
const catalogue=await import('../src/catalog/reddit-sidebar-templates.js').catch(()=>({}));
const renderer=await import('../src/catalog/reddit-sidebar-render.js').catch(()=>({}));
const template=()=>{assert.equal(catalogue.REDDIT_SIDEBAR_TEMPLATES?.length,1,'player-only Reddit sidebar lesson exists');return catalogue.REDDIT_SIDEBAR_TEMPLATES[0];};
const make=(layout,prefix='r')=>layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`${prefix}${i}`,x,y,w,h),label:label??''}));
const boardOf=()=>make(template().layout);
const resource=board=>resources(board.filter(C.placed).map(p=>[p.type,p.x,p.y,p.w,p.h]));
const moveLink=(board,key)=>{const next=structuredClone(board),p=next.find(p=>p.type==='ab_link'),at=catalogue.REDDIT_SIDEBAR_POSITIONS[key];assert.ok(at);assert.equal(C.moveMany(next,[p.id],at.x-p.x,at.y-p.y),true);return next;};
const diff=()=>make([['gh_diff',24,24,400,172]],'e');
const peer=()=>make([['gov_font',24,96,208,32],...[8,48,144,184,224].map(y=>['ab_link',24,y,192,32])],'e');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function meter(board,opponent=[],{reverse=false,capacity=14,hp=10000,ticks=480,offset=0}={}){
 assert.equal(resource(board).legal,true);assert.equal(resource(opponent).legal,true);
 const b=new E.Battle(reverse?opponent:board,reverse?board:opponent,{playerHp:hp,enemyHp:hp,playerCapacity:capacity,enemyCapacity:capacity,playerAdmin:[],enemyAdmin:[]}),who=reverse?'enemy':'player',foe=reverse?'player':'enemy',events=[];
 // Initial opposing-clock offsets are diagnostic only, never template startup.
 for(const p of b[foe].parts)if(p.period)p.remaining+=offset;
 for(let i=0;i<ticks&&!b.result;i++)events.push(...b.step(.05));
 return{b,who,foe,events,side:b[who],metrics:b.metrics[who]};
}
const walk=node=>[node,...(node.childNodes??[]).flatMap(walk)];
const textOf=node=>node.nodeName==='#text'?node.value:(node.childNodes??[]).map(textOf).join('');
const overlap=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];

test('player-only sidebar lesson reuses original seven exact Reddit parts and adds one ordinary font',()=>{
 const t=template(),base=COMMUNITY_TEMPLATES.find(t=>t.id==='site_reddit'),r=resource(boardOf());
 assert.deepEqual([t.id,t.faction,t.status,t.labOpponent],['lesson_reddit_sidebar','reddit','experimental',false]);
 assert.match(t.name,/Reddit風.*別教材.*返信とサイドバー/);assert.notEqual(t.name,base.name);assert.notEqual(t.pageName,base.pageName);
 assert.deepEqual(t.layout.slice(0,7),base.layout);assert.notEqual(t.layout[0],base.layout[0]);
 assert.deepEqual(t.layout[7],['gov_font',692,444,232,36]);assert.deepEqual([t.hp,t.fee,t.reward,t.admin,t.loot],[440,0,0,[],[]]);
 assert.deepEqual([r.acquisitionValue,r.load,r.parts,r.footprint,r.legal],[34,14,8,305472,true]);
 assert.deepEqual(r.experimental,['rd_vote','rd_post','rd_thread','wk_reference']);assert.equal(D.PARTS.gov_font.status,undefined);
 assert.deepEqual(catalogue.REDDIT_SIDEBAR_POSITIONS,{thread:{x:100,y:492},reading:{x:692,y:492},detached:{x:692,y:552}});
});

test('one link move trades direct-child diversity and the only replay source for actual font power',()=>{
 const initial=boardOf(),moved=moveLink(initial,'reading'),detached=moveLink(initial,'detached');
 for(const board of[moved,detached]){assert.deepEqual(board.filter(p=>p.id!=='r5'),initial.filter(p=>p.id!=='r5'));assert.deepEqual(board.map(({x,y,...p})=>p),initial.map(({x,y,...p})=>p));assert.deepEqual([resource(board).load,resource(board).acquisitionValue,resource(board).footprint],[14,34,312128]);}
 const a=E.analyze(initial),b=E.analyze(moved),c=E.analyze(detached);
 assert.deepEqual(a.parents,{r3:'r2',r4:'r2',r5:'r2',r6:'r2'});assert.deepEqual(b.parents,{r3:'r2',r4:'r2',r6:'r2'});assert.deepEqual(c.parents,b.parents);
 assert.equal(a.mods.r5.power,1);assert.equal(b.mods.r5.power,1.5);assert.equal(c.mods.r5.power,1);
 assert.deepEqual(b.relations,[{from:'r7',to:'r5',kind:'power',label:'文字'}]);assert.deepEqual(a.groups,[]);assert.deepEqual(b.groups,[]);
 assert.ok(a.near.r6.includes('r5'));assert.ok(!a.near.r6.includes('r4'));assert.deepEqual(b.near.r6,['r2']);assert.deepEqual(c.near.r5,[]);
 for(const info of[a,b,c]){assert.deepEqual(info.sets,[{faction:'reddit',count:5,text:'実験中：系統セット追加補正なし'}]);assert.deepEqual(info.navigation,{entries:1,slowdown:1,highlightedLinks:['r5']});assert.equal(Math.floor(info.freeRatio*5),2);for(const m of Object.values(info.mods))assert.equal(m.speed,1);}
 near(a.freeRatio,1-305472/(960*680));near(b.freeRatio,1-312128/(960*680));
});

test('24-second no-lag diagnostic separates natural damage replay and real healing in both seats',()=>{
 for(const reverse of[false,true])for(const[key,damage,healing,replays,hp]of[['thread',286.4,48,4,9938],['reading',317,32,0,9922],['detached',278,32,0,9922]]){
  const tr=meter(moveLink(boardOf(),key),diff(),{reverse});assert.equal(tr.b.combatVersion,'combat-v4');assert.equal(tr.b.result,null);near(tr.b.elapsed,24);near(tr.metrics.hpDamage,damage);assert.equal(tr.metrics.healing,healing);assert.equal(tr.metrics.replays,replays);assert.equal(tr.metrics.naturalAttacks,49);assert.equal(tr.side.hp,hp);assert.equal(tr.side.lag,1);
  for(const field of['shieldDamage','overheal','shielding','shieldWaste','routed','spent','unconverted','prevented'])assert.equal(tr.metrics[field],0,field);assert.equal(tr.side.income,0);
  const naturalFires=tr.events.filter(e=>e.kind==='fire'&&e.side===tr.who&&e.id==='r5'&&!e.echo);assert.equal(naturalFires.length,13);const naturalTimes=new Set(naturalFires.map(e=>e.time));const natural=tr.events.filter(e=>e.kind==='damage'&&e.side===tr.who&&e.id==='r5'&&naturalTimes.has(e.time));assert.equal(natural.length,13);assert.ok(natural.every(e=>e.value===(key==='reading'?9:6)&&!e.pierce));
  const echoes=tr.events.filter(e=>e.kind==='echo'&&e.side===tr.who);assert.deepEqual(echoes.map(e=>[e.time,e.to]),key==='thread'?[[3.25,'r5'],[9.75,'r5'],[16.25,'r5'],[22.75,'r5']]:[]);
  assert.ok(tr.events.filter(e=>e.kind==='heal'&&e.side===tr.who).every(e=>e.value===(key==='thread'?12:8)));
 }
});

test('empty opponents and later damage expose overheal rather than inventing survival value',()=>{
 for(const reverse of[false,true])for(const[key,nominal]of[['thread',48],['reading',32]]){
  const empty=meter(moveLink(boardOf(),key),[],{reverse});assert.equal(empty.metrics.healing,0);assert.equal(empty.metrics.overheal,nominal);assert.equal(empty.side.hp,10000);
  const early=meter(moveLink(boardOf(),key),diff(),{reverse,ticks:60,offset:.75});assert.equal(early.metrics.healing,0);assert.equal(early.metrics.overheal,nominal/4);
  const normal=meter(moveLink(boardOf(),key),diff(),{reverse,ticks:60});assert.equal(normal.metrics.healing,nominal/4);
  const later=meter(moveLink(boardOf(),key),diff(),{reverse,offset:.75});assert.equal(later.metrics.healing,nominal*3/4);assert.equal(later.metrics.overheal,nominal/4);
 }
});

test('normal CPU12 capacity slows both placements and incurs real overload damage',()=>{
 for(const reverse of[false,true])for(const[key,damage,hp,replays]of[['thread',254.3,9916.4,3],['reading',284,9900.4,0]]){
  const tr=meter(moveLink(boardOf(),key),diff(),{reverse,capacity:12});near(tr.metrics.hpDamage,damage);near(tr.side.hp,hp);assert.equal(tr.metrics.replays,replays);assert.equal(tr.metrics.naturalAttacks,44);assert.equal(tr.side.lag,1.1);assert.equal(tr.b.result,null);
  // HP arithmetic is independent of event-label presentation.
  near(10000+tr.metrics.healing-tr.b.metrics[tr.foe].hpDamage-tr.side.hp,21.6);
 }
});

test('cheaper supported five-link board defeats both main placements without enemy overload',()=>{
 assert.deepEqual([resource(peer()).acquisitionValue,resource(peer()).load,resource(peer()).footprint],[20,6,37376]);
 for(const reverse of[false,true])for(const[capacity,key,time,left]of[[14,'thread',21.1,185.7],[14,'reading',19.75,173],[12,'thread',19.75,229.7],[12,'reading',19.75,206]]){
  const tr=meter(moveLink(boardOf(),key),peer(),{reverse,capacity,hp:440,ticks:1201});assert.equal(tr.b.result?.winner,tr.foe);near(tr.b.elapsed,time);near(tr.b[tr.foe].hp,left);assert.equal(tr.side.hp,0);assert.equal(tr.b[tr.foe].lag,1);
 }
});

test('ordinary reversible moves collisions and save/stash operations preserve eight owned identities',()=>{
 const initial=boardOf();let board=initial;for(let i=0;i<4;i++)board=moveLink(moveLink(moveLink(board,'reading'),'detached'),'thread');assert.deepEqual(board,initial);assert.deepEqual(meter(board,diff()).events,meter(initial,diff()).events);assert.deepEqual(meter([...initial].reverse(),diff()).events,meter(initial,diff()).events);
 const invalid=structuredClone(initial);assert.equal(C.moveMany(invalid,['r5'],0,-32),false);assert.deepEqual(invalid,initial);
 const run=R.newRun('lab','blank');run.owned=initial.map((p,i)=>({...p,id:`p${i+1}`}));run.nextId=9;run.admin=[];const cash=run.cash,original=structuredClone(run.owned);
 assert.equal(R.move(run,'p6',692,492),true);let saved=JSON.parse(JSON.stringify(run));assert.equal(R.validateRun(saved),true);assert.equal(E.analyze(saved.owned).mods.p6.power,1.5);assert.equal(saved.cash,cash);
 assert.equal(R.move(saved,'p6',null,null),true);assert.equal(saved.owned.length,8);assert.equal(saved.cash,cash);assert.equal(resource(saved.owned).acquisitionValue,31);assert.equal(resource(saved.owned).load,13);assert.equal(saved.owned.reduce((sum,p)=>sum+D.PARTS[p.type].price,0),34);
 assert.equal(R.move(saved,'p6',100,492),true);assert.deepEqual(saved.owned,original);assert.equal(R.validateRun(JSON.parse(JSON.stringify(saved))),true);
});

test('native forum vote link reference and font controls retain their exact existing markup',()=>{
 for(const p of boardOf())for(const label of[p.label,'<script>hostile</script> & "label"']){const item={...p,label},html=V.markup(item,{theme:'reddit'});assert.equal(html,V.markup(item,{theme:'mixed'}));assert.equal(walk(parseFragment(html)).some(n=>n.tagName==='script'),false);}
 assert.match(V.markup(boardOf()[0]),/data-ui="vote-up"/);assert.match(V.markup(boardOf()[5]),/href="#" data-ui="link"/);assert.match(V.markup(boardOf()[7]),/data-ui="font"/);
});

test('new lesson chrome is original inert text without provider assets or service actions',()=>{
 assert.equal(typeof renderer.redditSidebarDecor,'function');assert.equal(renderer.redditSidebarDecor('unknown'),'');
 for(const[kind]of template().decor){const html=renderer.redditSidebarDecor(kind)||communityDecor(kind);assert.ok(html,kind);for(const node of walk(parseFragment(html))){assert.ok(!['button','input','select','textarea','form','a','script','iframe','img','audio','video','object','embed','canvas','svg'].includes(node.tagName),node.tagName);for(const attr of node.attrs??[])assert.ok(!['src','srcset','href','action','formaction','data-ui','tabindex','contenteditable','role'].includes(attr.name)&&!attr.name.startsWith('on'),attr.name);}}
 const lesson=renderer.redditSidebarDecor('reddit-sidebar-lesson');for(const re of[/回復12/,/回復8/,/原本なし/,/6→9/,/286\.4/,/317/,/CPU12では遅延1.1倍/,/24秒/,/HP10,000/])assert.match(lesson,re);
 for(const re of[/21\.6/,/0\.75秒/,/有償/,/実験室/,/回復/,/再発動/,/最適/])assert.match(template().counterplay,re);
});

test('all decorations and both alternative link rectangles have source-legal nonoverlap',()=>{
 const t=template(),slots=[...boardOf().map(p=>[p.x,p.y,p.w,p.h]),[692,492,208,32],[692,552,208,32]];
 for(const[kind,x,y,w,h]of t.decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,kind);for(const slot of slots)assert.equal(overlap([x,y,w,h],slot),false,kind);}
 for(let i=0;i<t.decor.length;i++)for(let j=i+1;j<t.decor.length;j++)assert.equal(overlap(t.decor[i].slice(1),t.decor[j].slice(1)),false,`${t.decor[i][0]} / ${t.decor[j][0]}`);
});

const css=()=>{let source='';try{source=readFileSync(new URL('../src/catalog/reddit-sidebar.css',import.meta.url),'utf8');}catch{}assert.ok(source,'isolated sidebar lesson CSS exists');return source;};
const blocks=()=>new Map([...css().replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(m=>[m[1].trim(),m[2]]));
const luminance=hex=>{const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
const contrast=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(x+.05)/(y+.05);};

test('new lesson styles use isolated noninteractive selectors with measured text contrast',()=>{
 const source=css();assert.doesNotMatch(source,/\.native-|\.web-node|\.node-|\.container-slot|url\(|@import|@font-face|animation\s*:|transition\s*:|opacity\s*:|filter\s*:/);assert.match(source,/pointer-events:\s*none/);
 for(const[selector,body]of blocks()){assert.ok(selector.split(',').every(s=>s.trim().startsWith('.reddit-sidebar-')),selector);assert.doesNotMatch(body,/overflow\s*:\s*hidden|text-overflow/,'new lesson text must not silently truncate');}
 const shared=[...blocks()].find(([selector])=>selector.includes('.reddit-sidebar-title')&&selector.includes('.reddit-sidebar-lesson'))?.[1];assert.ok(shared);const color=shared.match(/(?:^|;)\s*color:\s*(#[a-f0-9]{6})/i)?.[1],background=shared.match(/(?:^|;)\s*background:\s*(#[a-f0-9]{6})/i)?.[1];assert.ok(color&&background);assert.ok(contrast(color,background)>=4.5);
});

test('declared lesson line budgets fit authored boxes without claiming browser wrapping',()=>{
 const t=template(),html=renderer.redditSidebarDecor('reddit-sidebar-lesson'),paragraphs=walk(parseFragment(html)).filter(n=>n.tagName==='p'),title=walk(parseFragment(html)).find(n=>n.tagName==='h2');
 assert.equal(paragraphs.length,13);assert.ok(20+13*16+20<=t.decor.find(d=>d[0]==='reddit-sidebar-lesson')[4]);
 assert.match(blocks().get('.reddit-sidebar-lesson'),/padding:\s*10px 12px/);assert.match(blocks().get('.reddit-sidebar-lesson p'),/margin:\s*0/);assert.match(blocks().get('.reddit-sidebar-lesson h2'),/font:\s*700 14px\/20px/);
 const width=(text,size=11)=>[...text].reduce((sum,c)=>sum+(/[\u0020-\u007e]/.test(c)?size*.7:size),0);
 for(const p of paragraphs)assert.ok(width(textOf(p))<=248,`${width(textOf(p))}: ${textOf(p)}`);assert.ok(width(textOf(title),14)<=248);
 for(const[kind,count]of[['reddit-sidebar-title',1],['reddit-sidebar-thread-note',1],['reddit-sidebar-font-seat',1],['reddit-sidebar-reading-note',1],['reddit-sidebar-detached-note',4],['reddit-sidebar-footnote',1]]){const d=t.decor.find(d=>d[0]===kind),html=renderer.redditSidebarDecor(kind);assert.equal(walk(parseFragment(html)).filter(n=>n.tagName==='br').length+1,count);assert.ok(count*16<=d[4]);for(const line of html.replace(/<br>/g,'\n').replace(/<[^>]+>/g,'').split('\n'))assert.ok(width(line)<=d[3],`${kind}: ${line}`);}
});

test('same-parts font relocation is disclosed so the link comparison is not a false forced choice',()=>{
 const board=boardOf();assert.equal(C.moveMany(board,['r7'],316-692,492-444),true);const info=E.analyze(board);
 assert.deepEqual([resource(board).acquisitionValue,resource(board).load,resource(board).footprint,resource(board).legal],[34,14,297120,true]);assert.equal(info.parents.r7,'r2');assert.equal(info.mods.r4.power,1.5);assert.equal(info.mods.r5.power,1.5);
 for(const reverse of[false,true]){const tr=meter(board,diff(),{reverse});near(tr.metrics.hpDamage,357.8);assert.equal(tr.metrics.healing,48);assert.equal(tr.metrics.replays,4);assert.equal(tr.metrics.naturalAttacks,49);assert.equal(tr.b.result,null);}
 for(const reverse of[false,true])for(const[capacity,time,hp]of[[14,21.1,122.4],[12,19.75,176.4]]){const tr=meter(board,peer(),{reverse,capacity,hp:440,ticks:1201});assert.equal(tr.b.result?.winner,tr.foe);near(tr.b.elapsed,time);near(tr.b[tr.foe].hp,hp);assert.equal(tr.b[tr.foe].lag,1);}
 assert.match(template().counterplay,/316,492/);assert.match(template().counterplay,/357\.8/);assert.match(renderer.redditSidebarDecor('reddit-sidebar-detached-note'),/初期位置/);assert.match(renderer.redditSidebarDecor('reddit-sidebar-detached-note'),/316,492/);assert.match(renderer.redditSidebarDecor('reddit-sidebar-detached-note'),/357\.8/);
});

test('qualified enemy fixture cost is the actual registry price and load',()=>{
 assert.deepEqual([resource(diff()).acquisitionValue,resource(diff()).load,resource(diff()).footprint],[7,4,68800]);assert.match(template().counterplay,/差分1個（\$7\/CPU4）/);
});
