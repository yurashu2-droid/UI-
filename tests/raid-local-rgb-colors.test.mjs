import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { IDBFactory } from "fake-indexeddb";
import {
  safeDeclarations,
  createSafeStyleReader,
  CSS_LIMITS,
} from "../src/raid/code-css.js";
import {
  analyzeLocalCode,
  analyzeStaticCode,
  reconstructCodeAnalysis,
  reconstructStaticCode,
} from "../src/raid/code.js";
import { reconstructLocalCode } from "../src/raid/local-code.js";
import { processLocalImportMessage } from "../src/raid/local-import-worker.js";
import { verifyRaidBlueprint } from "../src/raid/blueprint.js";
import { createProfileStore } from "../src/profile-store.js";

const local = { localOpaqueRgb: true };
const capturedAt = "2026-10-03T03:20:00.000Z";
const bytes = (text) => new TextEncoder().encode(text);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const rgbSource =
  '<title>RGB paper shop</title><style>body{color:rgb(18,52,86)}button{background:rgb(101,67,33);border:2px solid rgb(17,34,51)}</style><h1>Paper shop</h1><button style="color:rgba(100% 100% 100% / 100%)">Buy paper</button>';
const unchangedSource =
  '<title>Unchanged local</title><style>body{color:#123456}button{background:#654321;border:2px solid #112233}</style><h1>Paper shop</h1><button style="color:#ffffff">Buy paper</button><label><input type="checkbox">Recycled paper</label><input type="button" value="Buy ink">';
const text = (part) =>
  part.appearance.primitives.find((p) => p.kind === "text");
const rect = (part) =>
  part.appearance.primitives.find((p) => p.kind === "rect");
async function capture(html, css) {
  const result = await reconstructLocalCode({
    html: bytes(html),
    capturedAt,
    ...(css === undefined
      ? {}
      : { stylesheet: { name: "theme.css", bytes: bytes(css) } }),
  });
  assert.equal(result.ok, true, result.error);
  assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
  return result.value;
}

// Removing the local RGB opt-in must fail these real color/blueprint assertions.
// Syntax/ranges: https://www.w3.org/TR/css-color-4/#rgb-functions
test("local opaque RGB literals normalize to bounded six-digit sRGB colors", () => {
  for (const [value, expected] of [
    ["rgb(18, 52, 86)", "#123456"],
    ["rgba(18,52,86)", "#123456"],
    ["RGB(+18 +52 +86)", "#123456"],
    ["rgba(18 52 86 / 1.0)", "#123456"],
    ["rgb(18,52,86,100%)", "#123456"],
    ["rgba(100%, 50%, 0%, 1)", "#ff8000"],
    ["rgb(100% 128 0% / 100%)", "#ff8000"],
    ["rgb(18.49 51.5 85.5)", "#123456"],
    ["rgb(-1 999 .5 / 2)", "#00ff01"],
    ["rgb(-1% 101% 0% / 101%)", "#00ff00"],
    ["rgba(\n18\t52\r86\f/ 1)", "#123456"],
  ]) {
    assert.deepEqual(
      safeDeclarations(`color:${value}`, local),
      { color: expected },
      value,
    );
    assert.deepEqual(
      safeDeclarations(`color:${value}`),
      {},
      "public/default: " + value,
    );
  }
});

test("local RGB supports only existing color properties and solid border grammar", () => {
  assert.deepEqual(
    safeDeclarations(
      "color:rgb(18,52,86);background-color:rgb(101 67 33);border-color:rgba(17,34,51,1)",
      local,
    ),
    {
      color: "#123456",
      background: "#654321",
      borderColor: "#112233",
    },
  );
  for (const border of [
    "2px solid rgb(17, 34, 51)",
    "rgba(17 34 51 / 1) solid 2px",
    "solid 2px RGB(17 34 51)",
  ])
    assert.deepEqual(
      safeDeclarations(`border:${border}`, local),
      { borderWidth: 2, borderColor: "#112233" },
      border,
    );
  assert.deepEqual(
    safeDeclarations("background:rgb(18 52 86)!important", local),
    { background: "#123456" },
  );
  for (const declaration of [
    "border:2px dashed rgb(1,2,3)",
    "border:2px solid rgb(1,2,3) rgb(4,5,6)",
    "border:99px solid rgb(1,2,3)",
    "border:2px solidrgb(1,2,3)",
    "background:rgb(1,2,3) none",
    "background:rgb(1,2,3),red",
    "border-color:rgb(1,2,3) red",
    "font-family:rgb(1,2,3),serif",
    "padding:rgb(1,2,3)",
    "unknown:rgb(1,2,3)",
  ])
    assert.deepEqual(safeDeclarations(declaration, local), {}, declaration);
});

