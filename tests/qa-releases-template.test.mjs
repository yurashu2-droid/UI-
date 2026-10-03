import {releasesProtectionDecor} from '../src/catalog/releases-protection-render.js';
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
import {knowledgeDecor} from '../src/catalog/knowledge-render.js';
import {releasesDecor} from '../src/catalog/releases-render.js';
const saved=()=>JSON.parse(JSON.stringify(R.newRun('lab','site_github_releases')));
const battle=(items,enemy=[])=>new E.Battle(items,enemy,{playerHp:10000,enemyHp:10000,playerCapacity:10,enemyCapacity:12});

test('QA: release save and opponent retain sparse native layout and inert fictional assets',()=>{
 const r=saved(),t=SITE_TEMPLATES.find(t=>t.id==='site_github_releases');assert.equal(R.validateRun(r),true);assert.equal(r.page.theme,'forge');assert.deepEqual(r.admin,[]);
 const resource=resources(t.layout);assert.deepEqual([resource.acquisitionValue,resource.load,resource.parts,resource.legal],[24,10,4,true]);
 r.stage=R.labEnemies().findIndex(t=>t.id==='site_github_releases');assert.equal(R.validateRun(r),true);assert.equal(R.opponent(r).id,t.id);
 assert.deepEqual(R.enemyBoard(r).map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]),r.owned.map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]));
 const overlap=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
 for(const [kind,x,y,w,h]of t.decor){assert.ok(x>=0&&y>=0&&x+w<=960&&y+h<=680,kind);for(const p of r.owned)assert.equal(overlap([x,y,w,h],[p.x,p.y,p.w,p.h]),false,kind);}
 const walk=(n,decor=false)=>{assert.ok(!['script','iframe','object','embed','img','link','audio','video','form'].includes(n.tagName));if(decor)assert.ok(!['button','input','select','textarea','a'].includes(n.tagName));for(const a of n.attrs||[]){if(a.name==='href'&&a.value==='#')continue;assert.ok(!['href','src','srcset','download','action','formaction','poster'].includes(a.name));assert.ok(!a.name.startsWith('on'));}for(const c of n.childNodes||[])walk(c,decor);};
 const decor=t.decor.map(([kind])=>knowledgeDecor(kind)||releasesDecor(kind)||releasesProtectionDecor(kind)).join('');walk(parseFragment(decor),true);assert.match(decor,/実ファイルの取得・送信は行いません/);assert.match(decor,/追加セット補正はありません/);
 for(const p of r.owned){assert.equal(V.markup(p,{theme:'forge'}),V.markup(p,{theme:'mixed'}));walk(parseFragment(V.markup(p)));}
 const css=readFileSync(new URL('../src/catalog/releases.css',import.meta.url),'utf8');assert.doesNotMatch(css,/@import|url\s*\(|\.web-node|\.node-|\.native-/i);
});

test('QA: cached release protection never preloads a ZIP payload and the PDF retains independent piercing',()=>{
 const r=saved(),zip=r.owned.find(p=>p.type==='gh_transfer'),cache=r.owned.find(p=>p.type==='go_cache'),commit=r.owned.find(p=>p.type==='gh_commit'),pdf=r.owned.find(p=>p.type==='gov_pdf');
 const enemy=[C.makeItem('am_newsletter','news',24,24,280,60),C.makeItem('ad_popup','pop',24,100,280,88)],b=battle(r.owned,enemy),events=[];
 assert.equal(b.player.lag,1);assert.equal(b.states.player.get(cache.id).cache,true);assert.equal(b.states.player.get(cache.id).target,zip.id);
 for(let tick=1;tick<=480;tick++){
  events.push(...b.step(.05));
  if(tick<80)assert.equal(!!b.states.player.get(zip.id).payload,false,'cache cannot preload the first original');
  if(tick===60){assert.equal(b.metrics.player.prevented,1);assert.equal(b.states.player.get(cache.id).cache,false);}
  if(tick===70)assert.equal(b.metrics.player.replays,0,'first commit timer still lacks the original');
 }
 assert.deepEqual(events.filter(e=>e.kind==='echo'&&e.id===commit.id).map(e=>[e.time,e.to]),[[10.5,zip.id],[17.5,zip.id]]);
 assert.deepEqual(events.filter(e=>e.kind==='fire'&&e.id===zip.id&&!e.echo).map(e=>e.time),[4,12.8,20.8]);
 assert.deepEqual(events.filter(e=>e.kind==='damage'&&e.id===pdf.id).map(e=>e.time),[2.75,8.25,13.75,19.25]);assert.equal(b.metrics.player.hpDamage,192);assert.equal(b.player.income,0);
 const shielded=battle(r.owned);shielded.enemy.shield=60;const hit=[];for(let i=0;i<80;i++)hit.push(...shielded.step(.05));
 const firstPDF=hit.find(e=>e.kind==='damage'&&e.id===pdf.id),firstZIP=hit.find(e=>e.kind==='damage'&&e.id===zip.id);
 assert.deepEqual([firstPDF.value,firstPDF.hit,firstPDF.blocked,firstPDF.pierce],[18,9,9,true]);assert.deepEqual([firstZIP.value,firstZIP.hit,firstZIP.blocked,firstZIP.pierce],[30,0,30,false]);
 const removed=battle(r.owned.filter(p=>p.id!==zip.id)),remaining=[];for(let i=0;i<480;i++)remaining.push(...removed.step(.05));assert.equal(remaining.some(e=>e.kind==='echo'&&e.id===commit.id),false);
});
