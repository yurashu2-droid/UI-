import {releasesProtectionDecor} from '../src/catalog/releases-protection-render.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {knowledgeDecor} from '../src/catalog/knowledge-render.js';
const render=await import('../src/catalog/releases-render.js').catch(()=>({}));
const template=()=>SITE_TEMPLATES.find(t=>t.id==='site_github_releases');
const boardOf=t=>t.layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`${t.id}-${i}`,x,y,w,h),label:label||''}));
function simulate(board,enemy=[]){const b=new E.Battle(board,enemy,{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12}),events=[];for(let i=0;i<480;i++)events.push(...b.step(.05));return{b,events};}

test('Releases template appends a small four-part lesson without shifting saved template positions',()=>{
 const t=template();assert.ok(t);assert.match(t.name,/GitHub Releases風/);assert.equal(t.faction,'forge');assert.equal(t.status,'experimental');assert.deepEqual(t.admin,[]);assert.ok(D.PRESETS[t.id]);
 assert.deepEqual(SITE_TEMPLATES.slice(0,15).map(t=>t.id),['site_twitter_classic','site_x','site_wikipedia','site_github','site_niconico','site_reddit','site_yahoo_portal','site_steam_store','site_wayback','site_twitch','site_google_docs','site_soundcloud','site_stackoverflow','site_google_reader','site_rakuten']);assert.equal(SITE_TEMPLATES[15].id,t.id);
 const board=boardOf(t);assert.equal(board.length,4);for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y));assert.equal(board.reduce((n,p)=>n+D.PARTS[p.type].price,0),24);assert.equal(board.reduce((n,p)=>n+D.PARTS[p.type].load,0),10);
});
test('release cache does not invent a ZIP payload and the distant PDF stays independent',()=>{
 const t=template();assert.ok(t);const board=boardOf(t),{b,events}=simulate(board),byType=t=>board.find(p=>p.type===t),zip=byType('gh_transfer'),commit=byType('gh_commit'),pdf=byType('gov_pdf'),cache=byType('go_cache');
 assert.equal(b.states.player.get(cache.id).target,zip.id);assert.equal(b.player.info.groups.length,0);for(const p of b.player.parts)assert.deepEqual([p.speed,p.power],[1,1]);
 const copies=events.filter(e=>e.kind==='echo'&&e.id===commit.id);assert.deepEqual(copies.map(e=>e.time),[10.5,17.5]);assert.ok(copies.every(e=>e.to===zip.id));
 assert.equal(events.find(e=>e.kind==='damage'&&e.id===zip.id).time,4);assert.equal(events.find(e=>e.kind==='damage'&&e.id===pdf.id).time,2.75);assert.equal(b.metrics.player.hpDamage,192);assert.equal(b.metrics.player.naturalAttacks,7);assert.equal(b.player.income,0);assert.equal(b.player.shield,0);
 assert.equal(simulate(board.filter(p=>p.id!==zip.id)).events.some(e=>e.kind==='echo'&&e.id===commit.id),false);
});
test('funded cover is blocked or delayed at its real clock without claiming every window loses damage',()=>{
 const t=template();assert.ok(t);const board=boardOf(t),enemy=[C.makeItem('am_newsletter','news',24,24,280,60),C.makeItem('ad_popup','pop',24,100,280,88)];for(const p of enemy)assert.ok(C.canPlace(enemy,p,p.x,p.y));
 const{b,events}=simulate(board,enemy),zip=board.find(p=>p.type==='gh_transfer');const controls=events.filter(e=>e.kind==='control'&&e.to===zip.id);
 assert.deepEqual(controls.filter(e=>e.action==='blocked').map(e=>e.time),[3,15]);assert.deepEqual(controls.filter(e=>e.action==='cover').map(e=>e.time),[9,21]);
 assert.deepEqual(events.filter(e=>e.kind==='fire'&&e.id===zip.id&&!e.echo).map(e=>e.time),[4,12.8,20.8]);assert.equal(b.metrics.player.hpDamage,192);
});
test('release chrome contains fictional notes and assets but no real download or verification action',()=>{
 const t=template();assert.ok(t);assert.equal(typeof render.releasesDecor,'function');assert.match(V.header('forge',t.pageName),/非公式/);
 for(const[kind]of t.decor){const html=knowledgeDecor(kind)||render.releasesDecor(kind)||releasesProtectionDecor(kind);assert.ok(html,kind);assert.doesNotMatch(html,/<button|<input|<form|<script|<iframe|<img|\bsrc=|\bhref=|\bonclick=/i);}
 assert.match(render.releasesDecor('release-disclaimer'),/実ファイル/);assert.match(render.releasesDecor('release-disclaimer'),/追加セット補正はありません/);
 for(const p of boardOf(t))assert.equal(V.markup(p,{theme:'forge'}),V.markup(p,{theme:'mixed'}));
});
