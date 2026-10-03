import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { parseFragment } from 'parse5';
import V from '../src/components.js';
import C from '../src/document.js';
import Effects from '../src/effects.js';
import { previewCatalogueAction } from '../src/catalog/preview.js';

// Production markup and exact handlers in a narrow DOM-event adapter, not browser/AT acceptance.
const source = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
const start = source.indexOf('function previewAction(e: MouseEvent)');
const end = source.indexOf('\n/* ---------- Events ---------- */', start);
assert.ok(start >= 0 && end > start);
const handlerCode = transformSync(source.slice(start, end), { loader: 'ts', target: 'es2022' }).code;
function fixture() {
  const item = C.makeItem('gov_accordion', 'accordion', 20, 20);
  item.label = '<script>editable title</script>';
  const parsed = parseFragment(V.markup(item));
  const sectionNode = parsed.childNodes.find(n => n.tagName === 'section');
  const buttonNode = sectionNode.childNodes.find(n => n.tagName === 'button');
  const spanNode = buttonNode.childNodes.find(n => n.tagName === 'span');
  const attrs = new Map(buttonNode.attrs.map(a => [a.name, a.value]));
  const classes = new Set(sectionNode.attrs.find(a => a.name === 'class').value.split(/\s+/));
  const marker = { textContent: spanNode.childNodes.map(n => n.value ?? '').join('') };
  const section = { classList: {
    contains: value => classes.has(value),
    add: value => classes.add(value), remove: value => classes.delete(value),
    toggle(value) { if (classes.has(value)) { classes.delete(value); return false; } classes.add(value); return true; },
  } };
  const button = {
    tagName: 'BUTTON', dataset: { ui: attrs.get('data-ui') }, disabled: false,
    getAttribute: name => attrs.get(name) ?? null,
    setAttribute(name, value) { attrs.set(name, String(value)); },
    closest: selector => selector === '.native-accordion' ? section : selector === '.web-node' ? node : null,
    querySelector: selector => selector === 'span' ? marker : null,
  };
  const node = { dataset: { id: item.id }, querySelector(selector) {
    return selector === '.native-accordion' ? section : selector === '.accordion-summary>span' ? marker : selector === '.accordion-summary' ? button : null;
  } };
  class Element {
    closest(selector) { return selector === '[data-ui]' ? button : selector === '.browser-paper' ? {} : null; }
  }
  let pulses = 0;
  const click = (preview = true, battle = null) => {
    const handler = new Function('Element', 'preview', 'battle', 'storyActive', 'storySession', 'fx', 'previewCatalogueAction', `${handlerCode}; return previewAction;`)(Element, preview, battle, false, null, { pulse() { pulses++; } }, previewCatalogueAction);
    handler({ target: new Element(), preventDefault() { throw new Error('button must not navigate'); } });
  };
  return { item, node, section, marker, button, click, pulses: () => pulses };
}
function assertExpanded(f, expanded) {
  assert.equal(f.section.classList.contains('collapsed'), !expanded);
  assert.equal(f.marker.textContent, expanded ? '−' : '＋');
  assert.equal(f.button.getAttribute('aria-expanded'), String(expanded));
}

test('accordion local preview keeps current expansion, marker and accessible state together', () => {
  const f = fixture(), before = structuredClone(f.item);
  assertExpanded(f, true);
  for (const expanded of [false, true, false, true]) { f.click(); assertExpanded(f, expanded); }
  assert.equal(f.pulses(), 4);
  assert.deepEqual(f.item, before, 'preview must not modify inventory or edited labels');
});

test('accordion editing, battle and disabled synthetic clicks do not mutate local state', () => {
  const f = fixture();
  f.click(false); assertExpanded(f, true);
  f.click(true, Object.freeze({ ticks: 4 })); assertExpanded(f, true);
  f.button.disabled = true; f.click(); assertExpanded(f, true);
  assert.equal(f.pulses(), 0);
});

test('actual battle accordion feedback announces collapse and the existing timed reopen', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  Effects.prototype.act.call({}, f.node, 'gov_accordion');
  assertExpanded(f, false);
  t.mock.timers.tick(259); assertExpanded(f, false);
  t.mock.timers.tick(1); assertExpanded(f, true);
});

test('battle accordion feedback does not mutate a replacement control through a retained old timer', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = fixture(), replacement = fixture();
  Effects.prototype.act.call({}, previous.node, 'gov_accordion');
  replacement.click(); assertExpanded(replacement, false);
  t.mock.timers.tick(260);
  assertExpanded(previous, true); assertExpanded(replacement, false);
});
