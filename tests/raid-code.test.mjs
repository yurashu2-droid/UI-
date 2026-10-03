import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as raid from "../src/raid/index.js";
import * as ingest from "../server/site-ingest/service.js";

const HTML = `<!doctype html><title>Actual source bookstore</title><nav>${Array.from({ length: 70 }, (_, i) => `<a href='/category/${i}'>Category ${i}</a>`).join("")}</nav><main><h1>All actual books</h1><article><h3><a title='Actual book Alpha' href='/a'>Alpha...</a></h3><button style='background-color:#286e4a;color:#fff'>Add to basket</button></article><article><h3>Actual book Beta</h3><button>Add to basket</button></article></main><script>throw Error('never execute')</script><input type=password value=secret><img src='http://127.0.0.1/private.png'>`;

test("actual fetched HTML becomes an explicitly approximate playable snapshot with representative source groups", async () => {
  const calls = [];
  const service = ingest.createStaticIngestService({
    transport: async (url, options) => {
      calls.push({ url, options });
      return new Response(HTML, { headers: { "content-type": "text/html" } });
    },
  });
  assert.equal(typeof service.reconstruct, "function");
  const result = await service.reconstruct("https://books.toscrape.com/");
  assert.equal(result.ok, true, result.error);
  const b = result.value;
  assert.equal(b.source.kind, "static-public");
  assert.equal(b.extractorVersion, "code-v1");
  assert.equal(b.fidelity, "code-approximation");
  assert.equal(
    b.analysis.sourceHash,
    createHash("sha256").update(HTML).digest("hex"),
  );
  assert.equal(b.analysis.layout, "inferred-flow");
  assert.equal(b.analysis.confidence, "low");
  assert.equal(b.analysis.styles, "safe-css-subset-v1");
  assert.equal(b.analysis.candidateCount > 70, true);
  assert.equal((await raid.verifyRaidBlueprint(b)).ok, true);
  assert.ok(raid.createRaidEnemy(b).length >= 6);
  const text = b.components
    .flatMap((c) =>
      c.appearance.primitives
        .filter((p) => p.kind === "text")
        .map((p) => p.text),
    )
    .join(" ");
  assert.match(text, /Actual book Alpha/);
  assert.match(text, /Actual book Beta/);
  assert.match(text, /Add to basket/);
  for (const c of b.components) {
    assert.equal(c.sourceRect, null);
    assert.ok(c.sourceNode.order > 0);
    assert.equal(typeof c.sourceNode.path, "string");
  }
  const products = b.components.filter((c) => c.evidence === "product");
  for (const product of products)
    assert.ok(
      b.components.some(
        (c) =>
          c.evidence === "purchase" &&
          c.sourceNode.group === product.sourceNode.group,
      ),
    );
  assert.equal(
    b.components.filter((c) => c.evidence === "navigation").length <= 3,
    true,
  );
  assert.equal(
    calls.length,
    1,
    "no stylesheets/images/scripts/subresources fetched",
  );
  assert.doesNotMatch(
    JSON.stringify(b),
    /private\.png|127\.0\.0\.1|secret|never execute/,
  );
  assert.equal(
    b.components.find((c) => c.evidence === "purchase").appearance.background,
    "#286e4a",
  );
  assert.match(b.warnings.join(" "), /コード解析による近似配置/);
  const loot = raid
    .prepareRaidRewards(b, "actual-code-win")
    .find((r) => r.componentId === products[0].componentId);
  assert.equal(
    raid.createRaidLootItem(loot, "p1").appearanceId,
    products[0].appearanceId,
  );
  assert.equal(service.capabilities().publicStaticCapture, false);
  assert.equal(service.capabilities().publicCodeReconstruction, true);
});

test("approximation requires actual supported fetched source and cannot claim measured coordinates", async () => {
  const service = ingest.createStaticIngestService({
    transport: async () =>
      new Response(HTML, { headers: { "content-type": "text/html" } }),
  });
  assert.equal(typeof service.reconstruct, "function");
  assert.equal((await service.reconstruct("http://127.0.0.1/")).ok, false);
  const result = await service.reconstruct("https://example.com/");
  assert.equal(result.ok, true);
  const b = structuredClone(result.value);
  b.components[0].sourceRect = { x: 1, y: 1, w: 300, h: 100 };
  assert.equal(raid.validateRaidBlueprint(b).ok, false);
  const invalid = structuredClone(result.value);
  invalid.analysis.sourceHash = "invented";
  assert.equal(raid.validateRaidBlueprint(invalid).ok, false);
});

