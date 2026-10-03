import D from "./data.js";
import E from "./engine.js";
import V from "./components.js";
import * as Lab from "./buildlab.js";
import {
  PAID_WITNESS_FOES,
  PAID_WITNESS_BASE_HP,
  PAID_WITNESS_PHASE_SECONDS,
  PAID_WITNESS_DEFAULT_SELECTION,
  preparePaidWitnessComparison,
  type PaidWitnessSelection,
} from "./paid-witness-comparison.js";
import type { Item, LayoutEntry } from "./types.js";
import stylesheetUrl from "./styles/paid-witness.css?url";
import { loadFeatureStylesheet } from "./feature-styles.js";

export const loadStyles = () => loadFeatureStylesheet(stylesheetUrl);

type Model = Awaited<ReturnType<typeof preparePaidWitnessComparison>>;
type Inspection = ReturnType<Model["inspect"]>;
type Conditions = Inspection["conditions"];
type Comparison = Awaited<ReturnType<Model["compare"]>>;
const mounts = new WeakMap<HTMLElement, { dispose(): void }>();

const phaseText = (phase: number) =>
  phase < 0
    ? "−0.5：相手側の全周期時計を0.5秒遅らせる"
    : phase > 0
      ? "+0.5：自分側の全周期時計を0.5秒遅らせる"
      : "0：自然な開始時刻";
const hpText = (hp: number) =>
  hp === 440
    ? "440：公開した公称比較（反実仮想）"
    : hp === 460
      ? "460：取得時点の自分の基礎HP"
      : `${hp}：共通基礎HPの感度比較`;
const layoutText = (layout: string) =>
  layout === "original" ? "元の配置" : "組み替え後";

