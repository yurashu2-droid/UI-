import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import C from '../src/document.js';
import E from '../src/engine.js';
const guidance=await import('../src/app-guidance.js').catch(()=>({}));
const item=(type,id,x,y,w,h)=>C.makeItem(type,id,x,y,w,h);

test('speed guidance recognizes all semantic video sources and excludes unrelated timers',()=>{
  assert.equal(typeof guidance.isVideoSource,'function');
  for(const type of ['yt_play','yt_embed','nc_player'])assert.equal(guidance.isVideoSource(item(type,type,24,24)),true,type);
  for(const type of ['ab_link','am_buy','nc_comment','yt_sub','yt_like'])assert.equal(guidance.isVideoSource(item(type,type,24,24)),false,type);
  assert.match(guidance.VIDEO_SPEED_HELP,/動画本体/);
  assert.match(guidance.VIDEO_SPEED_HELP,/上限2倍/);
  assert.match(guidance.VIDEO_SPEED_HELP,/対象外/);
});

test('working guidance follows actual engine relations rather than timed adjacency',()=>{
  assert.equal(typeof guidance.videoSpeedWorking,'function');
  for(const type of ['yt_play','yt_embed','nc_player']) {
    const source=item(type,'source',32,32,560,280),speed=item('yt_speed','speed',32,312,104,40);
    const linked=E.analyze([source,speed]);
    assert.equal(linked.mods.source.speed,2);
    assert.equal(guidance.videoSpeedWorking(speed,linked),true,type);
    assert.match(guidance.videoSpeedHint(linked),/適用中/);
    const beside={...speed,x:592,y:32};
    const loose=E.analyze([source,beside]);
    assert.equal(guidance.videoSpeedWorking(beside,loose),false,type);
    assert.doesNotMatch(guidance.videoSpeedHint(loose),/適用中|今のページで効く/);
    assert.match(guidance.videoSpeedHint(loose),/操作列/);
  }
  const text=item('ab_link','text',32,32,192,32),speed=item('yt_speed','speed',224,32,104,40);
  const unrelated=E.analyze([text,speed]);
  assert.equal(guidance.videoSpeedWorking(speed,unrelated),false);
  assert.equal(guidance.videoSpeedHint(unrelated),undefined);
});

test('app uses the tested speed guidance and has restore and community category labels (source contract)',()=>{
  const app=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
  assert.match(app,/restore:\s*"復元"/);
  assert.match(app,/yt_speed:\s*\{\s*t:\s*isVideoSource,\s*x:\s*VIDEO_SPEED_HELP/);
  assert.match(app,/if \(p\.type === "yt_speed"\) return videoSpeedWorking\(p, info\)/);
  assert.match(app,/if \(t === "yt_speed"\) return videoSpeedHint\(info\)/);
  for(const [id,glyph] of [['wiki','文'],['forge','git'],['nico','TV'],['reddit','r']])assert.match(app,new RegExp(`${id}:\\s*"${glyph}"`));
});
