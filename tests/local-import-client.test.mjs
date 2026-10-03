import test from "node:test";
import assert from "node:assert/strict";
import {
  createLocalImportClient,
  LOCAL_IMPORT_LIMITS,
} from "../src/raid/local-import-client.ts";
import { createFixtureRaid } from "../src/raid/fixtures.ts";

const tick = async () => {
  for (let n = 0; n < 8; n++)
    await new Promise((resolve) => setImmediate(resolve));
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const file = (text = "<h1>Local</h1>", options = {}) => {
  let reads = 0;
  const bytes = new TextEncoder().encode(text);
  return {
    name: "page.html",
    size: bytes.byteLength,
    webkitRelativePath: "",
    arrayBuffer: async () => {
      reads++;
      return bytes.buffer.slice(0);
    },
    get reads() {
      return reads;
    },
    ...options,
  };
};
class WorkerAdapter extends EventTarget {
  terminated = 0;
  sent = [];
  handlers = new Map();
  addEventListener(type, fn) {
    super.addEventListener(type, fn);
    this.handlers.set(type, fn);
  }
  removeEventListener(type, fn) {
    super.removeEventListener(type, fn);
    this.handlers.delete(type);
  }
  postMessage(value, transfer) {
    this.sent.push({ value, transfer });
  }
  terminate() {
    this.terminated++;
  }
  emit(data) {
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: data });
    this.dispatchEvent(event);
  }
}
function fixture(options = {}) {
  const workers = [];
  const client = createLocalImportClient({
    isAllowed: () => true,
    createWorker: () => {
      const worker = new WorkerAdapter();
      workers.push(worker);
      return worker;
    },
    ...options,
  });
  return { client, workers };
}
const reply = (worker, result) =>
  worker.emit({
    type: "local-import-result",
    requestId: worker.sent[0].value.requestId,
    result,
  });

test("local import requires live opt-in and rejects files before reading", async () => {
  const a = fixture({ isAllowed: undefined }),
    f = file();
  assert.equal((await a.client.importFiles(f)).code, "local-disabled");
  assert.equal(f.reads, 0);
  assert.equal(a.workers.length, 0);
  const b = fixture();
  for (const overrides of [
    { size: 524289 },
    { name: "page.zip" },
    { name: "folder/page.html" },
    { webkitRelativePath: "folder/page.html" },
    { size: NaN },
  ]) {
    const f = file("", overrides);
    assert.equal((await b.client.importFiles(f)).ok, false);
    assert.equal(f.reads, 0);
  }
  const html = file(),
    css = file("", { name: "style.css", size: 262145 });
  assert.equal((await b.client.importFiles(html, css)).ok, false);
  assert.equal(html.reads, 0);
  assert.equal(css.reads, 0);
  assert.equal(b.workers.length, 0);
  assert.deepEqual(LOCAL_IMPORT_LIMITS, {
    htmlBytes: 524288,
    cssBytes: 262144,
    deadlineMs: 5000,
  });
});

test("cancellation while native read is pending settles immediately and never starts a worker", async () => {
  const pending = deferred(),
    f = file("<h1>Pending</h1>", { arrayBuffer: () => pending.promise }),
    { client, workers } = fixture();
  const result = client.importFiles(f);
  client.cancel();
  assert.equal((await result).code, "cancelled");
  pending.resolve(new ArrayBuffer(3));
  await tick();
  assert.equal(workers.length, 0);
});

test("new selection terminates old worker and clears every event listener", async () => {
  const { client, workers } = fixture();
  const older = client.importFiles(file());
  await tick();
  const worker = workers[0],
    late = worker.handlers.get("message");
  const newer = client.importFiles(file());
  assert.equal((await older).code, "cancelled");
  assert.equal(worker.terminated, 1);
  assert.equal(worker.handlers.size, 0);
  await tick();
  assert.equal(workers.length, 2);
  late({
    data: {
      type: "local-import-result",
      requestId: 1,
      result: { ok: false, code: "injected", error: "stale" },
    },
  });
  client.cancel();
  assert.equal((await newer).code, "cancelled");
  assert.equal(workers[1].terminated, 1);
});

test("worker boundary transfers raw bounded bytes without HTML names or paths", async () => {
  const { client, workers } = fixture();
  const work = client.importFiles(
    file("<h1>Local</h1>", { name: "private-name.html" }),
    file("h1{color:red}", { name: "style.css" }),
  );
  await tick();
  const { value, transfer } = workers[0].sent[0];
  assert.equal(value.type, "import-local");
  assert.ok(value.html instanceof ArrayBuffer);
  assert.equal(value.stylesheet.name, "style.css");
  assert.ok(value.stylesheet.bytes instanceof ArrayBuffer);
  assert.deepEqual(transfer, [value.html, value.stylesheet.bytes]);
  assert.doesNotMatch(JSON.stringify(value), /private-name|fakepath/);
  client.cancel();
  await work;
});

