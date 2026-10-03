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

// Source/native markup and real fixed-step contracts, never browser pixel acceptance.
const catalogue=await import('../src/catalog/chat-workspace-templates.js').catch(()=>({}));
const render=await import('../src/catalog/chat-workspace-render.js').catch(()=>({}));
const template=()=>{assert.equal(catalogue.CHAT_WORKSPACE_TEMPLATES?.length,1,'SIDECHANNEL exists');return catalogue.CHAT_WORKSPACE_TEMPLATES[0];};
const boardOf=()=>template().layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`chat-${i}`,x,y,w,h),label:label||''}));
const resource=board=>resources(board.filter(C.placed).map(p=>[p.type,p.x,p.y,p.w,p.h]));
const moveTo=(board,x,y)=>{const next=structuredClone(board),p=next.find(p=>p.type==='gov_breadcrumb');assert.equal(C.moveMany(next,[p.id],x-p.x,y-p.y),true);return next;};
const variants=()=>[boardOf(),moveTo(boardOf(),648,228),moveTo(boardOf(),208,552)];
const source=(type,id='source')=>[C.makeItem(type,id,24,24,Math.max(D.PARTS[type].minW,360),D.PARTS[type].h)];
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const walk=node=>[node,...(node.childNodes??[]).flatMap(walk)];
function meter(board,opponent=source('gh_diff'),{reverse=false,phase=0,ticks=480}={}){
 assert.equal(resource(board).legal,true);assert.equal(resource(opponent).legal,true);
 const b=new E.Battle(reverse?opponent:board,reverse?board:opponent,{playerHp:440,enemyHp:440,playerCapacity:12,enemyCapacity:12,playerAdmin:[],enemyAdmin:[]}),who=reverse?'enemy':'player',foe=reverse?'player':'enemy';
 // Diagnostic ONLY: shift the opponent's initial clock; no product rule or saved state changes.
 if(phase)for(const p of b[foe].parts)if(p.period)p.remaining+=phase;
 const events=[];for(let tick=0;tick<ticks&&!b.result;tick++){events.push(...b.step(.05));for(const side of[b.player,b.enemy]){assert.ok(side.hp>=0&&side.hp<=440);assert.ok(side.shield>=0&&side.shield<=60);}}
 return{b,events,who,foe,side:b[who],metrics:b.metrics[who]};
}

test('SIDECHANNEL is a four-part $20/CPU8 legal chat-workspace teaching board',()=>{
 const t=template(),board=boardOf(),r=resource(board);
 assert.equal(t.id,'site_slack');assert.equal(t.faction,'chatworkspace');assert.equal(t.status,'experimental');assert.match(t.pageName,/SIDECHANNEL/);assert.match(t.name,/Slack風/);
 assert.deepEqual([t.hp,t.fee,t.reward,t.admin],[440,0,0,[]]);assert.deepEqual(board.map(p=>p.type),['tw_post','go_history','gov_pdf','gov_breadcrumb']);
 assert.deepEqual([r.parts,r.acquisitionValue,r.load,r.footprint,r.legal],[4,20,8,98208,true]);assert.deepEqual(r.experimental,['tw_post','go_history']);
 assert.ok(t.references.includes('https://slack.com/help/articles/115000769927-Use-threads-to-organize-discussions'));assert.ok(t.references.includes('https://slack.com/help/articles/212596808-Adjust-your-sidebar-preferences'));
 for(const p of board)assert.notEqual(D.PARTS[p.type].faction,'chatworkspace');
});

test('one breadcrumb move transfers document speed without changing area or cost',()=>{
 for(const[board,target]of variants().map((b,i)=>[b,[1,2,null][i]])){
  const info=E.analyze(board);assert.deepEqual(info.groups,[]);assert.deepEqual(info.parents,{});assert.equal(info.load,8);assert.equal(resource(board).footprint,98208);assert.equal(resource(board).acquisitionValue,20);
  for(let i=0;i<4;i++){assert.equal(info.mods[`chat-${i}`].speed,i===target?1.15:1);assert.equal(info.mods[`chat-${i}`].power,1);}
 }
 const initial=boardOf();let board=initial;for(let i=0;i<3;i++)board=moveTo(moveTo(moveTo(board,648,228),208,552),208,316);assert.deepEqual(board,initial);
 const invalid=structuredClone(initial);assert.equal(C.moveMany(invalid,['chat-3'],0,40),false);assert.deepEqual(invalid,initial);
});

