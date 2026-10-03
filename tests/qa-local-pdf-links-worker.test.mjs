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

// Genuine saved bytes captured before the PDF hint classifier was added.
// Do not recreate or reseal this old navigation capture with the new analyzer.
const fixture = {
  html: '<title>Document lab</title><h1>Library</h1><link rel="stylesheet" href="links.css"><a class="guide" href="https://resource.invalid/private-guide.PDF?token=PRIVATE#page=2" download="PRIVATE-DOWNLOAD.pdf" type="application/pdf" title="PRIVATE TITLE" aria-label="PRIVATE ARIA" onclick="globalThis.__pdfSourceRan=true">Read the guide</a><input type="search" value="PRIVATE QUERY"><input type="button" value="Buy paper"><script>globalThis.__pdfSourceRan=true;fetch("https://resource.invalid/script")</script><iframe src="https://resource.invalid/frame"></iframe><img src="https://resource.invalid/image">',
  css: 'a{background:rgb(18 52 86);color:#fedcba;border:2px solid #654321} @import "https://resource.invalid/import"; a{background-image:url(https://resource.invalid/image)}',
  capturedAt: "2026-10-03T03:20:00.000Z",
  legacy: {
    schemaVersion: 1,
    extractorVersion: "code-v1",
    mapperVersion: "canonical-v1",
    viewport: {
      width: 960,
      height: 680,
    },
    source: {
      kind: "local-file",
      name: "Document lab",
      displayUrl:
        "local://bdce1a4f14e4403061e23922557d4389296c56913206fa31cb483ef270c86980",
      capturedAt: "2026-10-03T03:20:00.000Z",
    },
    fidelity: "code-approximation",
    analysis: {
      sourceHash:
        "bdce1a4f14e4403061e23922557d4389296c56913206fa31cb483ef270c86980",
      layout: "inferred-flow",
      confidence: "low",
      styles: "safe-css-subset-v1",
      css: {
        rules: 1,
        limited: false,
        stylesheetHashes: [
          "4d7ccdeb1be5e3a82d00b1aa2c78090809820dac072bf77a73304c9a41c73764",
        ],
      },
      candidateCount: 4,
      selectedCount: 4,
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
        rect: {
          x: 0,
          y: 0,
          w: 960,
          h: 84,
        },
        fill: "#233d4c",
        borderColor: "#233d4c",
        borderWidth: 0,
        radius: 0,
      },
      {
        kind: "text",
        rect: {
          x: 28,
          y: 18,
          w: 904,
          h: 34,
        },
        text: "Document lab",
        size: 24,
        color: "#ffffff",
        font: "sans",
        weight: "normal",
        align: "left",
      },
      {
        kind: "text",
        rect: {
          x: 28,
          y: 56,
          w: 904,
          h: 22,
        },
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
        combatRect: {
          x: 28,
          y: 124,
          w: 432,
          h: 52,
        },
        sourceNode: {
          tag: "h1",
          path: "document/html[0]/body[1]/h1[0]",
          order: 6,
          group: 0,
          classes: [],
        },
        evidence: "heading",
        appearanceId:
          "appearance_e3b7cffb2839a6943f8a05007462721ba9db2ed5b9b07abff42e6c3bcaa22836",
        appearance: {
          width: 432,
          height: 52,
          background: "#ffffff",
          primitives: [
            {
              kind: "rect",
              rect: {
                x: 0,
                y: 0,
                w: 432,
                h: 52,
              },
              fill: "#ffffff",
              borderColor: "#b6c5cd",
              borderWidth: 1,
              radius: 0,
            },
            {
              kind: "text",
              rect: {
                x: 12,
                y: 8,
                w: 408,
                h: 36,
              },
              text: "Library",
              size: 22,
              color: "#263b4a",
              font: "sans",
              weight: "normal",
              align: "left",
            },
          ],
        },
      },
      {
        componentId: "component-01",
        canonicalType: "ab_nav",
        sourceRect: null,
        combatRect: {
          x: 500,
          y: 124,
          w: 432,
          h: 44,
        },
        sourceNode: {
          tag: "a",
          path: "document/html[0]/body[1]/a[2]",
          order: 9,
          group: 0,
          classes: ["guide"],
        },
        evidence: "navigation",
        appearanceId:
          "appearance_3523e04a32e77c469ed7b8e87988328e1f8ab7610324aab691d290beef845790",
        appearance: {
          width: 432,
          height: 44,
          background: "#123456",
          primitives: [
            {
              kind: "rect",
              rect: {
                x: 0,
                y: 0,
                w: 432,
                h: 44,
              },
              fill: "#123456",
              borderColor: "#654321",
              borderWidth: 2,
              radius: 0,
            },
            {
              kind: "text",
              rect: {
                x: 12,
                y: 8,
                w: 408,
                h: 28,
              },
              text: "Read the guide",
              size: 16,
              color: "#fedcba",
              font: "sans",
              weight: "normal",
              align: "left",
            },
          ],
        },
      },
      {
        componentId: "component-02",
        canonicalType: "go_search",
        sourceRect: null,
        combatRect: {
          x: 28,
          y: 210,
          w: 432,
          h: 44,
        },
        sourceNode: {
          tag: "input",
          path: "document/html[0]/body[1]/input[3]",
          order: 11,
          group: 0,
          classes: [],
        },
        evidence: "search",
        appearanceId:
          "appearance_7aebe8475c49b5af04ee725246e9a3191e69c91050bc2867a46d76dfd2c49bd7",
        appearance: {
          width: 432,
          height: 44,
          background: "#ffffff",
          primitives: [
            {
              kind: "rect",
              rect: {
                x: 0,
                y: 0,
                w: 432,
                h: 44,
              },
              fill: "#ffffff",
              borderColor: "#b6c5cd",
              borderWidth: 1,
              radius: 0,
            },
            {
              kind: "text",
              rect: {
                x: 12,
                y: 8,
                w: 408,
                h: 28,
              },
              text: "検索",
              size: 16,
              color: "#263b4a",
              font: "sans",
              weight: "normal",
              align: "left",
            },
          ],
        },
      },
      {
        componentId: "component-03",
        canonicalType: "am_buy",
        sourceRect: null,
        combatRect: {
          x: 500,
          y: 210,
          w: 432,
          h: 44,
        },
        sourceNode: {
          tag: "input",
          path: "document/html[0]/body[1]/input[4]",
          order: 12,
          group: 0,
          classes: [],
        },
        evidence: "purchase",
        appearanceId:
          "appearance_ef6cf530aeccd98a6a87127bdb4812477dd2c12a1ded9b69dff3e7331ff8dac2",
        appearance: {
          width: 432,
          height: 44,
          background: "#276c91",
          primitives: [
            {
              kind: "rect",
              rect: {
                x: 0,
                y: 0,
                w: 432,
                h: 44,
              },
              fill: "#276c91",
              borderColor: "#b6c5cd",
              borderWidth: 1,
              radius: 4,
            },
            {
              kind: "text",
              rect: {
                x: 12,
                y: 8,
                w: 408,
                h: 28,
              },
              text: "Buy paper",
              size: 16,
              color: "#ffffff",
              font: "sans",
              weight: "normal",
              align: "left",
            },
          ],
        },
      },
    ],
    captureId:
      "capture_0843e022953b1068b175fa87a9ac5f7ae17da1c175a2e74930e8cd6d59aa4949",
  },
};

