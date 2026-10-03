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

// Real canonical combat and parsed source contracts; no browser/pixel acceptance.
const catalogue=await import('../src/catalog/pinfield-templates.js').catch(()=>({}));
const render=await import('../src/catalog/pinfield-render.js').catch(()=>({}));
const template=()=>{assert.equal(catalogue.PINFIELD_TEMPLATES?.length,1,'PINFIELD exists');return catalogue.PINFIELD_TEMPLATES[0];};
const boardOf=()=>template().layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`pin-${i}`,x,y,w,h),label:label||''}));
const resource=board=>resources(board.filter(C.placed).map(p=>[p.type,p.x,p.y,p.w,p.h]));
const moveTo=(board,x,y)=>{const next=structuredClone(board),p=next.find(p=>p.type==='yt_caption');assert.equal(C.moveMany(next,[p.id],x-p.x,y-p.y),true);return next;};
const variants=()=>[boardOf(),moveTo(boardOf(),736,24),moveTo(boardOf(),648,480)];
const bells=n=>Array.from({length:n},(_,i)=>C.makeItem('yt_notify',`bell-${i}`,24+i*80,24,72,40));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const walk=node=>[node,...(node.childNodes??[]).flatMap(walk)];
const textOf=node=>node.nodeName==='#text'?node.value:(node.childNodes??[]).map(textOf).join('');
function meter(board,opponent=[],{reverse=false,ticks=480,hp=10000,phase=0,foePhase=0}={}){
 assert.equal(resource(board).legal,true);assert.equal(resource(opponent).legal,true);
 const b=new E.Battle(reverse?opponent:board,reverse?board:opponent,{playerHp:hp,enemyHp:hp,playerCapacity:12,enemyCapacity:12,playerAdmin:[],enemyAdmin:[]}),who=reverse?'enemy':'player',foe=reverse?'player':'enemy',events=[];
 // Diagnostic initial-clock shifts only, never a product rule or saved template state.
 if(phase)for(const p of b[who].parts)if(p.period)p.remaining+=phase;
 if(foePhase)for(const p of b[foe].parts)if(p.period)p.remaining+=foePhase;
 for(let i=0;i<ticks&&!b.result;i++)events.push(...b.step(.05));
 return{b,who,foe,events,side:b[who],metrics:b.metrics[who]};
}

test('PINFIELD is the exact ordinary four-part $20/CPU10 discovery layout',()=>{
 const t=template(),board=boardOf(),r=resource(board);
 assert.deepEqual([t.id,t.faction,t.pageName,t.status],['site_pinterest','pinfield','PINFIELD / ひらめきの棚','experimental']);assert.match(t.name,/Pinterest風/);
 assert.deepEqual([t.hp,t.fee,t.reward,t.admin],[440,0,0,[]]);
 assert.deepEqual(t.layout.map(p=>p.slice(0,5)),[['go_search',24,24,704,40],['yt_play',24,176,288,216],['yt_caption',24,400,88,40],['ab_link',336,344,288,32]]);
 assert.deepEqual([r.parts,r.acquisitionValue,r.load,r.footprint,r.legal,r.experimental,r.capWaste],[4,20,10,103104,true,[],[]]);
 assert.deepEqual(t.loot,['go_search','yt_play','yt_caption','ab_link']);
 for(const p of board){assert.notEqual(D.PARTS[p.type].faction,'pinfield');assert.equal(p.w,t.layout[board.indexOf(p)][3]);assert.equal(p.h,t.layout[board.indexOf(p)][4]);}
 assert.deepEqual(t.references,['https://help.pinterest.com/en/article/search-for-ideas-on-pinterest','https://help.pinterest.com/en/article/types-of-pins-on-pinterest','https://github.com/pinterest/gestalt/blob/master/packages/gestalt/src/Masonry.tsx']);
});

