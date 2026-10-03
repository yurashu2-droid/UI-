import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import {previewCatalogueAction} from '../src/catalog/preview.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
const p=(type,id,x,y,w,h)=>C.makeItem(type,id,x,y,w,h);

test('waveform attack has the reviewed flat packet and limited-scaling experimental tags',()=>{
  const d=D.PARTS.sc_track;assert.ok(d);assert.equal(d.status,'experimental');assert.equal(d.faction,'audio');assert.equal(d.kind,'attack');
  assert.deepEqual([d.value,d.cd,d.price,d.load],[10,3,4,2]);assert.deepEqual(d.tags,['audio','media']);
  assert.deepEqual([d.w,d.h,d.minW,d.minH],[500,104,256,88]);
  assert.match(d.desc,/動画専用/);assert.match(d.desc,/文字強化/);assert.match(d.desc,/通常発動/);
});
test('real audio excludes video and text support while generic repost keeps natural-payload behavior',()=>{
  assert.ok(D.PARTS.sc_track);
  const board=[p('sc_track','audio',256,160,500,104),p('yt_progress','seek',256,264,500,22),p('yt_speed','speed',256,286,104,40),p('yt_caption','caption',360,286,88,40),p('gov_font','font',256,120,232,36),p('go_suggest','suggest',496,76,260,84),p('yt_ad','ad',756,160,160,88),p('yt_sub','sub',72,160,184,40),p('go_translate','translate',72,208,184,40)];
  for(const item of board)assert.ok(C.canPlace(board,item,item.x,item.y),item.type);
  const b=new E.Battle(board,[],{playerHp:10000,enemyHp:10000,playerCapacity:100,enemyCapacity:100});
  const audio=b.player.parts.find(x=>x.id==='audio');assert.deepEqual([audio.speed,audio.power,audio.pierce],[1,1,0]);
  assert.equal(b.player.info.groups.some(g=>g.kind==='media-stack'),false);
  for(let i=0;i<600;i++)b.step(.05);assert.equal(b.player.income,0);
  const r=new E.Battle([p('sc_track','a',16,16,500,104),p('tw_retweet','r',16,128,128,32)],[],{playerHp:10000,enemyHp:10000,playerCapacity:100,enemyCapacity:100});
  for(let i=0;i<600;i++)r.step(.05);
  assert.equal(r.metrics.player.naturalAttacks,10);assert.equal(r.metrics.player.replays,6);assert.equal(r.metrics.player.hpDamage,121);assert.equal(r.player.income,0);
});
test('audio preview changes only local pressed state and canonical markup remains safe',()=>{
  assert.ok(D.PARTS.sc_track);const item=p('sc_track','a',0,0);item.label='<img src=x>';
  assert.match(V.markup(item),/native-audio-player/);assert.match(V.markup(item),/&lt;img/);
  const attrs=new Map();const button={dataset:{ui:'audio-play'},getAttribute(k){return attrs.get(k)??null;},setAttribute(k,v){attrs.set(k,v);}};
  assert.equal(previewCatalogueAction(button,null),true);assert.equal(attrs.get('aria-pressed'),'true');assert.match(attrs.get('title'),/実音声/);
  previewCatalogueAction(button,null);assert.equal(attrs.get('aria-pressed'),'false');
});
test('SoundCloud-inspired template has legal native waveform and genuinely connected repost rows',()=>{
  const t=SITE_TEMPLATES.find(t=>t.id==='site_soundcloud');assert.ok(t);assert.match(t.name,/SoundCloud風/);assert.equal(t.status,'experimental');
  const board=t.layout.map(([type,x,y,w,h],i)=>p(type,`${t.id}-${i}`,x,y,w,h));
  for(const item of board)assert.ok(C.canPlace(board,item,item.x,item.y),item.type);
  const info=E.analyze(board);
  for(const item of board.filter(p=>p.type==='tw_retweet'))assert.ok((info.near[item.id]??[]).some(id=>board.find(p=>p.id===id)?.type==='sc_track'));
  assert.ok(t.loot.every(type=>board.some(p=>p.type===type)));assert.match(t.counterplay,/CPU|面積/);assert.match(V.header('audio',t.pageName),/非公式/);
});
