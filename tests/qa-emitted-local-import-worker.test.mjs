import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isBuiltin } from 'node:module';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { reconstructLocalCode, LOCAL_CAPTURE_LIMITS } from '../src/raid/local-code.ts';
import { verifyRaidBlueprint } from '../src/raid/blueprint.ts';

// This is non-rendering production-artifact QA. Build with the real Vite config;
// observe, but do not rewrite, the worker sub-build. Execute only those emitted
// worker bytes, never the application, panel or source handler. The Node thread
// provides Web Worker message delivery, plus tripwires that cannot fetch/render.
// Client cancel/deadline/stale-result semantics belong to local-import-client
// tests: terminating this raw thread is cleanup, not proof that replies cannot race.
const bootstrap = String.raw`
import { parentPort, workerData } from 'node:worker_threads';
const listeners = [], sideEffects = [];
Object.defineProperty(globalThis, '__qaSourceRan', {
  get() { return false; }, set() { sideEffects.push('source-script'); },
});
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'importScripts', 'DOMParser', 'Image', 'eval', 'Function']) {
  Object.defineProperty(globalThis, name, { value: function () {
    sideEffects.push(name); throw Error('Unexpected source capability: ' + name);
  }, configurable: true });
}
// No Node globals are part of the browser artifact's contract.
globalThis.Buffer = undefined;
globalThis.process = undefined;
globalThis.addEventListener = (type, listener) => {
  if (type !== 'message') throw Error('Unexpected worker listener: ' + type);
  listeners.push(listener);
};
globalThis.postMessage = value => parentPort.postMessage({
  type: 'reply', value, sideEffects: [...sideEffects],
});
await import(workerData.entry);
if (listeners.length !== 1) throw Error('Expected exactly one emitted message handler');
parentPort.on('message', value => { for (const listener of listeners) listener({ data: value }); });
parentPort.postMessage({ type: 'ready', sideEffects: [...sideEffects] });
`;

const capturedAt = '2026-10-03T12:00:00.000Z';
const bytes = text => new TextEncoder().encode(text);
const buffer = text => bytes(text).buffer;
const hash = value => createHash('sha256').update(value).digest('hex');
const body = '<h1>夜の航路 café</h1><a href="https://qa-resource.invalid/nav">North</a><button>Add to cart</button>';
const link = '<link rel="stylesheet" href="./harbor.css">';
const embedded = '<style>button{background:#123456}</style>';
const sheet = '\ufeff/* 夜 🌙 */button{background:#654321}';
const source = '\ufeff<title>夜の航路 café</title>' + embedded + link + body;
const request = (html = source, extra = {}) => ({
  type: 'import-local', requestId: 17, html: buffer(html), capturedAt, ...extra,
});
const cssRequest = (html = source, css = sheet) => request(html, {
  stylesheet: { name: 'harbor.css', bytes: buffer(css) },
});
const text = asset => typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString('utf8');

function importGraph(output, entries, dynamic = false) {
  const reached = new Set();
  function visit(filename) {
    if (reached.has(filename)) return;
    const chunk = output.get(filename);
    assert.equal(chunk?.type, 'chunk', `dependency is an emitted local chunk: ${filename}`);
    reached.add(filename);
    [...chunk.imports, ...(dynamic ? chunk.dynamicImports : [])].forEach(visit);
  }
  entries.forEach(chunk => visit(chunk.fileName));
  return reached;
}