test('one owned CC move exchanges real video piercing for search proximity and form power',()=>{
 const [initial,moved,detached]=variants(),a=E.analyze(initial),b=E.analyze(moved),c=E.analyze(detached);
 assert.deepEqual(a.groups.map(g=>[g.kind,g.items]),[['media-stack',['pin-1','pin-2']]]);
 assert.deepEqual(a.relations,[{from:'pin-2',to:'pin-1',kind:'power',label:'字幕'}]);assert.equal(a.mods['pin-1'].pierce,.25);assert.equal(a.mods['pin-0'].power,1);
 assert.deepEqual(b.groups.map(g=>[g.kind,g.items]),[['search-form',['pin-0','pin-2']]]);assert.deepEqual(b.relations,[]);assert.equal(b.mods['pin-0'].power,1.3);assert.equal(b.mods['pin-1'].pierce,0);assert.deepEqual(b.near['pin-0'],['pin-2']);
 assert.deepEqual(c.groups,[]);assert.deepEqual(c.relations,[]);assert.deepEqual(c.near['pin-2'],[]);assert.equal(c.mods['pin-0'].power,1);assert.equal(c.mods['pin-1'].pierce,0);
 for(const board of[moved,detached]){assert.deepEqual(resource(board),resource(initial));assert.deepEqual(board.map(({x,y,...p})=>p),initial.map(({x,y,...p})=>p));for(const i of[0,1,3])assert.deepEqual(board[i],initial[i]);}
 for(const info of[a,b,c]){assert.deepEqual(info.parents,{});assert.deepEqual(info.sets,[]);assert.deepEqual(info.navigation,{entries:1,slowdown:1,highlightedLinks:['pin-3']});close(info.freeRatio,1-103104/(960*680));for(const id of['pin-0','pin-1','pin-2','pin-3'])assert.equal(info.mods[id].speed,1);}
});

test('CC y=26 keeps search proximity but loses aligned form and yields ten per search',()=>{
 const board=moveTo(boardOf(),736,26),a=E.analyze(board),trace=meter(board);
 assert.deepEqual(a.near['pin-0'],['pin-2']);assert.deepEqual(a.groups,[]);assert.equal(a.mods['pin-0'].power,1);assert.equal(a.mods['pin-1'].pierce,0);
 assert.equal(trace.metrics.hpDamage,241);assert.equal(trace.metrics.naturalAttacks,30);assert.equal(trace.b.result,null);
 const shots=trace.events.filter(e=>e.kind==='damage'&&e.side===trace.who&&e.id==='pin-0');assert.equal(shots.length,7);assert.ok(shots.every(e=>e.value===10&&!e.pierce));
});

test('exact finite 24-second empty and grouped-shield meters retain all natural attacks in both seats',()=>{
 for(const reverse of[false,true])for(const[n,expected]of[[0,[227,262,227]],[6,[35,61,31]],[7,[33,31,15]],[8,[33,15,15]]])for(const[i,board]of variants().entries()){
  const t=meter(board,bells(n),{reverse});assert.equal(t.b.combatVersion,'combat-v4');assert.equal(t.b.result,null);close(t.b.elapsed,24);assert.equal(t.side.hp,10000);assert.equal(t.side.lag,1);assert.equal(t.metrics.hpDamage,expected[i]);assert.equal(t.metrics.naturalAttacks,30);
  assert.equal(t.metrics.replays,0);assert.equal(t.metrics.healing,0);assert.equal(t.metrics.shielding,0);assert.equal(t.side.income,0);assert.equal(t.side.shield,0);
  const shots=t.events.filter(e=>e.kind==='damage'&&e.side===t.who);assert.equal(shots.length,30);
  for(const[id,count,value,pierce]of[['pin-0',7,i===1?13:8,false],['pin-1',10,8,i===0],['pin-3',13,7,false]]){const own=shots.filter(e=>e.id===id);assert.equal(own.length,count);assert.ok(own.every(e=>e.value===value&&e.pierce===pierce));}
  if(n===0)assert.equal(t.metrics.shieldDamage,0);
  if(n===8&&i===0){assert.equal(t.metrics.shieldDamage,194);assert.ok(shots.filter(e=>e.id==='pin-1').some(e=>e.blocked===6&&e.hit===2));}
 }
});