test("mixed separators nonliteral channels transparency and malformed RGB fail closed", () => {
  for (const value of [
    "rgb(1,2 3)",
    "rgb(1 2,3)",
    "rgb(1,2,3 / 1)",
    "rgb(1 2 3,1)",
    "rgb(1%,2,3%)",
    "rgb(1,2,3,)",
    "rgb(1 2)",
    "rgb(1 2 3 4)",
    "rgb(1 2 3 / 1 / 1)",
    "rgb(1 2 3 /)",
    "rgb(1 2 3) junk",
    "rgb (1,2,3)",
    "rgb(1e2 0 0)",
    "rgb(1. 2 3)",
    "rgb(Infinity 0 0)",
    "rgb(NaN 0 0)",
    "rgb(none 0 0)",
    "rgb(1 2 3 / none)",
    "rgb(from red r g b)",
    "rgb(calc(1) 2 3)",
    "rgb(var(--r) 2 3)",
    "rgb(1\u00a02\u00a03)",
    "rgba(1,2,3,0)",
    "rgb(1 2 3 / .999)",
    "rgb(1 2 3 / 99.999%)",
    "rgb(1 2 3 / -1)",
    "hsl(0 100% 50%)",
    "color(srgb 1 0 0)",
    "rgb(1,2,3",
    "rgb((1),2,3)",
    String.raw`r\67b(1,2,3)`,
    "rgb(1px 2 3)",
    "rgb(1% % 3)",
    `rgb(${"9".repeat(400)} 2 3)`,
  ]) {
    assert.deepEqual(
      safeDeclarations(`color:#abcdef;color:${value}`, local),
      { color: "#abcdef" },
      value,
    );
  }
});

test("declaration lexing remains inert around RGB-looking comments strings and resources", () => {
  assert.deepEqual(
    safeDeclarations(
      "/* note; ignored */ color:rgb(18,/* note */52,86);border:2px/**/solid/**/rgb(17 34 51)",
      local,
    ),
    {
      color: "#123456",
      borderWidth: 2,
      borderColor: "#112233",
    },
  );
  for (const declaration of [
    'content:"ignored; background:rgb(1,2,3);display:none;";',
    "--color:rgb(1,2,3);",
    "background:url(https://evil.invalid/rgb(1,2,3));",
    "background:rgb(1,2,3) url(https://evil.invalid/a);",
    "background:linear-gradient(rgb(1,2,3),red);",
    "border:var(--b,2px solid rgb(1,2,3));",
    "color:rgb(1/**/8 52 86);",
    "color:r/**/gb(18 52 86);",
    "border:2px solid 'rgb(1,2,3)';",
  ])
    assert.deepEqual(safeDeclarations(declaration, local), {}, declaration);
  assert.deepEqual(
    safeDeclarations(
      'content:"ignored;display:none;";color:rgb(18 52 86)',
      local,
    ),
    { color: "#123456" },
  );
});

