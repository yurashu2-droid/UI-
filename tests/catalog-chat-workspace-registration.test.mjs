import {withOriginalReleaseTeaching} from './helpers/original-release-teaching.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import D from '../src/data.js';
import R from '../src/run.js';
import C from '../src/document.js';
import V from '../src/components.js';
import { SITE_TEMPLATES } from '../src/catalog/index.js';
import { factionSetView } from '../src/app-guidance.js';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('chat workspace appends to existing opponent and template indices without changing any combat definition', () => {
  const enemies = R.labEnemies();
  assert.equal(hash(withOriginalReleaseTeaching(enemies.slice(0, 39),29)), '755dae8bbacabe6544bc4308df396ea233a6b0abd4b3e1c232b170c9eb891e88');
  assert.equal(hash(withOriginalReleaseTeaching(SITE_TEMPLATES.slice(0, 25),15)), '4cffc1fbfda4a601f6359aa28fc214decb783d77066309b993e4f553c41b9819');
  assert.equal(hash(D.PARTS), 'a949b4d8aa8f8b8b55f60fb827bb8e5c21f62219fccbc6da05fdd570189f5fb6');
  assert.equal(enemies[39]?.id, 'site_slack');
  assert.equal(SITE_TEMPLATES[25]?.id, 'site_slack');
  assert.equal(SITE_TEMPLATES.filter(t => t.id === 'site_slack').length, 1);
});

test('chat workspace remains a lab template and retains selected opponent and movable parts through ordinary saves', () => {
  const run = R.newRun('lab', 'site_slack');
  assert.equal(run.page.templateId, 'site_slack');
  assert.equal(run.page.theme, 'chatworkspace');
  assert.equal(run.owned.length, 4);
  const breadcrumb = run.owned.find(p => p.type === 'gov_breadcrumb');
  assert.equal(R.move(run, breadcrumb.id, 648, 228), true);
  assert.equal(R.move(run, breadcrumb.id, 208, 316), true);
  run.stage = 39;
  const restored = JSON.parse(JSON.stringify(run));
  assert.equal(R.validateRun(restored), true);
  assert.equal(R.opponent(restored).id, 'site_slack');
  assert.deepEqual(R.pageDecor(restored), SITE_TEMPLATES[25].decor);
  const shape = parts => parts.map(p => [p.type, p.x, p.y, p.w, p.h, p.label]);
  assert.deepEqual(shape(R.enemyBoard(restored)), shape(restored.owned));
  assert.ok(restored.owned.every(p => C.canPlace(restored.owned, p, p.x, p.y, p.w, p.h)));
  assert.deepEqual(R.newRun('campaign', 'site_slack').owned, []);
});

test('chat workspace supplies original static chrome without creating a faction bonus or shop parts', () => {
  assert.match(V.header('chatworkspace'), /SIDECHANNEL/);
  assert.match(D.FACTIONS.chatworkspace?.set ?? '', /追加補正なし/);
  assert.equal(factionSetView('chatworkspace', 3).active, false);
  assert.equal(Object.values(D.PARTS).filter(p => p.faction === 'chatworkspace').length, 0);
  assert.equal(Object.values(D.PARTS).filter(p => p.status === 'experimental').length, 28);
  assert.match(readFileSync(new URL('../src/styles/catalog.css', import.meta.url), 'utf8'), /@import ["']\.\.\/catalog\/chat-workspace\.css["'];/);
  assert.match(readFileSync(new URL('../src/components.ts', import.meta.url), 'utf8'), /chatWorkspaceDecor\(kind\)/);
});