test('eight notification bells are an unequal-price shield-only measurement fixture',()=>{
 const r=resource(bells(8));assert.deepEqual([r.acquisitionValue,r.load,r.footprint,r.parts,r.legal],[32,8,23040,8,true]);
 assert.deepEqual(E.analyze(bells(8)).groups.map(g=>[g.kind,g.items.length]),[['button-group',8]]);
 const t=meter(boardOf(),bells(8));assert.equal(t.b.metrics[t.foe].naturalAttacks,0);assert.equal(t.b.metrics[t.foe].hpDamage,0);assert.equal(t.b[t.foe].income,0);assert.ok(t.b.metrics[t.foe].shielding>0);
});

test('short windows and attack and bell initial-clock controls limit the shield lesson',()=>{
 const controls=[{ticks:120,expected:[17,15]},{ticks:120,phase:-.25,expected:[27,28]},{ticks:480,phase:-.25,expected:[41,28]},{ticks:480,phase:.25,expected:[33,15]},{ticks:480,foePhase:.5,expected:[41,28]},{ticks:480,foePhase:-.5,expected:[33,15]}];
 for(const {expected,...options} of controls)for(const[i,board]of variants().slice(0,2).entries()){
  const a=meter(board,bells(8),options),b=meter(board,bells(8),{...options,reverse:true});assert.equal(a.metrics.hpDamage,expected[i]);assert.deepEqual(a.metrics,b.metrics);assert.equal(a.b.result,null);assert.equal(b.b.result,null);
 }
});

test('same-price $20/CPU6 supported five-link control defeats both main placements in both seats',()=>{
 const peer=[C.makeItem('gov_font','font',24,96,208,32),...[8,48,144,184,224].map((y,i)=>C.makeItem('ab_link',`peer-${i}`,24,y,192,32))],r=resource(peer);
 assert.deepEqual([r.acquisitionValue,r.load,r.footprint,r.legal],[20,6,37376,true]);
 for(const reverse of[false,true])for(const[i,board]of variants().slice(0,2).entries()){
  const t=meter(board,peer,{reverse,hp:440,ticks:1201});assert.equal(t.b.result.winner,t.foe);close(t.b.elapsed,18.4);assert.equal(t.b[t.foe].hp,[274,249][i]);assert.equal(t.side.hp,0);
 }
});

test('repeated CC moves reverse exactly and collision rejects without mutation',()=>{
 const original=boardOf();let next=original;for(let i=0;i<4;i++)next=moveTo(moveTo(moveTo(next,736,24),648,480),24,400);
 assert.deepEqual(next,original);assert.deepEqual(meter(next).events,meter(original).events);assert.deepEqual(meter([...original].reverse()).events,meter(original).events);
 const invalid=structuredClone(original);assert.equal(C.moveMany(invalid,['pin-2'],0,-16),false);assert.deepEqual(invalid,original);
});

test('ordinary move stash and JSON round trips preserve the same four owned parts labels and cash',()=>{
 const r=R.newRun('lab','blank');r.owned=boardOf().map((p,i)=>({...p,id:`p${i+1}`}));r.nextId=5;r.admin=[];const cash=r.cash,initial=structuredClone(r.owned);
 assert.equal(R.validateRun(JSON.parse(JSON.stringify(r))),true);assert.equal(R.move(r,'p3',736,24),true);
 let saved=JSON.parse(JSON.stringify(r));assert.equal(R.validateRun(saved),true);assert.equal(E.analyze(saved.owned).mods.p1.power,1.3);assert.deepEqual(saved.owned.filter(p=>p.id!=='p3'),initial.filter(p=>p.id!=='p3'));
 assert.equal(R.move(saved,'p3',null,null),true);assert.equal(saved.cash,cash);assert.equal(saved.owned.length,4);assert.equal(resource(saved.owned).load,9);assert.equal(resource(saved.owned).acquisitionValue,16);assert.equal(saved.owned.reduce((sum,p)=>sum+D.PARTS[p.type].price,0),20,'stashing never refunds');
 assert.equal(R.move(saved,'p3',648,480),true);assert.deepEqual(E.analyze(saved.owned).near.p3,[]);assert.equal(R.move(saved,'p3',24,400),true);saved=JSON.parse(JSON.stringify(saved));assert.equal(R.validateRun(saved),true);assert.deepEqual(saved.owned,initial);assert.equal(saved.cash,cash);
});

