import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { createHash } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { mountRaidPanel } from "../src/raid/panel.js";
import { prepareRaidChallenge } from "../src/raid-challenge.js";
import { createProfileStore } from "../src/profile-store.js";
import R from "../src/run.js";
import { createStaticIngestService } from "../server/site-ingest/service.js";

// A small DOM event adapter, not a browser and not pixel/animation approval.
class NodeAdapter {
  constructor(doc, tag) {
    Object.assign(this, {
      ownerDocument: doc,
      tagName: tag,
      children: [],
      style: {},
      dataset: {},
      attributes: {},
      events: {},
      className: "",
      textContent: "",
      value: "",
      clientWidth: 960,
    });
    this.classList = {
      add: (...names) => {
        this.className = [
          ...new Set([...this.className.split(/\s+/), ...names]),
        ].join(" ");
      },
      toggle: (name, force) => {
        const present = this.className.split(/\s+/).includes(name);
        this.className = this.className
          .split(/\s+/)
          .filter((n) => n !== name)
          .concat((force ?? !present) ? [name] : [])
          .join(" ");
      },
    };
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  addEventListener(k, fn) {
    this.events[k] = fn;
  }
  closest(selector) {
    return selector === "[data-component-id]" && this.dataset.componentId
      ? this
      : (this.parentElement?.closest(selector) ?? null);
  }
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) {
      if (selector === "[data-component-id]" && child.dataset.componentId)
        result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
}
function dom() {
  const created = [],
    doc = {
      createElement(tag) {
        const node = new NodeAdapter(doc, tag);
        created.push(node);
        return node;
      },
      addEventListener() {},
      removeEventListener() {},
    };
  return { host: doc.createElement("div"), created };
}
async function until(check, message) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

test("actual Vite host routes native panel submission through HTTP acquisition, combat, reload and exact trophy", async (t) => {
  const nativeFetch = globalThis.fetch,
    NativeElement = globalThis.Element;
  let base = "",
    sourceAvailable = true,
    panel;
  const requests = [],
    sourceCalls = [];
  const html =
    "<title>HTTP panel source</title><h1>Source catalog</h1><nav><a>Books</a></nav><article><h3>Source book</h3><button>Add to basket</button></article>";
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.startsWith("/api/")) {
      requests.push(url);
      return nativeFetch(new URL(url, base), options);
    }
    if (url === "https://books.toscrape.com/") {
      sourceCalls.push({ url, options });
      return new Response(sourceAvailable ? html : "Unavailable", {
        status: sourceAvailable ? 200 : 503,
        headers: { "content-type": "text/html" },
      });
    }
    throw Error("Unexpected source request " + url);
  };
  globalThis.Element = NodeAdapter;
  let server;
  t.after(async () => {
    panel?.dispose();
    if (server) await server.close();
    globalThis.fetch = nativeFetch;
    globalThis.Element = NativeElement;
  });
  server = await createViteServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
      hmr: false,
      watch: null,
    },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const home = await nativeFetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /src\/main\.ts/);
  const factory = new IDBFactory(),
    store = createProfileStore(factory),
    run = R.newRun("lab"),
    before = structuredClone(run);
  let fought, battleId;
  const { host, created } = dom();
  panel = mountRaidPanel(host, {
    onChallenge: async (blueprint) => {
      fought = blueprint;
      const prepared = prepareRaidChallenge(run, blueprint);
      for (let i = 0; i < 1800 && !prepared.battle.result; i++)
        prepared.battle.step(0.05);
      assert.equal(prepared.battle.result?.winner, "player");
      battleId = prepared.battleId;
      await store.recordRaidVictory(blueprint, battleId);
      return { battleId, winner: prepared.battle.result.winner };
    },
    onClaim: async (reward, blueprint) => {
      await store.claimRaidReward(run, reward, blueprint);
      return { ok: true };
    },
  });
  const named = (text) => created.find((node) => node.textContent === text);
  const meta = created.find((node) => node.className === "raid-meta"),
    status = created.find((node) => node.className === "raid-status");
  await until(
    () => meta.textContent.includes("星見文庫"),
    "initial fixture did not finish",
  );
  const input = created.find((node) => node.tagName === "input"),
    form = created.find((node) => node.tagName === "form");
  input.value = "https://books.toscrape.com/";
  form.events.submit({ preventDefault() {} });
  await until(
    () => meta.textContent.includes("HTTP panel source"),
    "panel did not select HTTP result",
  );
  assert.match(meta.textContent, /コード解析による近似配置/);
  assert.deepEqual(requests, [
    "/api/raid-captures/capabilities",
    "/api/raid-captures/code",
  ]);
  assert.equal(sourceCalls.length, 1);
  assert.equal(sourceCalls[0].options.redirect, "error");
  assert.equal(sourceCalls[0].options.credentials, "omit");
  // Acquisition failure preserves the selected opponent; no fixture substitution.
  sourceAvailable = false;
  form.events.submit({ preventDefault() {} });
  await until(
    () => status.className.includes("is-error"),
    "HTTP failure did not reach the panel",
  );
  assert.match(meta.textContent, /HTTP panel source/);
  const challenge = named("このページに挑戦");
  assert.equal(challenge.disabled, false);
  await challenge.events.click();
  assert.equal(
    fought.analysis.sourceHash,
    createHash("sha256").update(html).digest("hex"),
  );
  assert.ok(
    fought.components.every((component) => component.sourceRect === null),
  );
  assert.deepEqual(run, before);
  const reloaded = createProfileStore(factory),
    pending = await reloaded.listPendingRaids();
  assert.equal(pending[0].battleId, battleId);
  panel.dispose();
  const resumed = dom();
  panel = mountRaidPanel(
    resumed.host,
    {
      onChallenge: async () => {
        throw Error("must not fight twice");
      },
      onClaim: async (reward, blueprint) => {
        await reloaded.claimRaidReward(run, reward, blueprint);
        return { ok: true };
      },
    },
    pending[0],
  );
  await until(
    () =>
      resumed.host
        .querySelectorAll("[data-component-id]")
        .some((n) => n.className.includes("raid-loot-ready")),
    "pending victory did not resume",
  );
  const part = resumed.host.querySelectorAll("[data-component-id]")[0],
    canvas = resumed.created.find((n) => n.className === "raid-canvas");
  canvas.events.click({ target: part });
  await until(
    async () => (await reloaded.listTrophies()).length === 1,
    "trophy not persisted",
  );
  const trophy = (await reloaded.listTrophies())[0],
    original = fought.components.find(
      (c) => c.componentId === trophy.componentId,
    );
  assert.equal(trophy.item.appearanceId, original.appearanceId);
  assert.equal(trophy.captureId, fought.captureId);
  assert.deepEqual(await reloaded.getBlueprint(fought.captureId), fought);
  assert.deepEqual(await reloaded.listPendingRaids(), []);
  assert.equal(
    sourceCalls.length,
    2,
    "reload and reward must not refetch source",
  );
});