test("the client accepts only the requested real code analysis through the dedicated endpoint", async () => {
  const service = ingest.createStaticIngestService({
    transport: async () =>
      new Response(HTML, { headers: { "content-type": "text/html" } }),
  });
  const calls = [];
  const result = await raid.requestRaidCapture(
    "https://books.toscrape.com/",
    undefined,
    async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/capabilities"))
        return Response.json(service.capabilities());
      const capture = await service.reconstruct(JSON.parse(options.body).url);
      return Response.json(capture.value);
    },
  );
  assert.equal(result.ok, true, result.error);
  assert.equal(result.value.fidelity, "code-approximation");
  assert.equal(calls[1].url, "/api/raid-captures/code");
  assert.equal(calls[1].options.redirect, "error");
});

test("empty hydrated shells do not invent an enemy and embedded CSS is interpreted only as safe values", async () => {
  const shell = ingest.createStaticIngestService({
    transport: async () =>
      new Response(
        '<title>App</title><div id=app></div><script>fetch("/api/data")</script>',
        { headers: { "content-type": "text/html" } },
      ),
  });
  assert.equal(
    (await shell.reconstruct("https://example.com/")).code,
    "no-playable-elements",
  );
  const styled = ingest.createStaticIngestService({
    transport: async () =>
      new Response(
        "<title>Style</title><style>.hidden {display:none} .buy {background-color:#123456;color:white;background-image:url(http://127.0.0.1/x)}</style><h1>Source heading</h1><button class=buy>Add to cart</button><h2 class=hidden>Hidden source</h2>",
        { headers: { "content-type": "text/html" } },
      ),
  });
  const b = (await styled.reconstruct("https://example.com/")).value;
  assert.equal(
    b.components.find((c) => c.evidence === "purchase").appearance.background,
    "#123456",
  );
  assert.doesNotMatch(JSON.stringify(b), /Hidden source|127\.0\.0\.1|url\(/);
});

test("the code mapper rejects a source digest that does not describe the HTML it was given", async () => {
  const { reconstructStaticCode } =
    await import("../server/site-ingest/code.js");
  await assert.rejects(
    () =>
      reconstructStaticCode({
        html: HTML,
        bytes: Buffer.byteLength(HTML),
        sourceHash: "0".repeat(64),
        requestedUrl: "https://example.com/",
        capturedAt: "2026-10-02T15:00:00.000Z",
        extraction: { title: "x", candidates: [] },
      }),
    /source-hash-mismatch/,
  );
});

test("product title and purchase detection ignore hidden leaves and hidden ancestors", async () => {
  const { analyzeStaticCode } = await import("../server/site-ingest/code.js");
  const a = analyzeStaticCode(
    '<title>Visible</title><article><h3><a style="display:none" title="HIDDEN-NAME">hidden</a>Visible book</h3><button>Add to basket</button></article><article><h3>Ordinary article</h3><div hidden><button>Add to cart</button></div></article>',
  );
  assert.equal(
    a.candidates.find((c) => c.kind === "product").label,
    "Visible book",
  );
  assert.equal(a.candidates.filter((c) => c.kind === "product").length, 1);
  assert.doesNotMatch(JSON.stringify(a), /HIDDEN-NAME|Add to cart/);
});

test("invalid CSS named colors cannot resolve Object prototype properties", async () => {
  const service = ingest.createStaticIngestService({
    transport: async () =>
      new Response(
        '<title>Safe colors</title><h1 style="background:constructor;color:__proto__">A heading</h1>',
        { headers: { "content-type": "text/html" } },
      ),
  });
  const result = await service.reconstruct("https://example.com/");
  assert.equal(result.ok, true, result.error);
  assert.equal(
    typeof result.value.components[0].appearance.background,
    "string",
  );
});