test('PINFIELD retains native video search CC and link markup with hostile-label escaping',()=>{
 for(const p of boardOf())for(const label of[p.label,'<script>alert("x")</script> & "quote"']){
  const item={...p,label},html=V.markup(item,{theme:'pinfield'});assert.equal(html,V.markup(item,{theme:'mixed'}));assert.equal(walk(parseFragment(html)).some(n=>n.tagName==='script'),false);
 }
 const board=boardOf();assert.match(V.markup(board[1]),/data-ui="play" aria-label="動画を再生"/);assert.match(V.markup(board[1]),/video-time/);assert.match(V.markup(board[0]),/type="search"/);assert.match(V.markup(board[3]),/href="#" data-ui="link"/);
 const cc=walk(parseFragment(V.markup(board[2]))).find(n=>n.tagName==='button');assert.equal(textOf(cc),'CC');assert.equal(cc.attrs.find(a=>a.name==='type').value,'button');assert.equal(cc.attrs.find(a=>a.name==='data-ui').value,'caption');assert.equal(cc.attrs.some(a=>a.name==='form'),false);
});

test('original discovery chrome is static noninteractive artwork with no remote resources',()=>{
 const t=template();assert.equal(typeof render.pinfieldHeader,'function');assert.equal(typeof render.pinfieldDecor,'function');assert.match(render.pinfieldHeader(),/PINFIELD/);assert.match(render.pinfieldHeader(),/Pinterest風.*非公式/);
 for(const html of[render.pinfieldHeader(),...t.decor.map(([kind])=>render.pinfieldDecor(kind))]){
  assert.ok(html);for(const node of walk(parseFragment(html))){assert.ok(!['button','input','select','textarea','form','a','script','iframe','img','audio','video','object','embed','canvas','svg'].includes(node.tagName),node.tagName);for(const attr of node.attrs??[])assert.ok(!['src','srcset','href','action','formaction','data-ui','tabindex','contenteditable','role'].includes(attr.name)&&!attr.name.startsWith('on'),attr.name);}
 }
 assert.equal(render.pinfieldDecor('unknown'),'');assert.match(render.pinfieldDecor('pinfield-board-heading'),/固定/);assert.match(render.pinfieldDecor('pinfield-comparison'),/検索送信ではありません/);assert.match(render.pinfieldDecor('pinfield-comparison'),/保存・投稿・推薦/);
 for(const re of[/24秒/,/6秒/,/0\.25秒/,/0\.5秒/,/同額ではない/,/開始|位相/,/最適|完成形/,/通常ショップ/,/ゲーム内/,/未接続/])assert.match(t.counterplay,re);
});

test('every fixed decoration clears all four parts and all three CC placements',()=>{
 const t=template(),slots=[...boardOf().map(p=>[p.x,p.y,p.w,p.h]),[736,24,88,40],[736,26,88,40],[648,480,88,40]],overlap=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
 for(const[kind,x,y,w,h]of t.decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,kind);for(const slot of slots)assert.equal(overlap([x,y,w,h],slot),false,kind);}
 for(let i=0;i<t.decor.length;i++)for(let j=i+1;j<t.decor.length;j++)assert.equal(overlap(t.decor[i].slice(1),t.decor[j].slice(1)),false,`${t.decor[i][0]} / ${t.decor[j][0]}`);
});