async function cachedSource() {
  const service = createStaticIngestService({
    transport: async () =>
      new Response(
        "<title>Saved source</title><h1>Saved heading</h1><button>Add to basket</button>",
        { headers: { "content-type": "text/html" } },
      ),
  });
  const result = await service.reconstruct("https://example.com/");
  assert.equal(result.ok, true, result.error);
  return result.value;
}
const unusedCallbacks = {
  onChallenge: async () => {
    throw Error("unused");
  },
  onClaim: async () => ({ ok: false, error: "unused" }),
};

test("initial cached mode selects a verified saved snapshot and never acquires or bills a source", async (t) => {
  const original = globalThis.fetch,
    blueprint = await cachedSource();
  globalThis.fetch = async () => {
    assert.fail("cached mode fetched a source");
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  const { host, created } = dom();
  const panel = mountRaidPanel(
    host,
    {
      ...unusedCallbacks,
      onCaptured: async () => {
        assert.fail("cached mode billed acquisition");
      },
    },
    undefined,
    { url: "https://example.com/", kind: "cached", cachedBlueprint: blueprint },
  );
  t.after(() => panel.dispose());
  await until(
    () =>
      created.some(
        (n) =>
          n.className === "raid-meta" && n.textContent.includes("Saved source"),
      ),
    "cached source not selected",
  );
  assert.equal(
    created.find((n) => n.tagName === "input").value,
    "https://example.com/",
  );
});

test("missing or mismatched cached requests fail without network or fixture substitution", async (t) => {
  const original = globalThis.fetch,
    blueprint = await cachedSource();
  globalThis.fetch = async () => {
    assert.fail("invalid cache requested network");
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  for (const cachedBlueprint of [
    undefined,
    { ...blueprint, captureId: "invalid" },
    blueprint,
  ]) {
    const { host, created } = dom();
    const panel = mountRaidPanel(host, unusedCallbacks, undefined, {
      url: "https://books.toscrape.com/",
      kind: "cached",
      cachedBlueprint,
    });
    await until(
      () =>
        created.some(
          (n) =>
            n.className.includes("raid-status") &&
            n.className.includes("is-error"),
        ),
      "invalid cache did not fail",
    );
    assert.equal(
      created.find((n) => n.className === "raid-meta").textContent,
      "",
    );
    assert.equal(
      created.find((n) => n.textContent === "このページに挑戦").disabled,
      true,
    );
    panel.dispose();
  }
});

test("initial reanalysis preserves URL/kind and cannot select before its acquisition receipt saves", async (t) => {
  const original = globalThis.fetch,
    blueprint = await cachedSource();
  globalThis.fetch = async (url) =>
    String(url).endsWith("capabilities")
      ? Response.json({
          schemaVersion: 1,
          publicCodeReconstruction: true,
          sourceJavascript: false,
          supportedUrls: ["https://example.com/"],
        })
      : Response.json(blueprint);
  t.after(() => {
    globalThis.fetch = original;
  });
  const { host, created } = dom();
  let calls = 0;
  const panel = mountRaidPanel(
    host,
    {
      ...unusedCallbacks,
      onCaptured: async (snapshot, kind) => {
        calls++;
        assert.equal(kind, "reanalyze");
        assert.equal(snapshot.captureId, blueprint.captureId);
        assert.equal(
          created.find((n) => n.className === "raid-meta").textContent,
          "",
        );
        throw Error("Receipt storage failed");
      },
    },
    undefined,
    { url: "https://example.com/", kind: "reanalyze" },
  );
  t.after(() => panel.dispose());
  await until(
    () => created.some((n) => n.textContent === "Receipt storage failed"),
    "receipt failure did not reach panel",
  );
  assert.equal(calls, 1);
  assert.equal(
    created.find((n) => n.tagName === "input").value,
    "https://example.com/",
  );
  assert.equal(
    created.find((n) => n.className === "raid-meta").textContent,
    "",
  );
});

test("receipt saving blocks duplicate requests and cancellation, then selects the unmodified snapshot", async (t) => {
  const original = globalThis.fetch,
    blueprint = await cachedSource();
  let requests = 0,
    saves = 0,
    finishSave;
  globalThis.fetch = async (url) => {
    requests++;
    return String(url).endsWith("capabilities")
      ? Response.json({
          schemaVersion: 1,
          publicCodeReconstruction: true,
          sourceJavascript: false,
          supportedUrls: ["https://example.com/"],
        })
      : Response.json(blueprint);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  const { host, created } = dom();
  const panel = mountRaidPanel(
    host,
    {
      ...unusedCallbacks,
      onCaptured: async (snapshot) => {
        saves++;
        snapshot.source.name = "Caller mutation";
        await new Promise((resolve) => {
          finishSave = resolve;
        });
      },
    },
    undefined,
    { url: "https://example.com/", kind: "new" },
  );
  t.after(() => panel.dispose());
  await until(() => saves === 1, "receipt did not start");
  assert.equal(created.find((n) => n.tagName === "input").disabled, true);
  const cancel = created.find((n) => n.textContent === "取得を中止");
  assert.equal(cancel.hidden, true);
  cancel.events.click();
  created
    .find((n) => n.tagName === "form")
    .events.submit({ preventDefault() {} });
  assert.equal(requests, 2);
  finishSave();
  await until(
    () =>
      created.some(
        (n) =>
          n.className === "raid-meta" && n.textContent.includes("Saved source"),
      ),
    "saved result not selected",
  );
  assert.equal(saves, 1);
  assert.equal(created.find((n) => n.tagName === "input").disabled, false);
});

test("pending victory takes priority over an initial live request and never refetches", async (t) => {
  const original = globalThis.fetch,
    blueprint = await cachedSource();
  globalThis.fetch = async () => {
    assert.fail("resuming a victory fetched source");
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  const { host, created } = dom();
  const panel = mountRaidPanel(
    host,
    unusedCallbacks,
    { blueprint, battleId: "saved-battle", winner: "player" },
    { url: "https://books.toscrape.com/", kind: "new" },
  );
  t.after(() => panel.dispose());
  await until(
    () =>
      host
        .querySelectorAll("[data-component-id]")
        .some((n) => n.className.includes("raid-loot-ready")),
    "pending victory not restored",
  );
  assert.match(
    created.find((n) => n.className === "raid-meta").textContent,
    /Saved source/,
  );
});
