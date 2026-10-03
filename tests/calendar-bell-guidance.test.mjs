import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import {Editor} from '../src/editor.js';
import {createRunPersistence} from '../src/persistence.js';
import {calendarDecor} from '../src/catalog/calendar-render.js';

const note = () => calendarDecor('calendar-bell-note');
const textOf = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(textOf).join('');
const noteText = () => textOf(parseFragment(note()));
const initialScope = text => assert.match(text, /初期配置の見本/);
const part = (run, type) => run.owned.find(p => p.type === type);

// The editor and storage transactions are production code. Only document's
// event registration is adapted; no browser, pointer or visual QA is claimed.
function fixture(t) {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = {addEventListener() {}};
  t.after(() => oldDocument
    ? Object.defineProperty(globalThis, 'document', oldDocument)
    : delete globalThis.document);
  const run = R.newRun('lab', 'site_calendar');
  const values = new Map();
  const persistence = createRunPersistence({
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }, 'calendar-bell-guidance-');
  let renderedNote = note();
  const editor = new Editor({
    getRun: () => run,
    getHost: () => null,
    getOverlay: () => null,
    enabled: () => run.phase === 'build',
    onChange() {
      assert.equal(persistence.save(run).ok, true);
      renderedNote = note();
    },
    onSelect() {},
    onToast() {},
    paint() {},
  });
  return {run, editor, persistence, renderedNote: () => renderedNote};
}

function measure(board, bellId) {
  const battle = new E.Battle(board, [], {
    playerHp: 10000, enemyHp: 10000,
    playerCapacity: Infinity, enemyCapacity: Infinity,
    playerAdmin: [], enemyAdmin: [],
  });
  const shields = [];
  for (let tick = 0; tick < 200; tick++) {
    shields.push(...battle.step(.05).filter(event =>
      event.side === 'player' && event.id === bellId && event.kind === 'shield'));
  }
  return {
    battle,
    times: shields.map(event => Math.round(event.time * 100) / 100),
    values: shields.map(event => event.value),
  };
}

test('calendar bell guidance describes the initial layout and base interval in the existing five-line ornament', () => {
  const fragment = parseFragment(note());
  assert.equal(fragment.childNodes.length, 1);
  const paragraph = fragment.childNodes[0];
  assert.equal(paragraph.tagName, 'p');
  assert.deepEqual(paragraph.attrs, [{name: 'class', value: 'calendar-bell-note'}]);
  assert.deepEqual(paragraph.childNodes.filter(node => node.tagName).map(node => node.tagName), ['br', 'br', 'br', 'br']);
  const lines = note().replace(/^<p[^>]*>|<\/p>$/g, '').split('<br>');
  assert.ok(lines.every(line => [...line].length <= 19), 'source text budget only, not browser wrapping acceptance');
  const text = noteText();
  initialScope(text);
  assert.match(text, /基礎間隔4秒/);
  assert.match(text, /シールド5/);
  assert.match(text, /近くに動画で\+2/);
  assert.match(text, /速度補正/);
  assert.match(text, /未配置では発動しません/);
  assert.match(text, /切替は表示のみ/);
  assert.match(text, /端末への通知なし/);
  assert.doesNotMatch(text, /このベルは4秒ごとに|動画は近くになく、追加分はなし/);
});

test('initial WEEKGRID bell retains shield 5 and the actual half-period first activation', () => {
  const run = R.newRun('lab', 'site_calendar');
  const bell = part(run, 'yt_notify');
  assert.ok(run.owned.every(p => C.canPlace(run.owned, p, p.x, p.y)));
  assert.deepEqual(E.analyze(run.owned).near[bell.id], []);
  const trace = measure(run.owned, bell.id);
  assert.deepEqual(trace.times, [2, 6, 10]);
  assert.deepEqual(trace.values, [5, 5, 5]);
  assert.match(noteText(), /基礎間隔4秒/, 'base interval does not promise the first pulse at 4 seconds');
});

test('moving the original bell to a button group changes its real cadence while the note remains an explicitly initial example', t => {
  const h = fixture(t), before = structuredClone(h.run);
  const bellId = part(h.run, 'yt_notify').id;
  h.editor.select([bellId]);
  h.editor.update({x: 496, y: 236});
  assert.deepEqual([part(h.run, 'yt_notify').x, part(h.run, 'yt_notify').y], [496, 236]);
  assert.equal(h.editor.history.length, 1);
  assert.deepEqual(h.run.owned.map(p => p.id), before.owned.map(p => p.id));
  assert.equal(E.analyze(h.run.owned).mods[bellId].speed, 1.12);
  assert.deepEqual(measure(h.run.owned, bellId).times, [1.8, 5.4, 8.95]);
  const after = structuredClone(h.run);
  h.editor.undo();
  assert.deepEqual(h.run, before);
  h.editor.redo();
  assert.deepEqual(h.run, after);
  assert.deepEqual(h.persistence.load('lab').run, after);
  initialScope(textOf(parseFragment(h.renderedNote())));
  assert.match(noteText(), /速度補正/);
});

test('an ordinarily added nearby video grants real shield 7 without contradicting the fixed bell lesson', t => {
  const h = fixture(t), bellId = part(h.run, 'yt_notify').id;
  const originalBell = structuredClone(part(h.run, 'yt_notify'));
  h.editor.add('yt_play');
  const videoId = part(h.run, 'yt_play').id;
  h.editor.select([videoId]);
  h.editor.update({x: 152, y: 280, w: 256, h: 144});
  assert.deepEqual(part(h.run, 'yt_notify'), originalBell);
  assert.ok(h.run.owned.every(p => C.canPlace(h.run.owned, p, p.x, p.y)));
  const trace = measure(h.run.owned, bellId);
  assert.ok(trace.battle.player.info.near[bellId].includes(videoId));
  assert.deepEqual(trace.times, [2, 6, 10]);
  assert.deepEqual(trace.values, [7, 7, 7]);
  const stored = h.persistence.load('lab');
  assert.equal(stored.status, 'loaded');
  assert.deepEqual(measure(stored.run.owned, bellId).values, [7, 7, 7]);
  initialScope(noteText());
  assert.match(noteText(), /近くに動画で\+2/);
  assert.doesNotMatch(noteText(), /動画は近くになく、追加分はなし/);
});

test('stashing the original bell retains ownership but stops its pulses, as the initial-layout note explains', t => {
  const h = fixture(t), before = structuredClone(h.run);
  const bellId = part(h.run, 'yt_notify').id;
  h.editor.select([bellId]);
  h.editor.stash();
  assert.deepEqual([part(h.run, 'yt_notify').x, part(h.run, 'yt_notify').y], [null, null]);
  assert.deepEqual(h.run.owned.map(p => p.id), before.owned.map(p => p.id));
  assert.deepEqual(measure(h.run.owned, bellId).values, []);
  const stored = h.persistence.load('lab');
  assert.equal(stored.status, 'loaded');
  assert.deepEqual(measure(stored.run.owned, bellId).values, []);
  h.editor.undo();
  assert.deepEqual(h.run, before);
  assert.deepEqual(measure(h.run.owned, bellId).values, [5, 5, 5]);
  h.editor.redo();
  assert.deepEqual(measure(h.run.owned, bellId).values, []);
  initialScope(noteText());
  assert.match(noteText(), /未配置では発動しません/);
});