test("embedded and inline local RGB reach sealed appearance without changing semantic geometry", async () => {
  const b = await capture(rgbSource);
  assert.equal(
    text(b.components[0]).color,
    "#123456",
    "body text color is inherited",
  );
  assert.equal(
    text(b.components[1]).color,
    "#ffffff",
    "inline literal overrides inherited text",
  );
  assert.equal(b.components[1].appearance.background, "#654321");
  assert.equal(rect(b.components[1]).borderColor, "#112233");
  assert.equal(rect(b.components[1]).borderWidth, 2);
  const hex = await capture(
    rgbSource
      .replace("rgb(18,52,86)", "#123456")
      .replace("rgb(101,67,33)", "#654321")
      .replace("rgb(17,34,51)", "#112233")
      .replace("rgba(100% 100% 100% / 100%)", "#ffffff"),
  );
  assert.deepEqual(b.components, hex.components);
  assert.deepEqual(b.decor, hex.decor);
  assert.notEqual(
    b.captureId,
    hex.captureId,
    "source bytes keep distinct provenance",
  );
  assert.equal(b.analysis.sourceHash, hash(rgbSource));
  assert.equal(b.source.kind, "local-file");
  assert.equal(b.fidelity, "code-approximation");
  assert.equal(b.analysis.confidence, "low");
  assert.ok(b.components.every((c) => c.sourceRect === null));
});

