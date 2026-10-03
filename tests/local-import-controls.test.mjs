import test from "node:test";
import assert from "node:assert/strict";
import { mountLocalImportControls } from "../src/raid/local-import-controls.ts";
import {
  documentAdapter,
  settle,
  deferred,
  localFile,
  WorkerAdapter,
} from "./helpers/local-import-dom.mjs";
function mount(t, options = {}) {
  const original = globalThis.Worker;
  globalThis.Worker = WorkerAdapter;
  WorkerAdapter.instances = [];
  t.after(() => {
    if (original === undefined) delete globalThis.Worker;
    else globalThis.Worker = original;
  });
  const doc = documentAdapter(),
    host = doc.createElement("section");
  doc.body.append(host);
  const received = [];
  const handle = mountLocalImportControls(host, {
    isAllowed: () => true,
    onSelected: async (...args) => {
      received.push(args);
      return { ok: true, value: args[0] };
    },
    ...options,
  });
  t.after(() => handle.dispose());
  const [html, css] = host.querySelectorAll("input");
  return {
    doc,
    host,
    handle,
    html,
    css,
    received,
    workers: WorkerAdapter.instances,
    button: (label) =>
      host.querySelectorAll("button").find((n) => n.textContent === label),
  };
}
function choose(input, file) {
  input.files = file ? [file] : [];
  input.value = "C:\\fakepath\\private.html";
  input.dispatchEvent(new Event("change"));
}

test("local controls disclose bounded inert approximation and default to disabled", (t) => {
  const ui = mount(t, { isAllowed: undefined });
  assert.ok(ui.host.children[0], "local controls section must exist");
  assert.equal(ui.host.children[0].hidden, true);
  assert.equal(ui.html.type, "file");
  assert.match(ui.html.accept, /html/);
  assert.match(ui.css.accept, /css/);
  assert.equal(ui.html.multiple, false);
  assert.equal(ui.css.multiple, false);
  assert.match(ui.host.textContent, /実験室/);
  assert.match(ui.host.textContent, /512/);
  assert.match(ui.host.textContent, /256/);
  assert.match(ui.host.textContent, /UTF-8/);
  assert.match(ui.host.textContent, /画像/);
  assert.match(ui.host.textContent, /JavaScript/);
  assert.match(ui.host.textContent, /近似/);
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, true);
});

test("HTML and optional CSS selection never reads or grants anything until explicit import", async (t) => {
  const ui = mount(t),
    html = localFile(),
    css = localFile("h1{color:red}", { name: "style.css" });
  choose(ui.html, html);
  choose(ui.css, css);
  assert.equal(html.reads, 0);
  assert.equal(css.reads, 0);
  assert.equal(ui.html.value, "");
  assert.equal(ui.css.value, "");
  assert.equal(ui.received.length, 0);
  ui.button("ローカルHTMLを近似再構成").click();
  await settle();
  assert.equal(html.reads, 1);
  assert.equal(css.reads, 1);
  assert.equal(ui.workers.length, 1);
  assert.equal(ui.workers[0].options.type, "module");
  assert.match(ui.workers[0].url.pathname, /local-import-worker\.ts$/);
  assert.doesNotMatch(ui.host.textContent, /private\.html|C:\\/);
});

test("oversized and directory files fail before read and can be replaced", async (t) => {
  const ui = mount(t),
    big = localFile("", { size: 524289 });
  choose(ui.html, big);
  assert.equal(big.reads, 0);
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, true);
  assert.match(ui.host.textContent, /512/);
  choose(ui.html, localFile("", { webkitRelativePath: "folder/page.html" }));
  assert.equal(ui.workers.length, 0);
  choose(ui.html, localFile());
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, false);
});

test("changing selection cancels an old worker without using its late result", async (t) => {
  const ui = mount(t);
  choose(ui.html, localFile());
  ui.button("ローカルHTMLを近似再構成").click();
  await settle();
  const old = ui.workers[0],
    late = old.handlers.get("message");
  choose(ui.html, localFile("<h1>New</h1>"));
  assert.equal(old.terminated, 1);
  late({
    data: {
      type: "local-import-result",
      requestId: 1,
      result: { ok: false, code: "stale", error: "OLD MESSAGE" },
    },
  });
  await settle();
  assert.doesNotMatch(ui.host.textContent, /OLD MESSAGE/);
  assert.equal(ui.received.length, 0);
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, false);
});

test("native picker cancellation preserves prior file choice and selected opponent", async (t) => {
  const ui = mount(t);
  choose(ui.html, localFile());
  const before = ui.host.textContent;
  ui.html.files = [];
  ui.html.dispatchEvent(new Event("cancel"));
  ui.html.dispatchEvent(new Event("change"));
  assert.equal(ui.host.textContent, before);
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, false);
  assert.equal(ui.received.length, 0);
});

for (const invalidation of ["dispose", "detach", "replace", "eligibility"])
  test(`${invalidation} blocks a delayed file read from starting parser work`, async (t) => {
    let allowed = true;
    const ui = mount(t, { isAllowed: () => allowed }),
      read = deferred();
    choose(
      ui.html,
      localFile("<h1>Delay</h1>", { arrayBuffer: () => read.promise }),
    );
    ui.button("ローカルHTMLを近似再構成").click();
    if (invalidation === "dispose") ui.handle.dispose();
    else if (invalidation === "detach") ui.host.remove();
    else if (invalidation === "replace")
      ui.host.replaceChildren(ui.doc.createElement("p"));
    else allowed = false;
    const before = ui.host.textContent;
    read.resolve(new TextEncoder().encode("<h1>Delay</h1>").buffer);
    await settle();
    assert.equal(ui.workers.length, 0);
    assert.equal(ui.received.length, 0);
    assert.equal(ui.host.textContent, before);
  });

