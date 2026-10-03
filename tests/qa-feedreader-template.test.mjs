import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {feedreaderDecor} from '../src/catalog/feedreader-render.js';
const run=()=>JSON.parse(JSON.stringify(R.newRun('lab','site_google_reader')));
const fight=board=>new E.Battle(board,[],{playerHp:10000,enemyHp:10000,playerCapacity:19,enemyCapacity:19});

test('QA: Reader culture damage changes only when the actual local neighbours change',()=>{
 const r=run(),base=r.owned,search=base.find(p=>p.type==='go_search'),localLink=base.find(p=>p.type==='ab_link'),star=base.find(p=>p.type==='tw_favorite');
 const hit=board=>{const b=fight(board);b._activate(b.player,b.enemy,b.player.parts.find(p=>p.id===search.id));return b.events.find(e=>e.kind==='damage'&&e.id===search.id).value;};
 assert.equal(hit(base),12);assert.equal(hit(base.filter(p=>p.id!==localLink.id)),10);assert.equal(hit(base.filter(p=>p.id!==star.id)),10);
 assert.equal(hit(base.filter(p=>p.id!==localLink.id&&p.id!==star.id)),8);
 const far=C.makeItem('gov_pdf','far-government',24,576,184,48);const extended=[...base,far];assert.ok(C.canPlace(extended,far,far.x,far.y));assert.equal(hit(extended),12);
 assert.equal(R.validateRun(r),true);r.stage=R.labEnemies().findIndex(t=>t.id==='site_google_reader');assert.equal(R.validateRun(r),true);
 assert.equal(R.opponent(r).id,'site_google_reader');assert.deepEqual(R.enemyBoard(r).map(p=>p.type),base.map(p=>p.type));
});

test('QA: Reader retains independent source waits and has no active unread or external-feed controls',()=>{
 const r=run(),t=SITE_TEMPLATES.find(t=>t.id==='site_google_reader'),b=fight(r.owned),events=[];
 for(let i=0;i<480;i++)events.push(...b.step(.05));
 assert.equal(b.player.load,19);assert.equal(b.player.lag,1);assert.equal(b.player.income,0);
 const ref=r.owned.find(p=>p.type==='wk_reference'),pager=r.owned.find(p=>p.type==='go_page'),article=r.owned.find(p=>p.type==='wk_article'),diff=r.owned.find(p=>p.type==='gh_diff');
 assert.deepEqual(events.filter(e=>e.kind==='echo'&&e.id===pager.id).map(e=>[e.time,e.to]),[[8.25,diff.id],[14.25,diff.id],[20.25,diff.id]]);
 assert.ok(events.filter(e=>e.kind==='echo'&&e.id===ref.id).every(e=>e.to===article.id));
 const covered=fight(r.owned);for(let i=0;i<80;i++)covered.step(.05);
 covered.states.player.get(article.id).coveredUntil=1000;covered.states.player.get(diff.id).coveredUntil=1000;
 const late=[];for(let i=0;i<160;i++)late.push(...covered.step(.05));assert.equal(late.some(e=>e.kind==='echo'&&(e.id===ref.id||e.id===pager.id)),false);
 const html=t.decor.map(([kind])=>feedreaderDecor(kind)).join('');
 const walk=n=>{assert.ok(!['button','input','select','textarea','form','script','iframe','img','link'].includes(n.tagName));for(const a of n.attrs||[])assert.ok(!['src','href','action','formaction','onclick'].includes(a.name));for(const child of n.childNodes||[])walk(child);};walk(parseFragment(html));
 assert.match(html,/未読数は表示用/);assert.match(html,/外部への購読・共有や既読操作は行いません/);
 for(const p of r.owned)assert.equal(V.markup(p,{theme:'feedreader'}),V.markup(p,{theme:'mixed'}));
 const css=readFileSync(new URL('../src/catalog/feedreader.css',import.meta.url),'utf8');assert.doesNotMatch(css,/@import|url\s*\(|\.web-node|\.node-|\.native-/i);
});
