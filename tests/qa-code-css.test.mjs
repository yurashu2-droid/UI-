import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createStaticIngestService } from "../server/site-ingest/service.js";
import { reconstructStaticCode } from "../server/site-ingest/code.js";
import { safeDeclarations } from "../server/site-ingest/css.js";
import { verifyRaidBlueprint } from "../src/raid/index.js";
const PAGE = "https://books.toscrape.com/", SHEET = PAGE + "static/oscar/css/styles.css";
const html = links => `<title>QA CSS source</title>${links}<h1>Visible heading</h1><article><h3>Visible book</h3><button>Add to basket</button></article>`;
const link = '<link rel="stylesheet" href="/static/oscar/css/styles.css">';
const css = 'button {color:#fff;background:#123456;border:2px solid #abcdef;padding:6px 12px}';
const hash = text => createHash("sha256").update(text).digest("hex");

test("QA: repeated stylesheet links fetch once and only the exact declared asset can be requested", async () => {
  for (const [links, expected] of [
    [link.repeat(6), [PAGE, SHEET]],
    ['<link rel=stylesheet href="/static/oscar/css/styles.css?x=1">', [PAGE]],
    ['<link rel=stylesheet href="https://books.toscrape.com.evil.example/static/oscar/css/styles.css">', [PAGE]],
    ['<link rel="alternate stylesheet" href="/static/oscar/css/styles.css">', [PAGE]],
    ['<link rel=stylesheet disabled href="/static/oscar/css/styles.css">', [PAGE]],
    ['<link rel=stylesheet media=print href="/static/oscar/css/styles.css">', [PAGE]],
    ['', [PAGE]],
  ]) {
    const calls = [];
    const service = createStaticIngestService({ transport: async url => {
      calls.push(url);
      return new Response(url === SHEET ? css : html(links), { headers: { "content-type": url === SHEET ? "text/css" : "text/html" } });
    } });
    const result = await service.reconstruct(PAGE);
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(calls, expected);
  }
});

test("QA: CSS response URL spoofing and streamed oversize fall back without storing an untrusted stylesheet hash", async () => {
  for (const variant of ["mismatched-url", "redirected", "stream-overflow"]) {
    const calls = [];
    const service = createStaticIngestService({ transport: async url => {
      calls.push(url);
      if (url === PAGE) return new Response(html(link), { headers: { "content-type": "text/html" } });
      const response = variant === "stream-overflow"
        ? new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(200000).fill(32)); controller.enqueue(new Uint8Array(100000).fill(32)); controller.close(); } }), { headers: { "content-type": "text/css" } })
        : new Response(css, { headers: { "content-type": "text/css" } });
      if (variant === "mismatched-url") Object.defineProperty(response, "url", { value: "https://unrelated.example/sheet.css" });
      if (variant === "redirected") Object.defineProperty(response, "redirected", { value: true });
      return response;
    } });
    const result = await service.reconstruct(PAGE);
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(calls, [PAGE, SHEET]);
    assert.deepEqual(result.value.analysis.css.stylesheetHashes, []);
    assert.match(result.value.warnings.join(" "), /CSS.*取得/);
    assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
  }
});

test("QA: CSS values cannot carry active resources, non-finite dimensions or prototype-derived colors", () => {
  for (const attack of [
    'background:url(https://unrelated.example/a);font-family:url(https://unrelated.example/font);border-radius:expression(alert(1))',
    'padding:Infinitypx;font-size:NaNpx;border-width:1e309px;border-radius:-3px',
    'background:constructor;color:__proto__;border-color:toString',
    'background:u\\72l(https://unrelated.example/a);font-family:var(--font);padding:calc(2px + 4px)',
  ]) assert.deepEqual(safeDeclarations(attack), {});
  assert.deepEqual(safeDeclarations('color:#123456; padding:32px 0; border:8px solid #abcdef'), {
    color: '#123456', padding: [32,0,32,0], borderWidth:8, borderColor:'#abcdef',
  });
});

test("QA: a stylesheet content mismatch cannot become a frozen source appearance", async () => {
  const sourceHtml = html(link);
  await assert.rejects(() => reconstructStaticCode({
    requestedUrl:PAGE, html:sourceHtml, bytes:Buffer.byteLength(sourceHtml), sourceHash:hash(sourceHtml),
    capturedAt:"2026-10-02T00:00:00.000Z", extraction:{title:"QA CSS source",candidates:[]},
    stylesheets:[{css,sourceHash:hash(css+" /* changed */")}],
  }), /stylesheet-hash-mismatch/);
});

test("QA: cancel while fetching CSS fails closed and releases the single-job lock", async () => {
  let started, finish;
  const cssStarted = new Promise(resolve => { started=resolve; });
  let hold = true;
  const service = createStaticIngestService({ transport: async url => {
    if (url === PAGE) return new Response(html(link), {headers:{"content-type":"text/html"}});
    if (hold) { started(); await new Promise(resolve => { finish=resolve; }); }
    return new Response(css,{headers:{"content-type":"text/css"}});
  } });
  const controller = new AbortController();
  const pending = service.reconstruct(PAGE,controller.signal);
  await cssStarted;
  assert.equal((await service.reconstruct(PAGE)).code,"busy");
  controller.abort(); finish();
  assert.equal((await pending).code,"cancelled");
  hold=false;
  const next=await service.reconstruct(PAGE);
  assert.equal(next.ok,true,next.error);
  assert.deepEqual(next.value.analysis.css.stylesheetHashes,[hash(css)]);
});
