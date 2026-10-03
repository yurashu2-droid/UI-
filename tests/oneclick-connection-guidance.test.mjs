import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import D from '../src/data.js';
import {INSTANT_SEARCH_HELP} from '../src/app-guidance.js';
const source=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
const fn=source.match(/^function connectText\([^]*?^}/m)?.[0];assert.ok(fn);
const compiled=transformSync(fn,{loader:'ts',target:'es2022'}).code;
function hint(type){const context={P:D.PARTS,NEEDS:{},INSTANT_SEARCH_HELP,type};vm.runInNewContext(compiled+'\noutput=connectText(type);',context);return context.output;}

test('actual One-click connection hint separates nearby spendable charge from cumulative income and natural attacks',()=>{
 const text=hint('am_oneclick');
 assert.match(text,/収益UI/);assert.match(text,/チャージ.*\$3|\$3.*チャージ/);
 assert.match(text,/累計収益/);assert.match(text,/通常攻撃/);assert.match(text,/別/);
 assert.match(text,/ページに置けば.*収益が未接続でも通常攻撃/);
 assert.match(text,/二重/);assert.doesNotMatch(text,/ボタン同士を横/);
});

test('ordinary button and Instant Search connection hints keep their existing guidance',()=>{
 assert.match(hint('am_buy'),/ボタン同士を横/);assert.equal(hint('go_instant'),INSTANT_SEARCH_HELP);
});
