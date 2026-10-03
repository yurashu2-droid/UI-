import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { build } from 'vite';
import D from '../src/data.js';
import C from '../src/document.js';
import { SITE_TEMPLATES } from '../src/catalog/index.js';
import { arenaCatalogDefinition, fingerprintJson } from '../src/online/catalog.js';
import { createFixtureRaid } from '../src/raid/fixtures.js';
import { createRaidEnemy, verifyRaidBlueprint } from '../src/raid/blueprint.js';

const hash = value => createHash('sha256')
  .update(JSON.stringify(value, (_key, item) => item instanceof Set ? [...item] : item))
  .digest('hex');
const registryUrl = new URL('../src/part-registry.ts', import.meta.url);

// Recorded before extraction: every field and its order, including descriptions
// and legacy replay tags, rather than a reduced combat-only projection.
test('shared registry keeps all 82 definitions, field order, identity and freezing', async () => {
  assert.ok(existsSync(registryUrl), 'the shared registry must exist separately from the template facade');
  const { PARTS, WIDTH, HEIGHT, LOAD_LIMIT } = await import(registryUrl.href);
  assert.strictEqual(PARTS, D.PARTS, 'the facade reuses the one registry instance');
  assert.equal(Object.keys(PARTS).length, 82);
  assert.equal(hash(PARTS), 'a949b4d8aa8f8b8b55f60fb827bb8e5c21f62219fccbc6da05fdd570189f5fb6');
  assert.deepEqual([WIDTH, HEIGHT, LOAD_LIMIT], [960, 680, 56]);
  assert.deepEqual([D.WIDTH, D.HEIGHT, D.LOAD_LIMIT], [WIDTH, HEIGHT, LOAD_LIMIT]);
  assert.ok(Object.isFrozen(PARTS));
  for (const [id, definition] of Object.entries(PARTS)) {
    assert.strictEqual(definition, D.PARTS[id], id);
    assert.ok(Object.isFrozen(definition), id);
    assert.ok(Object.isFrozen(definition.tags), `${id} tags`);
    if (definition.replayTags) assert.ok(Object.isFrozen(definition.replayTags), `${id} replayTags`);
  }
});

test('data facade preserves API order, constants, existing templates and gameplay fingerprint', async () => {
  assert.deepEqual(Object.keys(D), [
    'FACTIONS', 'PARTS', 'ENEMIES', 'PRESETS', 'STARTER', 'SKINS', 'SKINNABLE',
    'ADMIN', 'ADMIN_SLOTS', 'WIDTH', 'HEIGHT', 'LOAD_LIMIT', 'MAX_ITEMS', 'VERSION',
  ]);
  for (const [key, value] of [['WIDTH', 960], ['HEIGHT', 680], ['LOAD_LIMIT', 56]]) {
    assert.deepEqual(Object.getOwnPropertyDescriptor(D, key), {
      value, writable: true, enumerable: true, configurable: true,
    }, `${key} remains a plain facade data property`);
  }
  assert.equal(hash(D.ENEMIES), 'b68fcb8299863fa241caabdc7952a282648a12ce6c1f350a7f0241497df88774');
  assert.equal(hash(D.PRESETS), '12ad4f6eaea48b155f8397719d777765ddd5b004088a3b35bda866f80674cf60');
  assert.equal(hash(SITE_TEMPLATES.slice(0, 28)), 'f785ead593679902127ccc2b2bcbe777161746ededfc781f34923c5a9c541b89');
  assert.equal(await fingerprintJson(arenaCatalogDefinition()), '5ae7f15b99800961281723849d5c74b681c7cff3b6f4d92879f9be6323db6ece');
});

test('shared registry preserves real geometry for every definition and board-edge rejection', () => {
  const geometry = Object.keys(D.PARTS).map((type, index) => {
    const item = C.makeItem(type, 'p' + index, 32, 24);
    return {
      item,
      analysis: C.analyze([item]),
      boundary: C.canPlace([], item, D.WIDTH - item.w, D.HEIGHT - item.h),
      overflow: C.canPlace([], item, D.WIDTH - item.w + 1, D.HEIGHT - item.h),
    };
  });
  assert.equal(hash(geometry), '9d8c2a104d3c3690ace69c49449e1afa91ec68dd4e9ffd5ff6068d9a065bab3d');
  for (const { item, boundary, overflow } of geometry) {
    assert.equal(boundary, true, item.type);
    assert.equal(overflow, false, item.type);
    assert.equal(C.canPlace([], item, D.WIDTH - item.w, D.HEIGHT - item.h + 1), false, item.type);
  }
});