async function runWorker(directory, entry, input) {
  const worker = new Worker(pathToFileURL(join(directory, 'bootstrap.mjs')), {
    // Do not inherit the test runner's tsx loader or any source-module adapter.
    execArgv: [], workerData: { entry: pathToFileURL(join(directory, entry)).href },
  });
  let timeout;
  try {
    return await new Promise((resolve, reject) => {
      let ready = false;
      timeout = setTimeout(() => reject(Error('Emitted worker did not settle within 10 seconds')), 10000);
      worker.once('error', reject);
      worker.once('exit', code => reject(Error(`Emitted worker exited before reply (${code})`)));
      worker.on('message', message => {
        try {
          assert.deepEqual(message.sideEffects, [], 'source scripts/resources never invoke executable, network or DOM capabilities');
          if (message.type === 'ready') {
            assert.equal(ready, false);
            ready = true;
            const transfer = [];
            if (input?.html instanceof ArrayBuffer) transfer.push(input.html);
            if (input?.stylesheet?.bytes instanceof ArrayBuffer) transfer.push(input.stylesheet.bytes);
            worker.postMessage(input, transfer);
            assert.ok(transfer.every(value => value.byteLength === 0), 'real worker messaging transfers, rather than mocks, source buffers');
          } else {
            assert.equal(ready, true);
            assert.equal(message.type, 'reply');
            resolve(message.value);
          }
        } catch (error) { reject(error); }
      });
    });
  } finally {
    clearTimeout(timeout);
    await worker.terminate();
  }
}

