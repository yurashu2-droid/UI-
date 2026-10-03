import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import V from '../src/components.js';
import { previewCatalogueAction } from '../src/catalog/preview.js';

test('real history UI is a priced Google experiment with the reviewed footprint and tradeoffs',()=>{
  const p=D.PARTS.go_history;assert.ok(p);
  assert.equal(p.status,'experimental');assert.equal(p.faction,'google');
  assert.equal(p.price,6);assert.equal(p.load,2);assert.equal(p.cd,5);assert.equal(p.value,12);
  assert.deepEqual([p.w,p.h,p.minW,p.minH,p.maxW,p.maxH],[280,112,224,96,560,224]);
  assert.ok(p.tags.includes('document'));assert.ok(p.tags.includes('text'));assert.equal(p.tags.includes('search'),false);
  assert.match(p.desc,/50%/);assert.match(p.desc,/貫通/);assert.match(p.desc,/0.*上書き/);assert.match(p.desc,/共有/);assert.match(p.desc,/空.*発動しない/);
});
test('canonical history markup uses the safe one-record renderer and starts unavailable',()=>{
  assert.ok(D.PARTS.go_history);
  const item=C.makeItem('go_history','history',24,24);item.label='<img src=x>';
  const html=V.markup(item);assert.match(html,/native-version-history/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
  assert.match(html,/<button[^>]*disabled/);assert.equal((html.match(/class="history-entry"/g)||[]).length,1);
});
test('history preview action explains automatic game restoration without external file operations',()=>{
  const attrs=new Map();
  const button={dataset:{ui:'history-restore'},setAttribute(k,v){attrs.set(k,v);}};
  assert.equal(previewCatalogueAction(button,null),true);
  assert.match(attrs.get('title'),/自動/);assert.match(attrs.get('title'),/実際のファイル.*変更しません/);
});
