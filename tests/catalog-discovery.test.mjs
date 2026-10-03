import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import V from '../src/components.js';
import { SITE_TEMPLATES } from '../src/catalog/index.js';
const discovery = await import('../src/catalog/discovery-render.js').catch(() => ({}));
function boardOf(template) { return template.layout.map(([type,x,y,w,h,,label],i) => ({ ...C.makeItem(type,`${template.id}-${i}`,x,y,w,h), label: label || '' })); }

test('portal and gaming storefront add distinct lab templates using existing combat parts', () => {
  for (const [id, name] of [['site_yahoo_portal', /Yahoo! JAPAN風/], ['site_steam_store', /Steam風/]]) {
    const template = SITE_TEMPLATES.find(t => t.id === id);
    assert.ok(template, id);
    assert.match(template.name, name);
    assert.equal(template.status, 'experimental');
    assert.ok(D.PRESETS[id]);
    assert.ok(D.FACTIONS[template.faction]);
    const board = boardOf(template);
    for (const p of board) { assert.ok(C.canPlace(board,p,p.x,p.y), `${id}:${p.type}`); assert.notEqual(D.PARTS[p.type].status,'experimental'); }
    assert.ok(template.loot.every(type => board.some(p => p.type === type)));
    assert.match(template.inspiredBy, /架空.*公式/);
  }
});

test('discovery templates actually connect their advertised cross-culture controls', () => {
  const portal = SITE_TEMPLATES.find(t => t.id === 'site_yahoo_portal');
  const store = SITE_TEMPLATES.find(t => t.id === 'site_steam_store');
  assert.ok(portal); assert.ok(store);
  const p = boardOf(portal), s = boardOf(store);
  const pi = E.analyze(p), si = E.analyze(s);
  const search = p.find(x => x.type === 'go_search'), button = p.find(x => x.type === 'gov_submit');
  assert.ok(pi.groups.some(g => g.kind === 'search-form' && g.items.includes(search.id) && g.items.includes(button.id)));
  const video = s.find(x => x.type === 'yt_play'), ad = s.find(x => x.type === 'yt_ad'), cart = s.find(x => x.type === 'am_cart');
  assert.equal(si.mods[video.id].speed, 2);
  assert.ok(si.near[video.id].includes(ad.id));
  assert.ok(si.near[ad.id].includes(cart.id));
});

test('discovery page decoration is fictional inert markup while native parts keep their controls', () => {
  assert.equal(typeof discovery.discoveryDecor, 'function');
  for (const t of SITE_TEMPLATES.filter(t => ['portal','storefront'].includes(t.faction))) {
    assert.match(V.header(t.faction,t.pageName), /非公式/);
    for (const [kind] of t.decor) {
      const html = discovery.discoveryDecor(kind);
      assert.ok(html.length > 0, kind);
      assert.doesNotMatch(html, /<script|<iframe|<img|\bsrc=|\bhref=|\bonclick=/i);
    }
  }
  assert.match(V.markup(C.makeItem('go_search','s')), /data-ui="search"/);
  assert.match(V.markup(C.makeItem('am_wish','w')), /data-ui="wish"/);
});
