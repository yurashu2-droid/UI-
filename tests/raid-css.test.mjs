import test from "node:test";
import assert from "node:assert/strict";
import { createStaticIngestService } from "../server/site-ingest/service.js";
import { verifyRaidBlueprint } from "../src/raid/blueprint.js";
const URL = "https://books.toscrape.com/";
const CSS_URL = URL + "static/oscar/css/styles.css";
const HTML =
  '<title>Styled source</title><link rel=stylesheet href="static/oscar/css/styles.css"><h1>Source store</h1><button class="btn buy">Add to basket</button>';
const CSS =
  ".btn {padding:6px 18px;border:2px solid #112233;border-radius:12px;font-size:18px;font-weight:700;text-align:center;font-family:Georgia,serif}.buy {color:#fff;background-color:#428bca}";

test("one declared fixed stylesheet contributes safe source color type spacing and shape", async () => {
  const calls = [];
  const service = createStaticIngestService({
    transport: async (url, options) => {
      calls.push({ url, options });
      return new Response(url === CSS_URL ? CSS : HTML, {
        headers: { "content-type": url === CSS_URL ? "text/css" : "text/html" },
      });
    },
  });
  const result = await service.reconstruct(URL);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(
    calls.map((c) => c.url),
    [URL, CSS_URL],
  );
  for (const c of calls) {
    assert.equal(c.options.credentials, "omit");
    assert.equal(c.options.redirect, "error");
  }
  const b = result.value,
    buy = b.components.find((c) => c.evidence === "purchase"),
    box = buy.appearance.primitives.find((p) => p.kind === "rect"),
    label = buy.appearance.primitives.find((p) => p.kind === "text");
  assert.equal(box.fill, "#428bca");
  assert.equal(box.radius, 12);
  assert.equal(box.borderWidth, 2);
  assert.equal(box.borderColor, "#112233");
  assert.equal(label.font, "serif");
  assert.equal(label.size, 18);
  assert.equal(label.weight, "bold");
  assert.equal(label.align, "center");
  assert.equal(label.rect.x, 18);
  assert.equal(b.analysis.styles, "safe-css-subset-v1");
  assert.equal(b.analysis.css.stylesheetHashes.length, 1);
  assert.equal((await verifyRaidBlueprint(b)).ok, true);
});

test("stylesheet discovery never requests arbitrary links imports fonts or CSS resource URLs", async () => {
  const calls = [];
  const html =
    HTML +
    '<link rel=stylesheet href="https://evil.example/x.css"><link rel=stylesheet href="/other.css"><style>@import "http://127.0.0.1/x"; @font-face {font-family:Bad;src:url(https://evil.example/font)} button {background:url(http://localhost/a);color:#123456}</style>';
  const dangerous =
    '@import "https://evil.example/a";@media (min-width:0px){.buy{background:#ff0000}}@font-face{font-family:Bad;src:url(https://evil.example/font)}' +
    CSS +
    " .buy {background-image:url(http://127.0.0.1/a);font-family:url(https://evil.example/serif);padding:999999px;border-radius:calc(100px);width:100000px}";
  const service = createStaticIngestService({
    transport: async (url) => {
      calls.push(url);
      return new Response(url === CSS_URL ? dangerous : html, {
        headers: { "content-type": url === CSS_URL ? "text/css" : "text/html" },
      });
    },
  });
  const result = await service.reconstruct(URL);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(calls, [URL, CSS_URL]);
  assert.doesNotMatch(
    JSON.stringify(result.value),
    /127\.0\.0\.1|evil\.example|url\(|@import|@font-face/,
  );
  assert.equal(
    result.value.components.find((c) => c.evidence === "purchase").appearance
      .background,
    "#428bca",
  );
});

test("bad CSS responses are bounded and fall back to usable HTML-only reconstruction", async () => {
  for (const response of [
    () =>
      new Response("x".repeat(262145), {
        headers: { "content-type": "text/css" },
      }),
    () =>
      new Response("", {
        status: 302,
        headers: { location: "http://127.0.0.1" },
      }),
    () =>
      new Response("<script/>", { headers: { "content-type": "text/html" } }),
  ]) {
    let calls = 0;
    const service = createStaticIngestService({
      transport: async (url) => {
        calls++;
        return url === CSS_URL
          ? response()
          : new Response(HTML, { headers: { "content-type": "text/html" } });
      },
    });
    const result = await service.reconstruct(URL);
    assert.equal(result.ok, true, result.error);
    assert.equal(calls, 2);
    assert.equal(result.value.analysis.css.stylesheetHashes.length, 0);
    assert.match(result.value.warnings.join(" "), /CSS.*取得/);
  }
});

test("CSS rule and declaration budgets stop unbounded selectors without losing safe validation", async () => {
  const html =
    "<title>Limits</title><style>" +
    Array.from({ length: 5000 }, (_, i) => `.x${i}{color:#123456}`).join("") +
    "</style><h1>Visible title</h1><button>Add to basket</button>";
  const service = createStaticIngestService({
    transport: async () =>
      new Response(html, { headers: { "content-type": "text/html" } }),
  });
  const result = await service.reconstruct("https://example.com/");
  assert.equal(result.ok, true, result.error);
  assert.equal(result.value.analysis.css.limited, true);
  assert.ok(result.value.analysis.css.rules <= 1024);
});

test("cancelling a stylesheet fetch aborts the entire reconstruction and keeps the shared job slot bounded", async () => {
  const controller = new AbortController();
  let fetchingCss;
  const started = new Promise((resolve) => {
    fetchingCss = resolve;
  });
  const service = createStaticIngestService({
    transport: async (url, options) => {
      if (url !== CSS_URL)
        return new Response(HTML, { headers: { "content-type": "text/html" } });
      fetchingCss();
      return new Promise((_, reject) =>
        options.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        ),
      );
    },
  });
  const pending = service.reconstruct(URL, controller.signal);
  await started;
  assert.equal(
    (await service.reconstruct("https://example.com/")).code,
    "busy",
  );
  controller.abort();
  assert.equal((await pending).code, "cancelled");
});

