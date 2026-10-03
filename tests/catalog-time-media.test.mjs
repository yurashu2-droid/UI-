import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import { SITE_TEMPLATES } from '../src/catalog/index.js';
const render = await import('../src/catalog/time-media-render.js').catch(()=>({}));
const boardOf=t=>t.layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`${t.id}-${i}`,x,y,w,h),label:label||''}));

test('archive and live-channel motifs add separate legal lab pages without new combat IDs',()=>{
  for(const [id,expected] of [['site_wayback',/Wayback Machine風/],['site_twitch',/Twitch風/]]){
    const t=SITE_TEMPLATES.find(t=>t.id===id);assert.ok(t,id);assert.match(t.name,expected);
    assert.equal(t.status,'experimental');assert.ok(D.FACTIONS[t.faction]);assert.ok(D.PRESETS[id]);
    const board=boardOf(t);
    for(let i=0;i<board.length;i++){const p=board[i];assert.ok(C.canPlace(board,p,p.x,p.y),`${id}:${p.type}`);assert.equal(p.w,t.layout[i][3]);assert.equal(p.h,t.layout[i][4]);}
    assert.ok(t.loot.every(type=>board.some(p=>p.type===type)));
  }
});
test('archive cache binds to its archived PDF while live membership and ad income reach support',()=>{
  const archive=SITE_TEMPLATES.find(t=>t.id==='site_wayback'),live=SITE_TEMPLATES.find(t=>t.id==='site_twitch');assert.ok(archive);assert.ok(live);
  const a=boardOf(archive),l=boardOf(live),enemy=[C.makeItem('ab_link','enemy',24,24)];
  const ab=new E.Battle(a,enemy,{playerHp:10000,enemyHp:10000,playerCapacity:56,enemyCapacity:56});
  const cache=a.find(p=>p.type==='go_cache'),pdf=a.find(p=>p.type==='gov_pdf');
  assert.equal(ab.states.player.get(cache.id).target,pdf.id);
  const lb=new E.Battle(l,enemy,{playerHp:10000,enemyHp:10000,playerCapacity:56,enemyCapacity:56});
  const support=l.find(p=>p.type==='yt_tip'),member=l.find(p=>p.type==='yt_sub'),ad=l.find(p=>p.type==='yt_ad');
  const routed=[];
  for(let i=0;i<400;i++)routed.push(...lb.step(.05).filter(e=>e.kind==='conversion'&&e.action==='route'&&e.to===support.id));
  assert.ok(routed.some(e=>e.id===member.id),'membership route must work');
  assert.ok(routed.some(e=>e.id===ad.id),'ad route must work');
  assert.ok(lb.metrics.player.spent>0);
});
test('archive history and stream chat decoration stays fictional and inert',()=>{
  assert.equal(typeof render.timeMediaDecor,'function');
  for(const t of SITE_TEMPLATES.filter(t=>['webarchive','livechannel'].includes(t.faction))){
    assert.match(V.header(t.faction,t.pageName),/非公式/);
    for(const [kind] of t.decor){const html=render.timeMediaDecor(kind);assert.ok(html,kind);assert.doesNotMatch(html,/<script|<iframe|<img|\bsrc=|\bhref=|\bonclick=/i);}
  }
});
