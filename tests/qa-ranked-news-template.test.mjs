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
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {rankedNewsDecor} from '../src/catalog/ranked-news-render.js';
const saved=()=>JSON.parse(JSON.stringify(R.newRun('lab','site_hacker_news')));
const fight=items=>new E.Battle(items,[],{playerHp:10000,enemyHp:10000,playerCapacity:13,enemyCapacity:13});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} vs ${b}`);

test('QA: ranked list distinguishes local adjacency from global attention and pauses only its actual replay source',()=>{
 const r=saved(),b=fight(r.owned),more=r.owned.find(p=>p.type==='ab_nav'),post=r.owned.find(p=>p.type==='rd_post'),ref=r.owned.find(p=>p.type==='wk_reference'),links=r.owned.filter(p=>p.type==='ab_link');
 assert.deepEqual(b.player.info.groups,[]);assert.deepEqual(b.player.info.near[more.id],[]);assert.deepEqual(b.player.info.near[post.id],[ref.id]);assert.deepEqual(b.player.info.near[ref.id],[post.id]);
 for(let i=0;i<8;i++)assert.deepEqual(b.player.info.near[links[i].id],[links[i-1]?.id,links[i+1]?.id].filter(Boolean));
 const without=fight(r.owned.filter(p=>p.id!==more.id));close(b.player.parts[0].period,1.8);close(without.player.parts[0].period,1.8*1.1/1.15);
 for(let i=0;i<480;i++){b.step(.05);without.step(.05);}close(b.metrics.player.hpDamage-without.metrics.player.hpDamage,14);assert.equal(b.player.parts.find(p=>p.id===more.id).damage,50);
 const covered=fight(r.owned);for(let i=0;i<60;i++)covered.step(.05);assert.ok(covered.states.player.get(post.id).payload);covered.states.player.get(post.id).coveredUntil=1000;
 const late=[];for(let i=0;i<420;i++)late.push(...covered.step(.05));assert.equal(late.some(e=>e.kind==='echo'&&e.id===ref.id),false);assert.ok(late.some(e=>e.kind==='damage'&&e.id===links[0].id));assert.equal(covered.player.income,0);
});

test('QA: ranked template round trips as an opponent and keeps fictional ranking chrome inert',()=>{
 const r=saved(),t=SITE_TEMPLATES.find(t=>t.id==='site_hacker_news');assert.equal(R.validateRun(r),true);assert.equal(r.page.theme,'rankednews');assert.deepEqual(r.admin,[]);
 const resource=resources(t.layout);assert.deepEqual([resource.acquisitionValue,resource.load,resource.parts,resource.legal],[36,13,11,true]);assert.equal(Object.values(D.PARTS).some(p=>p.faction==='rankednews'),false);
 r.stage=R.labEnemies().findIndex(t=>t.id==='site_hacker_news');assert.equal(R.validateRun(r),true);assert.deepEqual(R.enemyBoard(r).map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]),r.owned.map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]));
 const intersects=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];for(const[kind,x,y,w,h]of t.decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,kind);for(const p of r.owned)assert.equal(intersects([x,y,w,h],[p.x,p.y,p.w,p.h]),false,kind);}
 const walk=(n,decor)=>{assert.ok(!['form','script','iframe','object','embed','img','link','audio','video'].includes(n.tagName));if(decor)assert.ok(!['input','button','select','textarea','a'].includes(n.tagName));for(const a of n.attrs||[]){if(a.name==='href'&&a.value==='#')continue;assert.ok(!['href','src','srcset','action','formaction','download'].includes(a.name));assert.ok(!a.name.startsWith('on'));}for(const c of n.childNodes||[])walk(c,decor);};
 const html=V.header('rankednews',r.page.name)+t.decor.map(([kind])=>rankedNewsDecor(kind)).join('');walk(parseFragment(html),true);assert.match(html,/得点・アカウントは架空/);assert.match(html,/順位に追加効果はありません/);
 for(const p of r.owned){assert.equal(V.markup(p,{theme:'rankednews'}),V.markup(p,{theme:'mixed'}));walk(parseFragment(V.markup(p)),false);}
 assert.doesNotMatch(readFileSync(new URL('../src/catalog/ranked-news.css',import.meta.url),'utf8'),/@import|url\s*\(|\.web-node|\.node-|\.native-/i);
});
