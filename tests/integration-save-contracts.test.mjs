import test from 'node:test';
import assert from 'node:assert/strict';
import R from '../src/run.js';
import C from '../src/document.js';
import { SITE_TEMPLATES } from '../src/catalog/index.js';

test('all laboratory opponents survive save validation', () => {
  for (let stage = 0; stage < R.labEnemies().length; stage++) {
    const run = R.newRun('lab');
    run.stage = stage;
    assert.equal(R.validateRun(run), true, `lab opponent ${stage}`);
  }
});

test('import rejects unbounded or unsafe optional appearance references', () => {
  for (const invalid of ['<script>', 'https://example.com/image.png', 'x'.repeat(500)]) {
    const run = R.newRun('lab');
    run.owned[0].appearanceId = invalid;
    assert.equal(R.validateRun(run), false, invalid);
  }
});

test('import validates revenue routing against owned item identities', () => {
  const run = R.newRun('lab');
  run.owned[0].routeTo = 'p999999';
  assert.equal(R.validateRun(run), false);
  run.owned[0].routeTo = run.owned[1].id;
  assert.equal(R.validateRun(run), true);
});

test('selling a routing target removes dangling routing references', () => {
  const run = R.newRun('lab');
  const [producer, target] = run.owned;
  producer.routeTo = target.id;
  assert.equal(R.sell(run, target.id).ok, true);
  assert.equal(producer.routeTo, undefined);
  assert.equal(R.validateRun(run), true);
});

test('campaign offers and rewards exclude experimental catalogue entries', () => {
  for (let stage = 0; stage < 8; stage++) {
    const run = R.newRun('campaign');
    run.stage = stage;
    for (let rerolls = 0; rerolls < 20; rerolls++) {
      run.rerolls = rerolls;
      for (const offer of R.market(run))
        assert.equal(['ad_popup', 'go_cache', 'yt_tip'].includes(offer.type), false, offer.type);
    }
  }
});

test('fusion preserves acquired source identities as lineage while using a canonical fused look', () => {
  const run = R.newRun('lab');
  const search = C.makeItem('go_search','p1',32,40,420,44);
  search.appearanceId='appearance_'+'a'.repeat(64);
  search.provenanceId='capture_'+'b'.repeat(64);
  run.owned=[search,C.makeItem('go_suggest','p2',32,84,420,84)];
  run.nextId=3;
  const [result]=R.fuse(run);
  assert.equal(result.item.appearanceId,undefined);
  assert.deepEqual(result.item.lineage,[{appearanceId:search.appearanceId,provenanceId:search.provenanceId}]);
  assert.equal(R.validateRun(run),true);
});

test('site presets keep their identity and decorative page structure', () => {
  for (const template of SITE_TEMPLATES) {
    const run=R.newRun('lab',template.id);
    assert.equal(run.page.theme,template.faction);
    assert.equal(run.page.name,template.pageName);
    assert.equal(run.page.templateId,template.id);
    assert.deepEqual(R.pageDecor(run),template.decor);
    assert.equal(R.validateRun(run),true);
  }
});

test('a locked acquired UI is not automatically fused',()=>{
  const run=R.newRun('lab');
  run.owned=[C.makeItem('go_search','p1',32,40,420,44),C.makeItem('go_suggest','p2',32,84,420,84)];
  run.owned[0].fusionLocked=true; run.nextId=3;
  assert.deepEqual(R.fuse(run),[]);
  assert.equal(run.owned.length,2);
});

test('selected fusion keeps full composition context and leaves unrelated recipes untouched',()=>{
  const run=R.newRun('lab');
  run.owned=[
    C.makeItem('am_buy','p1',32,32,168,44),C.makeItem('am_quantity','p2',200,32,112,44),C.makeItem('yt_sub','p3',312,32,184,44),
    C.makeItem('go_search','p4',32,200,420,44),C.makeItem('go_suggest','p5',32,244,420,84),
  ];run.nextId=6;
  const result=R.fuse(run,{pair:['p1','p3']});
  assert.equal(result.length,1);
  assert.equal(result[0].item.type,'yt_tip');
  assert.ok(run.owned.some(p=>p.id==='p2'));
  assert.ok(run.owned.some(p=>p.id==='p4'));
  assert.ok(run.owned.some(p=>p.id==='p5'));
  assert.equal(R.validateRun(run),true);
});
