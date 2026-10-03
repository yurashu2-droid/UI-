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
import {RELEASE_TEMPLATES} from '../src/catalog/releases-templates.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {knowledgeDecor} from '../src/catalog/knowledge-render.js';
import {releasesDecor} from '../src/catalog/releases-render.js';

// Registered teaching upgrade. These are source/engine contracts, not browser QA.
const upgrade=await import('../src/catalog/releases-protection-upgrade.js').catch(()=>({}));
const renderer=await import('../src/catalog/releases-protection-render.js').catch(()=>({}));
const template=()=>{assert.equal(upgrade.RELEASE_PROTECTION_TEMPLATES?.length,1,'the existing Releases teaching upgrade exists');return upgrade.RELEASE_PROTECTION_TEMPLATES[0];};
const make=(layout,prefix)=>layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`${prefix}${i}`,x,y,w,h),label:label??''}));
const resource=board=>resources(board.filter(C.placed).map(p=>[p.type,p.x,p.y,p.w,p.h]));
const boardOf=()=>make(template().layout,'r');
const moveCache=(board,key)=>{const next=structuredClone(board),cache=next.find(p=>p.type==='go_cache');if(key==='stash'){const run=R.newRun('lab','blank');run.owned=next;assert.equal(R.move(run,cache.id,null,null),true);}else{const target=upgrade.RELEASE_CACHE_POSITIONS[key];assert.ok(target);assert.equal(C.moveMany(next,[cache.id],target.x-cache.x,target.y-cache.y),true);}return next;};
const plain=()=>make([['am_newsletter',24,24,280,60],['ad_popup',24,100,280,88]],'e');
const accelerated=()=>make([['gov_form',16,16,480,336],['ad_popup',48,246,280,88],['am_newsletter',48,360,280,60]],'e');
const peer=()=>make([['gov_font',32,96,208,32],['ab_link',32,48,192,32],['ab_link',32,144,192,32],['ab_link',32,184,192,32],['ab_link',240,96,192,32]],'e');
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
function meter(board,opponent=[],{reverse=false,capacity=12,ticks=480,offset=0,hp=10000}={}){
 const b=new E.Battle(reverse?opponent:board,reverse?board:opponent,{playerHp:hp,enemyHp:hp,playerCapacity:capacity,enemyCapacity:capacity,playerAdmin:[],enemyAdmin:[]});
 const name=reverse?'enemy':'player',other=reverse?'player':'enemy',events=[];
 // Diagnostic only: never stored in a template or applied by production startup.
 for(const part of b[other].parts)part.remaining=Math.max(.05,part.remaining+offset);
 for(let i=0;i<ticks&&!b.result;i++)events.push(...b.step(.05));
 return{b,name,other,side:b[name],metrics:b.metrics[name],events};
}
const walk=node=>[node,...(node.childNodes??[]).flatMap(walk)];
const overlaps=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];

test('Releases upgrade preserves the exact existing identity, default four parts and catalogue count',()=>{
 const t=template(),base=RELEASE_TEMPLATES[0],board=boardOf(),r=resource(board);
 for(const key of ['id','name','faction','pageName','address','hp','fee','reward','status','admin','loot','layout','references'])assert.deepEqual(t[key],base[key],key);
 assert.notEqual(t.layout,base.layout,'upgrade owns its independent layout array');
 assert.deepEqual([r.parts,r.acquisitionValue,r.load,r.footprint,r.legal],[4,24,10,106304,true]);
 assert.deepEqual(r.experimental,['gh_commit','gh_transfer','go_cache']);
 assert.equal(SITE_TEMPLATES.length,29);assert.equal(Object.keys(D.PARTS).length,82);
 assert.strictEqual(SITE_TEMPLATES[15],t,'upgrade replaces the existing entry in place');
});

test('three legal cache slots change only one original part and protect ZIP, PDF or nothing',()=>{
 const initial=boardOf(),cache=initial.find(p=>p.type==='go_cache');
 assert.deepEqual(upgrade.RELEASE_CACHE_POSITIONS,{zip:{x:648,y:300},pdf:{x:552,y:456},detached:{x:648,y:456}});
 for(const [key,target]of [['zip','r1'],['pdf','r3'],['detached',undefined]]){
  const board=moveCache(initial,key),trace=meter(board),r=resource(board);
  assert.deepEqual([r.acquisitionValue,r.load,r.footprint,r.legal],[24,10,106304,true]);
  assert.equal(trace.b.states[trace.name].get(cache.id).target,target);
  assert.deepEqual(board.filter(p=>p.id!==cache.id),initial.filter(p=>p.id!==cache.id));
  assert.deepEqual(E.analyze(board).parents,{});assert.deepEqual(E.analyze(board).groups,[]);
  const back=moveCache(board,'zip');assert.deepEqual(back,initial);assert.deepEqual(meter(back).events,meter(initial).events);
 }
 const invalid=structuredClone(initial);assert.equal(C.moveMany(invalid,[cache.id],216-cache.x,300-cache.y),false);assert.deepEqual(invalid,initial);
});