test("selected RGB stylesheet respects exact link source order and Worker result validation", async (t) => {
  t.mock.method(globalThis, "fetch", () =>
    assert.fail("local RGB must not fetch"),
  );
  const embedded = "<style>button{background:rgb(18 52 86)}</style>";
  const link = '<link rel="stylesheet" href="./theme.css">';
  const body = '<button style="color:rgba(255,255,255,1)">Buy paper</button>';
  const css =
    "button{background:rgb(101 67 33);border:2px solid rgb(17 34 51)}";
  const html = embedded + link + body;
  const b = await capture(html, css);
  assert.equal(b.components[0].appearance.background, "#654321");
  assert.equal(text(b.components[0]).color, "#ffffff");
  assert.equal(rect(b.components[0]).borderColor, "#112233");
  assert.deepEqual(b.analysis.css.stylesheetHashes, [hash(css)]);
  assert.equal(
    (await capture(link + embedded + body, css)).components[0].appearance
      .background,
    "#123456",
  );
  assert.equal(
    (await capture(html)).components[0].appearance.background,
    "#123456",
  );
  const reply = await processLocalImportMessage({
    type: "import-local",
    requestId: 81,
    html: bytes(html).buffer,
    capturedAt,
    stylesheet: { name: "theme.css", bytes: bytes(css).buffer },
  });
  assert.deepEqual(reply.result, { ok: true, value: b });
  assert.equal(reply.requestId, 81);
  assert.doesNotMatch(JSON.stringify(b), /theme\.css|rgb\(|rgba\(/i);
});

test("RGB uses existing byte declaration selector rule and block budgets", async () => {
  assert.deepEqual(
    safeDeclarations(
      "unknown:0;".repeat(63) + "color:rgb(18 52 86);color:red",
      local,
    ),
    { color: "#123456" },
  );
  assert.deepEqual(
    safeDeclarations("unknown:0;".repeat(64) + "color:rgb(18 52 86)", local),
    {},
  );
  assert.deepEqual(
    safeDeclarations("/*" + ";".repeat(64) + "*/color:rgb(18 52 86)", local),
    {},
  );
  assert.deepEqual(
    safeDeclarations(" ".repeat(4096) + "color:rgb(18 52 86)", local),
    {},
  );
  const full = createSafeStyleReader(
    ["h1{color:rgb(18 52 86)}".repeat(CSS_LIMITS.rules + 1)],
    local,
  );
  assert.equal(full.rules, CSS_LIMITS.rules);
  assert.equal(full.limited, true);
  assert.equal(
    createSafeStyleReader(["a b c d e{color:rgb(18 52 86)}"], local).rules,
    0,
  );
  const blocked = createSafeStyleReader(
    ["@unused;".repeat(CSS_LIMITS.blocks) + "h1{color:rgb(18 52 86)}"],
    local,
  );
  assert.equal(blocked.rules, 0);
  assert.equal(blocked.limited, true);
  const oversized = await reconstructLocalCode({
    html: bytes(
      "<style>" +
        " ".repeat(CSS_LIMITS.bytes) +
        "h1{color:rgb(1 2 3)}</style><h1>Bounded</h1>",
    ),
    capturedAt,
  });
  assert.equal(oversized.code, "source-too-large");
});

test("public/default RGB analysis and prior local non-RGB captures retain whole-result hashes", async () => {
  const unchanged = await capture(unchangedSource);
  assert.equal(
    hash(JSON.stringify(unchanged)),
    "fafa7f74ca5eb800223293409be1cc2669f95f8d2f6851b3c782709bd320e70f",
  );
  assert.equal(
    unchanged.captureId,
    "capture_735147617eb56793ff1efea76b06499f34d17e8817f6848e5085349df2fab958",
  );
  for (const [html, expected] of [
    [
      rgbSource,
      "51bcd01d79bed0f5b1ee91c2a56e334ed56e115f9fc7ecac25115c50cc45115b",
    ],
    [
      unchangedSource,
      "a2c4a918e006f3b2979f31a2bb5f6c1403bd76a07442f91bc8e168bc5b89304d",
    ],
  ]) {
    const pub = await reconstructStaticCode({
      html,
      sourceHash: hash(html),
      capturedAt,
      requestedUrl: "https://example.com/",
    });
    assert.equal(hash(JSON.stringify(pub)), expected);
    assert.equal((await verifyRaidBlueprint(pub)).ok, true);
  }
  assert.equal(analyzeStaticCode(rgbSource).css.rules, 0);
  assert.equal(analyzeLocalCode(rgbSource).css.rules, 2);
  const oldJson = await readFile(
    new URL(
      "../fixtures/raid/compatibility/books-before-child-selectors.json",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    hash(JSON.stringify(JSON.parse(oldJson))),
    "df768a21e42f6bfda965c4237e3074e18e6830a363707d7c755bd2b8ec2151e8",
  );
  assert.equal((await verifyRaidBlueprint(JSON.parse(oldJson))).ok, true);
});

test("new local RGB capture changes its appearance while an old stored approximation stays byte-identical", async () => {
  // This source has no local-only semantic candidates. The unchanged public
  // analyzer reproduces the genuine pre-RGB local bytes pinned before edits.
  const old = await reconstructCodeAnalysis(analyzeStaticCode(rgbSource), {
    kind: "local-file",
    displayUrl: "local://" + hash(rgbSource),
    caption: "ローカルHTML / コード解析による近似配置",
    capturedAt,
    sourceHash: hash(rgbSource),
    stylesheetHashes: [],
  });
  assert.equal(
    hash(JSON.stringify(old)),
    "9b8906916f5968c7341cbf2cf63d4a3cf4f59bad2a187f0b82cd2f8926ebef84",
  );
  assert.equal(
    old.captureId,
    "capture_ee95e560415717057ae91ccd1883f50c9e7475d92a4840567bbce6bf4450fb29",
  );
  assert.equal((await verifyRaidBlueprint(old)).ok, true);
  const store = createProfileStore(new IDBFactory());
  await store.recordRaidVictory(old, "old-rgb-pending");
  const persisted = JSON.stringify(await store.getBlueprint(old.captureId));
  const pending = JSON.stringify(await store.listPendingRaids());
  const fresh = await capture(rgbSource);
  assert.equal(
    hash(JSON.stringify(fresh)),
    "c0fd3658829ccbb8e8d8ca33a3272e6b403f2f1072e753c66d14abded64021df",
  );
  assert.equal(
    fresh.captureId,
    "capture_fa0dc2c1f334226907ceaee363ed76756ebecfdafc923284412731747397ff44",
  );
  assert.notEqual(fresh.captureId, old.captureId);
  assert.notDeepEqual(
    fresh.components.map((c) => c.appearanceId),
    old.components.map((c) => c.appearanceId),
  );
  assert.deepEqual(
    fresh.components.map((c) => c.combatRect),
    old.components.map((c) => c.combatRect),
  );
  assert.equal(fresh.analysis.sourceHash, old.analysis.sourceHash);
  await store.recordRaidVictory(fresh, "new-rgb-pending");
  assert.equal(
    JSON.stringify(await store.getBlueprint(old.captureId)),
    persisted,
  );
  assert.equal(
    JSON.stringify(
      (await store.listPendingRaids()).filter(
        (p) => p.battleId === "old-rgb-pending",
      ),
    ),
    pending,
  );
});
