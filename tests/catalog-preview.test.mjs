import test from 'node:test';
import assert from 'node:assert/strict';
const preview = await import('../src/catalog/preview.js').catch(() => ({}));
function button(kind) {
  const attributes = new Map(), icon = { textContent: '☆' };
  return { dataset:{ui:kind}, textContent:'自分のラベル', getAttribute(k){return attributes.get(k)??null;}, setAttribute(k,v){attributes.set(k,v);}, querySelector(){return icon;}, icon };
}
test('catalogue social preview toggles native pressed state without changing custom labels', () => {
  assert.equal(typeof preview.previewCatalogueAction,'function');
  for(const kind of ['retweet','favorite','follow','bookmark']) {
    const control=button(kind);
    assert.equal(preview.previewCatalogueAction(control,null),true);
    assert.equal(control.getAttribute('aria-pressed'),'true');
    assert.equal(control.textContent,'自分のラベル');
    if(kind==='favorite') assert.equal(control.icon.textContent,'★');
    preview.previewCatalogueAction(control,null);
    assert.equal(control.getAttribute('aria-pressed'),'false');
    if(kind==='favorite') assert.equal(control.icon.textContent,'☆');
  }
});
test('reference and support previews disclose their local-only meaning without charging or opening anything', () => {
  assert.equal(typeof preview.previewCatalogueAction,'function');
  const reference=button('reference'), state={textContent:''};
  assert.equal(preview.previewCatalogueAction(reference,{querySelector(){return state;}}),true);
  assert.match(state.textContent,/参照.*プレビュー/);
  const support=button('support');
  assert.equal(preview.previewCatalogueAction(support,null),true);
  assert.match(support.getAttribute('title'),/実際の決済なし/);
  assert.equal(preview.previewCatalogueAction(button('search'),null),false);
});

test('social toggles expose their initial unpressed state to assistive technology', async () => {
  const { default: C } = await import('../src/document.js');
  const { default: V } = await import('../src/components.js');
  for(const type of ['tw_retweet','tw_favorite','tw_follow','x_bookmark']) assert.match(V.markup(C.makeItem(type,type)),/aria-pressed="false"/);
});

test('cache link has a local display demonstration without spending protection or navigating',()=>{
 const attrs=new Map(),state={textContent:'準備完了'},control={dataset:{ui:'cache'},setAttribute(k,v){attrs.set(k,v);}};
 const node={querySelector(s){assert.equal(s,'.cache-state');return state;}};
 assert.equal(preview.previewCatalogueAction(control,node),true);assert.equal(state.textContent,'表示のデモ');assert.match(attrs.get('title'),/戦闘状態/);
});
