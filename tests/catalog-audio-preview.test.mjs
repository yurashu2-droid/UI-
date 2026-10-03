import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const audio=await import('../src/catalog/audio-render.js').catch(()=>({}));

test('waveform prototype uses a local native play control and original bounded SVG geometry',()=>{
  assert.equal(typeof audio.audioPlayerMarkup,'function');
  const html=audio.audioPlayerMarkup('夜のインターネット');
  assert.match(html,/native-audio-player/);assert.match(html,/data-ui="audio-play"/);assert.match(html,/aria-pressed="false"/);
  assert.equal((html.match(/<svg /g)||[]).length,2);assert.equal((html.match(/<path /g)||[]).length,2);
  assert.match(html,/架空の波形/);assert.doesNotMatch(html,/<audio|<iframe|<script|<img|\bsrc=|\bhref=|\bonclick=/i);
});
test('waveform prototype escapes edited titles and does not infer text or video support from artwork',()=>{
  assert.equal(typeof audio.audioPlayerMarkup,'function');
  const html=audio.audioPlayerMarkup('<img src=x onerror="bad()">');
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|onerror="/);assert.doesNotMatch(html,/native-video|video-caption|native-search/);
});

test('untouched waveform starts with zero played fraction matching its zero timestamp',()=>{
  const html=audio.audioPlayerMarkup();
  const css=readFileSync(new URL('../src/catalog/audio.css',import.meta.url),'utf8');
  const fallback=css.match(/var\(--audio-position,\s*([0-9.]+)\)/);
  assert.ok(fallback);assert.equal(Number(fallback[1]),0);
  assert.match(html,/<time class="audio-time">0:00<\/time>/);assert.match(html,/aria-pressed="false"/);
});
