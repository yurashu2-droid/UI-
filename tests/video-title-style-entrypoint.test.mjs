import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('custom native video titles are included before the preserved acquired-appearance stylesheet',()=>{
  const catalog=readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8');
  assert.match(catalog,/@import ["']\.\/video-titles\.css["'];/);
  const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
  const native=main.indexOf('import "./styles/catalog.css";'),acquired=main.indexOf('import "./styles/raid.css";');
  assert.ok(native>=0&&acquired>native,'acquired-appearance rules retain their established import order');
  const css=readFileSync(new URL('../src/styles/video-titles.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/visibility\s*:/,'custom title rules must not make hidden acquired artwork visible');
  const raid=readFileSync(new URL('../src/styles/raid.css',import.meta.url),'utf8');
  assert.match(raid,/\.raid-live-layer\[data-raid-live="video"\] > \.video-copy\s*\{\s*visibility:\s*hidden/);
});