test('fixed 24-second diff example exchanges 55 restored HP for one extra PDF in both seats',()=>{
 for(const reverse of[false,true])for(const[board,damage,healing]of[[variants()[0],127,55],[variants()[1],145,0],[variants()[2],127,0]]){
  const trace=meter(board,source('gh_diff'),{reverse});assert.equal(trace.b.result,null);assert.equal(trace.b.combatVersion,'combat-v4');assert.equal(trace.side.lag,1);assert.equal(trace.side.hp,440-110+healing);assert.equal(trace.metrics.hpDamage,damage);assert.equal(trace.metrics.healing,healing);
  assert.equal(trace.metrics.shielding,0);assert.equal(trace.metrics.replays,0);assert.equal(trace.side.income,0);assert.equal(trace.side.shield,0);
  assert.deepEqual(trace.events.filter(e=>e.kind==='damage'&&e.side===trace.foe).map(e=>e.time),[2.5,7.5,12.5,17.5,22.5]);
  const pdf=trace.events.filter(e=>e.kind==='damage'&&e.side===trace.who&&e.id==='chat-2');assert.ok(pdf.every(e=>e.value===18&&e.pierce));assert.equal(pdf.length,damage===145?5:4);close(pdf[0].time,damage===145?2.4:2.75);
  const times=events=>events.map(e=>Number(e.time.toFixed(2)));assert.deepEqual(times(pdf),damage===145?[2.4,7.2,12,16.75,21.55]:[2.75,8.25,13.75,19.25]);
  assert.deepEqual(times(trace.events.filter(e=>e.kind==='damage'&&e.side===trace.who&&e.id==='chat-0')),[1.1,3.3,5.5,7.7,9.9,12.1,14.3,16.5,18.7,20.9,23.1]);
  close(trace.side.parts.find(p=>p.id==='chat-0').period,2.2);close(trace.side.parts.find(p=>p.id==='chat-1').period,healing?5/1.15:5);close(trace.side.parts.find(p=>p.id==='chat-2').period,damage===145?5.5/1.15:5.5);
  assert.deepEqual(times(trace.events.filter(e=>e.kind==='history'&&e.side===trace.who&&e.action==='restore')),healing?[6.55,10.9,15.25,19.6,23.95]:[]);
  if(!healing)assert.deepEqual(trace.events.filter(e=>e.kind==='history'&&e.side===trace.who&&e.action==='expire').map(e=>e.time),[7.5,12.5,17.5,22.5]);
 }
});

test('plus or minus 0.75-second diagnostic offsets disprove generic restoration claims',()=>{
 for(const reverse of[false,true])for(const[phase,plainHealing]of[[-.75,55],[.75,44]])for(const[board,healing]of[[variants()[0],55],[variants()[1],plainHealing]]){
  const trace=meter(board,source('gh_diff'),{reverse,phase});assert.equal(trace.metrics.healing,healing);close(trace.events.find(e=>e.kind==='damage'&&e.side===trace.foe).time,2.5+phase);
 }
});

test('ZIP timing, small-chip overwrites, piercing and no damage bound restoration claims',()=>{
 for(const reverse of[false,true])for(const[i,board]of variants().slice(0,2).entries()){
  const zip=meter(board,source('gh_transfer'),{reverse});assert.equal(zip.metrics.healing,36);assert.deepEqual(zip.events.filter(e=>e.kind==='damage'&&e.side===zip.foe).map(e=>e.time),[4,12,20]);assert.equal(zip.metrics.hpDamage,i?145:127);
  const mixed=[...source('gh_diff'),C.makeItem('ab_link','chip',24,244,360,32)],chip=meter(board,mixed,{reverse});assert.equal(chip.metrics.healing,i?17.5:21);assert.ok(chip.events.filter(e=>e.kind==='history'&&e.side===chip.who&&e.action==='restore').every(e=>e.from==='chip'&&e.value===3.5));
  const piercing=meter(board,source('gov_pdf'),{reverse});assert.equal(piercing.metrics.healing,18);assert.ok(piercing.events.filter(e=>e.kind==='heal'&&e.side===piercing.who).every(e=>e.value===4.5));
  const quiet=meter(board,[],{reverse});assert.equal(quiet.side.hp,440);assert.equal(quiet.metrics.healing,0);assert.equal(quiet.side.shield,0);
 }
});

test('native shield cap and half-piercing apply without protection from chat chrome',()=>{
 const shield=[C.makeItem('gov_form','shield-0',16,16,280,200),C.makeItem('gov_form','shield-1',400,16,280,200)];
 for(const board of variants().slice(0,2)){
  const trace=meter(board,shield);assert.ok(trace.events.filter(e=>e.kind==='damage'&&e.side==='player'&&e.id==='chat-2').every(e=>e.hit>=9&&e.value===18));assert.equal(trace.metrics.healing,0);assert.equal(trace.side.shield,0);
 }
 const quiet=new E.Battle([],shield,{playerHp:440,enemyHp:440,playerCapacity:12,enemyCapacity:12,playerAdmin:[],enemyAdmin:[]});for(let i=0;i<480;i++)quiet.step(.05);assert.equal(quiet.enemy.shield,60);assert.ok(quiet.metrics.enemy.shieldWaste>0);
});

