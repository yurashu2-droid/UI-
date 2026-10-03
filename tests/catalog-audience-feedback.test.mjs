import test from 'node:test';
import assert from 'node:assert/strict';
import Effects from '../src/effects.js';
const presentation = await import('../src/catalog/audience-feedback.js').catch(() => ({}));
const snapshot = { loyalty: 3.25, loyaltyExpiresAt: 13, churn: 7.75, retained: 2.5, eligibleViews: 2 };

test('audience feedback exists only for an explicit experimental snapshot', () => {
  assert.equal(typeof presentation.audienceFeedback, 'function');
  assert.equal(presentation.audienceFeedback(null, 4), null);
  const view = presentation.audienceFeedback(snapshot, 4);
  assert.match(view.summary, /実験/);
  assert.match(view.membership, /ページ共有.*3.25.*8/);
  assert.match(view.membership, /9.0秒/);
  assert.match(view.summary, /離脱.*7.75.*維持.*2.5/);
  assert.match(view.explanation, /自然再生3回.*\$1/);
  assert.doesNotMatch(view.explanation, /回復/);
});

test('exhausted loyalty has no stale expiry or promise of future protection', () => {
  assert.equal(typeof presentation.audienceFeedback, 'function');
  const view = presentation.audienceFeedback({ ...snapshot, loyalty: 0 }, 14);
  assert.match(view.membership, /0.*8.*受付中/);
  assert.doesNotMatch(view.membership, /秒/);
});

test('audience events explain departures and retention only in the active variant', () => {
  const oldDocument = globalThis.document, oldMedia = globalThis.matchMedia;
  const classes = new Set();
  const element = { offsetWidth: 200, classList: { add(c) { classes.add(c); }, remove(c) { classes.delete(c); } } };
  globalThis.document = { querySelector(selector) { return selector === '#effect-layer' ? {} : element; } };
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const fx = new Effects();
    const battle = { elapsed: 4, player: { parts: [{ id: 'ad', type: 'yt_ad' }, { id: 'member', type: 'yt_sub' }] }, audience: null };
    const churn = { kind: 'audience', action: 'churn', id: 'ad', side: 'player', value: 1.5, remaining: 0, time: 4 };
    fx.emit(churn, battle);
    assert.equal(fx.lines.player.length, 0);
    battle.audience = { player: { snapshot() { return snapshot; } } };
    fx.emit(churn, battle);
    assert.match(fx.lines.player.join(''), /広告で離脱.*1.5/);
    assert.ok(classes.has('is-ad-churn'));
    fx.emit({ ...churn, action: 'loyalty-retained', id: 'member', value: 0.75 }, battle);
    assert.match(fx.lines.player.join(''), /会員が留まった.*0.75/);
    assert.ok(classes.has('is-loyalty-retained'));
    assert.doesNotMatch(fx.lines.player.join(''), /回復|呼び戻し/);
  } finally { globalThis.document = oldDocument; globalThis.matchMedia = oldMedia; }
});

test('experimental page meter is removed when returning to canonical battle rules', () => {
  assert.equal(typeof presentation.applyAudienceFeedback, 'function');
  const children = [];
  const frame = {
    ownerDocument: { createElement() { const n = { className: '', textContent: '', title: '', setAttribute() {}, remove() { children.splice(children.indexOf(n), 1); } }; return n; } },
    querySelector(selector) { return selector === ':scope > .audience-experiment-meter' ? children[0] : null; },
    insertBefore(n) { children.push(n); },
  };
  presentation.applyAudienceFeedback(frame, snapshot, 4);
  assert.equal(children.length, 1);
  assert.match(children[0].textContent, /実験.*ページ共有/);
  assert.match(children[0].title, /自然再生3回.*\$1/);
  presentation.applyAudienceFeedback(frame, null, 0);
  assert.equal(children.length, 0);
});