test("disabled alternate and print stylesheets do not use the one-asset request budget", async () => {
  for (const attrs of [
    "disabled",
    'media="print"',
    'rel="alternate stylesheet"',
  ]) {
    let calls = 0;
    const html = `<title>Inactive style</title><link ${attrs} ${attrs.startsWith("rel=") ? "" : 'rel="stylesheet"'} href="static/oscar/css/styles.css"><h1>Visible heading</h1>`;
    const service = createStaticIngestService({
      transport: async () => {
        calls++;
        return new Response(html, { headers: { "content-type": "text/html" } });
      },
    });
    const result = await service.reconstruct(URL);
    assert.equal(result.ok, true, result.error);
    assert.equal(calls, 1);
  }
});

test("previous code-approximation manifests still verify without new CSS metadata", async () => {
  const { sealRaidBlueprint } = await import("../src/raid/blueprint.js");
  const service = createStaticIngestService({
    transport: async () =>
      new Response("<title>Old capture</title><h1>Original</h1>", {
        headers: { "content-type": "text/html" },
      }),
  });
  const { captureId, ...old } = (
    await service.reconstruct("https://example.com/")
  ).value;
  delete old.analysis.css;
  old.analysis.styles = "inline-and-embedded-subset";
  old.analysis.omitted[0] = "external-stylesheets";
  const frozen = await sealRaidBlueprint(old);
  assert.equal((await verifyRaidBlueprint(frozen)).ok, true);
});

test("embedded styles ignore print-only, conditional and non-CSS blocks during screen approximation", async () => {
  const { analyzeStaticCode } = await import('../server/site-ingest/code.js');
  for (const attributes of ['media="print"', 'media="screen and (max-width: 1px)"', 'type="text/plain"']) {
    const parsed = analyzeStaticCode(`<style ${attributes}>h1{display:none}</style><h1>Visible screen heading</h1>`);
    assert.equal(parsed.candidates.filter(c => c.kind === 'heading').length, 1, attributes);
  }
  for (const attributes of ['', 'media="ALL"', 'media=" screen "', 'type="text/css"']) {
    const parsed = analyzeStaticCode(`<style ${attributes}>h1{color:#2468ac}</style><h1>Screen heading</h1>`);
    assert.equal(parsed.candidates.find(c => c.kind === 'heading').style.color, '#2468ac', attributes);
  }
});

test("reviewed external CSS uses the same normalized unconditional screen eligibility", async () => {
  for (const attributes of ['media="SCREEN"', 'media=" all "']) {
    const calls = [];
    const html = `<link rel="stylesheet" ${attributes} href="static/oscar/css/styles.css"><h1>Visible heading</h1>`;
    const service = createStaticIngestService({ transport: async url => {
      calls.push(url);
      return new Response(url === CSS_URL ? 'h1{color:#2468ac}' : html, { headers: { 'content-type': url === CSS_URL ? 'text/css' : 'text/html' } });
    }});
    assert.equal((await service.reconstruct(URL)).ok, true);
    assert.deepEqual(calls, [URL, CSS_URL]);
  }
});
