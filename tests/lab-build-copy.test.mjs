import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Copy-level regression only; this does not claim browser layout or click acceptance.
test('app catalogue labels describe completed examples without promising obtainable optima',()=>{
  const app=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
  assert.match(app,/optgroup label="完成構成例"/);
  assert.match(app,/構成例図鑑・相性表/);
  assert.doesNotMatch(app,/>理想形ビルド図鑑・相性表</);
  assert.doesNotMatch(app,/modalHead\("BUILD BOOK", "理想形ビルド図鑑"\)/);
  assert.match(app,/入手費用・必要な処理能力/);
});