test('shared registry preserves complete archive and commerce blueprint seals and real placement', async () => {
  for (const [id, digest] of [
    ['archive', 'de95821fe9051ee8bf94188343b55bdc46e8eea382010053c8eb801ef7e14dc2'],
    ['commerce', '4f2542574521f0681beafae3dfc363feb8e459cc0b95612bff03b0f26cd39adc'],
  ]) {
    const blueprint = await createFixtureRaid(id);
    assert.equal(hash(blueprint), digest, id);
    assert.equal((await verifyRaidBlueprint(blueprint)).ok, true, id);
    const board = createRaidEnemy(blueprint);
    assert.ok(C.analyze(board).load <= D.LOAD_LIMIT, id);
    for (const item of board) assert.ok(C.canPlace(board, item, item.x, item.y), item.type);
  }
});

function importGraph(output, entries, dynamic = false) {
  const reached = new Set();
  function visit(filename) {
    if (reached.has(filename)) return;
    const chunk = output.get(filename);
    assert.equal(chunk?.type, 'chunk', `local emitted dependency ${filename}`);
    reached.add(filename);
    [...chunk.imports, ...(dynamic ? chunk.dynamicImports : [])].forEach(visit);
  }
  entries.forEach(entry => visit(entry.fileName));
  return reached;
}

// Observe the actual production worker sub-build without source transformation,
// browser, timing claim, or dist writes. Transitive imports matter here.
test('emitted local parser worker excludes template registry and keeps parse5 outside the client graph', async t => {
  const workerChunks = [];
  const result = await build({
    root: fileURLToPath(new URL('../', import.meta.url)), logLevel: 'silent',
    build: { write: false },
    worker: { plugins: () => [{ name: 'observe-part-registry-worker',
      generateBundle(_options, bundle) {
        workerChunks.push(...Object.values(bundle).filter(item => item.type === 'chunk'));
      },
    }] },
  });
  assert.ok(!Array.isArray(result));
  const output = new Map(result.output.map(item => [item.fileName, item]));
  const chunks = result.output.filter(item => item.type === 'chunk');
  const entries = chunks.filter(item => item.isEntry);
  assert.ok(entries.length > 0);
  const initial = importGraph(output, entries);
  const reachable = importGraph(output, entries, true);
  const worker = workerChunks.find(chunk => Object.keys(chunk.modules).some(id => id.endsWith('/src/raid/local-import-worker.ts')));
  assert.ok(worker, 'actual local parser worker is emitted');
  const asset = output.get(worker.fileName);
  assert.equal(asset?.type, 'asset');
  assert.equal(typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString('utf8'), worker.code);
  assert.deepEqual(worker.imports, []);
  assert.deepEqual(worker.dynamicImports, []);
  const workerModules = Object.keys(worker.modules);
  const clientModules = chunks.flatMap(chunk => Object.keys(chunk.modules));
  const initialChunks = chunks.filter(chunk => initial.has(chunk.fileName));
  t.diagnostic(JSON.stringify({
    worker: { bytes: Buffer.byteLength(worker.code), gzip: gzipSync(worker.code).length,
      brotli: brotliCompressSync(worker.code).length, modules: workerModules.length,
      templateModules: workerModules.filter(id => /-templates\.ts$/.test(id)).length },
    initial: { requests: initialChunks.length,
      bytes: initialChunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0),
      gzip: initialChunks.reduce((sum, chunk) => sum + gzipSync(chunk.code).length, 0) },
    css: result.output.filter(item => item.fileName.endsWith('.css')).map(item => ({ file: item.fileName, bytes: Buffer.byteLength(item.source) })),
  }));
  for (const id of workerModules) {
    assert.doesNotMatch(id, /\/src\/data\.ts$|\/src\/catalog\/(?:index|[^/]+-templates)\.ts$/, 'worker must not retain the site-template facade');
  }
  for (const suffix of ['/src/part-registry.ts', '/src/document.ts', '/src/raid/blueprint.ts']) {
    assert.equal(workerModules.filter(id => id.endsWith(suffix)).length, 1, `one worker module ${suffix}`);
    assert.equal(clientModules.filter(id => id.endsWith(suffix)).length, 1, `one shared client module ${suffix}`);
  }
  assert.ok(workerModules.some(id => id.includes('/node_modules/parse5/')), 'real parser remains in its worker');
  assert.ok(clientModules.some(id => id.endsWith('/src/catalog/index.ts')), 'site templates remain available to the UI');
  assert.ok(clientModules.some(id => /\/src\/catalog\/[^/]+-templates\.ts$/.test(id)));
  for (const id of clientModules) {
    assert.doesNotMatch(id, /\/node_modules\/(?:parse5|entities)\/|\/src\/raid\/(?:local-code|local-parser|code|code-css|code-source)\.ts$/, 'parser stays outside eager and deferred UI chunks');
  }
  const client = chunks.find(chunk => Object.keys(chunk.modules).some(id => id.endsWith('/src/raid/local-import-client.ts')));
  assert.ok(client && reachable.has(client.fileName));
  assert.ok(!initial.has(client.fileName), 'worker client stays deferred until local import UI is requested');
  assert.ok(client.viteMetadata.importedAssets.has(worker.fileName), 'deferred client references this exact worker artifact');
});
