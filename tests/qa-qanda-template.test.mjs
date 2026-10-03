import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {activeFactionSets} from '../src/app-guidance.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {qandaDecor} from '../src/catalog/qanda-render.js';

test('QA: Q&A save preserves actual faction, related-link and original-only reference behavior',()=>{
 const r=JSON.parse(JSON.stringify(R.newRun('lab','site_stackoverflow')));assert.equal(R.validateRun(r),true);
 const b=new E.Battle(r.owned,[],{playerHp:1000,enemyHp:1000,playerCapacity:56,enemyCapacity:56});
 assert.equal(b.player.load,17);assert.equal(r.owned.reduce((s,p)=>s+D.PARTS[p.type].price,0),42);
 assert.deepEqual(activeFactionSets(b.player.info),[{faction:'retro',count:4}]);
 const ref=b.player.parts.find(p=>p.type==='wk_reference'),diff=b.player.parts.find(p=>p.type==='gh_diff');
 b._activate(b.player,b.enemy,ref);assert.equal(b.metrics.player.replays,0,'a reference cannot invent its first source attack');
 b._activate(b.player,b.enemy,diff);b._activate(b.player,b.enemy,ref);assert.equal(b.metrics.player.replays,1);
 assert.ok(b.events.some(e=>e.kind==='echo'&&e.id===ref.id&&e.to===diff.id));
 b.states.player.get(diff.id).coveredUntil=20;b._activate(b.player,b.enemy,ref);assert.equal(b.metrics.player.replays,1,'covered original cannot be replayed');
 const links=b.player.parts.filter(p=>p.type==='ab_link');assert.ok(links.every(p=>Math.abs(p.speed-1.3225)<1e-8));
 for(const link of links)b._activate(b.player,b.enemy,link);assert.deepEqual(links.map(p=>p.damage),[7,7,4]);
 r.stage=R.labEnemies().findIndex(t=>t.id==='site_stackoverflow');assert.equal(R.validateRun(r),true);assert.equal(R.opponent(r).id,'site_stackoverflow');
 assert.deepEqual(R.enemyBoard(r).map(p=>p.type),r.owned.map(p=>p.type));
});

test('QA: Q&A acceptance stays inert and a one-sided nearby text legitimately strengthens the rule',()=>{
 const t=SITE_TEMPLATES.find(t=>t.id==='site_stackoverflow'),r=R.newRun('lab',t.id);
 const html=t.decor.map(([kind])=>qandaDecor(kind)).join('');
 const walk=n=>{assert.ok(!['button','input','select','textarea','form','script','iframe','img'].includes(n.tagName));for(const a of n.attrs||[])assert.ok(!['src','href','action','formaction','onclick'].includes(a.name));for(const c of n.childNodes||[])walk(c);};walk(parseFragment(html));
 assert.match(qandaDecor('qanda-accepted'),/表示のみ/);
 for(const p of r.owned)assert.equal(V.markup(p,{theme:'qanda'}),V.markup(p,{theme:'mixed'}));
 const rule=C.makeItem('ab_hr','rule',24,100,500,8),text=C.makeItem('ab_heading','text',24,32,500,56);
 const b=new E.Battle([rule,text],[],{playerHp:1000,enemyHp:1000});b._activate(b.player,b.enemy,b.player.parts.find(p=>p.id==='rule'));
 assert.ok(b.events.some(e=>e.kind==='shield'&&e.id==='rule'&&e.value===7));
});