test('all declared slots stay clear of fixed chrome and preserve native controls and edited labels',()=>{
 const t=template(),slots=[...boardOf().map(p=>[p.x,p.y,p.w,p.h]),[552,456,288,44],[648,456,288,44]];
 for(const[kind,x,y,w,h]of t.decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,kind);for(const slot of slots)assert.equal(overlaps([x,y,w,h],slot),false,kind);}
 for(const [i,p]of boardOf().entries()){
  const original=make(RELEASE_TEMPLATES[0].layout,'r')[i];assert.equal(V.markup(p,{theme:'forge'}),V.markup(original,{theme:'forge'}));
  assert.equal(V.markup(p,{theme:'forge'}),V.markup(p,{theme:'mixed'}));
  const html=V.markup({...p,label:'<script>hostile</script> & "exact title"'});assert.equal(walk(parseFragment(html)).some(n=>n.tagName==='script'),false);
 }
 assert.match(V.markup(boardOf()[1]),/data-ui="transfer-preview"/);assert.match(V.markup(boardOf()[2]),/data-ui="cache"/);assert.match(V.markup(boardOf()[3]),/data-ui="download"/);
});

test('two prevented popups do not improve the finite 24-second ordinary-pressure output in either seat',()=>{
 assert.deepEqual([resource(plain()).acquisitionValue,resource(plain()).load,resource(plain()).footprint,resource(plain()).legal],[15,4,41440,true]);
 for(const reverse of [false,true])for(const [key,prevented]of [['zip',2],['pdf',0],['detached',0]]){
  const tr=meter(moveCache(boardOf(),key),plain(),{reverse});
  assert.deepEqual([tr.metrics.hpDamage,tr.metrics.naturalAttacks,tr.metrics.replays,tr.metrics.prevented],[192,7,2,prevented]);
  assert.equal(tr.side.lag,1);assert.equal(tr.side.income,0);assert.equal(tr.metrics.healing,0);assert.equal(tr.metrics.shielding,0);assert.equal(tr.b.result,null);
 }
});

test('real form acceleration can make cached ZIP protection preserve replay without making a first original',()=>{
 assert.deepEqual([resource(accelerated()).acquisitionValue,resource(accelerated()).load,resource(accelerated()).footprint,resource(accelerated()).legal],[20,7,178080,true]);
 for(const reverse of [false,true])for(const [key,damage,replays,prevented]of [['zip',157,2,2],['pdf',135,1,0],['detached',135,1,0]]){
  const tr=meter(moveCache(boardOf(),key),accelerated(),{reverse});
  assert.deepEqual(tr.b[tr.other].info.parents,{e1:'e0'});assert.equal(tr.b[tr.other].parts.find(p=>p.id==='e1').period,5);
  assert.deepEqual([tr.metrics.hpDamage,tr.metrics.naturalAttacks,tr.metrics.replays,tr.metrics.prevented],[damage,7,replays,prevented]);
  const echoes=tr.events.filter(e=>e.kind==='echo'&&e.side===tr.name).map(e=>[e.time,e.to]);assert.deepEqual(echoes,key==='zip'?[[10.5,'r1'],[17.5,'r1']]:[[10.5,'r1']]);
  assert.ok(tr.events.filter(e=>e.kind==='control'&&e.action==='cover').every(e=>e.to==='r1'),'PDF protection does not redirect hostile targeting');
  assert.equal(tr.b[tr.other].income,15);assert.equal(tr.b.metrics[tr.other].spent,12);assert.equal(tr.b[tr.other].parts.find(p=>p.id==='e1').charge,3);
 }
 const b=new E.Battle(boardOf(),plain(),{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12});
 for(let i=1;i<80;i++){b.step(.05);assert.equal(b.states.player.get('r1').payload,undefined);assert.equal(b.metrics.player.replays,0);}
 b.step(.05);assert.equal(b.states.player.get('r1').payload.value,30);assert.equal(b.metrics.player.replays,0);
});

test('clock offsets and shorter windows qualify the protection benefit instead of promising a universal counter',()=>{
 for(const reverse of [false,true])for(const [offset,protectedDamage,unprotectedDamage,unprotectedReplay]of [[-.25,157,135,1],[0,157,135,1],[.25,157,150,2],[.75,157,157,2]]){
  const a=meter(boardOf(),accelerated(),{reverse,offset}),b=meter(moveCache(boardOf(),'pdf'),accelerated(),{reverse,offset});
  assert.deepEqual([a.metrics.hpDamage,b.metrics.hpDamage,b.metrics.replays],[protectedDamage,unprotectedDamage,unprotectedReplay]);
 }
 for(const reverse of [false,true]){
  const a=meter(boardOf(),accelerated(),{reverse,ticks:140}),b=meter(moveCache(boardOf(),'pdf'),accelerated(),{reverse,ticks:140});
  assert.equal(a.metrics.hpDamage,b.metrics.hpDamage);assert.equal(a.metrics.prevented,0);assert.equal(b.metrics.prevented,0);
 }
});

