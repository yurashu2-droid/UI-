import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "parse5";
import { IDBFactory } from "fake-indexeddb";
import { createSafeStyleReader, CSS_LIMITS } from "../src/raid/code-css.js";
import {
  analyzeLocalCode,
  analyzeStaticCode,
  reconstructStaticCode,
} from "../src/raid/code.js";
import { reconstructLocalCode } from "../src/raid/local-code.js";
import { processLocalImportMessage } from "../src/raid/local-import-worker.js";
import {
  verifyRaidBlueprint,
  prepareRaidRewards,
} from "../src/raid/blueprint.js";
import { createProfileStore } from "../src/profile-store.js";
import R from "../src/run.js";

const local = { localInputTypeSelectors: true };
const capturedAt = "2026-10-03T03:20:00.000Z";
const bytes = (s) => new TextEncoder().encode(s);
const hash = (s) => createHash("sha256").update(s).digest("hex");
const source =
  '<title>Input style shop</title><style>input[type=submit]{background:#123456;color:#fedcba;border:2px solid #112233;padding:7px;border-radius:9px}</style><input type="submit" value="Buy paper">';
const text = (part) =>
  part.appearance.primitives.find((p) => p.kind === "text");
const rect = (part) =>
  part.appearance.primitives.find((p) => p.kind === "rect");