test('QA: real emitted local-import Worker preserves inert, bounded, sealed local acquisition', async t => {
  const workerChunks = [];
  const result = await build({
    root: fileURLToPath(new URL('../', import.meta.url)), logLevel: 'silent',
    build: { write: false },
    worker: { plugins: () => [{ name: 'qa-observe-emitted-local-worker',
      generateBundle(_options, bundle) {
        workerChunks.push(...Object.values(bundle).filter(item => item.type === 'chunk'));
      },
    }] },
  });
  assert.ok(!Array.isArray(result), 'one real production client build');
  const output = new Map(result.output.map(item => [item.fileName, item]));
  const entries = result.output.filter(item => item.type === 'chunk' && item.isEntry);
  assert.ok(entries.length > 0);
  const initial = importGraph(output, entries);
  const reachable = importGraph(output, entries, true);
  const worker = workerChunks.find(chunk => Object.keys(chunk.modules).some(id => id.endsWith('/src/raid/local-import-worker.ts')));
  assert.ok(worker, 'the real Vite worker sub-build includes the local-import entry');
  const asset = output.get(worker.fileName);
  assert.equal(asset?.type, 'asset', 'worker is present in the returned production output');
  assert.equal(text(asset), worker.code, 'inspect and execute the exact bytes emitted as the worker asset');
  assert.deepEqual(worker.imports, [], 'worker has no external, Node or unmaterialized runtime imports');
  assert.deepEqual(worker.dynamicImports, [], 'worker needs no runtime dependency fetches');

  await t.test('the reachable deferred UI points to real worker bytes, with parser/server/Node code outside the UI graph', () => {
    const clientChunks = result.output.filter(item => item.type === 'chunk');
    const clientModules = clientChunks.flatMap(chunk => Object.keys(chunk.modules));
    for (const module of ['local-import-client', 'local-import-controls', 'panel']) {
      const chunk = clientChunks.find(item => Object.keys(item.modules).some(id => id.endsWith(`/src/raid/${module}.ts`)));
      assert.ok(chunk, `emitted ${module} exists`);
      assert.ok(reachable.has(chunk.fileName), `${module} is reachable from the real app entry`);
      assert.ok(!initial.has(chunk.fileName), `${module} remains outside the initial eager graph`);
    }
    const client = clientChunks.find(item => Object.keys(item.modules).some(id => id.endsWith('/src/raid/local-import-client.ts')));
    assert.ok(client.viteMetadata.importedAssets.has(worker.fileName), 'the client references this real worker asset');
    assert.ok(client.code.includes(worker.fileName.split('/').at(-1)), 'the emitted URL names this emitted artifact');
    const base = new URL(client.fileName, 'https://artifact-fixture.invalid/nested/');
    const emittedUrls = [...client.code.matchAll(/new URL\((["'`])([^"'`]+)\1,\s*import\.meta\.url\)/g)]
      .map(([, , path]) => new URL(path, base).href);
    assert.ok(emittedUrls.includes(new URL(worker.fileName, 'https://artifact-fixture.invalid/nested/').href), 'the emitted relative worker URL resolves to the actual asset, including beneath a nested deployment base');
    assert.match(client.code, /new Worker\(/, 'the production path constructs a real worker');
    for (const id of clientModules) assert.doesNotMatch(id, /\/node_modules\/(?:parse5|entities)\/|\/src\/raid\/(?:local-code|local-parser|code|code-css|code-source)\.ts$/, 'parsing is not included even in the deferred UI thread graph');
    const workerModules = Object.keys(worker.modules);
    assert.ok(workerModules.some(id => id.includes('/node_modules/parse5/')), 'the emitted worker includes the real inert parser');
    assert.ok(workerModules.some(id => id.endsWith('/src/raid/local-code.ts')));
    for (const id of [...clientModules, ...workerModules]) {
      assert.ok(!isBuiltin(id), `no Node built-in module: ${id}`);
      assert.doesNotMatch(id, /(?:^|\/)server\/|__vite[-_]browser[-_]external|^node:/, 'no server modules or browser-external stubs');
    }
    for (const chunk of [...clientChunks, worker]) {
      assert.doesNotMatch(chunk.code, /__vite[-_]browser[-_]external|\b(?:require\s*\(|process\.(?:env|versions|cwd)|Buffer\.(?:from|alloc))/, 'no emitted Node fallback/built-in use');
      for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) assert.ok(output.has(dependency), `every emitted import path resolves locally: ${dependency}`);
    }
  });

  const directory = await mkdtemp(join(tmpdir(), 'ui-raid-emitted-worker-'));
  try {
    await mkdir(dirname(join(directory, worker.fileName)), { recursive: true });
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    await writeFile(join(directory, 'bootstrap.mjs'), bootstrap);
    await writeFile(join(directory, worker.fileName), text(asset));
    assert.equal(await readFile(join(directory, worker.fileName), 'utf8'), worker.code, 'materialization preserves actual output bytes');
    const execute = input => runWorker(directory, worker.fileName, input);

    await t.test('emitted worker produces the same verified seal, UTF8 hashes and CSS cascade as the source core', async () => {
      for (const html of [source, source.replace(embedded + link, link + embedded)]) {
        const expected = await reconstructLocalCode({ html: bytes(html), stylesheet: { name: 'harbor.css', bytes: bytes(sheet) }, capturedAt });
        assert.equal(expected.ok, true, expected.error);
        const reply = await execute(cssRequest(html));
        assert.deepEqual(reply, { type: 'local-import-result', requestId: 17, result: expected });
        const result = await verifyRaidBlueprint(reply.result.value);
        assert.equal(result.ok, true, result.error);
        const value = result.value;
        assert.equal(value.source.kind, 'local-file');
        assert.equal(value.source.displayUrl, 'local://' + hash(bytes(html)));
        assert.equal(value.analysis.sourceHash, hash(bytes(html)));
        assert.deepEqual(value.analysis.css.stylesheetHashes, [hash(bytes(sheet))]);
        assert.equal(value.fidelity, 'code-approximation');
        assert.equal(value.extractorVersion, 'code-v1');
        assert.ok(value.components.every(component => component.sourceRect === null));
        assert.equal(value.components.find(component => component.evidence === 'purchase').appearance.background, html === source ? '#654321' : '#123456');
        assert.doesNotMatch(JSON.stringify(value), /harbor\.css|qa-resource\.invalid|<script|<link/);
      }
    });

    await t.test('source scripts, source markup and resource URLs stay inert inside the actual emitted worker', async () => {
      const html = `<title>Fictional Harbor</title><base href="https://qa-resource.invalid/">
        <meta http-equiv="refresh" content="0;url=https://qa-resource.invalid/refresh">
        <link rel="stylesheet" href="https://qa-resource.invalid/remote.css">
        <script>globalThis.__qaSourceRan=true;fetch('https://qa-resource.invalid/script')</script>
        <script type="module" src="https://qa-resource.invalid/module.js"></script>
        <iframe src="https://qa-resource.invalid/frame"><h1>Frame secret</h1></iframe>
        <object data="https://qa-resource.invalid/object">Object secret</object>
        <template><h1>Template secret</h1></template><svg><text>SVG secret</text></svg>
        <img src="https://qa-resource.invalid/image" onerror="globalThis.__qaSourceRan=true">
        <input value="private-secret">${link}${body}`;
      const css = '@import url(https://qa-resource.invalid/import.css);@font-face{font-family:secret;src:url(https://qa-resource.invalid/font)}button{background:#654321;background-image:url(https://qa-resource.invalid/image)}';
      const expected = await reconstructLocalCode({ html: bytes(html), stylesheet: { name: 'harbor.css', bytes: bytes(css) }, capturedAt });
      assert.equal(expected.ok, true, expected.error);
      const reply = await execute(cssRequest(html, css));
      assert.deepEqual(reply.result, expected);
      assert.equal((await verifyRaidBlueprint(reply.result.value)).ok, true);
      assert.doesNotMatch(JSON.stringify(reply), /qa-resource\.invalid|private-secret|Frame secret|Object secret|Template secret|SVG secret|__qaSourceRan|harbor\.css/);
    });

    await t.test('malformed, invalid UTF8 and parser/input-budget failures return bounded safe errors', async () => {
      const cases = [
        ['null envelope', null, 'invalid-local-request'],
        ['unapproved fields', request(source, { filename: 'private-name.html' }), 'invalid-local-request'],
        ['wrong input type', request(source, { html: '<h1>Not raw bytes</h1>' }), 'invalid-local-request'],
        ['wrong timestamp', request(source, { capturedAt: 'not-a-date' }), 'invalid-local-request'],
        ['HTML over byte cap', request(source, { html: new ArrayBuffer(LOCAL_CAPTURE_LIMITS.htmlBytes + 1) }), 'invalid-local-request'],
        ['CSS over byte cap', request(source, { stylesheet: { name: 'harbor.css', bytes: new ArrayBuffer(LOCAL_CAPTURE_LIMITS.cssBytes + 1) } }), 'invalid-local-request'],
        ['malformed HTML UTF8', request(source, { html: new Uint8Array([0xc0, 0xaf]).buffer }), 'invalid-utf8'],
        ['malformed CSS UTF8', request(source, { stylesheet: { name: 'harbor.css', bytes: new Uint8Array([0xe2, 0x82]).buffer } }), 'invalid-utf8'],
        ['CSS path', request(source, { stylesheet: { name: '../harbor.css', bytes: buffer(sheet) } }), 'invalid-stylesheet-name'],
        ['unmatched CSS', cssRequest(source.replace('./harbor.css', 'different.css')), 'stylesheet-unmatched'],
        ['duplicate CSS', cssRequest(link + source), 'stylesheet-ambiguous'],
        ['combined CSS cap', cssRequest(source, ' '.repeat(LOCAL_CAPTURE_LIMITS.cssBytes)), 'source-too-large'],
        ['HTML nesting cap', request('<div>'.repeat(65) + body + '</div>'.repeat(65)), 'source-too-large'],
        ['inert template node cap', request('<template>' + '<i></i>'.repeat(20000) + '</template>' + body), 'source-too-large'],
        ['script-only shell', request('<script>globalThis.__qaSourceRan=true;document.write("<h1>Generated</h1>")</script>'), 'no-playable-elements'],
      ];
      for (const [label, input, code] of cases) {
        const reply = await execute(input);
        assert.deepEqual(Object.keys(reply).sort(), ['requestId', 'result', 'type'], label);
        assert.equal(reply.type, 'local-import-result', label);
        assert.equal(reply.requestId, input === null ? 0 : 17, label);
        assert.deepEqual(Object.keys(reply.result).sort(), ['code', 'error', 'ok'], label);
        assert.equal(reply.result.ok, false, label);
        assert.equal(reply.result.code, code, label);
        assert.match(reply.result.code, /^[a-z0-9-]{1,64}$/, label);
        assert.ok(reply.result.error.length > 0 && reply.result.error.length <= 500, label);
        assert.doesNotMatch(reply.result.error, /[\u0000-\u001f\u007f]|private-name|harbor\.css|qa-resource\.invalid|__qaSourceRan|Error:|\bat .*:\d+/, label);
        assert.ok(Buffer.byteLength(JSON.stringify(reply)) < 2000, label);
      }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
