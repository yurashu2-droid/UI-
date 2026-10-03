import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import C from "../src/document.js";
import R from "../src/run.js";
import { Editor } from "../src/editor.js";
import { factionSetView } from "../src/app-guidance.js";
import { STORY_STAGES, STORY_TITLE } from "../src/story/content.js";
import * as help from "../src/help-content.js";

const content = (storyActive, mode = "campaign") => {
  assert.equal(typeof help.getHelpContent, "function");
  return help.getHelpContent({ storyActive, mode });
};
const text = (value) => value.steps.map(step => `${step.title} ${step.text}`).join("\n");

test("story help takes precedence over its run mode and derives canonical progress counts", () => {
  const story = content(true), total = STORY_STAGES.reduce((n, stage) => n + stage.encounters.length, 0);
  assert.equal(story.kicker, STORY_TITLE);
  assert.match(story.title, /物語/);
  assert.ok(text(story).includes(`${STORY_STAGES.length}段階`));
  assert.ok(text(story).includes(`${total}勝`));
  assert.match(text(story), /機械へ接続/);
  assert.match(text(story), /旧遠征・オンラインとは別保存/);
  assert.doesNotMatch(text(story), /8つのサイト|8ラウンド|次のラウンドへ/);
  assert.deepEqual(content(true, "lab"), story);
});

test("story help explains loss recovery, records and pending salvage without revealing authored events", () => {
  const body = text(content(true));
  assert.match(body, /敗北・引き分けでライフが1つ減/);
  assert.match(body, /ライフが残っていれば同じ相手に再挑戦/);
  assert.match(body, /配置・連結・重さを見直/);
  assert.match(body, /重要記録.*章攻略.*保存/);
  assert.match(body, /UIの選択とは別/);
  assert.match(body, /作業場で記録を確認してから次の段階へ/);
  assert.match(body, /回収品を選ぶ/);
  assert.match(body, /回収を見送/);
  assert.match(body, /満杯.*物語の受取箱/);
  assert.match(body, /ライフが尽きても.*ページと回収記録.*保存/);
  for (const stage of STORY_STAGES) {
    assert.ok(!body.includes(stage.record.title), "help must not reveal individual records");
    for (const encounter of stage.encounters) assert.ok(!body.includes(encounter.title));
  }
});

test("legacy help uses the real round count, paid acquisition and its distinct loss rule", () => {
  const legacy = content(false), body = text(legacy);
  assert.match(legacy.title, /旧遠征/);
  assert.ok(body.includes(`${R.ROUNDS}ラウンド`));
  assert.match(body, /資金.*移植/);
  assert.match(body, /公開して対戦/);
  assert.match(body, /ライフが残っていれば次のラウンドへ/);
  assert.match(body, /最終ラウンドを終えると遠征終了/);
  assert.match(body, /報酬を受け取る/);
  assert.doesNotMatch(body, /同じ相手に再挑戦|重要記録|物語の受取箱|15勝/);
});

test("lab help explains free placement and opt-in rules without paid-run or story instructions", () => {
  const lab = content(false, "lab"), body = text(lab);
  assert.match(lab.title, /実験室/);
  assert.match(body, /UIライブラリ.*無料/);
  assert.match(body, /テスト対戦/);
  assert.match(body, /ページのお手本/);
  assert.match(body, /対戦ルール［実験室限定］/);
  assert.match(body, /明示的に選/);
  assert.match(body, /試作部品.*通常のショップ・報酬には出ません/);
  assert.doesNotMatch(body, /資金|購入|レンタルサーバー|ライフ|ラウンド|回収品を選ぶ|機械へ接続/);
});

test("all modes describe only the supported five three-part faction bonuses", () => {
  const supported = Object.keys(D.FACTIONS).filter(id => factionSetView(id, 0).threshold === 3);
  assert.deepEqual(supported, ["youtube", "amazon", "google", "retro", "gov"]);
  for (const context of [[true, "campaign"], [false, "campaign"], [false, "lab"]]) {
    const sets = content(...context).steps.find(step => step.title === "セット効果を確認する");
    assert.ok(sets);
    for (const faction of supported) assert.ok(sets.text.includes(D.FACTIONS[faction].name));
    assert.match(sets.text, /同じ系統を3つページに置く/);
    assert.match(sets.text, /その他の試作・テンプレート系統には追加の3個セット補正はありません/);
    for (const faction of Object.keys(D.FACTIONS).filter(id => !supported.includes(id)))
      assert.ok(!sets.text.includes(D.FACTIONS[faction].name));
  }
});

