import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('divider guidance requires nearby text without falsely requiring text on both sides (source contract)',()=>{
  const app=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
  assert.match(app,/rule:\s*"近くに文字UIがあると防御 \+2"/);
  assert.doesNotMatch(app,/rule:\s*"上下に文字UIがあると防御 \+2"/);
});