const css=()=>{const path=new URL('../src/catalog/pinfield.css',import.meta.url);let result='';try{result=readFileSync(path,'utf8');}catch{}assert.ok(result,'PINFIELD CSS exists');return result;};
const blocks=()=>new Map([...css().replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(m=>[m[1].trim(),m[2]]));
function color(selector,property='color'){
 const value=blocks().get(selector)?.match(new RegExp(`(?:^|;)\\s*${property}:\\s*(#[a-f0-9]{6})`,'i'))?.[1];assert.ok(value,`explicit ${property} for ${selector}`);return value;
}
function luminance(hex){const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
function contrast(a,b){const [light,dark]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return(light+.05)/(dark+.05);}

test('PINFIELD actual text selector colors meet 4.5:1 on their declared surface colors',()=>{
 const page=color('.site-theme-pinfield .page-body','background'),header=color('.site-theme-pinfield .site-header','background');
 const surfaces=[
  [header,['.pinfield-word','.pinfield-word small','.pinfield-header-context','.pinfield-header-local']],
  [page,['.pinfield-search-note','.pinfield-search-seat','.pinfield-board-heading h1','.pinfield-board-heading p','.pinfield-chip-label','.pinfield-column-title','.pinfield-video-note','.pinfield-video-note b','.pinfield-video-detail','.pinfield-link-note','.pinfield-link-note b','.pinfield-detached-title','.pinfield-detached-note','.pinfield-offset-note','.pinfield-comparison']],
  [color('.pinfield-chip','background'),['.pinfield-chip']],
  [color('.pinfield-paper-card','background'),['.pinfield-paper-card']],
  [color('.pinfield-window-card','background'),['.pinfield-window-card']],
  [color('.pinfield-paper-strip','background'),['.pinfield-paper-strip']],
  [color('.pinfield-window-strip','background'),['.pinfield-window-strip']],
  [color('.site-theme-pinfield .site-footer','background'),['.site-theme-pinfield .site-footer']],
 ];
 for(const[background,selectors]of surfaces)for(const selector of selectors){const ratio=contrast(color(selector),background);assert.ok(ratio>=4.5,`${selector}: ${ratio.toFixed(3)}:1`);}
 // No opacity/filter can silently lower any inherited text contrast.
 assert.doesNotMatch(css(),/\bopacity\s*:|filter\s*:|mix-blend-mode\s*:/);
});

test('PINFIELD keeps the four-line lesson and supporting text inside declared source line budgets',()=>{
 const t=template(),source=css(),comparison=t.decor.find(d=>d[0]==='pinfield-comparison');assert.deepEqual(comparison.slice(1),[24,604,912,68]);
 assert.match(source,/\.pinfield-comparison\s*\{[^}]*font:\s*11px\/16px/);assert.match(source,/\.pinfield-comparison p\s*\{[^}]*margin:\s*0/);
 const paragraphs=walk(parseFragment(render.pinfieldDecor('pinfield-comparison'))).filter(n=>n.tagName==='p');assert.equal(paragraphs.length,4);assert.ok(1+2+4*16<=comparison[4]);
 // Conservative source character advance budget, not a browser font/wrapping claim.
 for(const p of paragraphs){const estimated=[...textOf(p)].reduce((sum,c)=>sum+(/[\u0020-\u007e]/.test(c)?7.7:11),0);assert.ok(estimated<=912,`${estimated}: ${textOf(p)}`);}
 for(const[kind,lines,height]of[['pinfield-video-note',2,40],['pinfield-video-detail',2,40],['pinfield-link-note',3,60],['pinfield-detached-note',2,40],['pinfield-offset-note',3,52]]){const d=t.decor.find(d=>d[0]===kind);assert.equal(d[4],height);assert.ok(lines*16<=height);assert.match(blocks().get(`.${kind}`),/font:\s*11px\/16px/);const html=render.pinfieldDecor(kind);assert.equal(walk(parseFragment(html)).filter(n=>n.tagName==='br').length+1,lines);for(const line of html.replace(/<br>/g,'\n').replace(/<[^>]+>/g,'').split('\n'))assert.ok([...line].reduce((sum,c)=>sum+(/[\u0020-\u007e]/.test(c)?7.7:11),0)<=d[3],`${kind}: ${line}`);}
});

test('PINFIELD CSS is local inert paper window and botanical artwork without native overrides',()=>{
 const source=css();assert.match(source,/\.site-theme-pinfield \.page-decor\s*\{[^}]*pointer-events:\s*none/);assert.match(source,/\.pinfield-paper/);assert.match(source,/\.pinfield-window/);assert.match(source,/\.pinfield-leaf/);
 assert.doesNotMatch(source,/\.native-|\.web-node|\.node-|\.container-slot|url\(|@import|@font-face|cursor:\s*pointer|animation\s*:|transition\s*:/);
});