const bytes = (text) => new TextEncoder().encode(text);
const hash = (text) => createHash("sha256").update(text).digest("hex");
const bootstrap = String.raw`
import { parentPort, workerData } from 'node:worker_threads';
const listeners = [], sideEffects = [];
Object.defineProperty(globalThis, '__pdfSourceRan', {
  get() { return false; }, set() { sideEffects.push('source-script'); },
});
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'importScripts', 'DOMParser', 'Image', 'eval', 'Function', 'FileReader',
  'FileReaderSync', 'showOpenFilePicker', 'open']) {
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
test("PDF filename hints survives emitted Worker real victory single claim and immutable archive coexistence", async () => {
  const observed = [];
  const built = await build({
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "silent",
    build: { write: false },
    worker: {
      plugins: () => [
        {
          name: "qa-observe-pdf-links-worker",
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
      id.endsWith("/src/raid/local-pdf-links.ts"),
    ),
  );
  for (const id of Object.keys(chunk.modules))
    assert.doesNotMatch(
      id,
      /(?:^|\/)server\/|^node:|__vite[-_]browser[-_]external/,
    );
  assert.doesNotMatch(
    emitted,
    /__vite[-_]browser[-_]external|\b(?:require\s*\(|process\.(?:env|versions|cwd)|Buffer\.(?:from|alloc))/,
  );
  const directory = await mkdtemp(join(tmpdir(), "ui-raid-pdf-links-"));
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
        () => reject(Error("emitted PDF worker timeout")),
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
                stylesheet: { name: "links.css", bytes: css },
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
        stylesheet: { name: "links.css", bytes: bytes(fixture.css) },
      }),
    );
    assert.equal((await verifyRaidBlueprint(fresh)).ok, true);
    assert.equal(
      hash(JSON.stringify(fixture.legacy)),
      "9e748cc0c7746446ee455f5ebbfdab878c3be516326942e6089405df45607000",
    );
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
      "newly eligible PDF hints change only the fresh capture identity",
    );
    assert.deepEqual(
      fresh.components.map((c) => c.evidence),
      ["heading", "pdf", "search", "purchase"],
    );
    for (const i of [0, 2, 3])
      assert.deepEqual(fresh.components[i], fixture.legacy.components[i]);
    assert.deepEqual(
      fresh.components[1].appearance,
      fixture.legacy.components[1].appearance,
    );
    assert.equal(
      fresh.components[1].appearanceId,
      fixture.legacy.components[1].appearanceId,
    );
    assert.deepEqual(fresh.analysis, fixture.legacy.analysis);
    assert.deepEqual(fresh.source, fixture.legacy.source);
    assert.deepEqual(
      fresh.warnings.filter((w) => !w.includes("PDF")),
      fixture.legacy.warnings,
    );
    assert.ok(
      fresh.warnings.some(
        (w) => w.includes("MIME") && w.includes("取得・検証していません"),
      ),
    );
    assert.equal(fresh.components[1].appearance.background, "#123456");
    assert.equal(
      fresh.components[1].appearance.primitives[0].borderColor,
      "#654321",
    );
    assert.ok(fresh.components.every((c) => c.sourceRect === null));
    assert.doesNotMatch(
      JSON.stringify(fresh),
      /PRIVATE|resource\.invalid|links\.css|private-guide|__pdfSourceRan|<input|<script|href=/,
    );

    const store = createProfileStore(new IDBFactory(), "pdf-links-source");
    const destination = createProfileStore(
      new IDBFactory(),
      "pdf-links-restored",
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
    const oldTrophy = await claimVictory(fixture.legacy, "navigation");
    assert.equal(oldTrophy.item.type, "ab_nav");
    const oldArchive = await store.exportCollectionBackup();
    const trophy = await claimVictory(fresh, "pdf");
    assert.equal(trophy.item.type, "gov_pdf");
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