test('under-capacity diagnostics expose deployed cache cost while stashing never refunds ownership',()=>{
 for(const reverse of [false,true]){
  const deployed=meter(boardOf(),plain(),{reverse,capacity:8}),stored=meter(moveCache(boardOf(),'stash'),plain(),{reverse,capacity:8});
  assert.deepEqual([deployed.metrics.hpDamage,stored.metrics.hpDamage,deployed.side.lag,stored.side.lag],[162,192,1.15,1]);
  near(deployed.side.hp,9978.4);near(stored.side.hp,10000);
 }
 const run=R.newRun('lab','site_github_releases');run.owned.find(p=>p.id==='p3').label='保存済み <ZIP> & "自分のラベル"';
 const cash=run.cash,identity=JSON.parse(JSON.stringify(run.owned));
 assert.equal(R.move(run,'p3',552,456),true);assert.equal(R.validateRun(JSON.parse(JSON.stringify(run))),true);
 assert.equal(run.cash,cash);assert.deepEqual(run.owned.map(p=>[p.id,p.type,p.w,p.h,p.label]),identity.map(p=>[p.id,p.type,p.w,p.h,p.label]));
 assert.equal(R.move(run,'p3',null,null),true);assert.equal(run.cash,cash);assert.equal(run.owned.length,4);assert.equal(resource(run.owned).load,8);assert.equal(resource(run.owned).acquisitionValue,19);
 assert.equal(run.owned.reduce((sum,p)=>sum+D.PARTS[p.type].price,0),24);assert.equal(R.validateRun(JSON.parse(JSON.stringify(run))),true);
 assert.equal(R.move(run,'p3',648,300),true);assert.deepEqual(run.owned,identity);
});

test('both protected and unprotected layouts lose to a cheaper ordinary supported-link board in both seats',()=>{
 assert.deepEqual([resource(peer()).acquisitionValue,resource(peer()).load,resource(peer()).footprint,resource(peer()).legal],[17,5,31232,true]);
 for(const key of ['zip','pdf','detached'])for(const reverse of [false,true]){
  const tr=meter(moveCache(boardOf(),key),peer(),{reverse,hp:440,ticks:1201});
  assert.equal(tr.b.result?.winner,tr.other);near(tr.b.elapsed,21.15);near(tr.b[tr.other].hp,248);assert.equal(tr.side.lag,1);assert.equal(tr.b[tr.other].lag,1);
 }
});

test('new teaching chrome is inert, clearly game-only and does not advertise blocked counts as strength',()=>{
 assert.equal(typeof renderer.releasesProtectionDecor,'function');const t=template();
 for(const[kind]of t.decor){const html=renderer.releasesProtectionDecor(kind)||knowledgeDecor(kind)||releasesDecor(kind);assert.ok(html,kind);
  for(const node of walk(parseFragment(html))){assert.ok(!['button','input','select','textarea','form','a','script','iframe','img','audio','video','object','embed'].includes(node.tagName),node.tagName);for(const attr of node.attrs??[])assert.ok(!['src','srcset','href','action','formaction','data-ui','tabindex'].includes(attr.name)&&!attr.name.startsWith('on'),attr.name);}
 }
 assert.equal(renderer.releasesProtectionDecor('unknown'),'');
 const lesson=renderer.releasesProtectionDecor('release-protection-lesson');assert.match(lesson,/192.*192/);assert.match(lesson,/157.*135/);assert.match(lesson,/位相/);assert.match(lesson,/CPU8/);assert.match(lesson,/増えません/);
 assert.match(renderer.releasesProtectionDecor('release-protection-footer'),/ゲーム内/);assert.match(renderer.releasesProtectionDecor('release-protection-footer'),/取得・送信/);
 const css=readFileSync(new URL('../src/catalog/releases-protection.css',import.meta.url),'utf8');assert.doesNotMatch(css,/\.native-|\.web-node|\.node-|url\(|@import|@font-face/);assert.match(css,/pointer-events:\s*none/);
 const foreground=css.match(/color:\s*#([0-9a-f]{6});/i)?.[1],background=css.match(/background:\s*#([0-9a-f]{6});/i)?.[1];assert.ok(foreground&&background);
 const luminance=hex=>{const channels=hex.match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];};
 const ratio=(Math.max(luminance(foreground),luminance(background))+.05)/(Math.min(luminance(foreground),luminance(background))+.05);assert.ok(ratio>=4.5);near(ratio,8.705457404107221);
 const lines=walk(parseFragment(lesson)).filter(n=>n.tagName==='p');assert.equal(lines.length,6);assert.ok(6*14+12<=t.decor.find(d=>d[0]==='release-protection-lesson')[4]);
 const text=node=>(node.value??'')+(node.childNodes??[]).map(text).join('');for(const line of lines){const width=Array.from(text(line)).reduce((n,c)=>n+(c.codePointAt(0)>255?11:7),0);assert.ok(width<=696,`${width}: ${text(line)}`);}
 const footer=walk(parseFragment(renderer.releasesProtectionDecor('release-protection-footer'))).filter(n=>n.tagName==='p');assert.equal(footer.length,3);for(const line of footer){const width=Array.from(text(line)).reduce((n,c)=>n+(c.codePointAt(0)>255?11:7),0);assert.ok(width<=888,`${width}: ${text(line)}`);}
});
