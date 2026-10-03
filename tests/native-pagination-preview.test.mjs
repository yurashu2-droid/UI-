import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFragment } from 'parse5';
import C from '../src/document.js';
import V from '../src/components.js';
import { previewCatalogueAction } from '../src/catalog/preview.js';
const pagination = await import('../src/catalog/pagination.js').catch(() => ({}));

// Parse the production component's HTML into a DOM boundary adapter. Native
// browser activation, focus, layout and assistive technology remain unverified.
class ElementAdapter {
  constructor(tag, attributes = []) {
    this.tagName = tag.toUpperCase();
    this.attributes = new Map(attributes.map(({ name, value }) => [name, value]));
    this.children = []; this.parentElement = null; this._text = '';
    this.dataset = new Proxy({}, { get: (_, key) => this.getAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`) ?? undefined });
    this.classList = {
      contains: name => (this.getAttribute('class') ?? '').split(/\s+/).includes(name),
      add: name => this.setAttribute('class', [...new Set([...(this.getAttribute('class') ?? '').split(/\s+/).filter(Boolean), name])].join(' ')),
      remove: name => this.setAttribute('class', (this.getAttribute('class') ?? '').split(/\s+/).filter(c => c !== name).join(' ')),
      toggle: (name, on) => { const add = on ?? !this.classList.contains(name); this.classList[add ? 'add' : 'remove'](name); return add; },
    };
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { value ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(child) { child.parentElement = this; this.children.push(child); }
  contains(other) { return this === other || this.children.some(child => child.contains(other)); }
  matches(selector) {
    return selector.split(',').some(raw => {
      const part = raw.trim();
      const tag = part.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && tag.toUpperCase() !== this.tagName) return false;
      for (const [, name] of part.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
      for (const [, name, , value] of part.matchAll(/\[([\w-]+)(?:=(['"]?)([^'"\]]*)\2)?\]/g)) {
        if (!this.hasAttribute(name) || value !== undefined && this.getAttribute(name) !== value) return false;
      }
      return true;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
function fixture(type) {
  const node = new ElementAdapter('div', [{ name: 'class', value: 'web-node' }]);
  function convert(parsed) {
    const el = new ElementAdapter(parsed.tagName, parsed.attrs);
    for (const child of parsed.childNodes ?? []) {
      if (child.tagName) el.append(convert(child));
      else if (child.nodeName === '#text') el._text += child.value;
    }
    return el;
  }
  const html = V.markup(C.makeItem(type, 'pager'));
  for (const parsed of parseFragment(html).childNodes.filter(child => child.tagName)) node.append(convert(parsed));
  const panel = node.querySelector('.native-pagination');
  const buttons = panel.querySelectorAll('button');
  return { node, panel, buttons, html, page: n => buttons.find(button => button.dataset.page === String(n)), direction: value => buttons.find(button => button.dataset.pageDirection === value) };
}
function selected(f, page) {
  const selected = f.buttons.filter(button => button.classList.contains('current'));
  const current = f.buttons.filter(button => button.getAttribute('aria-current') === 'page');
  assert.equal(selected.length, 1, 'one visually selected numeric page');
  assert.equal(current.length, 1, 'one accessible current numeric page');
  assert.equal(selected[0], current[0]);
  assert.equal(current[0].dataset.page, String(page));
  for (const arrow of f.buttons.filter(button => button.dataset.pageDirection)) {
    assert.equal(arrow.classList.contains('current'), false);
    assert.equal(arrow.getAttribute('aria-current'), null);
  }
}
function snapshot(f) { return f.buttons.map(button => [...button.attributes]); }

for (const [type, pages, labels] of [
  ['go_page', 6, ['1', '2', '3', '4', '5', '6', '次へ ›']],
  ['gov_page', 4, ['‹', '1', '2', '3', '4', '›']],
]) {
  test(`${type} production markup retains its silhouette with numeric semantics and local-only disclosure`, () => {
    const f = fixture(type);
    assert.deepEqual(f.buttons.map(button => button.textContent), labels);
    selected(f, 1);
    assert.deepEqual(f.buttons.filter(button => button.dataset.page).map(button => Number(button.dataset.page)), Array.from({ length: pages }, (_, i) => i + 1));
    assert.equal(f.direction('next').disabled, false);
    if (type === 'gov_page') assert.equal(f.direction('previous').disabled, true);
    for (const button of f.buttons) { assert.equal(button.tagName, 'BUTTON'); assert.equal(button.getAttribute('type'), 'button'); assert.equal(button.dataset.ui, 'page'); }
    for (const button of f.buttons.filter(button => button.dataset.pageDirection)) assert.match(button.getAttribute('aria-label'), /ページ/);
    assert.match(f.panel.getAttribute('aria-description') ?? '', /プレビュー.*取得.*しません/);
    assert.doesNotMatch(f.html, /<(?:a|form|script|iframe|img)\b|(?:href|src|action)=/);
  });

  test(`${type} preview advances and clamps numeric pages without selecting the arrow`, () => {
    const f = fixture(type);
    const next = () => f.direction('next') ?? f.buttons.at(-1);
    assert.equal(previewCatalogueAction(next(), f.node), true);
    selected(f, 2);
    for (let i = 3; i <= pages; i++) { assert.equal(previewCatalogueAction(next(), f.node), true); selected(f, i); }
    assert.equal(next().disabled, true);
    const before = snapshot(f);
    previewCatalogueAction(next(), f.node);
    assert.deepEqual(snapshot(f), before, 'synthetic disabled click is inert');
    previewCatalogueAction(f.page(2), f.node); selected(f, 2);
    assert.equal(next().disabled, false);
    previewCatalogueAction(f.page(2), f.node); selected(f, 2);
  });

  test(`${type} shared projection rejects invalid pages and synchronizes effect wraparound`, () => {
    assert.equal(typeof pagination.projectPagination, 'function');
    assert.equal(typeof pagination.advancePagination, 'function');
    const f = fixture(type);
    const before = snapshot(f);
    for (const invalid of [0, pages + 1, NaN, Infinity, 1.5]) {
      assert.equal(pagination.projectPagination(f.panel, invalid), false);
      assert.deepEqual(snapshot(f), before);
    }
    assert.equal(pagination.projectPagination(f.panel, pages), true); selected(f, pages);
    assert.equal(f.direction('next').disabled, true);
    assert.equal(pagination.advancePagination(f.node), true); selected(f, 1);
    assert.equal(f.direction('next').disabled, false);
    if (type === 'gov_page') assert.equal(f.direction('previous').disabled, true);
    f.page(1).textContent = '› is presentation only';
    assert.equal(pagination.advancePagination(f.node), true); selected(f, 2);
    assert.equal(pagination.advancePagination(new ElementAdapter('div')), false);
  });
}

test('government previous control moves backward and stops at the first page', () => {
  const f = fixture('gov_page');
  assert.equal(previewCatalogueAction(f.page(4) ?? f.buttons.at(-2), f.node), true);
  selected(f, 4); assert.equal(f.direction('previous').disabled, false);
  for (let i = 3; i >= 1; i--) { previewCatalogueAction(f.direction('previous'), f.node); selected(f, i); }
  assert.equal(f.direction('previous').disabled, true);
  const before = snapshot(f);
  previewCatalogueAction(f.direction('previous'), f.node);
  assert.deepEqual(snapshot(f), before);
});

test('page preview consumes invalid calls but refuses disabled, detached and other-node controls', () => {
  const f = fixture('go_page'), other = fixture('go_page');
  const before = snapshot(f), otherBefore = snapshot(other);
  for (const node of [null, other.node]) {
    assert.equal(previewCatalogueAction(f.buttons.at(-1), node), true);
    assert.deepEqual(snapshot(f), before); assert.deepEqual(snapshot(other), otherBefore);
  }
  f.page(2).disabled = true;
  const disabled = snapshot(f);
  previewCatalogueAction(f.page(2), f.node); assert.deepEqual(snapshot(f), disabled);
  const impostor = new ElementAdapter('button', [{ name: 'data-ui', value: 'page' }, { name: 'data-page', value: '2' }]);
  f.node.append(impostor);
  assert.equal(previewCatalogueAction(impostor, f.node), true); assert.deepEqual(snapshot(f), disabled);
  const nested = new ElementAdapter('div', [{ name: 'class', value: 'web-node' }]);
  f.panel.append(nested); nested.append(other.panel);
  assert.equal(previewCatalogueAction(other.page(2), f.node), true); assert.deepEqual(snapshot(f), disabled); assert.deepEqual(snapshot(other), otherBefore);
});

test('pagination stylesheet declares only a static disabled treatment', () => {
  const url = new URL('../src/styles/pagination.css', import.meta.url);
  let css = ''; try { css = readFileSync(url, 'utf8'); } catch {}
  assert.match(css, /\.native-pagination button:disabled\s*\{/);
  assert.match(css, /cursor:\s*not-allowed/);
  assert.doesNotMatch(css, /animation|transition|@keyframes|@import|url\s*\(/i);
});
