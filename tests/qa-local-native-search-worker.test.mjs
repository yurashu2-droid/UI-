import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { build } from "vite";
import { IDBFactory } from "fake-indexeddb";
import R from "../src/run.js";
import { prepareRaidChallenge } from "../src/raid-challenge.js";
import { createProfileStore } from "../src/profile-store.js";
import {
  prepareRaidRewards,
  verifyRaidBlueprint,
} from "../src/raid/blueprint.js";
import { reconstructLocalCode } from "../src/raid/local-code.js";

// The exact same HTML/CSS was captured with snapshot-1758 before this feature.
// Keep those genuine persisted bytes here; never generate the legacy result
// with the new parser, and never reseal it when testing archive coexistence.
const fixture = {
  html: '<title>Search lab</title><h1>Find notes</h1><link rel="stylesheet" href="query.css"><search class="lookup"><input type="search" value="PRIVATE QUERY" placeholder="PRIVATE PLACEHOLDER" oninput="globalThis.__searchSourceRan=true"></search><input type="SEARCH" value="PRIVATE STANDALONE"><form action="https://resource.invalid/send"><input type="password" value="PRIVATE PASSWORD"></form><script>globalThis.__searchSourceRan=true;fetch("https://resource.invalid/script")</script><iframe src="https://resource.invalid/frame"></iframe><img src="https://resource.invalid/image">',
  css: 'search{background:rgb(18 52 86);color:#fedcba} input{border:2px solid #654321} @import "https://resource.invalid/import"; search{background-image:url(https://resource.invalid/image)}',
  capturedAt: "2026-10-03T03:20:00.000Z",
  legacy: {
    schemaVersion: 1,
    extractorVersion: "code-v1",
    mapperVersion: "canonical-v1",
    viewport: { width: 960, height: 680 },
    source: {
      kind: "local-file",
      name: "Search lab",
      displayUrl:
        "local://e1a9e1e67e3c7e37b4b7f56a12da2e143e1c4d927b3b93cdc5a092c94c479a56",
      capturedAt: "2026-10-03T03:20:00.000Z",
    },
    fidelity: "code-approximation",
    analysis: {
      sourceHash:
        "e1a9e1e67e3c7e37b4b7f56a12da2e143e1c4d927b3b93cdc5a092c94c479a56",
      layout: "inferred-flow",
      confidence: "low",
      styles: "safe-css-subset-v1",
      css: {
        rules: 2,
        limited: false,
        stylesheetHashes: [
          "a842596048cf8b97a5c89eb1860c1dc5e1a1d22a73533fac60dcf33b3087cfc7",
        ],
      },
      candidateCount: 1,
      selectedCount: 1,
      omitted: ["unsupported-css", "images", "scripts"],
    },
    warnings: [
      "コード解析による近似配置です。取得したHTMLのタグ・名前・商品構造から戦闘用に配置しました。",
      "色・文字・余白・枠線・角丸は限定したCSSから反映。CSSの完全な計算、画像・動画・JavaScriptには対応していません。",
      "元ページの寸法を測定していません。回収できるのは、この近似再構成で表示したUIです。",
    ],
    background: "#eef2f4",
    decor: [
      {
        kind: "rect",
        rect: { x: 0, y: 0, w: 960, h: 84 },
        fill: "#233d4c",
        borderColor: "#233d4c",
        borderWidth: 0,
        radius: 0,
      },
      {
        kind: "text",
        rect: { x: 28, y: 18, w: 904, h: 34 },
        text: "Search lab",
        size: 24,
        color: "#ffffff",
        font: "sans",
        weight: "normal",
        align: "left",
      },
      {
        kind: "text",
        rect: { x: 28, y: 56, w: 904, h: 22 },
        text: "ローカルHTML / コード解析による近似配置",
        size: 12,
        color: "#c2d8e2",
        font: "sans",
        weight: "normal",
        align: "left",
      },
    ],
    components: [
      {
        componentId: "component-00",
        canonicalType: "ab_heading",
        sourceRect: null,
        combatRect: { x: 28, y: 124, w: 432, h: 52 },
        sourceNode: {
          tag: "h1",
          path: "document/html[0]/body[1]/h1[0]",
          order: 6,
          group: 0,
          classes: [],
        },
        evidence: "heading",
        appearanceId:
          "appearance_41d0c89cf181ed2271afa854c0b4dca4b4e822e210022c61b5fd2ce7ee4ec6ec",
        appearance: {
          width: 432,
          height: 52,
          background: "#ffffff",
          primitives: [
            {
              kind: "rect",
              rect: { x: 0, y: 0, w: 432, h: 52 },
              fill: "#ffffff",
              borderColor: "#b6c5cd",
              borderWidth: 1,
              radius: 0,
            },
            {
              kind: "text",
              rect: { x: 12, y: 8, w: 408, h: 36 },
              text: "Find notes",
              size: 22,
              color: "#263b4a",
              font: "sans",
              weight: "normal",
              align: "left",
            },
          ],
        },
      },
    ],
    captureId:
      "capture_bfeeceded347ff6913e9507c45c84735c69453b33c2d6772f5d97ea285b69dc8",
  },
};

