import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { createServer as createViteServer } from "vite";
import D from "../src/data.js";
import { createArenaServer } from "../server/arena/http.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Complete bundled production panel/client with DOM and cookie mechanics adapted.
// Startup recovery uses real loopback Vite and durable arena HTTP; lost-reply
// cases substitute responses only after actual commits, and the timeout case
// shortens the request timer. No browser, native focus, paint, or AT acceptance.
const compiled = buildSync({
  entryPoints: [new URL("../src/online/panel.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "OnlinePanel",
  platform: "browser",
  target: "es2022",
  loader: { ".css": "empty" },
}).outputFiles[0].text;

class PanelElement extends ElementAdapter {
  get firstElementChild() {
    return this.children.find((child) => child.tagName !== "#TEXT");
  }
  get disabled() {
    return this.getAttribute("disabled") !== null;
  }
  before(node) {
    const parent = this.parentElement;
    node.remove();
    node.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this), 0, node);
  }
  after(node) {
    const parent = this.parentElement;
    node.remove();
    node.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
  }
}
class InputElement extends PanelElement {}
class SelectElement extends PanelElement {}
class FormElement extends PanelElement {}
const listen = (server, port = 0) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
async function close(server) {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function fixture(
  t,
  { initial = "absent", cookie: initialCookie = "" } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "online-service-guidance-"));
  const filePath = join(directory, "arena.json");
  const reserve = createServer();
  await listen(reserve);
  const arenaPort = reserve.address().port;
  await close(reserve);
  let arena, failureServer, panel, vite;
  let cookie = initialCookie;
  const requests = [],
    commands = [],
    replies = [],
    faults = [];
  t.after(async () => {
    panel?.dispose();
    await vite?.close();
    await close(failureServer);
    await close(arena);
    rmSync(directory, { recursive: true, force: true });
  });
  async function startArena() {
    await close(failureServer);
    arena = createArenaServer({ filePath });
    await listen(arena, arenaPort);
  }
  if (initial === "healthy") await startArena();
  if (initial === "stall") {
    failureServer = createServer(() => {});
    await listen(failureServer, arenaPort);
  }
  if (initial === "html") {
    failureServer = createServer((req, res) => {
      res.writeHead(503, { "content-type": "text/html" });
      res.end(
        "<h1>Proxy temporarily unavailable</h1><p>private-upstream-detail</p>",
      );
    });
    await listen(failureServer, arenaPort);
  }
  vite = await createViteServer({
    configFile: false,
    logLevel: "silent",
    cacheDir: join(directory, "vite-cache"),
    server: {
      host: "127.0.0.1",
      port: 0,
      hmr: false,
      watch: null,
      proxy: { "/api/arena": `http://127.0.0.1:${arenaPort}` },
    },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}/api/arena`;
  const doc = {
    createElement(tag) {
      const Type =
        { input: InputElement, select: SelectElement, form: FormElement }[
          tag
        ] ?? PanelElement;
      return new Type(this, tag);
    },
  };
  doc.body = doc.createElement("body");
  doc.activeElement = doc.body;
  const host = doc.createElement("div");
  const context = {
    document: doc,
    async fetch(url, init) {
      requests.push(new URL(url).pathname);
      const isCommand = String(url).endsWith("/command");
      if (isCommand) commands.push(JSON.parse(init.body));
      const response = await fetch(url, {
        ...init,
        headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
      });
      const nextCookie = response.headers.get("set-cookie");
      if (nextCookie) cookie = nextCookie.split(";")[0];
      const text = await response.clone().text();
      replies.push({ status: response.status, text });
      if (isCommand && faults.length) {
        const fault = faults.shift();
        assert.equal(
          response.ok,
          true,
          "fault follows a real committed command",
        );
        return new Response(fault.body, {
          status: fault.status,
          headers: { "content-type": fault.contentType },
        });
      }
      return response;
    },
    crypto,
    structuredClone,
    Error,
    AbortController,
    AbortSignal:
      initial === "stall"
        ? {
            any: AbortSignal.any,
            timeout(milliseconds) {
              assert.equal(
                milliseconds,
                15000,
                "production timeout remains unchanged",
              );
              return AbortSignal.timeout(60);
            },
          }
        : AbortSignal,
    setTimeout,
    clearTimeout,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    cancelAnimationFrame() {},
    window: { addEventListener() {} },
    Element: PanelElement,
    HTMLElement: PanelElement,
    HTMLInputElement: InputElement,
    HTMLSelectElement: SelectElement,
    HTMLFormElement: FormElement,
  };
  const mount = vm.runInNewContext(
    compiled + "\nOnlinePanel.mountOnlinePanel;",
    context,
  );
  panel = mount(host, { baseUrl: base, onClose: () => panel.dispose() });
  const root = () => host.children[0];
  const node = (kind) => root().querySelector(`[data-arena="${kind}"]`);
  const status = () => root().querySelector(".arena-status").textContent;
  async function until(check, label) {
    const deadline = Date.now() + 6000;
    while (!check()) {
      assert.ok(Date.now() < deadline, label);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  async function click(kind, target = node(kind)) {
    assert.ok(target, `${kind} exists`);
    assert.equal(target.disabled, false, `${kind} is enabled`);
    await root().dispatch("click", { target, stopPropagation() {} });
  }
  async function state() {
    const response = await fetch(base + "/state", { headers: { cookie } });
    assert.equal(response.status, 200);
    return response.json();
  }
  await until(() => node("retry") || node("buy"), "initial connection settles");
  return {
    root,
    node,
    status,
    until,
    click,
    state,
    startArena,
    requests,
    replies,
    commands,
    faults,
  };
}

for (const initial of ["absent", "html"]) {
  test(`a ${initial === "absent" ? "missing arena behind Vite" : "proxy HTML response"} gives usable local recovery without closing the panel`, async (t) => {
    const h = await fixture(t, { initial });
    const root = h.root();
    assert.equal(h.replies[0].status, initial === "absent" ? 502 : 503);
    assert.match(h.status(), /応答を確認できません/);
    assert.match(h.status(), /この画面を開いたまま/);
    assert.match(h.status(), /ローカル開発/);
    assert.match(h.status(), /起動していない場合/);
    assert.match(h.status(), /別のターミナル/);
    assert.match(h.status(), /npm run arena/);
    assert.doesNotMatch(
      h.status(),
      /Unexpected|JSON|private-upstream-detail|npm run dev:local/,
    );
    assert.equal(
      h.node("new-guest"),
      null,
      "failure does not offer identity replacement",
    );
    assert.equal(h.commands.length, 0);
    await h.startArena();
    await h.click("retry");
    await h.until(
      () => h.node("buy"),
      "explicit retry connects after service startup",
    );
    assert.equal(h.root(), root, "same mounted panel is recovered");
    assert.equal(h.node("retry"), null);
    assert.doesNotMatch(h.status(), /npm run arena/);
    assert.equal((await h.state()).revision, 0);
    assert.equal(
      h.commands.length,
      0,
      "connection recovery does not invent gameplay",
    );
    assert.equal(
      h.requests.length,
      2,
      "only initial connection and explicit retry",
    );
  });
}

test("an expired identity keeps the server's actionable explanation instead of service startup advice", async (t) => {
  const h = await fixture(t, {
    initial: "healthy",
    cookie: "ui_raid_guest=expired-test-identity",
  });
  assert.match(h.status(), /ゲスト接続の有効期限/);
  assert.match(h.status(), /前のランを復元した状態ではありません/);
  assert.match(h.status(), /新しいゲストで開始/);
  assert.doesNotMatch(h.status(), /npm run arena|応答を確認できません/);
  assert.ok(h.node("new-guest"));
  assert.equal(h.commands.length, 0);
});

test("rejected publication still tells the player to place an attacker", async (t) => {
  const h = await fixture(t, { initial: "healthy" });
  const before = await h.state();
  await h.click("publish");
  await h.until(() => h.node("retry"), "invalid publication settles");
  assert.match(h.status(), /攻撃UIを最低一つ配置してください/);
  assert.doesNotMatch(h.status(), /npm run arena|応答を確認できません/);
  assert.equal(h.node("reroll").disabled, false);
  assert.deepEqual(await h.state(), before);
});

for (const kind of ["empty", "html", "json", "json-server-error"]) {
  test(`a lost committed purchase with ${kind} failure keeps its identity for explicit recovery`, async (t) => {
    const h = await fixture(t, { initial: "healthy" });
    const before = await h.state();
    const isJson = kind.startsWith("json");
    const fault = {
      status: kind === "json-server-error" ? 500 : 503,
      contentType: isJson ? "application/json" : "text/html",
      body:
        kind === "empty"
          ? ""
          : kind === "html"
            ? "<h1>private-proxy-detail</h1>"
            : JSON.stringify({
                code:
                  kind === "json-server-error"
                    ? "SERVER_ERROR"
                    : "UPSTREAM_UNAVAILABLE",
                message:
                  "private-proxy-detail /private/arena/store.json ui_raid_guest=test-only-token",
              }),
    };
    // The real client's existing one-time same-ID automatic transport retry also
    // loses its response; structured HTTP failures await explicit retry directly.
    h.faults.push(fault);
    if (!isJson) h.faults.push(fault);
    const stock = h
      .root()
      .querySelectorAll('[data-arena="buy"]')
      .find((button) => !button.disabled && D.PARTS[button.dataset.type]);
    await h.click("buy", stock);
    await h.until(
      () => h.root().querySelector("[data-arena-pending-command]"),
      "uncertain purchase waits for recovery",
    );
    assert.match(h.status(), /この画面を開いたまま/);
    assert.match(h.status(), /npm run arena/);
    assert.match(h.status(), /確定済みの可能性/);
    assert.doesNotMatch(
      h.status(),
      /Unexpected|private-proxy-detail|ui_raid_guest|store\.json/,
    );
    if (isJson) assert.match(h.status(), /応答を確認できません/);
    assert.equal(h.node("reroll").disabled, true);
    assert.equal(h.node("new-guest"), null);
    const original = h.commands[0];
    const committed = await h.state();
    assert.equal(committed.revision, before.revision + 1);
    assert.equal(committed.run.owned.length, 1);
    assert.equal(h.commands.length, isJson ? 1 : 2);
    assert.ok(
      h.commands.every(
        (command) => JSON.stringify(command) === JSON.stringify(original),
      ),
    );
    assert.ok(!h.root().textContent.includes(committed.online.id));
    await h.click("retry");
    await h.click("retry");
    await h.until(
      () => !h.node("retry"),
      "one explicit receipt recovery succeeds",
    );
    assert.equal(
      h.commands.length,
      isJson ? 2 : 3,
      "rapid repeated clicks send one explicit retry",
    );
    assert.deepEqual(h.commands.at(-1), original);
    assert.deepEqual(
      await h.state(),
      committed,
      "receipt retry does not purchase twice",
    );
    assert.equal(h.node("reroll").disabled, false);
    assert.doesNotMatch(h.status(), /npm run arena|確定済みの可能性/);
  });
}

test("a bounded connection timeout keeps the same local recovery instructions", async (t) => {
  const h = await fixture(t, { initial: "stall" });
  assert.match(h.status(), /タイムアウト/);
  assert.match(h.status(), /この画面を開いたまま/);
  assert.match(h.status(), /npm run arena/);
  assert.equal(h.node("new-guest"), null);
  assert.equal(h.commands.length, 0);
});