function targetIn(html = '<input id="target" class="buy" type="submit">') {
  const pending = [parse(html)];
  while (pending.length) {
    const n = pending.pop();
    if (n.attrs?.some((a) => a.name === "id" && a.value === "target")) return n;
    pending.push(...(n.childNodes ?? []));
  }
  throw Error("missing target");
}
async function capture(html = source, css) {
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

// Without the local selector opt-in this genuine capture has rules=0 and
// fallback #276c91/white; the intended change is sealed appearance, not pixels.
test("local exact input type styling reaches the verified canonical purchase", async () => {
  const b = await capture();
  assert.equal(b.analysis.css.rules, 1);
  assert.equal(b.components.length, 1);
  const purchase = b.components[0];
  assert.equal(purchase.canonicalType, "am_buy");
  assert.equal(purchase.evidence, "purchase");
  assert.equal(purchase.sourceRect, null);
  assert.equal(purchase.appearance.background, "#123456");
  assert.equal(text(purchase).color, "#fedcba");
  assert.deepEqual(text(purchase).rect, { x: 7, y: 7, w: 418, h: 30 });
  assert.equal(rect(purchase).borderColor, "#112233");
  assert.equal(rect(purchase).borderWidth, 2);
  assert.equal(rect(purchase).radius, 9);
  assert.equal(b.fidelity, "code-approximation");
  assert.equal(b.analysis.confidence, "low");
  assert.equal(b.analysis.sourceHash, hash(source));
  assert.doesNotMatch(JSON.stringify(b), /<input|value=|type=submit/);
});

// HTML selector case rules and raw attributes, not reflected input.type:
// https://html.spec.whatwg.org/multipage/semantics-other.html#case-sensitivity-of-selectors
// https://www.w3.org/TR/selectors-4/#attribute-selectors
test("the new local subset accepts exact quoted types ASCII case and CSS whitespace", () => {
  for (const type of ["submit", "button"]) {
    const target = targetIn(
      `<INPUT ID="target" CLASS="buy" TYPE="${type.toUpperCase()}">`,
    );
    for (const selector of [
      `input[type=${type}]`,
      `INPUT[TYPE=${type.toUpperCase()}]`,
      `input[ type = '${type}' ]`,
      `input[\nTYPE\t=\r"${type}"\f]`,
      `input.buy[type=${type}]`,
      `input[type=${type}].buy`,
      `input#target.buy[type=${type}]`,
      `input[type=${type}]#target.buy`,
    ]) {
      const reader = createSafeStyleReader(
        [`${selector}{color:#123456}`],
        local,
      );
      assert.equal(reader.rules, 1, selector);
      assert.equal(reader.styleFor(target).color, "#123456", selector);
      assert.equal(
        createSafeStyleReader([`${selector}{color:#123456}`]).rules,
        0,
        selector,
      );
    }
  }
});

test("local attribute list scanning never manufactures rules from inert fragments", () => {
  for (const selector of [
    'input[type="submit, h1, junk"]',
    '[title="junk,input[type=submit],junk"]',
    '[title="junk, input[type=submit], h1, junk"]',
    "input[/* ignored */type=submit]",
    "input[type=su/**/bmit]",
    "input[type=submit]/*, h1,*/",
    String.raw`input[type="submit\", h1, input[type=submit], junk"]`,
    String.raw`input[type=su\62mit]`,
    String.raw`[title=\[junk,input[type=submit],h1]`,
  ]) {
    const reader = createSafeStyleReader([`${selector}{color:red}`], local);
    assert.equal(reader.rules, 0, selector);
    assert.equal(reader.styleFor(targetIn()).color, undefined, selector);
    const a = analyzeLocalCode(
      `<style>${selector}{color:red}</style><h1>Visible</h1><input type="submit" value="Buy paper">`,
    );
    assert.ok(
      a.candidates.every((c) => c.style.color === undefined),
      selector,
    );
  }
});

test("unsupported types attributes flags escapes operators and states remain rejected", () => {
  for (const selector of [
    "[type=submit]",
    "*[type=submit]",
    ".buy[type=submit]",
    "button[type=submit]",
    "input[type]",
    "input[type=search]",
    "input[type=checkbox]",
    "input[type=text]",
    "input[type=hidden]",
    "input[type=password]",
    "input[type=reset]",
    "input[type=image]",
    'input[type=""]',
    'input[type=" submit "]',
    'input[type="submit" i]',
    "input[type=submit s]",
    "input[type=SUBMIT I]",
    "input[type~=submit]",
    "input[type|=submit]",
    "input[type^=sub]",
    "input[type$=mit]",
    "input[type*=submit]",
    "input[type==submit]",
    "input[type=submit][type=submit]",
    'input[value="Buy paper"]',
    "input[type=submit][disabled]",
    "input[type=submit]:hover",
    "input[type=submit]::before",
    ":is(input[type=submit])",
    "input[type=submit] + h1",
    "input[type=submit] ~ h1",
    "html|input[type=submit]",
    "|input[type=submit]",
    "*|input[type=submit]",
    "input[html|type=submit]",
    "input[|type=submit]",
    "input[*|type=submit]",
    "input [type=submit]",
    "input[type=ſubmit]",
    "input[\u00a0type=submit]",
    "input[type=submit]\u00a0h1",
    'input[type="sub\nmit"]',
    String.raw`input[ty\70e=submit]`,
    String.raw`in\70ut[type=submit]`,
    String.raw`input[type="sub\6dit"]`,
    'input[type="submit]',
    "input[type=submit]]",
    "input[[type=submit]]",
    "input#target#other[type=submit]",
  ])
    assert.equal(
      createSafeStyleReader([`${selector}{color:red}`], local).rules,
      0,
      selector,
    );
  assert.equal(
    createSafeStyleReader(["input[type=submit]{color:red}"], {
      localInputTypeSelectors: false,
    }).rules,
    0,
  );
});

test("raw HTML type values require an explicit exact supported attribute", () => {
  for (const type of [
    undefined,
    "",
    "text",
    "unknown",
    " submit ",
    "button\t",
    "ſubmit",
    "hidden",
    "password",
  ]) {
    const html = `<input id="target" ${type === undefined ? "" : `type="${type}"`} value="Buy PRIVATE">`;
    const reader = createSafeStyleReader(
      ["input[type=submit],input[type=button]{color:red}"],
      local,
    );
    assert.equal(
      reader.styleFor(targetIn(html)).color,
      undefined,
      String(type),
    );
    assert.deepEqual(
      analyzeLocalCode(`<style>input[type=submit]{color:red}</style>${html}`)
        .candidates,
      [],
      String(type),
    );
  }
  const duplicate = targetIn('<input id="target" type="button" TYPE="submit">');
  const reader = createSafeStyleReader(
    ["input[type=button]{color:blue}input[type=submit]{color:red}"],
    local,
  );
  assert.equal(
    reader.styleFor(duplicate).color,
    "#0000ff",
    "parse5 keeps the first HTML attribute",
  );
});

test("new type matching respects HTML and attribute namespaces without widening extraction", () => {
  const reader = createSafeStyleReader(
    ["input[type=submit]{color:red}"],
    local,
  );
  for (const namespaceURI of [
    "http://www.w3.org/2000/svg",
    "http://www.w3.org/1998/Math/MathML",
  ]) {
    const target = { ...targetIn(), namespaceURI };
    assert.equal(reader.styleFor(target).color, undefined);
  }
  const namespacedType = {
    ...targetIn(),
    attrs: [
      { name: "type", namespace: "urn:test", prefix: "x", value: "submit" },
    ],
  };
  assert.equal(reader.styleFor(namespacedType).color, undefined);
  for (const wrapped of [
    '<svg><input type="submit" value="Buy PRIVATE"></svg>',
    '<svg><foreignObject><input type="submit" value="Buy PRIVATE"></foreignObject></svg>',
    '<math><annotation-xml encoding="text/html"><input type="submit" value="Buy PRIVATE"></annotation-xml></math>',
    '<template><input type="submit" value="Buy PRIVATE"></template>',
    '<datalist><input type="submit" value="Buy PRIVATE"></datalist>',
  ])
    assert.deepEqual(
      analyzeLocalCode("<style>input[type=submit]{color:red}</style>" + wrapped)
        .candidates,
      [],
      wrapped,
    );
});

test("typed selectors share existing compound indexing specificity order and inline precedence", () => {
  const target = targetIn();
  for (const [css, expected] of [
    ["input[type=submit]{color:red} input{color:blue}", "#ff0000"],
    ["input[type=submit]{color:red} .buy{color:blue}", "#ff0000"],
    ["input[type=submit]{color:red} input.buy{color:blue}", "#0000ff"],
    ["input.buy{color:blue} input[type=submit]{color:red}", "#ff0000"],
    ["input.buy[type=submit]{color:red} input.buy{color:blue}", "#ff0000"],
    ["#target{color:blue} input.buy[type=submit]{color:red}", "#0000ff"],
    ["input#target[type=submit]{color:red} #target{color:blue}", "#ff0000"],
    ["input[type=button]{color:red} input{color:blue}", "#0000ff"],
    ["input.BUY[type=submit]{color:red} input{color:blue}", "#0000ff"],
    ["input#TARGET[type=submit]{color:red} input{color:blue}", "#0000ff"],
  ])
    assert.equal(
      createSafeStyleReader([css], local).styleFor(target).color,
      expected,
      css,
    );
  assert.equal(
    createSafeStyleReader(
      ["input[type=submit]{color:red}", "input[type=submit]{color:blue}"],
      local,
    ).styleFor(target).color,
    "#0000ff",
  );
  assert.equal(
    createSafeStyleReader(
      ["input#target.buy[type=submit]{color:red}"],
      local,
    ).styleFor(
      targetIn(
        '<input id="target" class="buy" type="submit" style="color:#123456">',
      ),
    ).color,
    "#123456",
  );
});

test("typed selectors compose with bounded child and descendant matching", () => {
  const target = targetIn(
    '<main class="outer"><section><div class="inside"><input id="target" type="submit"></div></section></main>',
  );
  for (const selector of [
    "main section .inside input[type=submit]",
    "main>section>.inside>input[type=submit]",
    '.outer .inside > input[ type = "submit" ]',
  ])
    assert.equal(
      createSafeStyleReader([`${selector}{color:red}`], local).styleFor(target)
        .color,
      "#ff0000",
      selector,
    );
  for (const selector of [
    "main > input[type=submit]",
    ".outer > .inside input[type=submit]",
    "body main section .inside input[type=submit]",
  ])
    assert.equal(
      createSafeStyleReader([`${selector}{color:red}`], local).styleFor(target)
        .color,
      undefined,
      selector,
    );
  const repaired = analyzeLocalCode(
    '<style>body > input[type=submit]{color:#123456}</style><table><input type="submit" value="Buy repaired"></table>',
  );
  assert.equal(
    repaired.candidates[0].style.color,
    "#123456",
    "use parse5 repaired ancestry",
  );
});

test("typed hiding excludes purchases and never turns private values into labels", async () => {
  for (const hiding of ["display:none", "visibility:hidden"]) {
    const html = `<style>input[type=submit]{${hiding}}</style><input type="submit" value="Buy PRIVATE"><button>Buy visible</button>`;
    const b = await capture(html);
    assert.deepEqual(
      b.components.map((p) => text(p).text),
      ["Buy visible"],
    );
    assert.doesNotMatch(JSON.stringify(b), /PRIVATE/);
  }
  for (const attr of ["hidden", "inert", 'aria-hidden="true"']) {
    const a = analyzeLocalCode(
      `<style>input[type=submit]{color:red}</style><input type="submit" value="Buy PRIVATE" ${attr}><button>Buy visible</button>`,
    );
    assert.deepEqual(
      a.candidates.map((c) => c.label),
      ["Buy visible"],
    );
  }
  const a = analyzeLocalCode(
    '<style>input[type=submit]{color:red}</style><input type="submit" aria-label="Buy SPOOFED"><input type="text" value="Buy PRIVATE"><input type="hidden" value="Buy HIDDEN"><input type="submit" value="Read more"><button>Buy visible</button>',
  );
  assert.deepEqual(
    a.candidates.map((c) => c.label),
    ["Buy visible"],
  );
  assert.doesNotMatch(JSON.stringify(a), /SPOOFED|PRIVATE|HIDDEN/);
});

test("genuine no-attribute selector comments keep local and default style results identical", () => {
  for (const css of [
    "/* [ignored] */input{color:red}",
    "input/* [ignored] */{color:red}",
    "input/* note */.buy{color:red}",
    "input{color:red}",
  ]) {
    const target = targetIn();
    const legacy = createSafeStyleReader([css]);
    const current = createSafeStyleReader([css], local);
    assert.deepEqual(current.styleFor(target), legacy.styleFor(target), css);
    assert.equal(current.rules, legacy.rules, css);
  }
});

test("selected stylesheet and Worker preserve source order and do not fetch or execute", async (t) => {
  t.mock.method(globalThis, "fetch", () =>
    assert.fail("local input styling must never fetch"),
  );
  const link = '<link rel="stylesheet" href="./theme.css">';
  const embedded = "<style>input[type=submit]{background:#123456}</style>";
  const body =
    '<input type="submit" value="Buy paper" style="color:#abcdef"><script>throw Error("must not execute")</script>';
  const css =
    'input[type=submit]{background:rgb(101 67 33);border:2px solid rgb(17 34 51)}@import "https://evil.invalid/a.css";@media screen{input[type=submit]{display:none}}input[type=submit]{background:url(https://evil.invalid/a);font-family:url(https://evil.invalid/font)}';
  const html = embedded + link + body;
  const b = await capture(html, css);
  assert.equal(b.components[0].appearance.background, "#654321");
  assert.equal(text(b.components[0]).color, "#abcdef");
  assert.equal(rect(b.components[0]).borderColor, "#112233");
  assert.deepEqual(b.analysis.css.stylesheetHashes, [hash(css)]);
  assert.equal(
    (await capture(link + embedded + body, css)).components[0].appearance
      .background,
    "#123456",
  );
  const reply = await processLocalImportMessage({
    type: "import-local",
    requestId: 83,
    html: bytes(html).buffer,
    capturedAt,
    stylesheet: { name: "theme.css", bytes: bytes(css).buffer },
  });
  assert.deepEqual(reply.result, { ok: true, value: b });
  assert.equal(reply.requestId, 83);
  assert.doesNotMatch(
    JSON.stringify(b),
    /evil\.invalid|theme\.css|throw Error|rgb\(/,
  );
});

test("typed selectors keep every byte block rule declaration part and raw comma budget", async () => {
  assert.deepEqual(CSS_LIMITS, {
    bytes: 262144,
    rules: 1024,
    blocks: 4096,
    declarations: 64,
    selectorParts: 4,
  });
  const target = targetIn();
  const rule = "input[type=submit]{color:red}";
  const full = createSafeStyleReader(
    [rule.repeat(CSS_LIMITS.rules + 1)],
    local,
  );
  assert.equal(full.rules, CSS_LIMITS.rules);
  assert.equal(full.limited, true);
  assert.equal(
    createSafeStyleReader([rule.repeat(CSS_LIMITS.rules)], local).limited,
    false,
  );
  const blocked = createSafeStyleReader(
    ["@unused;".repeat(CSS_LIMITS.blocks) + rule],
    local,
  );
  assert.equal(blocked.rules, 0);
  assert.equal(blocked.limited, true);
  const lastBlock = createSafeStyleReader(
    ["@unused;".repeat(CSS_LIMITS.blocks - 1) + rule],
    local,
  );
  assert.equal(lastBlock.rules, 1);
  assert.equal(lastBlock.limited, false);
  const exact = rule + " ".repeat(CSS_LIMITS.bytes - bytes(rule).length);
  assert.equal(createSafeStyleReader([exact], local).rules, 1);
  assert.equal(createSafeStyleReader([exact + " "], local).limited, true);
  assert.equal(createSafeStyleReader([exact + " "], local).rules, 0);
  assert.equal(createSafeStyleReader([exact, rule], local).rules, 1);
  assert.equal(createSafeStyleReader([exact, rule], local).limited, true);
  for (const [prefix, expected] of [
    ["unknown:0;".repeat(63), "#ff0000"],
    ["unknown:0;".repeat(64), undefined],
    [" ".repeat(4096), undefined],
  ]) {
    assert.equal(
      createSafeStyleReader(
        [`input[type=submit]{${prefix}color:red}`],
        local,
      ).styleFor(target).color,
      expected,
    );
  }
  assert.equal(
    createSafeStyleReader(["a b c input[type=submit]{color:red}"], local).rules,
    1,
  );
  assert.equal(
    createSafeStyleReader(["a b c d input[type=submit]{color:red}"], local)
      .rules,
    0,
  );
  assert.equal(
    createSafeStyleReader(
      [Array(129).fill("input[type=submit]").join(",") + "{color:red}"],
      local,
    ).rules,
    128,
  );
  for (const [count, expected] of [
    [126, 1],
    [127, 0],
    [128, 0],
  ]) {
    const prelude =
      'input[type="' + ",".repeat(count) + '"],input[type=submit]';
    assert.equal(
      createSafeStyleReader([prelude + "{color:red}"], local).rules,
      expected,
      `raw commas ${count}`,
    );
  }
  const over = await reconstructLocalCode({
    html: bytes(
      `<style>${exact} </style><input type="submit" value="Buy paper">`,
    ),
    capturedAt,
  });
  assert.equal(over.code, "source-too-large");
});

// Genuine pre-change capture recorded before editing, never reconstructed
// by the new parser. These persisted bytes and their seal must stay valid.
const legacy = {
  schemaVersion: 1,
  extractorVersion: "code-v1",
  mapperVersion: "canonical-v1",
  viewport: {
    width: 960,
    height: 680,
  },
  source: {
    kind: "local-file",
    name: "Input style shop",
    displayUrl:
      "local://2d6874cdb3316569312cba72ef85108f3bc86475eae40bea35aa3bc26bbc4d6b",
    capturedAt: "2026-10-03T03:20:00.000Z",
  },
  fidelity: "code-approximation",
  analysis: {
    sourceHash:
      "2d6874cdb3316569312cba72ef85108f3bc86475eae40bea35aa3bc26bbc4d6b",
    layout: "inferred-flow",
    confidence: "low",
    styles: "safe-css-subset-v1",
    css: {
      rules: 0,
      limited: false,
      stylesheetHashes: [],
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
      text: "Input style shop",
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
      canonicalType: "am_buy",
      sourceRect: null,
      combatRect: {
        x: 28,
        y: 124,
        w: 432,
        h: 44,
      },
      sourceNode: {
        tag: "input",
        path: "document/html[0]/body[1]/input[0]",
        order: 7,
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
    "capture_07ee2c2b8d12d7d5c568c6358641a23a3e2d782efc6c15bc193743d4c9229dbe",
};

const publicBaseline = [
  {
    selector: "input[type=submit]",
    analysisHash:
      "9cd93f5fdc57f383dfa5c75d4bf1ffcbdcee569634f6652e1aaecdf6588da5d8",
    resultHash:
      "75728004fb75059e267715af67c2bc1368e7aace93732113d931f70caadae168",
  },
  {
    selector: 'INPUT[ TYPE = "SuBmIt" ]',
    analysisHash:
      "9cd93f5fdc57f383dfa5c75d4bf1ffcbdcee569634f6652e1aaecdf6588da5d8",
    resultHash:
      "411b91f9fcea0df7006564d60f3d74b3bfe2dd21cae2fbe257df2669a1031061",
  },
  {
    selector: "form > input.buy[type=button]",
    analysisHash:
      "9cd93f5fdc57f383dfa5c75d4bf1ffcbdcee569634f6652e1aaecdf6588da5d8",
    resultHash:
      "647b3d093cf2b53b151804b07fd6cd6dfa72e50dee63307ee25d510a3887973a",
  },
  {
    selector: "[type=submit]",
    analysisHash:
      "9cd93f5fdc57f383dfa5c75d4bf1ffcbdcee569634f6652e1aaecdf6588da5d8",
    resultHash:
      "d96a4be1502662b8edff3e0dbfe18d291a82e7befcd743039fb4d2c16edfb508",
  },
  {
    selector: 'input[type="submit" i]',
    analysisHash:
      "9cd93f5fdc57f383dfa5c75d4bf1ffcbdcee569634f6652e1aaecdf6588da5d8",
    resultHash:
      "fdcd4a1254df4acb4c183a95d7b8c9ee2d3c57231bb7f85b98426e2f6f0d90c9",
  },
  {
    selector: "input[type=submit]:hover",
    analysisHash:
      "9cd93f5fdc57f383dfa5c75d4bf1ffcbdcee569634f6652e1aaecdf6588da5d8",
    resultHash:
      "5e77e89d323c825c450281aff894d3ea832302a5a58f460abb979edae17d3087",
  },
  {
    selector: 'input[type="submit, h1, junk"]',
    analysisHash:
      "04e60b11fa49359244b8d525481e5ccac7f67545cea0e6b930e65a9cd3aa8622",
    resultHash:
      "8173cc3381733311ad23110fae0c75bce08530972732d82e190f140debac67dd",
  },
  {
    selector: "h1,input[type=button]",
    analysisHash:
      "04e60b11fa49359244b8d525481e5ccac7f67545cea0e6b930e65a9cd3aa8622",
    resultHash:
      "0099d797581cc5c424af90c9dec29a9bd6b8fc0d3fc6d190dd2f31762f4a4b20",
  },
];

test("old and new local appearances coexist without rewriting stored or exported captures", async () => {
  assert.equal(
    hash(JSON.stringify(legacy)),
    "e84c2deb742f72184dfeab07826f1a7960c71b000ef2b1b0449794227072cefe",
  );
  assert.equal((await verifyRaidBlueprint(legacy)).ok, true);
  const factory = new IDBFactory(),
    store = createProfileStore(factory);
  const claim = async (b, battleId) => {
    await store.recordRaidVictory(b, battleId);
    return store.claimRaidReward(
      R.newRun("lab"),
      prepareRaidRewards(b, battleId)[0],
      b,
      { writeRunProfile: false },
    );
  };
  await claim(legacy, "old-input-claimed");
  await store.recordRaidVictory(legacy, "old-input-pending");
  const oldBytes = JSON.stringify(await store.getBlueprint(legacy.captureId));
  const oldPending = JSON.stringify(await store.listPendingRaids());
  const oldTrophies = await store.listTrophies();
  const fresh = await capture();
  assert.equal(
    hash(JSON.stringify(fresh)),
    "60056370129a47ce2f9281e8693e6467c23a97513d05ecca8e39a306eb911534",
  );
  assert.equal(
    fresh.captureId,
    "capture_f0cb481d33fa4f82c387806fabcf37c5f45487da94badefa0cbf7216d0b0ce8e",
  );
  assert.notEqual(fresh.captureId, legacy.captureId);
  assert.notEqual(
    fresh.components[0].appearanceId,
    legacy.components[0].appearanceId,
  );
  assert.deepEqual(
    fresh.components[0].combatRect,
    legacy.components[0].combatRect,
  );
  assert.equal(fresh.analysis.sourceHash, legacy.analysis.sourceHash);
  assert.equal(
    fresh.components[0].canonicalType,
    legacy.components[0].canonicalType,
  );
  assert.deepEqual(
    fresh.components[0].sourceNode,
    legacy.components[0].sourceNode,
  );
  await claim(fresh, "new-input-claimed");
  const reopened = createProfileStore(factory);
  assert.equal(
    JSON.stringify(await reopened.getBlueprint(legacy.captureId)),
    oldBytes,
  );
  assert.equal(JSON.stringify(await reopened.listPendingRaids()), oldPending);
  assert.deepEqual(
    (await reopened.listTrophies()).filter(
      (t) => t.battleId === "old-input-claimed",
    ),
    oldTrophies,
  );
  const exported = await reopened.exportCollectionBackup();
  assert.deepEqual([exported.captureCount, exported.trophyCount], [2, 2]);
  const archive = JSON.parse(exported.text);
  assert.deepEqual(
    archive.captures.find((b) => b.captureId === legacy.captureId),
    legacy,
  );
  assert.deepEqual(
    archive.captures.find((b) => b.captureId === fresh.captureId),
    fresh,
  );
  const imported = createProfileStore(new IDBFactory());
  const preview = await imported.inspectCollectionBackup(exported.text);
  assert.deepEqual(preview.conflicts, []);
  assert.deepEqual(await imported.restoreCollectionBackup(preview.candidate), {
    added: 2,
    unchanged: 0,
  });
  assert.deepEqual(await imported.getBlueprint(legacy.captureId), legacy);
  assert.deepEqual(await imported.getBlueprint(fresh.captureId), fresh);
  assert.deepEqual(
    await imported.listTrophies(),
    await reopened.listTrophies(),
  );
  assert.deepEqual(await imported.listPendingRaids(), []);
  const again = await imported.inspectCollectionBackup(exported.text);
  assert.deepEqual(await imported.restoreCollectionBackup(again.candidate), {
    added: 0,
    unchanged: 2,
  });
  assert.doesNotMatch(
    exported.text,
    /<input|type=submit|value=|Input style shop\.html/,
  );
});

test("default and public whole-result hashes remain pinned even for legacy malformed syntax", async () => {
  const body =
    '<h1>Paper shop</h1><input type="submit" value="Buy paper"><button>Buy ink</button>';
  for (const before of publicBaseline) {
    const html = `<title>Public styles</title><style>${before.selector}{color:#123456;background:#654321}</style>${body}`;
    const analysis = analyzeStaticCode(html);
    assert.equal(
      hash(JSON.stringify(analysis)),
      before.analysisHash,
      before.selector,
    );
    const pub = await reconstructStaticCode({
      html,
      sourceHash: hash(html),
      capturedAt,
      requestedUrl: "https://example.com/",
    });
    assert.equal(hash(JSON.stringify(pub)), before.resultHash, before.selector);
    assert.equal((await verifyRaidBlueprint(pub)).ok, true);
  }
  // The safer local attribute-list scan intentionally differs on fresh input;
  // public/default analysis keeps its legacy raw comma behavior byte-for-byte.
  const malformed =
    '<style>input[type="submit, h1, junk"]{color:red}</style><h1>Visible</h1>';
  assert.equal(
    analyzeStaticCode(malformed).candidates[0].style.color,
    "#ff0000",
  );
  assert.equal(
    analyzeLocalCode(malformed).candidates[0].style.color,
    undefined,
  );
  const prior = JSON.parse(
    await readFile(
      new URL(
        "../fixtures/raid/compatibility/books-before-child-selectors.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    hash(JSON.stringify(prior)),
    "df768a21e42f6bfda965c4237e3074e18e6830a363707d7c755bd2b8ec2151e8",
  );
  assert.equal((await verifyRaidBlueprint(prior)).ok, true);
});

test("lexical dispatch preserves no-attribute legacy lists with quoted brackets comments and escapes", () => {
  for (const css of [
    ':lang("["), input/* note */{color:red;background:#123456}',
    ':lang("["), h1/* note */{color:red}',
    'input,:lang("[ , h1, "){color:red}',
    String.raw`input,:lang("["),foo\x{color:red}`,
    String.raw`input,foo\[bar{color:red}`,
    ':lang("["), input/* ] [ */.buy{color:red}',
    String.raw`:lang("escaped \" ["), input/* note */{color:red}`,
    'input,:lang("/* [ */"){color:red}',
  ]) {
    const old = createSafeStyleReader([css]);
    const current = createSafeStyleReader([css], local);
    assert.equal(current.rules, old.rules, css);
    assert.equal(current.limited, old.limited, css);
    for (const target of [targetIn(), targetIn('<h1 id="target">Visible</h1>')])
      assert.deepEqual(current.styleFor(target), old.styleFor(target), css);
  }
});

test("quoted attribute fragments never acquire the new grammar on the legacy list path", () => {
  for (const css of [
    ':lang("junk,input[type=submit],junk"){color:red}',
    ':lang("junk,input[type=submit],junk"), h1{color:red}',
    String.raw`:lang("junk,input[type=submit],junk"), h1/* note */{color:red}`,
    ':lang("junk,input[type=submit], h1, junk"){color:red}',
  ]) {
    const old = createSafeStyleReader([css]);
    const current = createSafeStyleReader([css], local);
    assert.equal(current.rules, old.rules, css);
    for (const target of [targetIn(), targetIn('<h1 id="target">Visible</h1>')])
      assert.deepEqual(current.styleFor(target), old.styleFor(target), css);
  }
});

test("unsupported functions cannot manufacture selectors inside attribute-bearing lists", () => {
  for (const selector of [
    ":is(.a,input[type=submit],.b)",
    ":not(input[type=submit], input[type=button], h1)",
    ":where([title=x], input[type=submit], junk)",
    ":not(:is(.a, input[type=submit], h1), input[type=button], h1)",
    ":is(input[type=submit], :not(.a, input[type=button], .b), h1)",
    ':is([title="(,h1,)"],input[type=submit],h1)',
  ]) {
    const reader = createSafeStyleReader([`${selector}{color:red}`], local);
    assert.equal(reader.rules, 0, selector);
    assert.equal(reader.styleFor(targetIn()).color, undefined, selector);
    const a = analyzeLocalCode(
      `<style>${selector}{color:red}</style><h1>Visible</h1><input type="submit" value="Buy paper"><input type="button" value="Buy pen">`,
    );
    assert.ok(
      a.candidates.every((c) => c.style.color === undefined),
      selector,
    );
    const withOuter = createSafeStyleReader(
      [`${selector},input[type=button]{color:blue}`],
      local,
    );
    assert.equal(withOuter.rules, 1, selector);
    assert.equal(withOuter.styleFor(targetIn()).color, undefined, selector);
    assert.equal(
      withOuter.styleFor(targetIn('<input id="target" type="button">')).color,
      "#0000ff",
      selector,
    );
  }
});

// Recorded using the unedited frozen snapshot-1642 parser.
const noAttributeCaptures = [
  [
    ':lang("["), input/* note */{color:red;background:#123456}',
    "96c9b78f8007587dd5770742584d1e273ec7e8466d60d95b8d924f85df6f285e",
  ],
  [
    ':lang("["), h1/* note */{color:red}',
    "8fdc3c2db727c03becc19a5aed677ac75707fe728b79b05d3e844b597dbc2c8c",
  ],
  [
    'input,:lang("[ , h1, "){color:red}',
    "5f9cc45ffa25525990a55e44a11be2d985c0c655ef8708f3f267c892963b36b9",
  ],
  [
    'input,:lang("["),foo\\x{color:red}',
    "c334061befa7d7d9ac915795849ded9c7a8fab6f49ffd256b8be4df2d3e0a272",
  ],
  [
    "input,foo\\[bar{color:red}",
    "f1726336e897df044a969b9544918cb5cda0ec006990197e52491e2945011d56",
  ],
  [
    ':lang("junk,input[type=submit], h1, junk"){color:red}',
    "ce8e24c34eeb387d855390d86980e41649fa732f05c045d07325a9361b3dca56",
  ],
  [
    ":not(input,input,h1){color:red}",
    "5538bdb7ec99ea9e02f45aae9334ae936d8051c612b62a9b71f889f2b399eaf2",
  ],
  [
    ':lang("["), input/* ] [ */.buy{color:rgb(2 3 4)}',
    "b23a2db5e859ad365013321aaaf4824cb56104f1db668352a6e1739789b2ed4c",
  ],
];

test("quoted brackets preserve complete no-attribute local capture hashes", async () => {
  for (const [css, expected] of noAttributeCaptures) {
    const html = `<title>Lexical compatibility</title><style>${css}</style><h1>Visible</h1><input class="buy" type="submit" value="Buy paper"><button>Buy ink</button>`;
    const b = await capture(html);
    assert.equal(hash(JSON.stringify(b)), expected, css);
  }
});

test("nested function commas still consume the legacy raw selector-list budget", () => {
  for (const [count, expected] of [
    [125, 1],
    [126, 1],
    [127, 0],
    [128, 0],
  ]) {
    const css =
      ":is([title=x]" +
      ",input[type=submit]".repeat(count) +
      "),input[type=button]{color:red}";
    const reader = createSafeStyleReader([css], local);
    assert.equal(reader.rules, expected, String(count));
    assert.equal(
      reader.styleFor(targetIn()).color,
      undefined,
      "never expose a truncated function argument",
    );
  }
  for (const css of [
    ":not([title=x],input[type=submit],h1{color:red}",
    ":not([title=x]),input[type=submit]){color:red}",
    ":not([title=x]),input[type=submit](junk{color:red}",
    ":not([title=x]),input[type=submit]]{color:red}",
  ])
    assert.equal(createSafeStyleReader([css], local).rules, 0, css);
});
