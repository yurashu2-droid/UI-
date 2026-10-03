import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import {resources} from '../src/buildlab.js';

const catalogue=await import('../src/catalog/mail-templates.js').catch(()=>({}));
const template=()=>{const t=catalogue.MAIL_TEMPLATES?.[0];assert.ok(t,'POSTROOM mail template is present');return t;};
const boardOf=()=>template().layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`mail-${i}`,x,y,w,h),label:label||''}));
const part=(board,type)=>board.find(p=>p.type===type);
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const relocate=(board,type,x,y)=>board.map(p=>p.type===type?{...p,x,y}:p);
function simulate(board){
 const b=new E.Battle(board,[],{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12}),events=[];
 for(let tick=0;tick<480;tick++)events.push(...b.step(.05));
 return{b,events};
}

test('POSTROOM is a seven-part native inbox composition at $29/CPU12 without a mail combat family',()=>{
 const t=template(),board=boardOf();
 assert.equal(t.id,'site_gmail');assert.equal(t.faction,'mailroom');assert.match(t.name,/Gmail風/);assert.match(t.pageName,/POSTROOM/);
 assert.equal(t.status,'experimental');assert.deepEqual(t.admin,[]);assert.equal(t.fee,0);assert.equal(t.reward,0);
 assert.deepEqual(board.map(p=>p.type),['go_search','ab_link','ab_link','ab_link','go_translate','wk_article','wk_reference']);
 assert.deepEqual(resources(t.layout).acquisitionValue,29);assert.equal(resources(t.layout).load,12);
 for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y),p.type);
 assert.equal(Object.values(D.PARTS).some(p=>p.faction==='mailroom'),false);
 assert.ok(t.references.every(url=>url.startsWith('https://support.google.com/mail/answer/')));
 assert.deepEqual(E.analyze(board).parents,{});assert.deepEqual(E.analyze(board).groups,[]);
});

test('moving translation changes the real supported text source while the reference keeps the article',()=>{
 const board=boardOf(),translator=part(board,'go_translate'),article=part(board,'wk_article'),reference=part(board,'wk_reference'),first=board[1];
 const initial=simulate(board),movedBoard=relocate(board,'go_translate',216,136),moved=simulate(movedBoard);
 for(const p of movedBoard)assert.ok(C.canPlace(movedBoard,p,p.x,p.y),p.type);
 const relations=trace=>trace.b.player.info.relations.filter(r=>r.from===translator.id&&r.kind==='power');
 assert.deepEqual(relations(initial).map(r=>r.to),[article.id]);assert.deepEqual(relations(moved).map(r=>r.to),[first.id]);
 close(initial.b.player.info.mods[article.id].power,1.25);close(moved.b.player.info.mods[article.id].power,1);
 close(initial.b.player.info.mods[first.id].power,1);close(moved.b.player.info.mods[first.id].power,1.25);
 for(const trace of [initial,moved]){
  assert.deepEqual(trace.b.player.info.near[reference.id],[article.id]);
  const echoes=trace.events.filter(e=>e.kind==='echo');assert.ok(echoes.length>0);assert.ok(echoes.every(e=>e.id===reference.id&&e.to===article.id));
  assert.equal(trace.b.player.lag,1);assert.equal(trace.b.player.income,0);assert.equal(trace.b.player.shield,0);assert.equal(trace.b.metrics.player.healing,0);
 }
 const damage=(trace,id)=>trace.events.filter(e=>e.kind==='damage'&&e.id===id).map(e=>e.value);
 assert.ok(damage(initial,article.id).includes(12.5));assert.ok(damage(initial,article.id).includes(4.4));
 assert.ok(damage(moved,article.id).includes(10));assert.ok(damage(moved,article.id).includes(3.5));
 close(initial.b.metrics.player.hpDamage,406.1);close(moved.b.metrics.player.hpDamage,417);
 assert.equal(initial.b.metrics.player.naturalAttacks,57);assert.equal(moved.b.metrics.player.naturalAttacks,57);
 assert.equal(initial.b.metrics.player.replays,4);assert.equal(moved.b.metrics.player.replays,4);
 assert.deepEqual(initial.events.filter(e=>e.kind==='echo').map(e=>e.time),[3.25,9.75,16.25,22.75]);
 assert.equal(initial.events.find(e=>e.kind==='fire'&&e.id===article.id&&!e.echo).time,2.2,'first replay waits for the actual natural article payload');
 assert.notDeepEqual(damage(initial,first.id),damage(moved,first.id));
 assert.deepEqual(moved.events.filter(e=>e.kind==='fire'),initial.events.filter(e=>e.kind==='fire'));
 assert.deepEqual(simulate(relocate(movedBoard,'go_translate',592,152)).events,initial.events);
 assert.deepEqual(simulate([...board].reverse()).events,initial.events);
 const distant=simulate(relocate(board,'go_translate',16,568));
 assert.deepEqual(relations(distant),[]);close(distant.b.metrics.player.hpDamage,390);
 assert.deepEqual(damage(distant,article.id),damage(moved,article.id));
});

test('mail reading chrome, body controls and the alternate translation slot do not overlap',()=>{
 const t=template(),board=boardOf(),overlaps=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
 for(const slot of [[216,136,224,40],...board.map(p=>[p.x,p.y,p.w,p.h])]){
  for(const [kind,x,y,w,h] of t.decor){assert.equal(overlaps(slot,[x,y,w,h]),false,`${kind} overlaps a real control or the alternate slot`);}
 }
 for(const[kind,x,y,w,h]of t.decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,kind);}
 assert.match(t.counterplay,/25%/);assert.match(t.counterplay,/再発動|参照/);
});