test("malformed envelopes and non-local valid blueprints fail closed", async () => {
  const blueprint = await createFixtureRaid("archive");
  for (const envelope of [
    null,
    {
      type: "local-import-result",
      requestId: 1,
      result: { ok: true, value: blueprint },
    },
    {
      type: "local-import-result",
      requestId: 1,
      result: { ok: false, code: "x", error: "x" },
      extra: true,
    },
    {
      type: "local-import-result",
      requestId: 1,
      result: { ok: true, value: {} },
    },
  ]) {
    const { client, workers } = fixture();
    const work = client.importFiles(file());
    await tick();
    workers[0].emit(envelope);
    assert.equal((await work).code, "invalid-local-result");
    assert.equal(workers[0].terminated, 1);
    assert.equal(workers[0].handlers.size, 0);
  }
});

test("safe worker errors are retryable and unsupported Worker never falls back to UI parsing", async () => {
  const { client, workers } = fixture();
  let work = client.importFiles(file());
  await tick();
  workers[0].dispatchEvent(new Event("error"));
  assert.equal((await work).code, "local-worker-failed");
  work = client.importFiles(file());
  await tick();
  reply(workers[1], { ok: false, code: "invalid-utf8", error: "UTF-8" });
  assert.equal((await work).code, "invalid-utf8");
  assert.equal(workers[1].terminated, 1);
  const unavailable = fixture({
    createWorker: () => {
      throw Error("Worker unavailable");
    },
  });
  assert.equal(
    (await unavailable.client.importFiles(file())).code,
    "local-worker-unavailable",
  );
});

test("revoked live permission before worker delivery rejects result and preserves caller state", async () => {
  let allowed = true;
  const { client, workers } = fixture({ isAllowed: () => allowed });
  const work = client.importFiles(file());
  await tick();
  allowed = false;
  reply(workers[0], { ok: false, code: "anything", error: "anything" });
  assert.equal((await work).code, "local-disabled");
  assert.equal(workers[0].terminated, 1);
});

test("disposed client cannot start work and a late read cannot revive it", async () => {
  const pending = deferred(),
    { client, workers } = fixture();
  const work = client.importFiles(
    file("<h1>Pending</h1>", { arrayBuffer: () => pending.promise }),
  );
  client.dispose();
  assert.equal((await work).code, "cancelled");
  pending.resolve(new ArrayBuffer(10));
  await tick();
  assert.equal(workers.length, 0);
  assert.equal((await client.importFiles(file())).code, "cancelled");
});

test("processing deadline terminates worker and rejects late result", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { client, workers } = fixture();
  const work = client.importFiles(file());
  await tick();
  assert.equal(workers.length, 1);
  t.mock.timers.tick(4999);
  assert.equal(workers[0].terminated, 0);
  t.mock.timers.tick(1);
  assert.equal((await work).code, "local-timeout");
  assert.equal(workers[0].terminated, 1);
  assert.equal(workers[0].handlers.size, 0);
  t.mock.timers.reset();
});

test("a successful worker blueprint is returned only after full independent verification", async () => {
  const { reconstructLocalCode } = await import("../src/raid/local-code.ts");
  const generated = await reconstructLocalCode({
    html: new TextEncoder().encode("<h1>Local</h1>"),
    capturedAt: "2026-10-03T12:00:00.000Z",
  });
  assert.equal(generated.ok, true);
  const { client, workers } = fixture();
  const work = client.importFiles(file());
  await tick();
  reply(workers[0], generated);
  const result = await work;
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, generated.value);
  assert.notEqual(result.value, generated.value);
  assert.equal(workers[0].terminated, 1);
  assert.equal(workers[0].handlers.size, 0);
});

for (const action of ["cancel", "revoke"])
  test(`${action} during successful blueprint digest cannot deliver a selected result`, async (t) => {
    const { reconstructLocalCode } = await import("../src/raid/local-code.ts");
    const generated = await reconstructLocalCode({
      html: new TextEncoder().encode("<h1>Local</h1>"),
      capturedAt: "2026-10-03T12:00:00.000Z",
    });
    assert.equal(generated.ok, true);
    const held = deferred(),
      digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
    let called = false,
      allowed = true;
    t.mock.method(globalThis.crypto.subtle, "digest", (...args) => {
      if (!called) {
        called = true;
        return held.promise.then(() => digest(...args));
      }
      return digest(...args);
    });
    const { client, workers } = fixture({ isAllowed: () => allowed });
    const work = client.importFiles(file());
    await tick();
    reply(workers[0], generated);
    assert.equal(called, true);
    if (action === "cancel") client.cancel();
    else allowed = false;
    held.resolve();
    const result = await work;
    assert.equal(result.ok, false);
    assert.equal(
      result.code,
      action === "cancel" ? "cancelled" : "local-disabled",
    );
    assert.equal(workers[0].terminated, 1);
    await tick();
    assert.equal(workers[0].handlers.size, 0);
  });