test("explicit cancel preserves selected opponent and permits a same-file retry", async (t) => {
  const ui = mount(t);
  choose(ui.html, localFile());
  ui.button("ローカルHTMLを近似再構成").click();
  await settle();
  ui.button("ローカル読込を中止").click();
  assert.equal(ui.workers[0].terminated, 1);
  await settle();
  assert.equal(ui.received.length, 0);
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, false);
  ui.button("ローカルHTMLを近似再構成").click();
  await settle();
  assert.equal(ui.workers.length, 2);
});

test("live permission and parent reward lock are rechecked on synthetic clicks", async (t) => {
  let allowed = true,
    locked = false;
  const ui = mount(t, { isAllowed: () => allowed, isLocked: () => locked });
  choose(ui.html, localFile());
  locked = true;
  ui.button("ローカルHTMLを近似再構成").dispatchEvent(new Event("click"));
  assert.equal(ui.workers.length, 0);
  locked = false;
  allowed = false;
  ui.button("ローカルHTMLを近似再構成").dispatchEvent(new Event("click"));
  assert.equal(ui.workers.length, 0);
  assert.equal(ui.received.length, 0);
});

for (const kind of ["eligibility", "lock"])
  test(`settled import becomes retryable after temporary ${kind} revocation`, async (t) => {
    let allowed = true,
      locked = false;
    const ui = mount(t, { isAllowed: () => allowed, isLocked: () => locked }),
      read = deferred();
    choose(
      ui.html,
      localFile("<h1>Delay</h1>", { arrayBuffer: () => read.promise }),
    );
    ui.button("ローカルHTMLを近似再構成").click();
    if (kind === "eligibility") allowed = false;
    else locked = true;
    read.resolve(new TextEncoder().encode("<h1>Delay</h1>").buffer);
    await settle();
    if (ui.workers[0])
      ui.workers[0].reply({
        ok: false,
        code: "local-failed",
        error: "解析失敗",
      });
    await settle();
    allowed = true;
    locked = false;
    ui.handle.refresh();
    assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, false);
    assert.equal(ui.host.children[0].getAttribute("aria-busy"), "false");
  });

test("an invalid selected optional CSS blocks import until it is replaced or explicitly removed", (t) => {
  const ui = mount(t);
  choose(ui.html, localFile());
  choose(ui.css, localFile("x", { name: "style.css", size: 262145 }));
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, true);
  assert.equal(ui.button("CSSなしに戻す").disabled, false);
  ui.button("CSSなしに戻す").click();
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, false);
});

test("disposal cancels work without repainting controls or calling a closed owner", async (t) => {
  const busy = [],
    ui = mount(t, { onBusyChange: (value) => busy.push(value) });
  choose(ui.html, localFile());
  ui.button("ローカルHTMLを近似再構成").click();
  await settle();
  const before = ui.host.textContent;
  ui.handle.dispose();
  assert.equal(ui.host.textContent, before);
  assert.deepEqual(busy, [true]);
  assert.equal(ui.workers[0].terminated, 1);
  await settle();
  assert.deepEqual(busy, [true]);
});

test("invalid CSS stays visibly actionable after a valid HTML reselection", (t) => {
  const ui = mount(t),
    invalidCss = localFile("x", { name: "private.css", size: 262145 }),
    html = localFile("<h1>Replacement</h1>");
  choose(ui.css, invalidCss);
  choose(ui.html, html);
  assert.match(ui.host.textContent, /CSS: 選択エラー/);
  assert.match(ui.host.textContent, /再選択するか「CSSなしに戻す」/);
  assert.doesNotMatch(ui.host.textContent, /CSS: なし/);
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, true);
  assert.equal(html.reads, 0);
  assert.equal(invalidCss.reads, 0);
  assert.equal(ui.workers.length, 0);
  assert.doesNotMatch(ui.host.textContent, /private\.css|private\.html|C:\\/);
  ui.button("CSSなしに戻す").click();
  assert.match(ui.host.textContent, /CSS: なし/);
  assert.doesNotMatch(ui.host.textContent, /CSS: 選択エラー/);
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, false);
});

test("multiple CSS rejection stays visible until replacement without reading either file", (t) => {
  const ui = mount(t),
    first = localFile("a{}", { name: "first.css" }),
    second = localFile("b{}", { name: "second.css" });
  ui.css.files = [first, second];
  ui.css.dispatchEvent(new Event("change"));
  choose(ui.html, localFile());
  assert.match(ui.host.textContent, /CSS: 選択エラー/);
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, true);
  ui.css.files = [];
  ui.css.dispatchEvent(new Event("cancel"));
  assert.match(ui.host.textContent, /CSS: 選択エラー/);
  choose(ui.css, second);
  assert.match(ui.host.textContent, /CSS: 選択済み/);
  assert.doesNotMatch(ui.host.textContent, /CSS: 選択エラー/);
  assert.equal(ui.button("ローカルHTMLを近似再構成").disabled, false);
  assert.equal(first.reads, 0);
  assert.equal(second.reads, 0);
  assert.equal(ui.workers.length, 0);
});