test("render helper preserves the existing numbered help structure and escapes every body field", () => {
  assert.equal(typeof help.renderHelpBody, "function");
  const html = help.renderHelpBody({
    kicker: "TEST", title: "Test", steps: [
      { title: '<img src=x onerror="run()">', text: "& <script>run()</script> 'quoted'" },
      { title: "Second", text: "Description" },
    ], controls: ['<button onclick="run()">&'],
  });
  assert.match(html, /^<div class="howto">/);
  assert.match(html, /<b>1<\/b><p><strong>&lt;img src=x onerror=&quot;run\(\)&quot;&gt;<\/strong>/);
  assert.match(html, /&amp; &lt;script&gt;run\(\)&lt;\/script&gt; &#39;quoted&#39;/);
  assert.match(html, /<b>2<\/b><p><strong>Second<\/strong>Description<\/p>/);
  assert.match(html, /<p class="muted">.*&lt;button onclick=&quot;run\(\)&quot;&gt;&amp;/);
  assert.doesNotMatch(html, /<img|<script|<button|<dialog|modal-inner|data-close-modal/);
});

test("repeated mode changes produce independent content without stale story or laboratory wording", () => {
  const expectedStory = content(true), expectedLegacy = content(false), expectedLab = content(false, "lab");
  const mutated = content(true);
  mutated.steps[0].text = "changed";
  mutated.controls.push("changed");
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(content(false, "lab"), expectedLab);
    assert.deepEqual(content(false), expectedLegacy);
    assert.deepEqual(content(true), expectedStory);
  }
});

test("keyboard hints match real stash, undo and redo behavior for Control and Command", () => {
  const hints = content(false).controls.join(" / ");
  assert.match(hints, /Tab.*Enter\/Space.*選択/);
  assert.match(hints, /Shift\+Enter\/Space：選択を追加・解除/);
  assert.match(hints, /Delete\/Backspace：手持ちへ/);
  assert.match(hints, /売却は右の「売る」/);
  assert.match(hints, /Ctrl\/Cmd\+Z：元に戻す/);
  assert.match(hints, /Ctrl\/Cmd\+Shift\+Z.*やり直す/);
  assert.match(hints, /Shift.*クリック.*複数選択/);
  assert.match(hints, /G：まとまりを選択/);
  assert.match(hints, /Alt.*ドラッグ.*くっつき無効/);
  assert.doesNotMatch(content(false, "lab").controls.join(" / "), /売る|売却/);

  const originalElement = Object.getOwnPropertyDescriptor(globalThis, "Element");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  globalThis.Element = class {};
  globalThis.HTMLElement = class extends globalThis.Element {};
  globalThis.document = { querySelector: () => null };
  try {
    for (const key of ["Delete", "Backspace"]) for (const modifier of ["ctrlKey", "metaKey"]) {
      const run = R.newRun("campaign");
      run.owned = [C.makeItem("ab_link", "p1", 32, 32)];
      const before = structuredClone(run), editor = Object.create(Editor.prototype);
      Object.assign(editor, { history: [], future: [], selection: new Set(["p1"]),
        o: { getRun: () => run, enabled: () => true, onChange() {}, onSelect() {}, onToast() {} },
      });
      const press = (key, options = {}) => editor.key({ key, target: null, preventDefault() {}, ...options });
      press(key);
      assert.equal(run.owned.length, 1);
      assert.equal(run.owned[0].x, null);
      assert.equal(run.owned[0].y, null);
      assert.equal(run.cash, before.cash, "keyboard stash must not sell the UI");
      press("z", { [modifier]: true });
      assert.deepEqual(run, before);
      press("z", { [modifier]: true, shiftKey: true });
      assert.equal(run.owned[0].x, null);
    }
  } finally {
    for (const [name, descriptor] of [["Element", originalElement], ["HTMLElement", originalHTMLElement], ["document", originalDocument]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