test('a cheaper legal $17/CPU5 four-link board defeats both placements in both seats',()=>{
 const peer=[C.makeItem('gov_font','font',24,96,208,32),...[48,144,184,224].map((y,i)=>C.makeItem('ab_link',`link-${i}`,24,y,192,32))];assert.deepEqual([resource(peer).acquisitionValue,resource(peer).load,resource(peer).footprint,resource(peer).legal],[17,5,31232,true]);
 for(const reverse of[false,true])for(const[i,board]of variants().slice(0,2).entries()){
  const trace=meter(board,peer,{reverse,ticks:1201});assert.equal(trace.b.result.winner,trace.foe);close(trace.b.elapsed,i?22.7:22.5);assert.equal(trace.b[trace.foe].hp,i?300:318);
 }
});

test('run movement and save round trips preserve owned material and labels',()=>{
 const r=R.newRun('lab','blank');r.owned=boardOf().map((p,i)=>({...p,id:`p${i+1}`}));r.nextId=5;r.admin=[];assert.equal(R.validateRun(JSON.parse(JSON.stringify(r))),true);
 assert.equal(R.move(r,'p4',648,228),true);assert.equal(R.validateRun(JSON.parse(JSON.stringify(r))),true);assert.equal(resource(r.owned).acquisitionValue,20);const cash=r.cash;
 assert.equal(R.move(r,'p4',null,null),true);assert.equal(r.cash,cash);assert.equal(r.owned.length,4);assert.equal(resource(r.owned).load,7);assert.equal(R.move(r,'p4',208,316),true);assert.equal(R.validateRun(JSON.parse(JSON.stringify(r))),true);
});

test('original channel, thread and composer chrome is static without send or remote hooks',()=>{
 const t=template();assert.equal(typeof render.chatWorkspaceHeader,'function');assert.equal(typeof render.chatWorkspaceDecor,'function');assert.match(render.chatWorkspaceHeader(),/SIDECHANNEL/);assert.match(render.chatWorkspaceHeader(),/Slack風.*非公式/);
 for(const html of[render.chatWorkspaceHeader(),...t.decor.map(([kind])=>render.chatWorkspaceDecor(kind))]){
  assert.ok(html);for(const node of walk(parseFragment(html))){assert.ok(!['button','input','select','textarea','form','a','script','iframe','img','audio','video','object','embed'].includes(node.tagName),node.tagName);for(const attr of node.attrs??[])assert.ok(!['src','srcset','href','action','formaction','data-ui','tabindex','contenteditable'].includes(attr.name)&&!attr.name.startsWith('on'),attr.name);}
 }
 assert.equal(render.chatWorkspaceDecor('unknown'),'');assert.match(render.chatWorkspaceDecor('chat-composer'),/入力・送信なし/);assert.match(render.chatWorkspaceDecor('chat-thread-composer'),/入力・送信なし/);assert.match(render.chatWorkspaceDecor('chat-local-note'),/同期|送信/);
 assert.match(t.counterplay,/24秒/);assert.match(t.counterplay,/0.75/);assert.match(t.counterplay,/固定|限定/);assert.match(t.counterplay,/最適|完成形/);
});

test('fixed chat artwork clears native parts and advertised breadcrumb slots',()=>{
 const slots=[...boardOf().map(p=>[p.x,p.y,p.w,p.h]),[648,228,288,28],[208,552,288,28]],overlap=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
 for(const[kind,x,y,w,h]of template().decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,kind);for(const slot of slots)assert.equal(overlap([x,y,w,h],slot),false,kind);}
});

test('chat theme keeps native controls with escaped labels',()=>{
 for(const p of boardOf()){assert.equal(V.markup(p,{theme:'chatworkspace'}),V.markup(p,{theme:'mixed'}));assert.equal(walk(parseFragment(V.markup({...p,label:'<script>alert("x")</script> & "quote"'},{theme:'chatworkspace'}))).some(n=>n.tagName==='script'),false);}
 assert.match(V.markup(boardOf()[1]),/data-ui="history-restore"/);assert.match(V.markup(boardOf()[2]),/href="#" data-ui="download"/);assert.match(V.markup(boardOf()[3]),/native-breadcrumb/);
});

test('chat CSS is local inert artwork without native overrides or remote assets',()=>{
 const source=readFileSync(new URL('../src/catalog/chat-workspace.css',import.meta.url),'utf8');assert.match(source,/\.site-theme-chatworkspace \.page-body/);assert.match(source,/pointer-events:\s*none/);assert.doesNotMatch(source,/\.native-|\.web-node|\.node-|\.container-slot|url\(|@import|@font-face/);
});
