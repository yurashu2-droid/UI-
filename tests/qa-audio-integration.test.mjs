import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import Effects from '../src/effects.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {audioDecor} from '../src/catalog/audio-render.js';
const item=(t,id,x,y,w,h)=>C.makeItem(t,id,x,y,w,h);

test('QA: audio receives no accidental three-part, text/video support or advertising income',()=>{
 const a=item('sc_track','audio',256,160,500,104);
 const board=[a,item('gov_font','font',256,120,232,36),item('go_suggest','suggest',496,76,260,84),item('go_ads','text-ad',8,160,240,88),item('ad_retarget','retarget',256,272,280,80),item('yt_ad','video-ad',536,272,224,80),item('yt_sub','sub',72,264,176,40),item('yt_speed','speed',256,352,104,40),item('go_translate','translation',72,120,176,32)];
 for(const p of board)assert.ok(C.canPlace(board,p,p.x,p.y,p.w,p.h),p.type);
 const b=new E.Battle(board,[],{playerHp:10000,enemyHp:10000,playerCapacity:100,enemyCapacity:100});
 for(let i=0;i<600;i++)b.step(.05);
 const audio=b.player.parts.find(p=>p.id==='audio');assert.deepEqual([audio.speed,audio.power,audio.pierce],[1,1,0]);
 assert.equal(audio.damage,100);assert.equal(b.player.parts.find(p=>p.id==='retarget').damage,25,'existing independent retarget attacks are not audio scaling');assert.equal(b.metrics.player.hpDamage,125);assert.equal(b.player.income,0);
 const triple=new E.Battle([0,1,2].map(i=>item('sc_track',`a${i}`,24,24+i*120,500,104)),[],{playerHp:10000,enemyHp:10000});
 assert.ok(triple.player.parts.every(p=>p.speed===1&&p.power===1&&p.remaining===1.5));
});

test('QA: actual SoundCloud template replays both originals and round-trips through player and opponent saves',()=>{
 const r=JSON.parse(JSON.stringify(R.newRun('lab','site_soundcloud')));assert.equal(R.validateRun(r),true);assert.equal(r.page.theme,'audio');
 const b=new E.Battle(r.owned,[],{playerHp:10000,enemyHp:10000,playerCapacity:56,enemyCapacity:56});
 for(let i=0;i<600;i++)b.step(.05);
 assert.equal(b.metrics.player.naturalAttacks,20);assert.equal(b.metrics.player.replays,13);assert.equal(b.metrics.player.hpDamage,245.5);assert.equal(b.player.income,0);
 const tracks=b.player.parts.filter(p=>p.type==='sc_track');assert.ok(tracks.every(p=>p.fires===10&&p.damage>100));
 r.stage=R.labEnemies().findIndex(t=>t.id==='site_soundcloud');assert.equal(R.validateRun(r),true);assert.equal(R.opponent(r).id,'site_soundcloud');
 assert.deepEqual(R.enemyBoard(r).map(p=>p.type),r.owned.map(p=>p.type));
 for(let seed=201;seed<=210;seed++)for(let stage=0;stage<8;stage++){const campaign=R.newRun('campaign');campaign.seed=seed;campaign.stage=stage;assert.ok(R.market(campaign).every(p=>p.type!=='sc_track'));}
});

test('QA: native audio has no remote media target and starts at the same zero time and wave position',()=>{
 const r=R.newRun('lab','site_soundcloud'),t=SITE_TEMPLATES.find(t=>t.id==='site_soundcloud');
 const html=[V.header('audio',r.page.name),...t.decor.map(([kind])=>audioDecor(kind)),...r.owned.map(p=>V.markup(p))].join('');
 const walk=n=>{if(n.tagName)assert.ok(!['audio','video','iframe','script','object','embed','link'].includes(n.tagName));for(const a of n.attrs||[]){if(a.name==='href'&&a.value==='#')continue;assert.ok(!['src','srcset','href','action','formaction','poster'].includes(a.name),a.name);assert.ok(!a.name.startsWith('on'));}for(const c of n.childNodes||[])walk(c);};walk(parseFragment(html));
 const css=readFileSync(new URL('../src/catalog/audio.css',import.meta.url),'utf8');assert.doesNotMatch(css,/@import|url\s*\(/i);assert.match(css,/var\(--audio-position,\s*0\)/);
 const time={textContent:''},vars=new Map(),host={querySelector(k){return k==='.audio-time'?time:{style:{setProperty(k,v){vars.set(k,v);}}};}};
 const b=new E.Battle([item('sc_track','a',24,24)],[],{playerCapacity:1,playerHp:10000,enemyHp:10000});
 const a=b.player.parts[0],rate=D.PARTS.sc_track.cd/a.period;
 Effects.prototype.syncAudio.call({},host,60,rate);assert.equal(time.textContent,'0:37');
 const before=vars.get('--audio-position');Effects.prototype.syncAudio.call({},host,60,rate);assert.equal(vars.get('--audio-position'),before);
 Effects.prototype.syncAudio.call({},host,0,rate);assert.equal(time.textContent,'0:00');assert.equal(vars.get('--audio-position'),'0');
});