/** Fixed, read-only reference comparisons. The app retains modal/Close ownership. */
export function mountPaidWitnessPanel(
  host: HTMLElement,
  options: { isCurrent: () => boolean },
): { dispose(): void } {
  mounts.get(host)?.dispose();
  const doc = host.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text = "",
    cls = "",
  ) => {
    const node = doc.createElement(tag);
    node.textContent = text;
    node.className = cls;
    return node;
  };
  const root = el("section", "", "paid-witness-panel");
  root.setAttribute("aria-label", "同じ14個の配置を比べる");
  const status = el("p", "参照データを検証しています…", "paid-witness-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const actions = el("div", "", "paid-witness-actions");
  const content = el("div");
  root.append(status, actions, content);
  host.replaceChildren(root);
  let disposed = false,
    token = 0,
    actionToken = 0;
  let controller: AbortController | undefined;
  let model: Model | undefined;
  let busy = false,
    validationFocus = false;
  const listeners: (() => void)[] = [];
  let actionListeners: (() => void)[] = [],
    previewListeners: (() => void)[] = [];
  let observer: MutationObserver | undefined;
  const listen = (
    node: HTMLElement,
    name: string,
    fn: EventListener,
    list = listeners,
    capture = false,
  ) => {
    node.addEventListener(name, fn, capture);
    list.push(() => node.removeEventListener(name, fn, capture));
  };
  const clear = (list: (() => void)[]) => {
    list.splice(0).forEach((remove) => remove());
  };
  const handle = {
    dispose() {
      if (disposed) return;
      disposed = true;
      token++;
      actionToken++;
      controller?.abort();
      controller = undefined;
      observer?.disconnect();
      clear(listeners);
      clear(actionListeners);
      clear(previewListeners);
      root.remove();
      if (mounts.get(host) === handle) mounts.delete(host);
    },
  };
  mounts.set(host, handle);
  const current = () => {
    if (disposed) return false;
    let eligible = false;
    try {
      eligible = options.isCurrent();
    } catch {
      /* A broken owner guard fails closed. */
    }
    if (
      !eligible ||
      !host.isConnected ||
      !root.isConnected ||
      !host.contains(root) ||
      mounts.get(host) !== handle
    ) {
      handle.dispose();
      return false;
    }
    return true;
  };
  const begin = () => {
    token++;
    controller?.abort();
    controller = new AbortController();
    return { id: token, signal: controller.signal };
  };
  const owns = (id: number) => current() && id === token;
  const button = (name: string, label: string, id: number, run: () => void) => {
    const node = el("button", label);
    node.type = "button";
    node.dataset.paidAction = name;
    listen(
      node,
      "click",
      () => {
        if (
          !current() ||
          actionToken !== id ||
          !actions.contains(node) ||
          node.disabled
        )
          return;
        run();
      },
      actionListeners,
    );
    return node;
  };
  const setActions = (
    mode: "loading" | "ready" | "busy" | "cancelled" | "failed" | "invalid",
    retry?: () => void,
  ) => {
    const ownedFocus =
      actions.contains(doc.activeElement) ||
      (validationFocus && doc.activeElement === status);
    validationFocus = false;
    clear(actionListeners);
    const id = ++actionToken;
    const nodes: HTMLButtonElement[] = [];
    if (mode === "ready" || mode === "invalid") {
      const compare = button(
        "compare",
        "両配置を両方の席で比較（4対戦）",
        id,
        compareSelection,
      );
      compare.disabled = mode === "invalid";
      nodes.push(compare);
    } else if (mode === "busy")
      nodes.push(
        button("cancel", "比較を中止", id, () => {
          begin();
          busy = false;
          results.replaceChildren();
          status.textContent = "比較を中止しました。結果はありません。";
          setActions("cancelled", compareSelection);
        }),
      );
    else if (mode === "failed" || mode === "cancelled")
      nodes.push(button("retry", "再試行", id, retry!));
    actions.replaceChildren(...nodes);
    if (ownedFocus && current()) {
      if (mode === "loading") {
        validationFocus = true;
        status.tabIndex = -1;
        status.focus({ preventScroll: true });
      } else
        nodes.find((node) => !node.disabled)?.focus({ preventScroll: true });
    }
  };
  const controls = el("div", "", "paid-witness-controls");
  const select = (
    key: string,
    label: string,
    entries: readonly { value: string; text: string }[],
    value: string,
  ) => {
    const wrapper = el("label", label);
    const node = el("select");
    node.dataset.paidSelect = key;
    for (const entry of entries) {
      const option = el("option", entry.text);
      option.value = entry.value;
      node.append(option);
    }
    node.value = value;
    wrapper.append(node);
    controls.append(wrapper);
    listen(node, "change", () => {
      if (!current() || !controls.contains(node)) return;
      begin();
      busy = false;
      renderSelection();
    });
    return node;
  };
  const foe = select(
    "foe",
    "固定の参照相手",
    PAID_WITNESS_FOES.map((entry) => ({
      value: entry.id,
      text: `${entry.name}（${entry.id}）`,
    })),
    PAID_WITNESS_DEFAULT_SELECTION.foeId,
  );
  const hp = select(
    "hp",
    "双方の共通基礎HP",
    PAID_WITNESS_BASE_HP.map((value) => ({
      value: String(value),
      text: hpText(value),
    })),
    String(PAID_WITNESS_DEFAULT_SELECTION.commonBaseHp),
  );
  const phase = select(
    "phase",
    "片側全体の開始位相",
    PAID_WITNESS_PHASE_SECONDS.map((value) => ({
      value: String(value),
      text: phaseText(value),
    })),
    String(PAID_WITNESS_DEFAULT_SELECTION.phaseSeconds),
  );
  const selection = (): PaidWitnessSelection => {
    // Native selects can become empty after invalid assignment. Do not coerce it to phase zero.
    if (
      !PAID_WITNESS_FOES.some((entry) => entry.id === foe.value) ||
      !PAID_WITNESS_BASE_HP.some((value) => String(value) === hp.value) ||
      !PAID_WITNESS_PHASE_SECONDS.some((value) => String(value) === phase.value)
    )
      throw new Error("比較条件を選び直してください。");
    return {
      foeId: foe.value,
      commonBaseHp: Number(hp.value),
      phaseSeconds: Number(phase.value),
    } as PaidWitnessSelection;
  };
  const conditions = el("div", "", "paid-witness-conditions");
  const previews = el("div", "", "paid-witness-previews");
  const inventory = el("details", "", "paid-witness-inventory");
  const results = el("section", "", "paid-witness-results");
  results.setAttribute("aria-label", "選択した条件の比較結果");

  function conditionList(value: Conditions) {
    const list = el("ul");
    for (const [i, owner] of ["自分（有償14個）", "固定の参照相手"].entries())
      list.append(
        el(
          "li",
          `${owner}：基礎HP ${value.baseHp[i]} / 開始HP ${value.initialHp[i]} / 開始最大HP ${value.initialMaxHp[i]}；CPU負荷 ${value.load[i]} / 容量 ${value.capacity[i]}；CPU遅延 ${value.lag[i]}；過負荷HP損失 ${value.lagLoss[i]}；設備 ${value.admins[i].join(" + ") || "なし"}`,
        ),
      );
    list.append(
      el(
        "li",
        `${value.combatVersion} / ${value.step.toFixed(2)}秒刻み。設備を含む値は実際に構築した戦闘の自分／相手順です。`,
      ),
    );
    return list;
  }
  function preview(name: string, key: string, board: Item[], theme: string) {
    const detail = el("details", "", "paid-witness-preview");
    detail.open = key === "original";
    detail.append(el("summary", `${name}・ネイティブ配置（960 × 680）`));
    const layout: LayoutEntry[] = board.map((p) => [
      p.type,
      p.x,
      p.y,
      p.w,
      p.h,
      p.shape,
      p.label,
    ]);
    const resource = Lab.resources(layout),
      analysis = E.analyze(board);
    detail.append(
      el(
        "p",
        `${resource.parts}個 / CPU負荷 ${analysis.load} / 面積 ${resource.footprint} / 素材額面 $${resource.acquisitionValue} / 配置判定 ${resource.legal ? "合法" : "不正"}。素材額面は購入費の証明ではありません。`,
      ),
    );
    const scroll = el("div", "", "paid-witness-board-scroll");
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute(
      "aria-label",
      `${name}の配置。スクロールで全体を確認できます。部品の説明は下の一覧にあります。`,
    );
    const inert = el("div", "", `paid-witness-native site-theme-${theme}`);
    inert.dataset.paidPreview = key;
    inert.inert = true;
    inert.setAttribute("inert", "");
    inert.setAttribute("aria-hidden", "true");
    const stop: EventListener = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    for (const name of [
      "click",
      "auxclick",
      "submit",
      "pointerdown",
      "keydown",
      "input",
      "change",
      "focusin",
    ])
      listen(inert, name, stop, previewListeners, true);
    const body = el("div");
    V.render(body, board, {
      side: `paid-witness-${key}`,
      theme,
      interactive: false,
    });
    body.style.width = "960px";
    body.style.height = "680px";
    for (const node of body.querySelectorAll<HTMLElement>(
      "[tabindex],button,input,select,textarea,a",
    ))
      node.tabIndex = -1;
    inert.append(body);
    scroll.append(inert);
    detail.append(scroll);
    return detail;
  }
  function renderSelection() {
    if (!current() || !model) return;
    results.replaceChildren();
    clear(previewListeners);
    try {
      const data = model.inspect(selection());
      conditions.replaceChildren(
        el(
          "p",
          `${hpText(data.selection.commonBaseHp)}。460は取得時点の自分の基礎HPですが、固定の参照相手との比較であり実際のR8ではありません。`,
        ),
        el(
          "p",
          `${phaseText(data.selection.phaseSeconds)}。物理的な席を反転しても同じ所有側に適用します。`,
        ),
        conditionList(data.conditions),
      );
      previews.replaceChildren(
        preview(
          "元の配置",
          "original",
          data.original.owned,
          data.original.page.theme,
        ),
        preview(
          "組み替え後",
          "rearranged",
          data.rearranged.owned,
          data.rearranged.page.theme,
        ),
        preview(`参照相手：${data.foe.name}`, "foe", data.foe.board, "mixed"),
      );
      const list = el("ol");
      const geometry = (p: Inspection["inventory"][number]["before"]) =>
        `x=${p.x}, y=${p.y}, 幅=${p.w}, 高さ=${p.h}`;
      for (const item of data.inventory) {
        const row = el(
          "li",
          `${item.id}・${D.PARTS[item.type].name}（${item.type}）：元 ${geometry(item.before)} → 後 ${geometry(item.after)}`,
        );
        row.dataset.paidInventory = item.id;
        list.append(row);
      }
      const foeList = el("ul");
      for (const item of data.foe.board)
        foeList.append(
          el(
            "li",
            `${item.id}・${D.PARTS[item.type].name}（${item.type}）：x=${item.x}, y=${item.y}, 幅=${item.w}, 高さ=${item.h}`,
          ),
        );
      inventory.replaceChildren(
        el(
          "summary",
          "全14個の所持ID・部品・変更前後の座標と寸法 / 参照相手の一覧",
        ),
        list,
        el("h3", `参照相手：${data.foe.name}`),
        foeList,
      );
      status.textContent =
        "比較条件を確認し、比較ボタンを押してください。自動では計算しません。";
      setActions("ready");
    } catch {
      conditions.replaceChildren();
      previews.replaceChildren();
      inventory.replaceChildren();
      status.textContent =
        "比較条件を確認できません。固定の選択肢から選び直してください。";
      setActions("invalid");
    }
  }
  function renderResults(value: Comparison) {
    const table = el("table");
    table.append(
      el(
        "caption",
        `${PAID_WITNESS_FOES.find((foe) => foe.id === value.selection.foeId)!.name} / ${hpText(value.selection.commonBaseHp)} / ${phaseText(value.selection.phaseSeconds)}。4対戦の結果`,
      ),
    );
    const head = el("thead"),
      heading = el("tr");
    for (const label of [
      "配置",
      "有償側の物理席",
      "論理的な勝者",
      "自分の残HP",
      "相手の残HP",
      "時間",
      "この対戦の実条件（自分 / 相手）",
    ]) {
      const cell = el("th", label);
      cell.scope = "col";
      heading.append(cell);
    }
    head.append(heading);
    table.append(head);
    const body = el("tbody");
    for (const row of value.rows) {
      const tr = el("tr");
      tr.dataset.paidResult = `${row.layout}-${row.paidSeat}`;
      const name = el("th", layoutText(row.layout));
      name.scope = "row";
      tr.append(name);
      tr.append(
        el(
          "td",
          row.paidSeat === "player" ? "player（通常席）" : "enemy（反転席）",
        ),
        el(
          "td",
          row.winner === "own"
            ? "自分の勝ち"
            : row.winner === "foe"
              ? "相手の勝ち"
              : "引き分け",
        ),
        el("td", row.ownHp.toFixed(1)),
        el("td", row.foeHp.toFixed(1)),
        el("td", `${row.elapsed.toFixed(2)}秒`),
      );
      const inputs = el("td");
      inputs.append(conditionList(row));
      tr.append(inputs);
      body.append(tr);
    }
    table.append(body);
    results.replaceChildren(
      el("h3", "両配置・両席の比較結果"),
      el(
        "p",
        "自分は有償の14個、相手は固定の参照盤面を指します。物理席を逆にした行も省略していません。残HPは小数1桁、時間は小数2桁で表示します。",
      ),
      table,
    );
  }
  function compareSelection() {
    if (!current() || !model || busy) return;
    let selected: PaidWitnessSelection;
    try {
      selected = selection();
      model.inspect(selected);
    } catch {
      renderSelection();
      return;
    }
    const request = begin();
    busy = true;
    results.replaceChildren();
    status.textContent = "比較中 0 / 4対戦。";
    setActions("busy");
    const schedule = (resume: () => void) => {
      if (!owns(request.id)) return () => {};
      const task = setTimeout(() => {
        if (owns(request.id)) resume();
      }, 0);
      return () => clearTimeout(task);
    };
    void model
      .compare(selected, {
        signal: request.signal,
        schedule,
        onProgress: (progress) => {
          if (owns(request.id))
            status.textContent = `比較中 ${progress.completed} / ${progress.total}対戦。`;
        },
      })
      .then((value) => {
        if (!owns(request.id)) return;
        busy = false;
        renderResults(value);
        status.textContent =
          "4対戦の比較が完了しました。選択条件ごとの参考結果です。";
        setActions("ready");
      })
      .catch(() => {
        if (!owns(request.id)) return;
        busy = false;
        results.replaceChildren();
        status.textContent = "比較に失敗しました。同じ条件で再試行できます。";
        setActions("failed", compareSelection);
      });
  }
  function renderSummary(data: Model["summary"]) {
    const ledger = el("details", "", "paid-witness-ledger");
    ledger.append(
      el(
        "summary",
        `旧8ラウンド遠征・seed ${data.seed} / 有償取得と組み替えの記録`,
      ),
    );
    ledger.append(
      el(
        "p",
        `部品$${data.budget.parts} + 容量プラン$${data.budget.plans} + 再抽選$${data.budget.rerolls} = 支出$${data.budget.total}。初期$${data.initialCash} + 報酬$${data.budget.rewards} − 支出$${data.budget.total} = 残金$${data.budget.remainingCash}。`,
      ),
    );
    ledger.append(
      el(
        "p",
        `所持品${data.itemCount}個の入力価値$${data.inventoryValue}（購入$${data.budget.parts} + 戦利品$${data.budget.earnedInventory}）。実際の先行勝利${data.priorWins}回・残機${data.lives}。7回の精算後、R8前に文字サイズUIを購入。未受取報酬はありません。`,
      ),
    );
    ledger.append(
      el("p", `照合した取得・組み替え操作列：${data.sourceFingerprint}`),
    );
    const limits = el("ul");
    for (const text of data.limitations) limits.append(el("li", text));
    ledger.append(limits);
    content.replaceChildren(
      el(
        "p",
        "同じ14個の移動・サイズ変更を、固定の参照相手2種類で比べます。編集・取得・通常の対戦開始ではなく、読み取り専用の実験室資料です。",
      ),
      controls,
      conditions,
      results,
      previews,
      inventory,
      ledger,
      el(
        "p",
        "制限：選んだ旧遠征1経路の記録で、本編15対戦・8段階の攻略証明ではありません。相手は抽出した完成盤面で、有償取得・同額支出の証明はありません。全HPでの優位・最適配置・買物の再現性を保証しません。位相は片側全体の相関したずれだけです。旧経路R5・R6の過負荷は残ります。特殊な寸法は機械的に合法ですが、ネイティブ表示・実操作・読み上げのブラウザ受け入れ確認は未実施です。",
        "paid-witness-limits",
      ),
    );
  }
  function prepare() {
    if (!current()) return;
    const request = begin();
    status.textContent = "参照データを検証しています…";
    setActions("loading");
    void preparePaidWitnessComparison({ signal: request.signal })
      .then((value) => {
        if (!owns(request.id)) return;
        model = value;
        renderSummary(value.summary);
        renderSelection();
      })
      .catch(() => {
        if (!owns(request.id)) return;
        status.textContent =
          "参照データの検証に失敗しました。検証できるまで比較はできません。";
        setActions("failed", prepare);
      });
  }
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      current();
    });
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
  }
  prepare();
  return handle;
}
