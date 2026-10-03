import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as raid from "../src/raid/index.ts";

test("raid panel is available for app integration and reference fixtures contain no active source code", () => {
  assert.equal(typeof raid.mountRaidPanel, "function");
  for (const id of ["archive", "commerce"]) {
    const html = readFileSync(
      new URL(`../fixtures/raid/${id}.html`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(html, /<script|<iframe|<form|\son\w+=|https?:\/\//i);
    assert.match(html, /検証用ページ/);
  }
});

test("cancel is not a submit button and URL loading has one submission path", () => {
  const created = [];
  const doc = {
    addEventListener() {},
    removeEventListener() {},
    createElement(tag) {
      const n = {
        tagName: tag,
        type: tag === "button" ? "submit" : "",
        textContent: "",
        className: "",
        style: {},
        dataset: {},
        children: [],
        events: {},
        ownerDocument: doc,
        classList: { add() {}, toggle() {} },
        append(...children) {
          this.children.push(...children);
        },
        replaceChildren(...children) {
          this.children = children;
        },
        setAttribute() {},
        addEventListener(name, fn) {
          this.events[name] = fn;
        },
      };
      created.push(n);
      return n;
    },
  };
  const handle = raid.mountRaidPanel(doc.createElement("div"), {
    onChallenge: async () => ({ battleId: "unused", winner: "draw" }),
    onClaim: async () => ({ ok: false, error: "unused" }),
  });
  handle.dispose();
  const load = created.find(
    (n) => n.tagName === "button" && n.textContent === "公開ページを取得",
  );
  const cancel = created.find(
    (n) => n.tagName === "button" && n.textContent === "取得を中止",
  );
  assert.equal(
    cancel.type,
    "button",
    "cancel must never submit its enclosing form",
  );
  assert.equal(load.type, "submit");
  assert.equal(
    load.events.click,
    undefined,
    "click must not duplicate native form submission",
  );
  assert.equal(
    created.filter((n) => n.tagName === "button" && n.type === "submit").length,
    1,
  );
});