const bytes = (text) => new TextEncoder().encode(text);
const hash = (text) => createHash("sha256").update(text).digest("hex");
const bootstrap = String.raw`
import { parentPort, workerData } from 'node:worker_threads';
const listeners = [], sideEffects = [];
Object.defineProperty(globalThis, '__searchSourceRan', {
  get() { return false; }, set() { sideEffects.push('source-script'); },
});
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'importScripts', 'DOMParser', 'Image', 'eval', 'Function']) {
  Object.defineProperty(globalThis, name, { value: function () {
    sideEffects.push(name); throw Error('Unexpected source capability: ' + name);
  }, configurable: true });
}
globalThis.Buffer = undefined;
globalThis.process = undefined;
globalThis.addEventListener = (type, listener) => {
  if (type !== 'message') throw Error('Unexpected worker listener');
  listeners.push(listener);
};
globalThis.postMessage = value => parentPort.postMessage({ value, sideEffects });
await import(workerData.entry);
if (listeners.length !== 1) throw Error('Expected one production worker handler');
parentPort.on('message', value => {
  for (const listener of listeners) listener({ data: value });
});
parentPort.postMessage({ ready: true, sideEffects });
`;

// Node message delivery and fake-indexeddb adapt browser APIs. We execute the
// actual Vite-emitted Worker, actual seal, engine, claim and archive functions;
// this is not browser interaction, native file-picker or visual acceptance.
test("native search survives emitted Worker real victory single claim and immutable archive coexistence", async () => {
  const observed = [];
  const built = await build({
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "silent",
    build: { write: false },
    worker: {
      plugins: () => [
        {
          name: "qa-observe-native-search-worker",
          generateBundle(_options, bundle) {
            observed.push(
              ...Object.values(bundle).filter((item) => item.type === "chunk"),
            );
          },
        },
      ],
    },
  });
  assert.ok(!Array.isArray(built));
  const chunk = observed.find((item) =>
    Object.keys(item.modules).some((id) =>
      id.endsWith("/src/raid/local-import-worker.ts"),
    ),
  );
  assert.ok(chunk, "the real application build emits the local-import worker");
  const asset = built.output.find((item) => item.fileName === chunk.fileName);
  assert.equal(asset.type, "asset");
  const emitted =
    typeof asset.source === "string"
      ? asset.source
      : Buffer.from(asset.source).toString("utf8");
  assert.equal(emitted, chunk.code);
  assert.deepEqual(chunk.imports, []);
  assert.deepEqual(chunk.dynamicImports, []);
  assert.ok(
    Object.keys(chunk.modules).some((id) =>
      id.endsWith("/src/raid/local-native-search.ts"),
    ),
  );
  const directory = await mkdtemp(join(tmpdir(), "ui-raid-native-search-"));
  let worker, timer;
  try {
    await mkdir(dirname(join(directory, chunk.fileName)), { recursive: true });
    await writeFile(join(directory, "package.json"), '{"type":"module"}');
    await writeFile(join(directory, chunk.fileName), emitted);
    await writeFile(join(directory, "bootstrap.mjs"), bootstrap);
    worker = new Worker(pathToFileURL(join(directory, "bootstrap.mjs")), {
      execArgv: [],
      workerData: {
        entry: pathToFileURL(join(directory, chunk.fileName)).href,
      },
    });
    const result = await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(Error("emitted search worker timeout")),
        10000,
      );
      worker.once("error", reject);
      worker.once("exit", (code) =>
        reject(Error(`early worker exit: ${code}`)),
      );
      worker.on("message", (message) => {
        try {
          assert.deepEqual(
            message.sideEffects,
            [],
            "zero source execution, source network, or source DOM calls",
          );
          if (message.ready) {
            const html = bytes(fixture.html).buffer,
              css = bytes(fixture.css).buffer;
            worker.postMessage(
              {
                type: "import-local",
                requestId: 18,
                html,
                capturedAt: fixture.capturedAt,
                stylesheet: { name: "query.css", bytes: css },
              },
              [html, css],
            );
            assert.equal(html.byteLength, 0);
            assert.equal(css.byteLength, 0);
          } else resolve(message.value);
        } catch (error) {
          reject(error);
        }
      });
    });
    assert.equal(result.type, "local-import-result");
    assert.equal(result.requestId, 18);
    assert.equal(result.result.ok, true, result.result.error);
    const fresh = result.result.value;
    assert.deepEqual(
      result.result,
      await reconstructLocalCode({
        html: bytes(fixture.html),
        capturedAt: fixture.capturedAt,
        stylesheet: { name: "query.css", bytes: bytes(fixture.css) },
      }),
    );
    assert.equal((await verifyRaidBlueprint(fresh)).ok, true);
    assert.equal((await verifyRaidBlueprint(fixture.legacy)).ok, true);
    assert.equal(
      fresh.source.displayUrl,
      "local://" + hash(bytes(fixture.html)),
    );
    assert.equal(fresh.analysis.sourceHash, fixture.legacy.analysis.sourceHash);
    assert.deepEqual(fresh.analysis.css.stylesheetHashes, [
      hash(bytes(fixture.css)),
    ]);
    assert.notEqual(
      fresh.captureId,
      fixture.legacy.captureId,
      "newly eligible local controls change only fresh capture identity",
    );
    assert.deepEqual(
      fresh.components.map((c) => c.evidence),
      ["heading", "search", "search"],
    );
    assert.deepEqual(fresh.components[0], fixture.legacy.components[0]);
    assert.equal(fresh.components[1].appearance.background, "#123456");
    assert.equal(
      fresh.components[2].appearance.primitives[0].borderColor,
      "#654321",
    );
    assert.ok(fresh.components.every((c) => c.sourceRect === null));
    assert.doesNotMatch(
      JSON.stringify(fresh),
      /PRIVATE|resource\.invalid|query\.css|__searchSourceRan|<input|<script/,
    );

    const store = createProfileStore(new IDBFactory(), "native-search-source");
    const destination = createProfileStore(
      new IDBFactory(),
      "native-search-restored",
    );
    const run = R.newRun("lab"),
      runBefore = JSON.stringify(run);
    const legacyBytes = JSON.stringify(fixture.legacy);
    const claimVictory = async (blueprint, evidence) => {
      const prepared = prepareRaidChallenge(run, blueprint);
      for (let i = 0; i < 1201 && !prepared.battle.result; i++)
        prepared.battle.step(0.05);
      assert.equal(prepared.battle.result?.winner, "player");
      const reward = prepareRaidRewards(
        prepared.blueprint,
        prepared.battleId,
      ).find(
        (r) =>
          blueprint.components.find((c) => c.componentId === r.componentId)
            ?.evidence === evidence,
      );
      assert.ok(reward);
      await assert.rejects(
        () => store.claimRaidReward(run, reward, prepared.blueprint),
        /勝利/,
      );
      await store.recordRaidVictory(prepared.blueprint, prepared.battleId);
      const claim = await store.claimRaidReward(
        run,
        reward,
        prepared.blueprint,
        { writeRunProfile: false },
      );
      assert.equal(claim.created, true);
      assert.equal(
        (await store.claimRaidReward(run, reward, prepared.blueprint)).created,
        false,
      );
      return claim.trophy;
    };
    await claimVictory(fixture.legacy, "heading");
    const oldArchive = await store.exportCollectionBackup();
    const trophy = await claimVictory(fresh, "search");
    assert.equal(trophy.item.type, "go_search");
    assert.equal(trophy.item.appearanceId, fresh.components[1].appearanceId);
    assert.equal(JSON.stringify(run), runBefore);
    assert.equal(
      JSON.stringify(await store.getBlueprint(fixture.legacy.captureId)),
      legacyBytes,
    );
    assert.equal((await store.listPendingRaids()).length, 0);
    const exported = await store.exportCollectionBackup();
    assert.equal(exported.captureCount, 2);
    assert.equal(exported.trophyCount, 2);
    assert.equal(
      JSON.stringify(
        JSON.parse(exported.text).captures.find(
          (b) => b.captureId === fixture.legacy.captureId,
        ),
      ),
      legacyBytes,
    );
    const checked = await destination.inspectCollectionBackup(exported.text);
    assert.equal(checked.addCount, 2);
    assert.deepEqual(checked.conflicts, []);
    assert.deepEqual(
      await destination.restoreCollectionBackup(checked.candidate),
      { added: 2, unchanged: 0 },
    );
    assert.equal(
      JSON.stringify(await destination.getBlueprint(fixture.legacy.captureId)),
      legacyBytes,
    );
    assert.deepEqual(await destination.getBlueprint(fresh.captureId), fresh);
    assert.deepEqual(
      await destination.listTrophies(),
      await store.listTrophies(),
    );
    const older = await destination.inspectCollectionBackup(oldArchive.text);
    assert.equal(older.unchangedCount, 1);
    assert.equal(older.addCount, 0);
    assert.deepEqual(older.conflicts, []);
    assert.deepEqual(
      await destination.restoreCollectionBackup(older.candidate),
      { added: 0, unchanged: 1 },
    );
    assert.deepEqual(await destination.getBlueprint(fresh.captureId), fresh);
  } finally {
    clearTimeout(timer);
    if (worker) await worker.terminate();
    await rm(directory, { recursive: true, force: true });
  }
});
