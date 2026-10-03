import { pressureMeterMarkup } from "./catalog/server-pressure-render.js";
import D from "./data.js";
import C from "./document.js";
import E from "./engine.js";
import R from "./run.js";
import V from "./components.js";
import UIRaidEditor from "./editor.js";
import UIRaidEffects from "./effects.js";
import UIRaidTraffic from "./traffic.js";
import audio from "./audio.js";
import particles from "./particles.js";
import * as Cer from "./ceremony.js";
import { playOsUpgrade } from "./upgrade.js";
import * as Title from "./title.js";
import { initModernUI } from "./modern.js";
import { BUILDS } from "./builds.js";
import * as Lab from "./buildlab.js";
import { createLabBattleController, mountAudienceLabControl } from "./lab-audience-control.js";
import { mountCrawler, type Mood } from "./crawler.js";
import { mountBasket } from "./basket.js";
import { createWindowManager } from "./wm.js";
import { defaultWindowLayout } from "./window-layout.js";
import { renderHackSites, layoutHackSites, inspectCard, type ItemInfo } from "./hacksite.js";
import { beginExtract } from "./extract.js";
import { RECIPES } from "./fusion.js";
import { createRunPersistence, selectRecoveredRun } from "./persistence.js";
import { createProfileStore } from "./profile-store.js";
import { prepareRaidChallenge } from "./raid-challenge.js";
import { applyCombatFeedback, combatFeedback } from "./catalog/combat-feedback.js";
import { targetCaption } from "./catalog/target-caption.js";
import { previewCatalogueAction } from "./catalog/preview.js";
import { VIDEO_SPEED_HELP, INSTANT_SEARCH_HELP, instantSearchSupport, isVideoSource, videoSpeedWorking, videoSpeedHint, factionSetView, activeFactionSets } from "./app-guidance.js";
import { navigationGuidance, renderNavigationGuidance } from "./navigation-guidance.js";
import { conversionGuidance, renderConversionGuidance } from "./conversion-guidance.js";
import { incomeRouteGuidance, renderIncomeRouteGuidance } from "./income-route-guidance.js";
import { containmentGuidance, renderContainmentGuidance } from "./containment-guidance.js";
import { sidechannelPlacementGuide, renderSidechannelPlacementGuide, type SidechannelPlacement } from "./sidechannel-placement-guide.js";
import { battleIncomeResult, renderBattleIncomeResult, type BattleIncomeResultView } from "./battle-income-result.js";
import { getHelpContent, renderHelpBody } from "./help-content.js";
import { createDeferredMount } from "./feature-loader.js";
import { createRaidEnemy } from "./raid/blueprint.js";
import { registerRaidBlueprint } from "./raid/registry.js";
import { applyRaidAppearance, renderRaidAppearance } from "./raid/render.js";
import type { RaidBlueprint, RaidInitialRequest } from "./raid/types.js";
import type { LocalRaidSelection } from "./raid/local-selection.js";
import { currentStoryEncounter, currentStoryStage } from "./story/state.js";
import { STORY_WORLD } from "./story/content.js";
import * as StorySession from "./story/session.js";
import type { StoryCommand, StoryEncounter, StoryTransition } from "./story/types.js";

import type {
  Run,
  Item,
  PartDefinition,
  BattleSummary,
  Mode,
  SideName,
  Theme,
  Faction,
} from "./types.js";
type DocumentInfo = ReturnType<typeof C.analyze>;
type EngineInfo = ReturnType<typeof E.analyze>;
type Battle = InstanceType<typeof E.Battle>;

function $<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error("Missing application element: " + selector);
  return element;
}
function $$<T extends HTMLElement = HTMLElement>(selector: string): T[] {
  return [...document.querySelectorAll<T>(selector)];
}
function clone<T>(value: T): T {
  // Only plain, JSON-serializable run data enters this clone.
  return JSON.parse(JSON.stringify(value)) as T;
}
function isFaction(value: string): value is Faction {
  return Object.hasOwn(D.FACTIONS, value);
}
function isTheme(value: string): value is Theme {
  return value === "mixed" || isFaction(value);
}

/* Application shell: a run of shop → build → publish → loot, around one editable web page. */

const { esc, icon } = V,
  P = D.PARTS;
let run: Run,
  view: "self" | "enemy" = "self",
  preview = false,
  manualZoom: number | null = null,
  battle: Battle | null = null,
  preBattle: Run | null = null,
  paused = false,
  speed = 1,
  lastTime = 0,
  settling = false,
  saveOK = true,
  saveProblem = "",
  profileProblem = "",
  toastTimer: ReturnType<typeof setTimeout> | undefined,
  fitRAF = 0,
  coachHidden = false;
let incomeRouteBinding: { element: HTMLSelectElement; run: Run; sourceId: string } | null = null;
const sidechannelPlacementBindings = new Map<HTMLButtonElement, { run: Run; sourceId: string; owned: string; key: SidechannelPlacement }>();
const memory: Partial<Record<Mode, Run>> = {};
const labBattleController = createLabBattleController();
let storyActive = false;
let storySession: StorySession.StorySession | null = null;
let storyMatchId: string | null = null;
let storyBattleEncounter: StoryEncounter | null = null;
let pendingStorySettlement: StorySession.StorySession | null = null;
const storyPersistence = StorySession.createStorySessionPersistence({
  getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
});
function appOpponent() {
  if (!storyActive || !storySession) return R.opponent(run);
  const encounter = storyBattleEncounter ?? currentStoryEncounter(storySession.story) ?? currentStoryStage(storySession.story).encounters.at(-1)!;
  return { ...encounter.enemy, index: -1, round: null, size: encounter.enemy.layout.length, full: true };
}
function appEnemyBoard() {
  if (!storyActive || !storySession) return R.enemyBoard(run);
  return appOpponent().layout.map(([type,x,y,w,h,shape,label],i) => Object.assign(C.makeItem(type,"e"+i,x,y,w,h),shape?{shape}:{},label?{label}:{}));
}
let profileStore: ReturnType<typeof createProfileStore> | null = null;
let profileWrites: Promise<void> = Promise.resolve();
V.setAppearanceRenderer(applyRaidAppearance);
const fx = new UIRaidEffects(),
  traffic = new UIRaidTraffic(fx);
fx.traffic = traffic;
document.body.classList.toggle("reduced-motion", fx.reduced);
const KEY = "ui-raid-studio-v3-";
const runPersistence = createRunPersistence({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
}, KEY);
function load(mode: Mode): Run {
  if (memory[mode]) return clone(memory[mode]!);
  const result = runPersistence.load(mode);
  if (result.status === "loaded") return result.run;
  if (result.status === "corrupt" || result.status === "unavailable") {
    saveOK = false;
    saveProblem = result.error;
  }
  return memory[mode] ? clone(memory[mode]) : R.newRun(mode);
}
function save() {
  if (run.phase === "battle") return;
  if (storyActive && storySession) {
    const updated = storySession.story.phase === "naming" ? { ok: true as const, session: storySession } : StorySession.updateStoryBuild(storySession, run);
    if (!updated.ok) { run = clone(storySession.run); toast(updated.error); render(); return; }
    storySession = updated.session;
    const stored = storyPersistence.save(storySession);
    saveOK = stored.ok; saveProblem = stored.ok ? "" : stored.error;
    renderStorageNotice(); return;
  }
  memory[run.mode] = clone(run);
  const result = runPersistence.save(run);
  saveOK = result.ok;
  saveProblem = result.ok ? "" : result.error;
  if (result.ok && profileStore) {
    const snapshot = clone(run), store = profileStore;
    profileWrites = profileWrites.then(() => store.saveRun(snapshot, { isCurrent: value => runPersistence.isCurrent(value) })).then(() => {
      profileProblem = ""; renderStorageNotice();
    }).catch((error: unknown) => {
      profileProblem = error instanceof Error ? error.message : "コレクションの保存に失敗しました。";
      renderStorageNotice();
    });
  }
  renderStorageNotice();
}
function renderStorageNotice() {
  let notice = document.querySelector<HTMLElement>("#storage-notice");
  if (saveOK && !profileProblem) { notice?.remove(); return; }
  if (!notice) {
    notice = document.createElement("aside");
    notice.id = "storage-notice";
    notice.setAttribute("role", "alert");
    Object.assign(notice.style, { position: "fixed", left: "12px", right: "12px", bottom: "12px", zIndex: "30000", padding: "12px", background: "#fff3cf", color: "#34280b", border: "2px solid #ab7616", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" });
    document.body.append(notice);
  }
  notice.replaceChildren();
  const label = document.createElement("span");
  label.textContent = [saveProblem, profileProblem].filter(Boolean).join(" ");
  notice.append(label);
  const backup = document.createElement("button");
  backup.textContent = "データを書き出す";
  backup.onclick = () => {
    if (storyActive) { exportFile(); return; }
    const state = runPersistence.status(run.mode);
    if (state?.status !== "corrupt") { exportFile(); return; }
    const url = URL.createObjectURL(new Blob([state.raw], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `ui-raid-${run.mode}-recovery.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  notice.append(backup);
  if (!storyActive && !saveOK) {
    const reload = document.createElement("button");
    reload.textContent = "最新の保存を読み直す";
    reload.disabled = !!battle;
    reload.onclick = () => {
      if (battle || !window.confirm("今の未保存の編集は置き換わります。必要なら先に書き出してください。最新の保存を読み直しますか？")) return;
      const result = runPersistence.load(run.mode);
      if (result.status !== "loaded") {
        saveProblem = result.status === "empty" ? "読み直せる保存がありません。今の構成はそのまま残しています。" : result.error;
        renderStorageNotice(); return;
      }
      run = clone(result.run); memory[run.mode] = clone(run);
      saveOK = true; saveProblem = "";
      editor.reset(); preview = false; view = "self";
      render(); renderStorageNotice();
      toast("最新の保存を読み込みました。");
    };
    notice.append(reload);
  }
  const recover = document.createElement("button");
  recover.textContent = "この構成で保存を再開";
  recover.onclick = () => {
    if (storyActive) { save(); return; }
    if (!window.confirm("元データをバックアップして、現在の構成で保存を再開しますか？")) return;
    const result = runPersistence.recover(run);
    saveOK = result.ok; saveProblem = result.ok ? "" : result.error;
    renderStorageNotice();
  };
  notice.append(recover);
}
function toast(message: string) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3200);
}
let startMode = "campaign";
try {
  startMode = localStorage.getItem(KEY + "mode") || "campaign";
} catch {}
run = load(startMode === "lab" ? "lab" : "campaign");
try {
  profileStore = createProfileStore(indexedDB);
  for (const mode of ["lab", "campaign"] as const) {
    const legacy = runPersistence.load(mode);
    if (legacy.status === "loaded") await profileStore.migrateLegacy(legacy.run);
    const saved = await profileStore.loadRun(mode);
    const recovered = selectRecoveredRun(legacy, saved);
    if (recovered) memory[mode] = recovered;
  }
  run = memory[run.mode] ? clone(memory[run.mode]!) : run;
  for (const trophy of await profileStore.listTrophies()) {
    const capture = await profileStore.getBlueprint(trophy.captureId);
    if (capture) await registerRaidBlueprint(capture);
  }
} catch (error) {
  profileProblem = error instanceof Error ? error.message : "個人コレクションを開けません。";
  profileStore = null;
}
const editor = new UIRaidEditor.Editor({
  getRun: () => run,
  getHost: () => $("#player-body"),
  getOverlay: () => $("#editor-overlay"),
  enabled: () =>
    !battle &&
    !preview &&
    run.phase === "build" &&
    view !== "enemy" &&
    !$<HTMLDialogElement>("#modal").open,
  onChange: () => {
    save();
    render();
    afterBuildChange();
  },
  onSelect: () => {
    renderSide();
    renderShop();
    renderCoach();
    editor.drawSelection();
  },
  onToast: toast,
  paint: (board, lifted) =>
    V.render($("#player-body"), board, {
      side: "player",
      theme: run.page.theme,
      selected: lifted.length ? [] : [...editor.selection],
      lifted,
      decor: R.pageDecor(run),
    }),
});

/* ---------- Plain-language rules shown to the player ---------- */
const KIND: Record<string, string> = {
  attack: "攻撃",
  shield: "防御",
  heal: "回復",
  income: "収益",
  reactive: "連動",
  passive: "補助",
  echo: "再発動",
  interference: "妨害",
  cache: "保護",
  restore: "復元",
  "server-pressure": "一時負荷",
};
const GROUP_BONUS: Record<string, string> = {
  "button-group": "速度 +12%",
  "search-form": "威力 +30%",
  "nav-row": "速度 +15%",
  "nav-menu": "速度 +15%",
  "media-stack": "シークバーで動画 +25%",
  "commerce-stack": "購入ボタン +20%",
  "search-stack": "サジェストで文字攻撃 +40%",
};
const has = (q: Item, tag: string) => P[q.type].tags.includes(tag),
  isCtrl = (t: string) =>
    ["button", "search", "field", "toggle"].includes(P[t].layout);
// Support UIs only work next to the right kind of partner; these rules mirror the engine.
const NEEDS: Record<string, { t: (item: Item) => boolean; x: string }> = {
  yt_speed: {
    t: isVideoSource,
    x: VIDEO_SPEED_HELP,
  },
  am_prime: {
    t: (q) => P[q.type].cd > 0 && has(q, "commerce"),
    x: "購入ボタン・商品情報の隣に置くと1.5倍速",
  },
  gov_font: {
    t: (q) => P[q.type].kind === "attack" && has(q, "text"),
    x: "見出し・リンク・検索など文字で攻撃するUIの隣で威力 +50%",
  },
  go_suggest: {
    t: (q) => P[q.type].kind === "attack" && has(q, "text"),
    x: "検索窓の真下に付けると一体化。文字攻撃 +40%",
  },
  go_translate: {
    t: (q) =>
      P[q.type].kind === "attack" &&
      has(q, "text") &&
      P[q.type].faction !== "google",
    x: "Google以外の文字攻撃UIの隣で威力 +25%",
  },
  am_quantity: {
    t: (q) => ["am_buy", "am_product", "am_oneclick"].includes(q.type),
    x: "購入ボタン・商品情報・ワンクリック購入の横にくっつけると威力 +20%",
  },
  am_rating: {
    t: (q) => P[q.type].kind === "attack" && has(q, "commerce"),
    x: "購入系UIの隣で威力 +20%",
  },
  go_tabs: {
    t: (q) => has(q, "search") && P[q.type].cd > 0,
    x: "検索窓・検索結果の隣で速度 +20%",
  },
  gov_breadcrumb: {
    t: (q) => has(q, "document") && P[q.type].cd > 0,
    x: "PDF・申請UIの隣で速度 +15%",
  },
  yt_caption: {
    t: (q) => has(q, "video"),
    x: "動画の操作列に入れるとシールドを貫通",
  },
  yt_ad: { t: (q) => has(q, "video"), x: "動画の隣に置くと、再生のたびに収益" },
  yt_sub: {
    t: (q) => has(q, "video"),
    x: "動画の隣に置くと、3回再生ごとに収益",
  },
  yt_autoplay: {
    t: (q) => has(q, "video"),
    x: "動画の操作列に入れると、動画をもう一度再生",
  },
  yt_progress: {
    t: (q) => q.type === "yt_play",
    x: "動画の真下に付けると動画の威力 +25%",
  },
  go_ads: {
    t: (q) => has(q, "text") && P[q.type].cd > 0,
    x: "文字で攻撃するUIの隣で、発動のたび収益",
  },
  ab_counter: {
    t: (q) => P[q.type].cd > 0,
    x: "よく発動するUIの隣で、4回ごとに収益",
  },
  am_cart: {
    t: (q) => has(q, "economy"),
    x: "広告・カウンター・クーポンなど収益UIの隣で、お金が弾になる",
  },
  am_deal: {
    t: (q) => ["am_buy", "am_product", "am_oneclick"].includes(q.type),
    x: "購入ボタン・商品情報・ワンクリック購入の隣で収益",
  },
  am_coupon: {
    t: (q) => ["am_buy", "am_product", "am_oneclick"].includes(q.type),
    x: "購入ボタン・商品情報・ワンクリック購入の隣で収益",
  },
  go_page: {
    t: (q) => P[q.type].kind === "attack" && has(q, "text"),
    x: "文字攻撃UIの隣で、それをもう一度発動",
  },
  gov_page: {
    t: (q) => P[q.type].kind === "attack" && has(q, "document"),
    x: "PDF・送信ボタンの隣で、それをもう一度発動",
  },
};
function connectText(t: string) {
  if (t === "go_instant") return INSTANT_SEARCH_HELP;
  if (t === "am_oneclick") return "近くの収益UIから届くチャージ$3で連動購入。累計収益による通常攻撃の威力増加とは別。ページに置けば、収益が未接続でも通常攻撃は使える。同じ収益を複数の受け皿へ二重配分しない。";
  if (t === "go_jobs") return "文字・動画 → 隣の広告などの収益UI → 隣のジョブ一覧。収益の行き先は1つだけ。実験室の一時サーバー負荷ルールを選んでください。";
  const d = P[t];
  if (NEEDS[t]) return NEEDS[t].x;
  if (d.container)
    return "内側にUIを入れられる。中のUIは親ごと動き、効果も上がる";
  return (
    {
      button:
        "ボタン同士を横にくっつけるとボタングループ。検索窓の右なら検索フォーム",
      search: "右にボタンで検索フォーム、真下にサジェストで検索パネル",
      field: "ボタンの横にくっつけると連結",
      toggle: "動画の下の操作列に入れられる",
      media: "真下にシークバー、その下に操作ボタンを付けると動画プレイヤー",
      product: "真下に購入ボタンや数量を置くと商品購入欄",
      link: "リンク同士を横か縦に並べるとナビゲーション（速度 +15%）",
      heading: "文字攻撃。文字サイズ変更と組むと強い",
      marquee: "右側か真下にある攻撃UIをもう一度発動",
      rule: "近くに文字UIがあると防御 +2",
      document: "PDF・申請UIと並べると強い",
    }[d.layout] || "近く（隣接・同じまとまり）のUIと連携する"
  );
}
function working(p: Item, info: EngineInfo) {
  if (p.type === "go_jobs" && !labBattleController.value.startsWith("server-pressure")) return false;
  if (p.type === "yt_speed") return videoSpeedWorking(p, info);
  if (p.type === "am_cart") return conversionGuidance(p, info)?.state === "wired";
  const n = NEEDS[p.type];
  if (!n) return true;
  if (p.type === "yt_progress")
    return (info.member[p.id] || []).some((g) => g.kind === "media-stack");
  return (info.near[p.id] || []).some((id) => {
    const q = info.board.find((b) => b.id === id);
    return q && n.t(q);
  });
}
function shortDesc(d: PartDefinition) {
  const s = d.desc.split("。")[0];
  return s + "。";
}
function incomeRouteEditingAllowed() {
  return !battle && !preview && !settling && !pendingStorySettlement &&
    run.phase === "build" && view === "self" &&
    !document.querySelector("dialog[open]");
}
function setIncomeRouteFromControl(el: HTMLSelectElement) {
  const binding = incomeRouteBinding;
  if (!binding || binding.element !== el || binding.run !== run ||
    !el.isConnected || el.disabled || binding.sourceId !== el.dataset.sourceId ||
    !document.querySelector("#inspector")?.contains(el) || !incomeRouteEditingAllowed()) return;
  const selected = editor.selected();
  if (editor.selection.size !== 1 || selected.length !== 1 || selected[0].id !== binding.sourceId) return;
  const source = selected[0], pressure = labPressureCapacity() !== null;
  const info = E.analyze(run.owned, pressure ? "server-pressure-v1" : null);
  const route = incomeRouteGuidance(source, info, { owned: run.owned, pressure, editable: true });
  if (!route?.editable) return;
  const value = el.value, option = el.selectedOptions[0], previous = source.routeTo ?? "";
  if (!Number.isInteger(el.selectedIndex) || el.selectedIndex < 0 || !option || option.disabled ||
    (value !== "" && !route.candidates.some((candidate) => candidate.id === value))) {
    el.value = previous;
    return;
  }
  if (value === previous) return;
  const focused = document.activeElement === el, originalRun = run, sourceId = source.id;
  const committed = editor.commit(() => {
    if (value === "") delete source.routeTo;
    else source.routeTo = value;
    return true;
  });
  const next = incomeRouteBinding, selection = editor.selected();
  // A successful edit repaints the inspector. Preserve this focused control,
  // but never reclaim focus chosen by another control, a dialog or a new run.
  if (committed && focused && originalRun === run && next?.run === run &&
    next.sourceId === sourceId && editor.selection.size === 1 && selection.length === 1 && selection[0].id === sourceId &&
    next.element.isConnected && !next.element.disabled && incomeRouteEditingAllowed() &&
    (document.activeElement === document.body || document.activeElement === null))
    next.element.focus({ preventScroll: true });
}
function sidechannelPlacementEditingAllowed() {
  return run.mode === "lab" && !storyActive && incomeRouteEditingAllowed() &&
    !editor.drag && !editor.pending;
}
function bindSidechannelPlacementControls(host: HTMLElement, sel: Item[]) {
  if (run.mode !== "lab" || storyActive || run.page.templateId !== "site_slack" ||
    editor.selection.size !== 1 || sel.length !== 1) return;
  const guide = sidechannelPlacementGuide(run, [...editor.selection], { editable: sidechannelPlacementEditingAllowed() });
  if (!guide) return;
  const owned = JSON.stringify(run.owned);
  for (const element of host.querySelectorAll<HTMLButtonElement>("button[data-sidechannel-placement]")) {
    const target = guide.targets.find(target => target.key === element.dataset.sidechannelPlacement);
    if (target && element.dataset.sourceId === guide.breadcrumbId)
      sidechannelPlacementBindings.set(element, { run, sourceId: guide.breadcrumbId, owned, key: target.key });
  }
}
function setSidechannelPlacementFromControl(el: HTMLButtonElement) {
  const binding = sidechannelPlacementBindings.get(el);
  if (!binding) return;
  const current = () => sidechannelPlacementBindings.get(el) === binding && binding.run === run &&
    el.isConnected && !el.disabled && el.dataset.sourceId === binding.sourceId &&
    el.dataset.sidechannelPlacement === binding.key &&
    !!document.querySelector("#inspector")?.contains(el) && sidechannelPlacementEditingAllowed() &&
    editor.selection.size === 1 && editor.selected().length === 1 && editor.selected()[0].id === binding.sourceId &&
    JSON.stringify(run.owned) === binding.owned;
  if (!current()) return;
  const guide = sidechannelPlacementGuide(run, [...editor.selection], { editable: true });
  if (!guide?.editable || guide.breadcrumbId !== binding.sourceId || guide.current === binding.key) return;
  const focused = document.activeElement === el, originalRun = run;
  const committed = editor.commit(() => {
    if (!current()) return false;
    const fresh = sidechannelPlacementGuide(run, [...editor.selection], { editable: sidechannelPlacementEditingAllowed() });
    const target = fresh?.editable && fresh.breadcrumbId === binding.sourceId
      ? fresh.targets.find(target => target.key === binding.key) : undefined;
    return !!target && UIRaidEditor.patchItem(run.owned, binding.sourceId, { x: target.x, y: target.y });
  });
  if (!committed || !focused || run !== originalRun || !sidechannelPlacementEditingAllowed() ||
    editor.selection.size !== 1 || editor.selected().length !== 1 || editor.selected()[0].id !== binding.sourceId ||
    (document.activeElement !== document.body && document.activeElement !== null)) return;
  // Restore only the same operated control after its own successful repaint.
  for (const [element, next] of sidechannelPlacementBindings) {
    if (next.run === run && next.sourceId === binding.sourceId && next.key === binding.key &&
      next.owned === JSON.stringify(run.owned) && element.isConnected && !element.disabled &&
      document.querySelector("#inspector")?.contains(element)) {
      element.focus({ preventScroll: true });
      break;
    }
  }
}
function matchHint(t: string, info: EngineInfo) {
  if (t === "yt_speed") return videoSpeedHint(info);
  const d = P[t],
    b = info.board,
    hasAny = (f: (item: Item) => boolean) => b.some(f),
    c = info.counts[d.faction] || 0;
  if (
    isCtrl(t) &&
    d.layout !== "search" &&
    hasAny((q) => q.type === "go_search")
  )
    return "検索窓とつながる";
  if (
    d.layout === "search" &&
    hasAny((q) => isCtrl(q.type) && P[q.type].layout === "button")
  )
    return "ボタンとつながる";
  if (t === "yt_progress" && hasAny((q) => q.type === "yt_play"))
    return "動画とつながる";
  if (d.tags.includes("media-control") && hasAny((q) => q.type === "yt_play"))
    return "動画の操作列になる";
  if (t === "go_suggest" && hasAny((q) => q.type === "go_search"))
    return "検索窓とつながる";
  if (
    d.tags.includes("commerce") &&
    t !== "am_product" &&
    hasAny((q) => q.type === "am_product")
  )
    return "商品情報とつながる";
  if (t === "am_product" && hasAny((q) => P[q.type].tags.includes("commerce")))
    return "購入UIとつながる";
  const setHint = factionSetView(d.faction, c).nextHint;
  if (setHint) return setHint;
  if (NEEDS[t] && hasAny((q) => NEEDS[t].t(q))) return "今のページで効く";
  if (isCtrl(t) && hasAny((q) => isCtrl(q.type))) return "ボタンと連結できる";
  if (d.layout === "link" && hasAny((q) => P[q.type].layout === "link"))
    return "リンクと並べてナビに";
  if (d.container && b.length > 1) return "中にUIを入れられる";
  return "";
}
function hints(info: EngineInfo) {
  const out = [],
    b = info.board,
    grouped = (id: string) => (info.member[id] || []).length > 0,
    kids = (id: string) =>
      Object.values(info.parents).filter((v) => v === id).length;
  for (const p of b) {
    const d = P[p.type];
    if (
      p.type === "go_search" &&
      !(info.member[p.id] || []).some((g) => g.kind === "search-form")
    )
      out.push("検索窓の右にボタンをくっつけると「検索フォーム」（威力 +30%）");
    if (
      p.type === "yt_play" &&
      !(info.member[p.id] || []).some((g) => g.kind === "media-stack")
    )
      out.push(
        "動画の真下にシークバーや操作ボタンを付けると「動画プレイヤー」になる",
      );
    if (
      p.type === "am_product" &&
      !(info.member[p.id] || []).some((g) => g.kind === "commerce-stack")
    )
      out.push(
        "商品情報の真下に購入ボタンを置くと「商品購入欄」（購入ボタン +20%）",
      );
    if (d.container && !kids(p.id))
      out.push(`${d.name}の内側にUIを入れられる（ドラッグで中へ）`);
    if (NEEDS[p.type] && !working(p, info))
      out.push(`${d.name}は今、働いていない：${NEEDS[p.type].x}`);
  }
  const loose = b.filter((p) => isCtrl(p.type) && !grouped(p.id));
  if (loose.length >= 2)
    out.push("ボタン同士を横にくっつけると「ボタングループ」（速度 +12%）");
  const links = b.filter((p) => P[p.type].layout === "link" && !grouped(p.id));
  if (links.length >= 2)
    out.push("リンク同士を横か縦に並べると「ナビゲーション」（速度 +15%）");
  for (const [f, n] of Object.entries(info.counts))
    if (factionSetView(f, n).nextHint && isFaction(f))
      out.push(
        `${D.FACTIONS[f].name}のUIをあと1つ置くとセット効果：${D.FACTIONS[f].set}`,
      );
  return [...new Set(out)];
}

/* ---------- Page frames & back office ---------- */
function labPressureCapacity() {
  return run.mode === "lab" && !storyActive && labBattleController.value.startsWith("server-pressure") ? (labBattleController.value === "server-pressure-tight" ? 15 : labBattleController.value === "server-pressure-spare" ? 38 : 26) : null;
}
function frameMarkup(
  side: SideName,
  theme: Theme,
  name: string,
  address: string,
) {
  const o = appOpponent();
  return `<div class="frame-caption ${side === "enemy" ? "enemy" : ""}"><div class="frame-name"><i style="background:${side === "enemy" ? "#e5484d" : "#2fb47c"}"></i><b>${esc(name)}</b><small>${side === "enemy" ? (o.round ? `ROUND ${o.round} の相手` : "相手のサイト") : "あなたのサイト"}</small></div><div class="frame-health"><div class="health-meta"><span>HP</span></div><div class="health-track"><b style="width:100%"></b><i style="width:100%"></i></div></div></div>${labPressureCapacity() ? pressureMeterMarkup(C.analyze(side === "player" ? run.owned : appEnemyBoard()).load, labPressureCapacity()!) : ""}<div class="frame-viewport"><div class="browser-paper site-theme-${theme}"><div class="browser-tabs"><span class="traffic-lights"><i></i><i></i><i></i></span><div class="browser-tab"><i style="background:${(theme === "mixed" ? undefined : D.FACTIONS[theme].color) || "#8baa94"}"></i>${esc(name)} <span>×</span></div><span class="browser-plus">＋</span></div><div class="address-bar"><span class="address-controls">‹　›　↻</span><div class="address-field"><span>▧</span> ${esc(address)} <i>☆</i></div><span class="address-menu">⋮</span></div><header class="site-header">${V.header(theme, name)}</header><div class="page-wrap"><div class="page-body" id="${side}-body"></div>${side === "player" ? '<div class="editor-overlay" id="editor-overlay"></div><div class="tut-layer" id="tut-layer"></div>' : ""}</div><footer class="site-footer"><span>${esc(name)}　/　UI MASHUP</span><span>ローカル試作 · 実際のサービスには接続しません</span></footer>${adminDock(side, name)}</div></div>`;
}
const INVADER = [
  "..X.....X..",
  "...X...X...",
  "..XXXXXXX..",
  ".XX.XXX.XX.",
  "XXXXXXXXXXX",
  "X.XXXXXXX.X",
  "X.X.....X.X",
  "...XX.XX...",
];
function invaderSvg(color: string, size = 18) {
  return `<svg class="invader" width="${size}" height="${Math.round((size * 8) / 11)}" viewBox="0 0 11 8" shape-rendering="crispEdges" aria-hidden="true">${INVADER.flatMap((row, y) => [...row].map((c, x) => (c === "X" ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>` : ""))).join("")}</svg>`;
}
function adminViz(id: string, side: SideName) {
  const c = side === "enemy" ? "#ff6b6b" : "#5fe3a1";
  switch (id) {
    case "server":
      return '<div class="v-rack"><i></i><i></i><i></i></div><div class="v-load"><span></span></div>';
    case "cdn":
      return `<div class="v-cdn">${Array.from({ length: 14 }, (_, i) => `<i style="left:${((i * 37) % 92) + 4}%;top:${((i * 53) % 70) + 12}%"></i>`).join("")}</div>`;
    case "backup":
      return '<div class="v-backup"><span>▤</span><small>最終バックアップ<br>3分前</small></div>';
    case "moderator":
      return '<div class="v-mod"><span class="v-avatar">M</span><small>通報キューを監視中</small></div>';
    case "captcha":
      return '<div class="v-captcha"><i>✓</i><small>私はロボットでは<br>ありません</small></div>';
    case "adnet":
      return `<div class="v-bars">${[34, 52, 41, 66, 58, 80, 72].map((h) => `<i style="height:${h}%"></i>`).join("")}</div>`;
    case "sns":
      return '<div class="v-sns"><b>#UIRAID</b><small>トレンド入り</small></div>';
    case "sakura":
      return `<div class="v-inv">${Array.from({ length: 5 }, () => invaderSvg(c, 16)).join("")}</div>`;
    case "troll":
      return `<div class="v-inv troll">${Array.from({ length: 3 }, () => invaderSvg("#ff6b6b", 20)).join("")}</div>`;
    default:
      return "";
  }
}
function adminDock(side: SideName, name: string) {
  const o = appOpponent(),
    list = side === "player" ? run.admin || [] : o.admin,
    editable = side === "player" && !battle,
    open = side === "player" ? R.adminSlots(run) : D.ADMIN_SLOTS;
  if (!list.length && (side === "enemy" || !open))
    return `<section class="admin-dock is-slim"><div class="ad-head"><span class="ad-logo">⚙</span><b>管理画面</b><small>${side === "player" ? "[ロック] ROUND 3 で解放。対戦の報酬で設備（サーバー・CAPTCHA・AI運用など）が手に入ります" : "このサイトは運営設備なし"}</small></div></section>`;
  const slots = Array.from({ length: D.ADMIN_SLOTS }, (_, i) => {
    const id = list[i];
    if (!id) {
      if (side === "player" && i >= open)
        return `<div class="admin-empty is-lock">[ロック] ROUND ${i === 0 ? 3 : 6}で解放</div>`;
      return editable && run.mode === "lab"
        ? `<button class="admin-empty" data-admin-add="${i}">＋ 設備を導入</button>`
        : `<div class="admin-empty is-off">${side === "player" ? "対戦の報酬で設備を入手" : "なし"}</div>`;
    }
    const a = D.ADMIN[id];
    return `<div class="admin-widget aw-${id}" data-admin="${id}" title="${esc(a.desc)}"><div class="aw-top"><b>${esc(a.name)}</b><em>${esc(a.tag)}</em>${editable ? `<button data-admin-remove="${id}" aria-label="${esc(a.name)}を外す">×</button>` : ""}</div><div class="aw-viz">${adminViz(id, side)}</div><div class="aw-metric">${editable ? esc(a.desc) : "待機中"}</div></div>`;
  }).join("");
  return `<section class="admin-dock"><div class="ad-head"><span class="ad-logo">⚙</span><b>管理画面</b><small>admin.${esc(String(name).replace(/\s/g, ""))} / 運営ダッシュボード</small><span class="ad-status"><i></i>${battle ? "稼働中" : "待機中"}</span></div><div class="ad-slots">${slots}</div></section>`;
}
function adminPicker() {
  const owned = new Set(run.admin || []);
  openModal(
    `<div class="modal-inner">${modalHead("ADMIN / BACK OFFICE", "管理画面に設備を導入")}<p>ページのUIとは別に、サイトの裏側を強化します。</p><div class="admin-pick">${Object.entries(
      D.ADMIN,
    )
      .map(
        ([id, a]) =>
          `<button data-admin-pick="${id}" ${owned.has(id) ? "disabled" : ""}><span class="ap-viz">${adminViz(id, "player")}</span><b>${esc(a.name)} <em>${esc(a.tag)}</em></b><small>${esc(a.desc)}</small></button>`,
      )
      .join("")}</div></div>`,
  );
}
function renderFrames() {
  const o = appOpponent();
  $("#enemy-frame").className = "site-frame era-" + (ENEMY_ERA[o.faction] ?? "98");
  $("#player-frame").innerHTML = frameMarkup(
    "player",
    run.page.theme,
    run.page.name,
    "local://" + run.page.name.replace(/\s/g, "-"),
  );
  $("#enemy-frame").innerHTML = frameMarkup(
    "enemy",
    o.faction,
    o.pageName,
    o.address,
  );
  V.render($("#player-body"), run.owned, {
    side: "player",
    theme: run.page.theme,
    interactive: preview && !battle,
    selected: [...editor.selection],
    decor: R.pageDecor(run),
  });
  V.render($("#enemy-body"), appEnemyBoard(), {
    side: "enemy",
    theme: o.faction,
    interactive: preview && !battle,
    decor: o.decor || [],
  });
  const pInfo = C.analyze(run.owned),
    cap = labPressureCapacity() ?? R.capacity(run),
    slow = pInfo.load > cap,
    paper = $("#player-frame .browser-paper");
  paper.classList.toggle("is-slow", slow);
  if (slow) {
    const pct = Math.round(R.pageSpeed(pInfo.load, cap) * 100);
    paper
      .querySelector(".page-wrap")!
      .insertAdjacentHTML(
        "beforeend",
        `<div class="slow-banner">ページが重い（重さ ${pInfo.load} ／ 処理能力 ${cap}）— 表示速度 ${pct}%。UIの発動が遅くなり、待たされた閲覧者が離れていきます。</div>`,
      );
  }
  $("#player-frame").hidden = !battle && view === "enemy";
  $("#page-window").hidden = !battle && view === "enemy";
  $("#enemy-frame").hidden = !battle && view !== "enemy";
  $("#scene").classList.toggle("dual", !!battle);
  $("#traffic-hub").hidden = !battle;
  if (battle)
    $("#traffic-hub").innerHTML =
      `<div class="hub-label">共通の流入元</div><div class="hub-serp"><div class="hub-q">${icon("search")}<span>おもしろい サイト</span></div><div class="hub-meta">約 2 件（0.01 秒）</div><a class="hub-r you"><small>local://${esc(run.page.name)}</small><b>${esc(run.page.name)}</b><i id="hub-you">0人</i></a><a class="hub-r foe"><small>${esc(o.address)}</small><b>${esc(o.pageName)}</b><i id="hub-foe">0人</i></a><div class="hub-wait">検索結果で迷っている人<b id="hub-idle">0</b></div></div>`;
  editor.drawSelection();
  scheduleFit();
}
function scheduleFit() {
  cancelAnimationFrame(fitRAF);
  fitRAF = requestAnimationFrame(fit);
}
function fit() {
  const canvas = $("#canvas-scroll"),
    fitHost = !battle && view === "self" ? $("#page-window") : canvas,
    visible = [$("#player-frame"), $("#enemy-frame")].filter((n) => !n.hidden),
    dual = visible.length === 2,
    vertical = innerWidth <= 820 && !!battle;
  const ph = Math.max(
      ...visible.map((f) =>
        f.querySelector(".admin-dock.is-slim") ? 874 : 994,
      ),
    ),
    rw = Math.max(
      300,
      fitHost.clientWidth -
        44 -
        (dual && !vertical ? 28 : 0) -
        (battle && !vertical ? 194 : 0),
    ),
    rh = Math.max(300, fitHost.clientHeight - (battle ? 80 : 70));
  let scale =
    manualZoom ??
    Math.min(rw / (960 * (dual && !vertical ? 2 : 1)), rh / ph, 1);
  scale = Math.max(0.22, Math.min(1.5, scale));
  for (const f of visible) {
    const paper = f.querySelector<HTMLElement>(".browser-paper"),
      port = f.querySelector<HTMLElement>(".frame-viewport");
    if (!paper || !port) continue;
    if (!battle && view === "self" && f.id === "player-frame") {
      // The visible browser viewport is the window, with no fitting margins.
      // zoom participates in layout, so scrolling follows the displayed page size.
      port.style.width = "100%";
      port.style.height = "100%";
      f.style.width = "100%";
      scale = manualZoom ?? f.getBoundingClientRect().width / 960;
      paper.style.transform = "none";
      paper.style.zoom = String(scale);
      paper.style.position = "relative";
      paper.style.minHeight = "";
      // Measure after applying the new size: an old scrollbar must not leave
      // a strip of empty space when resetting a previously short window.
      if (manualZoom === null && port.clientWidth < f.clientWidth) {
        scale = port.clientWidth / 960;
        paper.style.zoom = String(scale);
      }
      continue;
    }
    paper.style.zoom = "";
    paper.style.position = "";
    paper.style.minHeight = "";
    paper.style.transform = `scale(${scale})`;
    port.style.width = 960 * scale + "px";
    port.style.height = ph * scale + "px";
    f.style.width = 960 * scale + "px";
  }
  $("#zoom-value").textContent =
    (manualZoom ? "" : "FIT ") + Math.round(scale * 100) + "%";
  const thumb = document.querySelector<HTMLElement>(
    "#enemy-thumbnail .thumb-paper",
  );
  if (thumb)
    thumb.style.transform = `scale(${$("#enemy-thumbnail").clientWidth / 960})`;
  editor.drawSelection();
}

/* ---------- Top bar ---------- */
function loadMeter(info: DocumentInfo) {
  const cap = labPressureCapacity() ?? R.capacity(run),
    load = info.load + (battle?.pressure?.player.work ?? 0),
    over = load > cap,
    pct = Math.round(R.pageSpeed(load, cap) * 100);
  return `<div class="tb-load ${over ? "over" : ""}" title="ページの重さ（UIの合計）と、サーバーの処理能力。重さが処理能力を超えると、UIの発動が遅くなり、待たされた閲覧者が離れていく。"><small>重さ / 処理能力</small><div class="load-bar"><i style="width:${Math.min(100, (load / cap) * 100)}%"></i>${over ? `<em style="width:${Math.min(60, ((load - cap) / cap) * 100)}%"></em>` : ""}</div><b>${load} / ${cap}</b><span class="tb-speed">${over ? `表示速度 ${pct}%` : "表示速度 100%"}</span></div>`;
}
function renderTopbar() {
  const info = C.analyze(run.owned);
  wm.setTitle("page", run.page.name);
  if (storyActive && storySession) {
    const stage = currentStoryStage(storySession.story);
    $("#tb-run").innerHTML = `<div class="tb-round"><small>STAGE</small><b>${stage.number}</b><span>/ 8</span></div><div class="tb-mode"><b>${esc(stage.title)}</b></div><div class="tb-lives">${"♥".repeat(run.lives)}</div><button id="story-hub-button" class="side-btn">ジャンクの作業場</button>`;
    $("#tb-stats").innerHTML = `<div class="tb-money"><small>資金</small>$<b>${run.cash}</b></div>${loadMeter(info)}`;
  } else if (run.mode === "campaign") {
    const results: Record<number, string> = {};
    for (const h of run.history)
      if (h.round)
        results[h.round - 1] = h.winner === "player" ? "win" : "lose";
    $("#tb-run").innerHTML =
      `<div class="tb-round"><small>ROUND</small><b>${Math.min(run.stage + 1, R.ROUNDS)}</b><span>/ ${R.ROUNDS}</span></div><div class="tb-ladder" title="各ラウンドの結果">${R.LADDER.map((_, i) => `<i class="${results[i] || (i === run.stage ? "now" : "")}"></i>`).join("")}</div><div class="tb-lives" title="ライフ：負けると1つ減る">${"♥".repeat(run.lives)}<span>${"♥".repeat(3 - run.lives)}</span></div>`;
    $("#tb-stats").innerHTML =
      `<div class="tb-money" title="資金：巡回先サイトからのUI移植と、サーバー契約に使う。対戦中の収益で増える。"><small>資金</small>$<b>${run.cash}</b></div>${loadMeter(info)}`;
  } else {
    $("#tb-run").innerHTML =
      `<div class="tb-mode"><b>実験室</b><small>${labPressureCapacity() ? `一時サーバー負荷 · 双方CPU ${labPressureCapacity()} · HPとは別` : labBattleController.value === "audience-v1" ? "実験：広告の離脱・登録の定着" : "すべてのUIを無料で試せます"}</small></div>`;
    $("#tb-stats").innerHTML = loadMeter(info);
  }
  const b = $<HTMLButtonElement>("#battle-button");
  b.disabled = !!battle;
  b.classList.toggle(
    "is-ready",
    !battle &&
      run.phase === "build" &&
      run.owned.some((p) => C.placed(p) && P[p.type].kind === "attack"),
  );
  b.textContent =
    storyActive ? (storySession?.reward ? "回収品を選ぶ" : "▶ 機械へ接続") :
    run.mode === "lab"
      ? "▶ テスト対戦"
      : run.phase === "reward"
        ? "報酬を受け取る"
        : ["complete", "gameover"].includes(run.phase)
          ? "結果を見る"
          : "▶ 公開して対戦";
  $<HTMLButtonElement>("#menu-button").disabled = !!battle;
}

/* ---------- Crawled sites: UI is copied from other websites, not bought from a store ---------- */
const SITE_URL: Record<string, string> = {
  youtube: "archive://youtube/watch?v=…",
  amazon: "archive://amazon/dp/…",
  google: "archive://google/search?q=…",
  retro: "archive://homepage/~abe/",
  gov: "archive://city.lg.jp/service/",
};
function shopCard(t: string, info: EngineInfo) {
  const d = P[t],
    f = D.FACTIONS[d.faction],
    poor = run.mode === "campaign" && run.cash < d.price,
    m = matchHint(t, info),
    pend = editor.pending?.type === t;
  return `<div class="shop-card ${poor ? "poor" : ""} ${pend ? "pending" : ""}" data-palette-type="${t}" tabindex="0" role="button" aria-label="${esc(d.name)}を自分のページへ移植"><div class="sc-top"><span class="sc-kind kind-${d.kind}">${KIND[d.kind]}</span><span class="sc-weight">重さ ${d.load}</span><span class="sc-price">${run.mode === "lab" ? "" : "$" + d.price}</span></div><div class="sc-visual"></div><b class="sc-name">${esc(d.name)}${d.status === "experimental" ? " ［実験］" : ""}</b><p class="sc-desc">${esc(shortDesc(d))}</p><div class="sc-foot">${m ? `<span class="sc-match">◎ ${esc(m)}</span>` : ""}<button class="sc-buy" data-add-type="${t}">${run.mode === "lab" ? "置く" : "⧉ 移植"}</button></div></div>`;
}
function planCard(key: string, sold: boolean) {
  const pl = R.PLANS[key],
    cap = R.capacity(run),
    poor = run.cash < pl.price;
  if (sold) return '<div class="plan-card sold">契約済み</div>';
  return `<div class="plan-card ${poor ? "poor" : ""}"><div class="pc-rack"><i></i><i></i><i></i></div><div class="pc-main"><b>${esc(pl.name)}</b><div class="pc-cap">処理能力 <strong>+${pl.cap}</strong><small>${cap} → ${cap + pl.cap}</small></div></div><div class="pc-foot"><span class="sc-price">$${pl.price}</span><button class="sc-buy" data-plan="${key}">契約する</button></div></div>`;
}
function renderShop() {
  const host = $("#library-list"),
    scroll = host.scrollTop,
    info = E.analyze(run.owned),
    lab = run.mode === "lab";
  $("#library-toolbar").hidden = !lab;
  $("#shop-foot").hidden = lab;
  crawler.setEnabled(!lab && !fx.reduced);
  if (lab || fx.reduced) {
    basket.setEnabled(false);
    $(".left-panel").classList.remove("hx-basket-on");
  }
  if (lab) {
    const q = $<HTMLInputElement>("#library-query").value.trim().toLowerCase(),
      family = $<HTMLSelectElement>("#family-filter").value;
    const types = Object.values(P).filter(
      (p) =>
        (family === "all" || p.faction === family) &&
        (!q ||
          (p.name + " " + p.desc + " " + D.FACTIONS[p.faction].name)
            .toLowerCase()
            .includes(q)),
    );
    $("#shop-title").textContent = "UIライブラリ";
    wm.setTitle("crawl", "UIライブラリ");
    $("#shop-sub").textContent = `${types.length}種類・ドラッグしてページへ`;
    let last = "",
      html = "";
    for (const p of types) {
      if (last !== p.faction) {
        html += `<div class="family-heading"><i style="background:${D.FACTIONS[p.faction].color}"></i><span>${esc(D.FACTIONS[p.faction].name)}</span></div>`;
        last = p.faction;
      }
      html += shopCard(p.id, info);
    }
    host.innerHTML =
      html || '<p class="empty-list">該当するUIがありません。</p>';
  } else {
    const nx = R.LADDER[run.stage + 1],
      nf = nx && D.ENEMIES[nx.e].faction,
      newF = nf && !R.shopFactions(run).has(nf) ? D.FACTIONS[nf].name : null;
    $("#shop-title").textContent = "巡回先のサイト";
    wm.setTitle("crawl", "巡回先のサイト");
    $("#shop-sub").innerHTML =
      `気に入ったUIを、自分のページへドラッグして<b>移植</b>（コピー）。移植には資金がかかります。${newF ? `<br><span class="unlock">次のラウンドから「${esc(newF)}」も巡回できる</span>` : ""}`;
    const bySite: Record<string, { index: number; type: string; sold: boolean }[]> = {},
      plans: Run["shop"] = [];
    run.shop.forEach((s, index) => {
      if (s.type.startsWith("plan:")) plans.push(s);
      else (bySite[P[s.type].faction] ??= []).push({ index, type: s.type, sold: s.sold });
    });
    let html = "";
    if (plans.length)
      html += `<section class="crawl-site server"><div class="cs-bar"><span class="cs-dots"><i></i><i></i><i></i></span><span class="cs-name">レンタルサーバー</span><span class="cs-url">rental-server.example/plans</span></div><div class="cs-body">${plans.map((s) => planCard(s.type.slice(5), s.sold)).join("")}<p class="cs-note">処理能力が上がると、重いページでも速く表示できる。</p></div></section>`;
    host.innerHTML = html;
    renderHackSites(
      host,
      Object.entries(bySite).flatMap(([f, stock]) =>
        isFaction(f)
          ? [{ faction: f, name: D.FACTIONS[f].name, url: SITE_URL[f], color: D.FACTIONS[f].color, header: V.header(f, D.FACTIONS[f].name), stock }]
          : [],
      ),
      { preview: (t) => V.palettePreview(t), info: (t) => itemInfo(t, info), favicon },
    );
    $("#reroll-button").innerHTML = `↻ 別のページを巡回 <b>$${R.REROLL}</b>`;
    $<HTMLButtonElement>("#reroll-button").disabled =
      run.phase !== "build" || run.cash < R.REROLL;
  }
  for (const card of host.querySelectorAll<HTMLElement>(
    ".shop-card[data-palette-type]",
  )) {
    const t = card.dataset.paletteType!,
      d = P[t],
      n = V.palettePreview(t),
      w = card.querySelector(".sc-visual")!.clientWidth || 240,
      s = Math.min(w / d.w, 52 / d.h, 1);
    n.style.transform = `scale(${s})`;
    card.querySelector(".sc-visual")!.append(n);
    for (const c of n.querySelectorAll<HTMLElement>("button,a,input,select"))
      c.tabIndex = -1;
  }
  host.scrollTop = scroll;
  if (!lab) syncCrawler();
  renderStash();
}
/* ---------- RAID Crawler: the AI shopkeeper reads your page and the stolen stock ---------- */
/* ---------- Hacked-site shop: inspect overlay, extraction, drop preview only over the page ---------- */
function itemInfo(t: string, info = E.analyze(run.owned)): ItemInfo {
  const d = P[t];
  return {
    name: d.name + (d.status === "experimental" ? " ［実験・バランス調整中］" : ""),
    price: d.price,
    kind: d.kind,
    kindLabel: KIND[d.kind],
    load: d.load,
    desc: shortDesc(d),
    match: matchHint(t, info) || null,
    poor: run.mode === "campaign" && run.cash < d.price,
    w: d.w,
    h: d.h,
  };
}
const dragProxy = document.createElement("div");
dragProxy.className = "ex-proxy";
dragProxy.setAttribute("aria-hidden", "true");
document.body.append(dragProxy);
let ownedAtEnter = 0;
const pageBox = () => {
  const b = document.getElementById("player-body");
  if (!b) return null;
  const rect = b.getBoundingClientRect();
  return { rect, scale: rect.width / D.WIDTH };
};
$("#library-list").addEventListener("pointerover", (e) => {
  const el = (e.target as Element).closest<HTMLElement>(".hs-el");
  if (el?.dataset.paletteType) inspectCard(el, itemInfo(el.dataset.paletteType));
});
$("#library-list").addEventListener("pointerout", (e) => {
  if (!(e.relatedTarget as Element | null)?.closest?.(".hs-el")) inspectCard(null);
});
$("#library-list").addEventListener("pointerdown", (e) => {
  const el = (e.target as Element).closest<HTMLElement>(".hs-el");
  if (!el || e.button !== 0 || (e.target as Element).closest("[data-add-type]")) return;
  const t = el.dataset.paletteType;
  if (!t || battle || run.phase !== "build") return;
  e.stopPropagation(); // the editor must not start its own drag yet
  e.preventDefault();
  inspectCard(null);
  beginExtract(el, t, e, {
    preview: (type) => V.palettePreview(type),
    size: (type) => ({ w: P[type].w, h: P[type].h }),
    page: pageBox,
    enterPage: (type, x, y, pointerId) => {
      ownedAtEnter = run.owned.length;
      dragProxy.dataset.paletteType = type;
      // start the editor's drag from just off the cursor so the next real move activates its preview
      dragProxy.dispatchEvent(new PointerEvent("pointerdown", { clientX: x + 6, clientY: y + 6, pointerId, bubbles: true, button: 0, buttons: 1, isPrimary: true, pointerType: "mouse" }));
    },
    leavePage: () => editor.cancelDrag(),
    didPlace: () => run.owned.length > ownedAtEnter,
    color: (type) => D.FACTIONS[P[type].faction].color,
    onGrab: (type) => {
      audio.sfx("steal", { volume: 1.1 });
      crawler.say(`「${P[type].name}」を抜き取ったよ。君のページまで運んで。`, "happy");
    },
    onDone: (type, placed) => {
      if (!placed) return;
      audio.sfx("drop", { volume: 1.2 });
      const id = [...editor.selection][0],
        node = id ? $$<HTMLElement>(`#player-body .web-node[data-id="${id}"]`)[0] : undefined;
      if (!node) return;
      node.classList.add("hx-pop");
      window.setTimeout(() => node.classList.remove("hx-pop"), 450);
      const r = node.getBoundingClientRect();
      particles.ring(r.left + r.width / 2, r.top + r.height / 2, D.FACTIONS[P[type].faction].color, Math.max(r.width, r.height) * 0.6);
    },
    reduced: () => fx.reduced,
  });
});

/* ---------- RAID OS windows: the panels are movable, resizable desktop windows ---------- */
const pageWindow = document.createElement("div"),
  playerFrame = $("#player-frame");
pageWindow.id = "page-window";
playerFrame.before(pageWindow);
pageWindow.append(playerFrame);
const wm = createWindowManager($("#workspace"), $(".tb-actions"));
const initialLayout = (w: number, h: number) => defaultWindowLayout(
  w, h, playerFrame.querySelector<HTMLElement>(".browser-paper")?.offsetHeight || 994,
);
const clipWindow = document.createElement("section");
clipWindow.className = "clip-window";
clipWindow.append($(".stash-panel"));
$("#workspace").append(clipWindow);
wm.add($("#page-window"), {
  id: "page",
  title: run.page.name,
  icon: "▧",
  rect: (w, h) => initialLayout(w, h).page,
  minW: 160,
  minH: 160,
});
wm.add($(".left-panel"), { id: "crawl", title: "巡回先のサイト", icon: "◎", rect: (w, h) => initialLayout(w, h).crawl, minW: 150, minH: 160 });
wm.add(clipWindow, { id: "clip", title: "クリップボード", icon: "▤", rect: (w, h) => initialLayout(w, h).clip, minW: 150, minH: 80 });
wm.add($("#right-panel"), { id: "props", title: "プロパティ", icon: "◧", rect: (w, h) => initialLayout(w, h).props, minW: 150, minH: 160 });
wm.onChange(() => {
  scheduleFit();
  layoutHackSites($("#library-list"));
});
const crawler = mountCrawler($(".left-panel"), $("#library-list"), () => fx.reduced);
let basketHover = "";
const basket = mountBasket(crawler.basketHost, {
  preview: (t) => V.palettePreview(t),
  size: (t) => ({ w: P[t].w, h: P[t].h }),
  page: () => {
    const b = document.getElementById("player-body");
    if (!b) return null;
    const rect = b.getBoundingClientRect();
    return { rect, scale: rect.width / D.WIDTH };
  },
  hover: (t) => {
    if (!t || t === basketHover) return;
    basketHover = t;
    const d = P[t],
      hint = matchHint(t, E.analyze(run.owned)),
      poor = run.cash < d.price;
    crawler.say(
      `「${d.name}」$${d.price}・${KIND[d.kind]}・重さ${d.load}。${shortDesc(d)}${hint ? `\n◎ ${hint}` : ""}${poor ? "\n…でも今の資金じゃ足りないね。" : ""}`,
      poor ? "sad" : hint ? "happy" : "normal",
    );
  },
  drop: (t, x, y) => {
    editor.selection.clear();
    editor.pending = { type: t };
    const rect = $("#player-body").getBoundingClientRect();
    const before = run.owned.length;
    editor.placePending({ x, y, scale: rect.width / D.WIDTH, r: rect });
    editor.pending = null;
    if (run.owned.length === before) return; // could not fit / could not afford: it falls back into the basket
    audio.sfx("drop", { volume: 1.2 });
    const id = [...editor.selection][0],
      node = id ? $$<HTMLElement>(`#player-body .web-node[data-id="${id}"]`)[0] : undefined;
    if (!node) return;
    node.classList.add("hx-pop");
    window.setTimeout(() => node.classList.remove("hx-pop"), 450);
    const r = node.getBoundingClientRect();
    particles.ring(r.left + r.width / 2, r.top + r.height / 2, "#3df4ff", Math.max(r.width, r.height) * 0.6);
  },
  grab: (t) => {
    audio.sfx("snap", { volume: 0.9 });
    crawler.say(`「${P[t].name}」、ピンとさせたよ。そのままページへ運んで。`, "happy");
  },
  reduced: () => fx.reduced,
});
const listToggle = document.createElement("button");
listToggle.type = "button";
listToggle.className = "hxb-list";
listToggle.textContent = "一覧で見る";
listToggle.addEventListener("click", () => {
  const open = $(".left-panel").classList.toggle("hx-list-open");
  listToggle.textContent = open ? "一覧を閉じる" : "一覧で見る";
});
crawler.basketHost.append(listToggle);
let crawlStage = -1,
  crawlRerolls = -1,
  crawlSold = new Set<number>(),
  crawlTalk = 0;
function fusionFor(t: string) {
  const placedTypes = new Set(run.owned.filter(C.placed).map((q) => q.type));
  return RECIPES.find((r) => (r.a === t && placedTypes.has(r.b)) || (r.b === t && placedTypes.has(r.a)));
}
function crawlerPitch(): [string, Mood] {
  const info = E.analyze(run.owned),
    stock = run.shop.filter((q) => !q.sold && !q.type.startsWith("plan:")).map((q) => q.type);
  for (const t of stock) {
    const r = fusionFor(t);
    if (r) {
      const other = r.a === t ? r.b : r.a;
      return [`いいパーツ入ったよ。この「${P[t].name}」、君のページの「${P[other].name}」の隣に置いて公開すれば「${P[r.into].name}」に統合できる。`, "happy"];
    }
  }
  for (const t of stock) {
    const hint = matchHint(t, info);
    if (hint) return [`「${P[t].name}」はおすすめ。${hint}。君のページと相性がいいよ。`, "happy"];
  }
  if (run.shop.some((q) => q.type.startsWith("plan:") && !q.sold))
    return ["レンタルサーバーの契約書も抜いてきた。ページが重くなってきたなら考えて。", "sly"];
  const cheap = stock.filter((t) => P[t].kind === "attack").sort((a, b) => P[a].price - P[b].price)[0];
  if (cheap) return [`掘り出し物は「${P[cheap].name}」。$${P[cheap].price}で、ちゃんと働くよ。`, "normal"];
  return ["今回はイマイチだね…。ハッキングし直す？", "sad"];
}
function crawlerTip(): [string, Mood] {
  const info = E.analyze(run.owned),
    cap = R.capacity(run),
    o = appOpponent(),
    fusions = R.fusionPairs(run.owned),
    afford = run.shop.filter((q) => !q.sold && !q.type.startsWith("plan:") && P[q.type].price <= run.cash).length;
  const tips: [string, Mood][] = [
    [`次の相手は「${o.pageName}」。${o.tip}`, "sly"],
    [afford ? `いまの資金 $${run.cash} で買えるのは ${afford} 個。ドラッグで君のページへ移植できる。` : `資金 $${run.cash} じゃ今は何も買えないね。対戦で稼いでおいで。`, afford ? "normal" : "sad"],
    info.load > cap
      ? [`ページの重さ ${info.load} が処理能力 ${cap} を超えてる。表示が遅れて閲覧者が逃げるよ。`, "sad"]
      : [`重さ ${info.load} / 処理能力 ${cap}。まだ余裕がある。`, "normal"],
    fusions.length
      ? [`公開すれば「${P[fusions[0].recipe.into].name}」に統合される組み合わせがあるね。${fusions[0].recipe.story}`, "happy"]
      : ["特定のUI同士を隣に置いたまま公開すると、上位のUIに統合されるんだ。検索窓とサジェストとか、ね。", "sly"],
    ["同じサイトのUIを3つ集めると、セット効果が付くよ。", "normal"],
  ];
  return tips[crawlTalk++ % tips.length];
}
function syncCrawler() {
  const sold = new Set(run.shop.flatMap((q, i) => (q.sold ? [i] : [])));
  const reason = crawlStage === -1 ? "first" : run.stage !== crawlStage ? "round" : run.rerolls !== crawlRerolls ? "reroll" : "same";
  crawler.sync(`${run.stage}|${run.rerolls}|${run.shop.map((q) => q.type).join(",")}`, reason);
  // The basket replaces the card list outside the tutorial (the tutorial points at list cards).
  const basketOn = false; // on hold: the shop is being rebuilt as the hacked-site window
  if (tutStep()) {
    wm.show("crawl");
    wm.show("clip");
  }
  $(".left-panel").classList.toggle("hx-basket-on", basketOn);
  basket.setEnabled(basketOn);
  if (basketOn)
    basket.sync(
      run.shop.flatMap((q, i) =>
        q.sold || q.type.startsWith("plan:") ? [] : [{ key: `${run.stage}|${run.rerolls}|${i}|${q.type}`, type: q.type }],
      ),
    );
  crawler.setHackLabel(`⟲ 再ハック <b>$${R.REROLL}</b>`, run.phase !== "build" || run.cash < R.REROLL);
  if (reason !== "same") {
    const [line, mood] = crawlerPitch();
    crawler.say((reason === "reroll" ? "…侵入し直した。" : reason === "round" ? "新しいサイトに潜ってきた。" : "") + line, mood);
  } else {
    const bought = [...sold].find((i) => !crawlSold.has(i));
    if (bought !== undefined) {
      const t = run.shop[bought].type;
      crawler.say(t.startsWith("plan:") ? "契約成立。サーバーが軽くなったね。" : `毎度。「${P[t].name}」、確かに渡したよ。`, "happy");
    }
  }
  crawlStage = run.stage;
  crawlRerolls = run.rerolls;
  crawlSold = sold;
}
crawler.onTalk(() => {
  const [line, mood] = crawlerTip();
  crawler.say(line, mood);
  audio.sfx("toggle", { volume: 0.6 });
});
crawler.onHack(() => {
  if (run.cash < R.REROLL) {
    crawler.say("資金が足りないね。次の対戦で稼いでおいで。", "sad");
    audio.sfx("error");
    return;
  }
  $("#reroll-button").click();
});
function renderStash() {
  const stash = run.owned.filter((p) => !C.placed(p));
  $("#stash-count").textContent = String(stash.length);
  $("#stash-list").innerHTML =
    stash
      .map((p) => {
        const caption = esc(targetCaption(p));
        return `<button class="stash-item" data-stash-id="${p.id}" style="max-width:100%" aria-label="${caption}" title="${caption} / ドラッグしてページへ"><i style="background:${D.FACTIONS[P[p.type].faction].color}"></i><span style="min-width:0;max-width:24ch">${caption}</span></button>`;
      })
      .join("") || '<span class="empty-list">なし</span>';
}

/* ---------- Right panel: selection, synergy, opponent ---------- */
function selectionCard(sel: Item[], info: EngineInfo) {
  if (!sel.length) return "";
  const containment = renderContainmentGuidance(containmentGuidance(sel, info, { editable: incomeRouteEditingAllowed() }));
  if (sel.length > 1) {
    const skinnable = sel.find((p) => D.SKINNABLE.includes(P[p.type].layout));
    return `<section class="side-sec sel-card"><div class="sel-kicker">${sel.length}個を選択中</div><h2>まとめて操作</h2><p class="sel-desc">ドラッグで一緒に移動できます。同じ高さに揃えて横につなぐこともできます。</p>${containment}<div class="sel-actions"><button data-editor-action="horizontal">横につなぐ</button><button data-editor-action="vertical">縦に揃える</button></div><div class="sel-actions"><button data-editor-action="stash">手持ちに戻す</button><button data-editor-action="remove" class="sell">${run.mode === "lab" ? "削除" : "まとめて売る"}</button></div>${skinnable ? `<details class="sel-more"><summary>見た目（時代）をまとめて変える</summary>${skinPicker(skinnable, true)}</details>` : ""}</section>`;
  }
  const p = sel[0],
    d = P[p.type],
    f = D.FACTIONS[d.faction],
    m = info.mods[p.id] || { speed: 1, power: 1, notes: [] },
    groups = info.member[p.id] || [],
    ok = working(p, info),
    instantSupport = instantSearchSupport(p, info);
  const interval=battle?.player.parts.find(part=>part.id===p.id)?.period ?? E.naturalPeriod(p,info,battle?.player.capacity??(labPressureCapacity()??(run.mode==="lab"&&!storyActive?Infinity:R.capacity(run))));
  const notes = [...m.notes];
  const placementGuide = run.mode === "lab" && !storyActive && run.page.templateId === "site_slack"
    ? renderSidechannelPlacementGuide(sidechannelPlacementGuide(run, [...editor.selection], { editable: sidechannelPlacementEditingAllowed() })) : "";
  return `<section class="side-sec sel-card"><div class="sel-kicker"><i style="background:${f.color}"></i>${esc(f.name)}<span class="sc-kind kind-${d.kind}">${KIND[d.kind]}</span></div><h2>${esc(d.name)}</h2>${d.status === "experimental" ? '<p class="sel-warn">実験用UI · バランス調整中。本編・オンラインの入手候補には入りません。</p>' : ""}<p class="sel-desc">${esc(d.desc)}</p>
 <div class="sel-stats">${p.type === "go_jobs" ? `<div><small>試験価格</small><b>$${d.price}</b></div><div><small>設置サイズ</small><b>${p.w}×${p.h}</b></div>` : ""}<div><small>自然発動</small><b>${d.cd ? (interval>0?interval.toFixed(2) + "秒ごと":"未配置") : "連動"}</b></div><div><small>威力</small><b>×${(m.power || 1).toFixed(2)}</b></div><div><small>重さ</small><b>${d.load}</b></div></div>
 ${
   notes.length || groups.length
     ? `<ul class="sel-bonus">${groups.map((g) => `<li>≡ ${esc(E.groupNames[g.kind])}（${esc(GROUP_BONUS[g.kind] || "")}）</li>`).join("")}${notes
         .filter((n) => !groups.some((g) => n.startsWith(E.groupNames[g.kind])))
         .map((n) => `<li>✓ ${esc(n)}</li>`)
         .join("")}</ul>`
     : ""
 }
 ${ok ? "" : `<p class="sel-warn">⚠ 今は働いていません</p>`}<div class="sel-connect"><b>つなぎ方</b>${esc(connectText(p.type))}</div>
 ${renderConversionGuidance(conversionGuidance(p, info))}
 ${renderIncomeRouteGuidance(incomeRouteGuidance(p, info, { owned: run.owned, pressure: labPressureCapacity() !== null, editable: incomeRouteEditingAllowed() }))}
 ${instantSupport ? `<div class="sel-connect"><b>接続している文字攻撃</b>${!instantSupport.placed ? "未配置：ページに置くと、自分の攻撃と近くの文字攻撃を支援します。" : instantSupport.targets.length ? `<ul class="sel-bonus">${instantSupport.targets.map(target => `<li>${esc(target.label || P[target.type].name)}</li>`).join("")}</ul>` : "ほかの文字攻撃には未接続。自分の内蔵サジェストは有効です。"}</div>` : ""}
 ${d.kind === "attack" && d.tags.includes("navigation") ? `<details class="sel-more"><summary>このUIの余白加算</summary>${renderNavigationGuidance(navigationGuidance(info, p))}</details>` : ""}
 <button id="toggle-fusion-lock" class="side-btn">${p.fusionLocked ? "合成を許可する" : "このUIの自動合成を保留"}</button>
 ${p.appearanceId ? '<p class="muted">取得元の外観を使用中。合成後は標準表示になりますが、元の外観と由来はコレクションに残ります。</p>' : ""}
 <details class="sel-more"><summary>見た目（時代）・部品ラベルを変える</summary>${skinPicker(p)}<label class="field-label">部品ラベル<input id="part-label" class="text-input" maxlength="80" value="${esc(p.label)}" placeholder="標準の名前・表示を使用"></label><p class="muted">部品の識別に使うラベルです。対応するUIの標準表示では、ページ上の文字も変わります。</p></details>
 ${containment}${placementGuide}
 <div class="sel-actions"><button data-editor-action="stash">手持ちに戻す</button><button data-editor-action="remove" class="sell">${run.mode === "lab" ? "削除" : `売る +$${R.sellValue(run, p.type)}`}</button></div></section>`;
}
// Each site culture gets a tiny favicon so it is recognisable at a glance, not only by colour.
const FAVICON: Record<string, string> = { youtube: "▶", amazon: "a", google: "G", retro: "HP", gov: "公", twitter: "t", x: "X", wiki: "文", forge: "git", nico: "TV", reddit: "r", audio: "≈" };
function favicon(f: string) {
  return `<span class="fav fav-${f}" aria-hidden="true">${FAVICON[f] ?? "?"}</span>`;
}
function synergyPanel(info: EngineInfo) {
  const counts = info.counts,
    order = Object.keys(D.FACTIONS)
      .filter(id => Object.values(P).some(part => part.faction === id))
      .filter(isFaction)
      .sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
  const traits = order
    .map((k) => {
      const n = counts[k] || 0,
        f = D.FACTIONS[k],
        setView = factionSetView(k, n);
      const progress = setView.threshold === null
        ? `<span class="trait-count">${n}個</span>`
        : `<span class="pips">${[0, 1, 2].map((i) => `<em class="${i < n ? "f" : ""}"></em>`).join("")}${n > 3 ? `<small>+${n - 3}</small>` : ""}</span>`;
      return `<div class="trait ${setView.active ? "on" : ""} ${n ? "" : "zero"}" style="--c:${f.color}">${favicon(k)}<b>${esc(f.name)}</b>${progress}<small>${esc(setView.status)}</small></div>`;
    })
    .join("");
  const links =
    info.groups
      .map(
        (g) =>
          `<div class="link-row"><b>≡ ${esc(E.groupNames[g.kind])}</b><span>${g.items.length}個</span><small>${esc(GROUP_BONUS[g.kind] || "")}</small></div>`,
      )
      .join("") +
    Object.entries(
      Object.values(info.parents).reduce<Record<string, number>>(
        (a, v) => ((a[v] = (a[v] || 0) + 1), a),
        {},
      ),
    )
      .map(
        ([id, n]) =>
          `<div class="link-row"><b>▣ ${esc(P[info.board.find((q) => q.id === id)!.type].name)}</b><span>中に${n}個</span><small>${info.board.find((q) => q.id === id)!.type === "gov_form" ? "中のUI 速度 +20%" : "内包ボーナス"}</small></div>`,
      )
      .join("");
  const tips = hints(info)
    .slice(0, 4)
    .map((h) => `<div class="hint">${esc(h)}</div>`)
    .join("");
  const navigation = info.board.some(p => P[p.type].kind === "attack" && P[p.type].tags.includes("navigation"))
    ? renderNavigationGuidance(navigationGuidance(info)) : "";
  return `<section class="side-sec synergy"><h3>シナジー<small>効いている効果</small></h3><div class="traits">${traits}</div><h4>連結・内包</h4>${links || '<p class="muted">まだありません。UI同士をくっつけてみよう。</p>'}${navigation}${tips ? `<h4>強くするヒント</h4>${tips}` : ""}</section>`;
}
function opponentCard() {
  const o = appOpponent(),
    adm = o.admin.map((a) => D.ADMIN[a].name);
  return `<section class="side-sec opp"><h3>${o.round ? `次の相手 <small>ROUND ${o.round}</small>` : "対戦相手"}</h3><div id="enemy-thumbnail" class="enemy-thumbnail" role="button" tabindex="0" aria-label="相手のサイトを大きく見る"></div><b class="opp-name">${esc(o.pageName)}</b><div class="opp-meta"><span>UI ${o.size}個</span><span>閲覧者の粘り ${o.hp}</span>${adm.length ? `<span>管理画面：${esc(adm.join("・"))}</span>` : ""}</div><p class="opp-tip">${esc(o.tip)}</p>${run.mode === "lab" ? `<select id="enemy-select" class="select-input">${enemyOptions(o.index)}</select><button id="open-builds" class="side-btn">構成例図鑑・相性表</button>` : ""}<button id="view-enemy" class="side-btn">相手のサイトをよく見る</button></section>`;
}
function renderSide() {
  incomeRouteBinding = null;
  sidechannelPlacementBindings.clear();
  const host = $("#inspector"),
    sel = editor.selected(),
    // Battle construction keeps analyze()'s full result; BattleSide exposes its base type.
    info = (battle?.player.info as EngineInfo | undefined) ?? E.analyze(run.owned, labPressureCapacity() ? "server-pressure-v1" : null);
  $<HTMLButtonElement>("#undo-button").disabled =
    !editor.history.length || !!battle;
  $<HTMLButtonElement>("#redo-button").disabled =
    !editor.future.length || !!battle;
  host.innerHTML =
    (preview
      ? '<div class="side-sec note">プレビュー中：ページの検索窓やボタンを実際に触れます。</div>'
      : "") +
    selectionCard(sel, info) +
    synergyPanel(info) +
    opponentCard();
  const routeControl = host.querySelector<HTMLSelectElement>("#sel-income-route");
  if (routeControl instanceof HTMLSelectElement && sel.length === 1 &&
    routeControl.dataset.sourceId === sel[0].id)
    incomeRouteBinding = { element: routeControl, run, sourceId: sel[0].id };
  bindSidechannelPlacementControls(host, sel);
  if (run.mode === "lab" && !storyActive) {
    const controlHost = document.createElement("section");
    controlHost.className = "side-sec lab-experiment-control";
    mountAudienceLabControl(controlHost, labBattleController,
      () => ({ mode: run.mode, storyActive, battleActive: !!battle }), () => { renderTopbar(); renderFrames(); renderSide(); });
    host.append(controlHost);
  }
  const o = appOpponent(),
    thumb = $("#enemy-thumbnail");
  thumb.innerHTML = `<div class="thumb-paper site-theme-${o.faction}"><header class="site-header">${V.header(o.faction, o.pageName)}</header><div class="page-body"></div></div>`;
  V.render(thumb.querySelector<HTMLElement>(".page-body")!, appEnemyBoard(), {
    side: "thumb",
    theme: o.faction,
    decor: o.decor || [],
  });
  scheduleFit();
}
function skinPicker(p: Item, all = false) {
  const d = P[p.type];
  if (!D.SKINNABLE.includes(d.layout))
    return '<p class="muted">このUIは元サイトのデザインのまま使います（見た目の変更はボタン・入力欄・トグル・ページ送りのみ）。</p>';
  const base = V.create(
      { ...p, shape: "source", label: "" },
      { preview: true },
    ),
    inner = base.firstElementChild,
    cls = inner?.className || "native-button",
    sample =
      d.layout === "search"
        ? "⌕ 検索"
        : d.layout === "field"
          ? "数量 ⌄"
          : d.layout === "toggle"
            ? "◐ ON"
            : d.layout === "pagination"
              ? '<button>1</button><button class="current">2</button><button>3</button>'
              : "Aa";
  return `<div class="skin-grid">${Object.entries(D.SKINS)
    .map(
      ([k, s]) =>
        `<button ${all ? "data-skin-all" : "data-shape"}="${k}" class="skin-chip ${!all && p.shape === k ? "active" : ""}" title="${esc(s.name)}"><span class="skin-sample web-node shape-${k}" style="--node-color:${D.FACTIONS[d.faction].color}"><span class="${esc(cls)} skin-face">${sample}</span></span><small>${esc(s.name)}</small><i>${esc(s.era)}</i></button>`,
    )
    .join("")}</div>`;
}

/* ---------- Tutorial: a blank page, three purchases, one connection, one battle ---------- */
function tutorialDone() {
  try {
    return localStorage.getItem(KEY + "tutorial") === "done";
  } catch {
    return false;
  }
}
function finishTutorial() {
  run.tutorial = 0;
  try {
    localStorage.setItem(KEY + "tutorial", "done");
  } catch {}
  save();
  render();
}
interface TutorialStep {
  n: number;
  text: string;
  label?: string;
  next?: string;
  card?: string;
  panel?: boolean;
  button?: boolean;
  rect?: [number, number, number, number, string];
}
function tutStep(): TutorialStep | null {
  if (run.mode !== "campaign" || !run.tutorial || preview || view === "enemy")
    return null;
  if (battle)
    return run.tutorial === 1
      ? {
          n: 0,
          label: "観戦のコツ",
          text: "閲覧者（カーソル）の奪い合い。上のバーで<b>多い方が優勢</b>。点線は「あなたのUIが相手から人を連れてきた」印です。",
        }
      : null;
  if (run.phase !== "build") return null;
  if (run.tutorial === 2)
    return {
      n: 7,
      text: "報酬のUIは左下の<b>手持ち</b>へ。巡回先には<b>戦ったサイトのUI</b>や、処理能力を増やす<b>レンタルサーバー</b>が並びます。ページが処理能力より<b>重い</b>と表示が遅くなり、閲覧者が離れていくので注意。",
      next: "はじめる",
    };
  const placed = run.owned.filter(C.placed),
    find = (t: string) => placed.find((p) => p.type === t),
    info = C.analyze(run.owned),
    h = find("ab_heading"),
    l = find("ab_link"),
    nav = find("ab_nav");
  if (!h)
    return {
      n: 1,
      card: "ab_heading",
      text: "まだ真っ白なページ。左の<b>巡回先サイト</b>から<b>「大きな明朝見出し」</b>を、ページの上のほうへドラッグして<b>移植</b>しよう。",
      rect: [32, 24, 576, 56, "ここに見出し"],
    };
  if (!l)
    return {
      n: 2,
      card: "ab_link",
      text: "見出しが付いた。次は<b>「青いハイパーリンク」</b>を見出しの下に置こう。",
      rect: [32, Math.min(600, h.y + h.h + 24), 192, 32, "ここ"],
    };
  if (!nav)
    return {
      n: 3,
      card: "ab_nav",
      text: "<b>「旧式ナビリンク」</b>を、青いリンクの<b>すぐ右</b>にくっつけてみよう。",
      rect: [Math.min(784, l.x + l.w), l.y, 176, l.h, "すぐ右"],
    };
  if (!(info.member[l.id] || []).some((g) => g.items.includes(nav.id)))
    return {
      n: 4,
      text: "ナビを青いリンクの<b>真横</b>まで寄せると、ピタッと連結します。",
      rect: [Math.min(784, l.x + l.w), l.y, nav.w, l.h, "ここまで寄せる"],
    };
  if (!run.tutorialAck)
    return {
      n: 5,
      panel: true,
      text: "連結した！ 右の<b>シナジー</b>に「ナビゲーション 速度 +15%」。さらに同じサイトのUIが3つで<b>セット効果</b>も発動中です。",
      next: "次へ",
    };
  return {
    n: 6,
    button: true,
    text: "準備完了。右上の<b>▶ 公開して対戦</b>で、相手のサイトと閲覧者を奪い合おう。",
  };
}
function renderCoach() {
  const el = $("#coach"),
    s = tutStep();
  for (const t of $$(".tut-target")) t.classList.remove("tut-target");
  const layer = document.querySelector<HTMLElement>("#tut-layer");
  if (layer) layer.innerHTML = "";
  if (!s) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  if (s.n !== lastTutorialStep) {
    lastTutorialStep = s.n;
    audio.sfx("tutorial");
  }
  el.classList.toggle("in-battle", !!battle);
  el.innerHTML = `<span class="coach-step">${s.label || (s.n <= 6 ? `STEP ${s.n}` : "TIPS")}</span><span class="coach-text">${s.text}</span>${s.next ? `<button id="tut-next" class="coach-next">${s.next}</button>` : ""}${battle ? "" : '<button id="tut-skip" class="coach-skip">スキップ</button>'}`;
  if (s.card)
    document
      .querySelector(`#library-list [data-palette-type="${s.card}"]`)
      ?.classList.add("tut-target");
  if (s.panel)
    document.querySelector("#inspector .synergy")?.classList.add("tut-target");
  if (s.button)
    $<HTMLButtonElement>("#battle-button").classList.add("tut-target");
  if (s.rect && layer) {
    const [x, y, w, hh, label] = s.rect;
    layer.innerHTML = `<div class="tut-drop" style="left:${x}px;top:${y}px;width:${w}px;height:${hh}px"><span>${esc(label)}</span></div>`;
  }
}
/* ---------- OS eras: the chrome modernises as the server grows ---------- */
type Era = "98" | "xp" | "aero" | "flat" | "art";
const ERAS: Era[] = ["98", "xp", "aero", "flat", "art"];
const ERA_NAME: Record<Era, string> = {
  "98": "RAID OS 98",
  xp: "RAID OS XP",
  aero: "RAID OS Aero",
  flat: "RAID OS Flat",
  art: "RAID OS 2025 Art",
};
const ERA_ACCENT: Record<Era, string> = { "98": "#0b1f8f", xp: "#316ac5", aero: "#2a78d8", flat: "#2b579a", art: "#ff4f1f" };
// Each rival site runs on a server of its own era.
const ENEMY_ERA: Record<string, Era> = { retro: "98", gov: "xp", amazon: "aero", google: "flat", youtube: "art" };
function eraFor(cap: number, mode: Mode): Era {
  if (mode === "lab") return "art";
  return cap >= 42 ? "art" : cap >= 32 ? "flat" : cap >= 24 ? "aero" : cap >= 17 ? "xp" : "98";
}
let appliedEra: Era | null = null,
  eraInstant = true,
  upgrading = false;
function setEraClass(e: Era) {
  for (const x of ERAS) document.body.classList.toggle("era-" + x, x === e);
  appliedEra = e;
}
function syncEra() {
  const e = eraFor(R.capacity(run), run.mode);
  if (upgrading) return;
  if (e === appliedEra) {
    // Entering a run may keep the same era. Consume the initial-render flag
    // here too, so the next server purchase still plays the upgrade wave.
    eraInstant = false;
    return;
  }
  if (!appliedEra || eraInstant || battle || ERAS.indexOf(e) < ERAS.indexOf(appliedEra)) {
    setEraClass(e);
    eraInstant = false;
    return;
  }
  const from = appliedEra;
  upgrading = true;
  void playOsUpgrade({
    fromClass: "era-" + from,
    accent: ERA_ACCENT[e],
    reduced: fx.reduced,
    swap: () => {
      setEraClass(e);
      scheduleFit();
    },
  }).then(() => {
    upgrading = false;
    Cer.showBanner("OSアップグレード！", `${ERA_NAME[e]} にアップデートしました`, ERA_ACCENT[e]);
    syncEra();
  });
}
function render() {
  syncEra();
  document.body.classList.toggle("preview-mode", preview);
  document.body.classList.toggle("battle-mode", !!battle);
  document.body.classList.toggle("battling", !!battle && !paused);
  $("#battle-controls").hidden = !battle;
  $("#battle-log").hidden = !battle;
  $("#canvas-float").hidden = !!battle || view === "enemy";
  const back = $("#back-to-page");
  back.hidden = !!battle || !(view === "enemy" || preview);
  back.textContent = preview ? "✎ 編集に戻る" : "← 自分のサイトに戻る";
  renderTopbar();
  const labControl = document.querySelector<HTMLSelectElement>("#lab-audience-experiment");
  if (labControl) labControl.disabled = !!battle || storyActive || run.mode !== "lab";
  renderFrames();
  if (!battle) {
    renderShop();
    renderSide();
    markFusions();
  } else {
    crawler.setEnabled(false);
    basket.setEnabled(false);
    fx.update(battle);
  }
  renderCoach();
}
/* ---------- UI fusion (統合): preview badges before a battle, ceremony after it ---------- */
let pendingFusions: ReturnType<typeof R.fuse> = [];
function markFusions() {
  for (const n of $$("#player-body .fuse-badge")) n.remove();
  for (const n of $$("#player-body .will-fuse")) n.classList.remove("will-fuse");
  if (view !== "self" || preview) return;
  for (const { recipe, a, b } of R.fusionPairs(run.owned)) {
    const into = P[recipe.into].name;
    [a, b].forEach((it, i) => {
      const node = $$<HTMLElement>(`#player-body .web-node[data-id="${it.id}"]`)[0];
      if (!node) return;
      node.classList.add("will-fuse");
      if (i === 0) {
        const badge = document.createElement("span");
        badge.className = "fuse-badge";
        badge.textContent = `⚗ 次の公開後に統合 → ${into}`;
        badge.title = `${P[a.type].name} ＋ ${P[b.type].name} → ${into}\n${recipe.story}${a.appearanceId || b.appearanceId ? "\n取得した外観は合成先の標準表示になります。元の外観と由来はコレクションに残ります。" : ""}`;
        if (a.appearanceId || b.appearanceId) badge.textContent += " · 外観は標準表示へ";
        node.append(badge);
      }
    });
  }
}
function celebrateFusions() {
  const list = pendingFusions;
  pendingFusions = [];
  list.forEach((f, i) =>
    window.setTimeout(() => {
      const d = P[f.item.type],
        color = D.FACTIONS[d.faction].color;
      Cer.showBanner("UI統合！", `${P[f.from[0]].name} ＋ ${P[f.from[1]].name} → ${d.name}　${f.recipe.story}`, color);
      audio.sfx("snap", { volume: 1.3 });
      audio.sfx("levelup", { volume: 0.9 });
      const node = $$<HTMLElement>(`#player-body .web-node[data-id="${f.item.id}"]`)[0];
      if (!node) return;
      node.classList.add("just-fused");
      window.setTimeout(() => node.classList.remove("just-fused"), 1600);
      const r = node.getBoundingClientRect();
      particles.setActivate(r, color);
      particles.burst(r.left + r.width / 2, r.top + r.height / 2);
      particles.ring(r.left + r.width / 2, r.top + r.height / 2, color, Math.max(r.width, r.height) * 0.7);
    }, 500 + i * 900),
  );
}

/* ---------- Modals ---------- */
let modalFeatureDispose: (() => void) | undefined;
let localRaidReturn: { run: Run; store: NonNullable<typeof profileStore>; selection: LocalRaidSelection } | undefined;
function openModal(html: string) {
  modalFeatureDispose?.(); modalFeatureDispose = undefined;
  $("#modal").classList.remove("feature-modal");
  $("#modal-content").innerHTML = html;
  if (!$<HTMLDialogElement>("#modal").open)
    $<HTMLDialogElement>("#modal").showModal();
}
function closeModal() {
  if (pendingStorySettlement) return;
  modalFeatureDispose?.(); modalFeatureDispose = undefined;
  $<HTMLDialogElement>("#modal").close();
}
$("#modal").addEventListener("close", () => {
  // A queued close from the previous panel may arrive after a story hub reopens.
  if ($<HTMLDialogElement>("#modal").open) return;
  modalFeatureDispose?.(); modalFeatureDispose = undefined;
  // Story transactions can repaint the inspector while the dialog is open.
  // Recompute its controls after actual dismissal, including native Escape.
  renderSide();
});
/* ---------- Isolated story profile and actual editor/battle bridge ---------- */
function commitStorySession(next: StorySession.StorySession) {
  // Story transactions establish a new inventory/economy baseline. Ordinary
  // editor saves bypass this bridge; story-only dialogue/start/cancel retains
  // history. Compare canonical runs, not the live run's temporary battle phase.
  const changedRun=!storySession||JSON.stringify(storySession.run)!==JSON.stringify(next.run);
  const stored=storyPersistence.save(next);
  if(!stored.ok)throw new Error(stored.error);
  storySession=clone(next);run=clone(next.run);
  if(changedRun)editor.reset();
  saveOK=true;saveProblem="";renderStorageNotice();
}
function enterStory(fresh=false) {
  if(battle)return;
  save();
  const read=storyPersistence.load();
  if(read.status==="unavailable"||(read.status==="corrupt"&&!fresh)){toast(read.error+" 新しく始める場合はメニューの「新しい物語」から元データを保全できます。");return;}
  const selected=fresh||read.status==="empty"||read.status==="corrupt"?StorySession.createStorySession():read.session;
  if(fresh&&read.status!=="empty"){const recovered=storyPersistence.recover(selected);if(!recovered.ok){toast(recovered.error);return;}}
  try{commitStorySession(selected);}catch(error){toast(error instanceof Error?error.message:"物語を保存できません。");return;}
  labBattleController.reset();
  storyActive=true;storyMatchId=null;storyBattleEncounter=null;
  editor.reset();preview=false;view="self";eraInstant=true;render();resetBuildSnap();audio.setMusic("build");openStoryHub();
}
function storyCommand(command:StoryCommand):StoryTransition {
  if(!storySession)throw new Error("物語が開いていません。");
  const result=StorySession.commandStorySession(storySession,command);
  if(!result.ok)return {ok:false,state:storySession.story,effects:[],error:result.error};
  try{commitStorySession(result.session);render();return {ok:true,state:result.session.story,effects:result.effects};}
  catch(error){return {ok:false,state:storySession.story,effects:[],error:error instanceof Error?error.message:"保存できません。"};}
}
function openStoryHub() {
  if(!storyActive||!storySession||battle)return;
  if(storySession.reward){storyRewardPanel();return;}
  if(run.lives<=0){
    openModal(`<div class="modal-inner">${modalHead("THE LAST BROWSER","接続が途切れた")}<p>この旅のライフが尽きました。作ったページと回収記録は保存されています。</p><button id="story-restart" class="primary">白紙のページから新しい旅へ</button><button data-close-modal>最後のページを見る</button></div>`);
    $("#story-restart").onclick=()=>enterStory(true);return;
  }
  openModal(`<div class="modal-inner" id="story-loading-head">${modalHead("THE LAST BROWSER","ジャンクの作業場")}</div><div class="story-host-controls"><button id="story-open-inbox" class="side-btn"></button></div><div id="story-feature-host"></div>`);
  $("#modal").classList.add("feature-modal");
  const inbox=$("#story-open-inbox");inbox.textContent=`物語の受取箱 (${storySession.inbox.length})`;inbox.onclick=storyInboxPanel;
  const host=$("#story-feature-host"), loadingHead=$("#story-loading-head");
  const feature=deferredModalFeature(host,async()=>{
    const panel=await import("./story/panel.js");
    await panel.loadStyles();
    return panel;
  },({mountStoryHub})=>{
    const panel=mountStoryHub(host,{
    getState:()=>storySession!.story,
    onCommand:storyCommand,
    onClose:closeModal,
    renderOwnPage:host=>V.render(host,run.owned,{side:"story-ending",theme:run.page.theme,decor:R.pageDecor(run)}),
    onEdit:target=>{closeModal();view="self";preview=false;render();if(target==="shop")wm.show("crawl");if(target==="server")toast("左の巡回先にあるサーバープランで処理能力を増やせます。");},
    onBattle:()=>{
      if(!run.owned.some(item=>C.placed(item)&&P[item.type].kind==="attack"))throw new Error("まず作業台で、攻撃するUIを最低1つページに置いてください。");
      return start();
    },
    onPracticeFusion:()=>{
      if(!storySession)return;
      const result=StorySession.rehearseStoryFusion(storySession);
      if(!result.ok)throw new Error(result.error);
      commitStorySession(result.session);pendingFusions="fusions" in result?result.fusions:[];render();
      if(result.effects.some(e=>e.type==="fusion-reaction"))toast(STORY_WORLD.fusion.join(" "));
      else toast("配置した部品を統合しました。");
    },
    onOptionalRaid:async(url,kind)=>{
      await raidPanel({url,kind,...(kind==="cached"&&storySession?{cachedBlueprint:StorySession.findStoryCapture(storySession,url)}:{})});
    },
    });
    loadingHead.remove();
    return panel;
  }, { loadingHead, closeSelector: '[data-story-action="close"]' });
  modalFeatureDispose=feature.dispose;
  void feature.start();
}
function storyRewardPanel() {
  const reward=storySession?.reward;if(!reward)return;
  openModal(`<div class="modal-inner">${modalHead("SALVAGE","サイトからUIを1つ持ち帰る")}<p>物語の重要な記録は、この選択とは別に保存されています。</p><div id="story-reward-choices" class="reward-grid"></div><button id="story-skip-loot">回収を見送る</button></div>`);
  const host=$("#story-reward-choices");
  const claim=(type:string|null)=>{
    if(!storySession)return;
    const result=StorySession.claimStoryReward(storySession,type);if(!result.ok){toast(result.error);return;}
    try{commitStorySession(result.session);render();openStoryHub();}catch(error){toast(error instanceof Error?error.message:"回収を保存できません。");}
  };
  for(const type of reward.choices){const card=document.createElement("article");card.className="reward-card";const visual=document.createElement("div");visual.inert=true;visual.setAttribute("aria-hidden","true");visual.append(V.palettePreview(type));const button=document.createElement("button");button.type="button";button.textContent=P[type].name+" を持ち帰る";button.onclick=()=>claim(type);card.append(visual,button);host.append(card);}
  $("#story-skip-loot").onclick=()=>claim(null);
}
function storyInboxPanel() {
  if(!storySession)return;
  openModal(`<div class="modal-inner">${modalHead("STORY INBOX","物語の回収品と支給品")}<p>手持ちが満杯でも、ここに残ります。初回合成の支給品は合成まで売却できません。</p><div id="story-inbox-list"></div><button id="story-inbox-back">作業場へ戻る</button></div>`);
  const list=$("#story-inbox-list");
  if(!storySession.inbox.length)list.textContent="未受取のUIはありません。支給品は編集画面の手持ちを確認してください。";
  for(const delivery of storySession.inbox){const button=document.createElement("button");button.type="button";button.className="side-btn";button.textContent=`${P[delivery.type].name} を受け取る`;button.onclick=()=>{
    if(!storySession)return;const result=StorySession.collectStoryDelivery(storySession,delivery.id);if(!result.ok){toast(result.error);return;}
    try{commitStorySession(result.session);render();storyInboxPanel();}catch(error){toast(error instanceof Error?error.message:"受け取りを保存できません。");}
  };list.append(button);}
  $("#story-inbox-back").onclick=openStoryHub;
}
async function finishStoryBattle() {
  if(!battle||!storySession||!storyMatchId)return;
  const current=battle,incomeView=battleIncomeResult(current),settled=StorySession.settleStoryBattle(storySession,storyMatchId,current);
  if(!settled.ok){toast(settled.error);return;}
  if(!("summary" in settled)||!settled.summary)return;
  try{commitStorySession(settled.session);pendingStorySettlement=null;}catch(error){
    pendingStorySettlement=settled.session;
    openModal(`<div class="modal-inner"><h2>対戦結果を保存できません</h2><p>${esc(error instanceof Error?error.message:"保存できません。")}</p><p>この結果はまだ画面内に保全されています。保存を再試行するか、完成した結果をJSONへ書き出してください。</p><button id="story-retry-save" class="primary">同じ結果の保存を再試行</button><button id="story-export-pending">この結果をバックアップ</button><button id="story-use-saved">保存済みの記録に戻る</button></div>`);return;
  }
  const summary=settled.summary;
  pendingFusions="fusions" in settled?settled.fusions:[];
  editor.history=[];editor.future=[];fx.update(current);document.body.classList.remove("battling");
  audio.setMusic(summary.winner==="player"?"victory":"defeat");
  const visitors=traffic.active?traffic.final():{player:0,enemy:0};
  await Cer.showOutcome({win:summary.winner==="player",draw:summary.winner==="draw",round:null,you:visitors.player,foe:visitors.enemy,headline:summary.winner==="player"?"接続先から回収しました":"ページを組み直そう"});
  if(battle!==current)return;
  const reaction=settled.effects.some(e=>e.type==="fusion-reaction");
  openModal(`<div class="modal-inner">${modalHead("STORY / アクセス解析",summary.winner==="player"?"回収成功":"接続から帰還")}<p>相手：${esc(summary.enemy)}</p><p>基本収入 $${summary.base} ＋ 勝利 $${summary.bonus} ＋ 収益 $${summary.income} = $${summary.total}</p>${renderBattleIncomeResult(incomeView)}${reaction?`<p>${esc(STORY_WORLD.fusion.join(" "))}</p>`:""}<p>${summary.winner==="player"?"次に持ち帰るUIを選びます。重要な記録は確実に保存されます。":"同じ段階で、配置と部品を見直せます。"}</p><button id="story-result-hub" class="primary">ジャンクの作業場へ</button><button id="story-result-editor">ページを編集する</button></div>`);
  $("#story-result-hub").onclick=()=>{leaveBattle();openStoryHub();};
  $("#story-result-editor").onclick=()=>leaveBattle();
}

function deferredModalFeature<T>(host: HTMLElement, load: () => Promise<T>, mount: (value: T) => { dispose(): void }, focus?: { loadingHead: HTMLElement; closeSelector: string }) {
  let retry: HTMLButtonElement | undefined;
  const ownsOpenDialog = (): boolean => modalFeatureDispose === feature.dispose && host.isConnected && $<HTMLDialogElement>("#modal").open;
  const feature = createDeferredMount({
    load,
    mount: value => {
      // Capture ownership at replacement time, never across the async load.
      const previous = focus?.loadingHead.querySelector<HTMLButtonElement>("[data-close-modal]");
      const follow = !!previous && document.activeElement === previous;
      const panel = mount(value);
      if (follow && focus && ownsOpenDialog() && document.activeElement === document.body) {
        const close = host.querySelector<HTMLButtonElement>(focus.closeSelector);
        if (close?.isConnected && !close.disabled) close.focus({ preventScroll: true });
      }
      return panel;
    },
    onLoading: () => {
      // Only the retry control being removed may hand focus back to Close.
      const follow = !!retry && document.activeElement === retry;
      host.replaceChildren();
      retry = undefined;
      const status = document.createElement("p");
      status.setAttribute("role", "status");
      status.textContent = "画面を読み込んでいます…";
      host.append(status);
      if (follow && focus && ownsOpenDialog() && document.activeElement === document.body) {
        const close = focus.loadingHead.querySelector<HTMLButtonElement>("[data-close-modal]");
        if (close?.isConnected && !close.disabled) close.focus({ preventScroll: true });
      }
    },
    onError: error => {
      host.replaceChildren();
      const notice = document.createElement("p");
      notice.setAttribute("role", "alert");
      notice.textContent = "画面を読み込めませんでした。" + (error instanceof Error ? " " + error.message : "");
      retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "画面をもう一度読み込む";
      retry.onclick = () => { void feature.start(); };
      host.append(notice, retry);
    },
  });
  return feature;
}
function onlinePanel() {
  openModal(`<div class="modal-inner" id="online-loading-head">${modalHead("ONLINE", "非同期オンライン")}</div><div id="online-feature-host"></div>`);
  $("#modal").classList.add("feature-modal");
  const host = $("#online-feature-host"), loadingHead = $("#online-loading-head");
  const feature = deferredModalFeature(host, async () => {
    const panel = await import("./online/panel.js");
    await panel.loadStyles();
    return panel;
  }, ({ mountOnlinePanel }) => {
    const panel = mountOnlinePanel(host, { baseUrl: "/api/arena", onClose: closeModal });
    loadingHead.remove();
    return panel;
  }, { loadingHead, closeSelector: '[data-arena="close"]' });
  modalFeatureDispose = feature.dispose;
  void feature.start();
}
function localRaidEditingAllowed() {
  return !storyActive && run.mode === "lab" && run.phase === "build" &&
    !battle && !preview && !settling && !pendingStorySettlement;
}
async function playRaidChallenge(host: HTMLElement, blueprint: RaidBlueprint, signal: AbortSignal) {
  const sourceRun = run, sourceStory = storySession, victoryStore = profileStore;
  const localCurrent = () => localRaidEditingAllowed() && run === sourceRun &&
    storySession === sourceStory && profileStore === victoryStore && host.isConnected && !signal.aborted &&
    !!document.querySelector<HTMLDialogElement>("#modal")?.open;
  if (signal.aborted) throw new Error("対戦表示を閉じました。");
  if (blueprint.source.kind === "local-file" && !localCurrent())
    throw new Error("ローカルHTMLの対戦は実験室の編集画面で行ってください。");
  const prepared = prepareRaidChallenge(run, blueprint), challenge = prepared.battle;
  blueprint = prepared.blueprint;
  const registered = await registerRaidBlueprint(blueprint);
  if (!registered.ok) throw new Error(registered.error);
  if (signal.aborted) throw new Error("対戦表示を閉じました。");
  if (blueprint.source.kind === "local-file" && !localCurrent())
    throw new Error("画面が変わったためローカルHTMLの対戦を開始しませんでした。");
  const live = document.createElement("section"); live.className = "raid-live-battle";
  live.innerHTML = `<h3>ページ同士の対戦</h3><p class="raid-approximation">コード解析による近似配置で対戦します</p><p class="raid-live-status" role="status"></p><div class="raid-live-pages"><div><b>あなたのページ</b><div class="raid-live-viewport"><div class="raid-live-paper" data-raid-live="player"></div></div></div><div><b>${blueprint.source.kind === "local-file" ? "ローカルHTMLの近似UI" : "取得したページ"}</b><div class="raid-live-viewport"><div class="raid-live-paper" data-raid-live="enemy"></div></div></div></div>`;
  live.querySelector<HTMLElement>(".raid-approximation")!.textContent = blueprint.source.kind === "local-file" ? "ローカルファイルの静的コードを近似配置で対戦します。元ページやJavaScriptは実行しません。" : blueprint.fidelity === "code-approximation" ? "コード解析による近似配置で対戦します" : "保存された検証用の配置で対戦します";
  host.prepend(live);
  const you = live.querySelector<HTMLElement>('[data-raid-live="player"]')!, foe = live.querySelector<HTMLElement>('[data-raid-live="enemy"]')!;
  V.render(you, prepared.snapshot.owned, { side: "raid-player", theme: prepared.snapshot.page.theme, decor: R.pageDecor(prepared.snapshot) });
  V.render(foe, createRaidEnemy(blueprint), { side: "raid-enemy", theme: "mixed" });
  const sourceDecor = document.createElement("div");
  renderRaidAppearance(sourceDecor, { width: 960, height: 680, background: blueprint.background, primitives: blueprint.decor });
  Object.assign(sourceDecor.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
  foe.prepend(sourceDecor);
  const fitRaid = () => { for (const paper of [you, foe]) paper.style.setProperty("--raid-scale", String((paper.parentElement?.clientWidth ?? 400) / D.WIDTH)); };
  const raidResize = new ResizeObserver(fitRaid); raidResize.observe(live); fitRaid();
  const status = live.querySelector<HTMLElement>(".raid-live-status")!;
  return new Promise<{ battleId: string; winner: import("./types.js").Winner }>((resolve, reject) => {
    let raf = 0, last = performance.now(), accumulator = 0, finished = false;
    const cleanup = () => { cancelAnimationFrame(raf); raidResize.disconnect(); signal.removeEventListener("abort", aborted); live.remove(); };
    const aborted = () => { if (!finished) { finished = true; cleanup(); reject(new Error("対戦表示を閉じました。")); } };
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    const tick = (now: number) => {
      if (finished) return;
      accumulator += Math.min(.1, Math.max(0, (now-last)/1000))*2; last = now;
      while (accumulator >= .05 && !challenge.result) {
        accumulator -= .05;
        for (const event of challenge.step(.05)) if (event.kind === "fire") {
          const board = event.side === "player" ? you : foe;
          const item = board.querySelector<HTMLElement>(`[data-id="${event.id}"]`);
          if (item) { item.classList.add("is-firing"); setTimeout(() => item.classList.remove("is-firing"), 180); }
        }
      }
      status.textContent = `${challenge.elapsed.toFixed(1)}秒　あなた ${Math.ceil(challenge.player.hp)} ／ 相手 ${Math.ceil(challenge.enemy.hp)}`;
      for (const side of [challenge.player, challenge.enemy]) for (const part of side.parts) {
        const board = side.name === "player" ? you : foe;
        const node = board.querySelector<HTMLElement>(`[data-id="${part.id}"]`);
        if (!node) continue;
        const state = challenge.states[side.name].get(part.id);
        const targetSide = part.type === "ad_popup" ? (side.name === "player" ? challenge.enemy : challenge.player) : side;
        const target = targetSide.parts.find(p => p.id === state?.target);
        applyCombatFeedback(node, combatFeedback(part.type, part.charge, challenge.ticks, state, targetCaption(target), side.shield));
      }
      if (!challenge.result) { raf = requestAnimationFrame(tick); return; }
      finished = true;
      const winner = challenge.result.winner;
      void (winner === "player" && victoryStore ? victoryStore.recordRaidVictory(blueprint, prepared.battleId) : Promise.resolve())
        .then(() => { cleanup(); resolve({ battleId: prepared.battleId, winner }); })
        .catch((error: unknown) => { cleanup(); reject(error); });
    };
    raf = requestAnimationFrame(tick);
  });
}
async function raidPanel(initialRequest?: RaidInitialRequest) {
  if (localRaidReturn && (storyActive || run.mode !== "lab" ||
    localRaidReturn.run !== run || localRaidReturn.store !== profileStore)) {
    localRaidReturn.selection.clear();
    localRaidReturn = undefined;
  }
  if (!profileStore) { toast("個人コレクションの保存領域を開けないため、回収を開始できません。"); return; }
  const store = profileStore, sourceRun = run, sourceStory = storySession, sourceStoryMode = storyActive, sourceMode = run.mode;
  openModal(`<div class="modal-inner">${modalHead(run.mode === "lab" && !storyActive ? "UI RAID" : "URL RAID", run.mode === "lab" && !storyActive ? "URLとローカルHTMLから回収" : "ページを巡回する")}<div id="raid-feature-host">保存された報酬を確認しています…</div></div>`);
  $("#modal").classList.add("feature-modal");
  const host = $("#raid-feature-host"), controller = new AbortController();
  const ownsPanel = () => !controller.signal.aborted && host.isConnected &&
    $<HTMLDialogElement>("#modal").open && profileStore === store && run === sourceRun &&
    run.mode === sourceMode && storySession === sourceStory && storyActive === sourceStoryMode;
  const isLocalImportAllowed = () => ownsPanel() && localRaidEditingAllowed();
  const feature = deferredModalFeature(host,
    () => Promise.all([import("./raid/panel.js"), store.listPendingRaids()]),
    ([{ mountRaidPanel, createLocalRaidSelection }, pending]) => {
      if (!ownsPanel()) return { dispose() {} };
      const localAllowed = isLocalImportAllowed();
      if (localAllowed && !localRaidReturn)
        localRaidReturn = { run: sourceRun, store, selection: createLocalRaidSelection() };
      const localSelection = localAllowed ? localRaidReturn?.selection : undefined;
      const hiddenLocalCount = localAllowed ? 0 : pending.filter(saved => saved.blueprint.source?.kind === "local-file").length;
      const resume = pending.find(saved => saved.blueprint.source?.kind !== "local-file" || localAllowed);
      const panel = mountRaidPanel(host, {
      isLocalImportAllowed,
      localSelection,
      onEditLocal: localSelection ? () => {
        if (!isLocalImportAllowed() || localRaidReturn?.selection !== localSelection ||
          !localSelection.read()) return;
        view = "self";
        closeModal();
        render();
        toast("自分のページを編集できます。メニューのURLレイドから、前のローカル近似を再開してください。");
      } : undefined,
      onCaptured: async (blueprint,kind) => {
        if (blueprint.source.kind === "local-file") throw new Error("ローカルHTMLは実験室の専用取り込みから解析してください。");
        if(!storyActive||!storySession)return;
        const sourceSession=storySession;
        const result=await StorySession.cacheStoryAnalysis(sourceSession,blueprint,kind);
        if(storySession!==sourceSession)throw new Error("解析中に物語の構成が変わりました。最新の構成からもう一度解析してください。");
        if(!result.ok)throw new Error(result.error);
        if(controller.signal.aborted)throw new Error("解析画面を閉じました。エネルギーは消費していません。");
        commitStorySession(result.session);render();
      },
      onChallenge: blueprint => {
        if (!ownsPanel()) return Promise.reject(new Error("画面を開き直してから対戦してください。"));
        if (blueprint.source.kind === "local-file" && !isLocalImportAllowed())
          return Promise.reject(new Error("ローカルHTMLの対戦は実験室の編集画面で行ってください。"));
        return playRaidChallenge(host, blueprint, controller.signal);
      },
      onClaim: async (reward, blueprint) => {
        try {
          const local = blueprint.source.kind === "local-file";
          if (local && !isLocalImportAllowed()) throw new Error("ローカルHTMLの報酬は実験室で受け取ってください。");
          const claimRun=clone(run),writeRunProfile=!storyActive;
          await profileWrites;
          if (local && !isLocalImportAllowed()) throw new Error("画面が変わったため受け取りを開始しませんでした。実験室で開き直してください。");
          const result = await store.claimRaidReward(claimRun, reward, blueprint, {writeRunProfile});
          if (ownsPanel()) await registerRaidBlueprint(blueprint);
          return { ok: true as const, message: result.created ? (local ? "ローカルHTMLから回収した外観を個人コレクションへ保存しました。" : "個人コレクションへ保存しました。メニューのコレクションから使えます。") : "このUIはコレクションへ保存済みです。" };
        } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "保存できませんでした。" }; }
      },
      onDiscard: async battleId => { try { await store.discardRaidVictory(battleId); return { ok: true as const }; } catch { return { ok: false as const, error: "報酬の状態を保存できません。" }; } },
      }, resume, initialRequest);
      if (hiddenLocalCount) {
        const note = document.createElement("p");
        note.className = "raid-local-pending-note";
        note.dataset.localPendingCount = String(hiddenLocalCount);
        note.textContent = `実験室専用のローカル解析報酬が、読み込み時点で${hiddenLocalCount}件あります。実験室でこの画面を開き直すと受け取れます。`;
        host.prepend(note);
      }
      return panel;
    });
  modalFeatureDispose = () => { controller.abort(); feature.dispose(); };
  await feature.start();
}
async function collectionPanel() {
  if (!profileStore) { toast("コレクションを読み込めません。"); return; }
  openModal(`<div class="modal-inner">${modalHead("COLLECTION", "持ち帰ったUI")}<p>実験室では手持ちへ追加。本編では所持済みの同じUIに外観を適用できます。</p><div id="collection-backup-host"></div><div id="collection-feature-host">読み込んでいます…</div></div>`);
  const host = $("#collection-feature-host"), backupHost = $("#collection-backup-host"), store = profileStore;
  let disposed = false, listEpoch = 0;
  const isCurrent = () => !disposed && modalFeatureDispose === dispose &&
    profileStore === store && host.isConnected && $<HTMLDialogElement>("#modal").open;
  const backup = deferredModalFeature(backupHost, () => import("./collection-backup-controls.js"), ({ mountCollectionBackupControls }) =>
    mountCollectionBackupControls(backupHost, {
      store, isCurrent,
      onRestored: async (_result, stillCurrent) => {
        if (!isCurrent() || !stillCurrent()) return;
        await refreshCollection();
        if (isCurrent() && stillCurrent()) render();
      },
    }));
  function dispose() { disposed = true; listEpoch++; backup.dispose(); }
  modalFeatureDispose = dispose;
  void backup.start();
  await refreshCollection();

  async function refreshCollection() {
    const epoch = ++listEpoch, current = () => isCurrent() && epoch === listEpoch;
    try {
      const trophies = await store.listTrophies();
      if (!current()) return;
      if (!trophies.length) { host.textContent = "まだ持ち帰ったUIはありません。URLレイドで勝利すると、そのページのUIを選んで回収できます。"; return; }
      const sections: HTMLElement[] = [], captures = new Map<string, RaidBlueprint | undefined>();
      for (const trophy of trophies) {
        if (!captures.has(trophy.captureId)) {
          const capture = await store.getBlueprint(trophy.captureId);
          if (!current()) return;
          if (capture) {
            const registered = await registerRaidBlueprint(capture);
            if (!current()) return;
            if (!registered.ok) throw new Error(registered.error);
          }
          captures.set(trophy.captureId, capture);
        }
        const capture = captures.get(trophy.captureId), component = capture?.components.find(c => c.componentId === trophy.componentId);
        const section = document.createElement("section"); section.className = "collection-acquisition";
        const title = document.createElement("h3"); title.textContent = `${P[trophy.item.type].name} · ${capture?.source.name ?? "保存されたページ"}${capture?.source.kind === "local-file" ? " · ローカルファイルの静的コード近似" : capture?.fidelity === "code-approximation" ? " · コード解析による近似配置" : ""}`;
        const previewHost = document.createElement("div"); previewHost.className = "collection-preview";
        if (component) renderRaidAppearance(previewHost, component.appearance);
        else previewHost.textContent = "外観データがないため標準表示を使います。";
        const action = document.createElement("button"); action.textContent = run.mode === "lab" ? "手持ちに追加" : "所持中の同じUIへ外観を適用";
        action.onclick = () => {
          if (!current()) return;
          if (battle || run.phase !== "build") { toast("編集画面に戻ってから使ってください。"); return; }
          if (run.mode === "lab") {
            if (run.owned.length >= D.MAX_ITEMS) { toast("手持ちがいっぱいです。コレクションのUIは失われません。空きを作ってから追加してください。"); return; }
            closeModal();
            if (!editor.commit(() => { const item = R.nextItem(run, trophy.item.type, null, null, trophy.item.w, trophy.item.h); Object.assign(item, { appearanceId: trophy.item.appearanceId, provenanceId: trophy.item.provenanceId }); run.owned.push(item); return true; })) { toast("編集可能な画面で追加してください。"); return; }
          } else {
            const matches = run.owned.filter(p => p.type === trophy.item.type);
            const target = editor.selected().find(p => p.type === trophy.item.type) ?? (matches.length === 1 ? matches[0] : undefined);
            if (!target && matches.length > 1) { toast("同じUIが複数あります。適用したいUIをページで選んでから、もう一度コレクションを開いてください。"); return; }
            if (!target) { toast("本編では同じ標準UIを入手してから外観を適用できます。"); return; }
            closeModal();
            if (!editor.commit(() => { Object.assign(target, { appearanceId: trophy.item.appearanceId, provenanceId: trophy.item.provenanceId }); return true; })) { toast("編集可能な画面で適用してください。"); return; }
          }
          save(); render(); closeModal(); toast("取得したUIの外観を使えるようにしました。");
        };
        section.append(title, previewHost, action); sections.push(section);
      }
      if (current()) host.replaceChildren(...sections);
    } catch (error) {
      if (current()) host.textContent = error instanceof Error ? error.message : "コレクションを読み込めません。";
    }
  }
}
function overflowPanel() {
  openModal(`<div class="modal-inner">${modalHead("REWARD INBOX", "報酬の受取箱")}<p>手持ちが満杯でも報酬はここに残ります。編集画面で空きを作ってから受け取れます。</p><div id="overflow-feature-host"></div></div>`);
  const host = $("#overflow-feature-host"), pending = run.pendingInventory ?? [];
  if (!pending.length) { host.textContent = "未受取の通常報酬はありません。"; return; }
  for (const item of pending) {
    const row = document.createElement("section"); row.className = "collection-acquisition";
    const name = document.createElement("h3"); name.textContent = P[item.type].name;
    const button = document.createElement("button"); button.textContent = "手持ちへ受け取る";
    button.disabled = run.phase !== "build" || run.owned.length >= D.MAX_ITEMS;
    button.onclick = () => {
      closeModal();
      if (!editor.commit(() => R.collectOverflow(run, item.id))) { toast("編集画面で手持ちに空きを作ってください。"); return; }
      save(); render(); toast("受取箱のUIを手持ちへ追加しました。");
    };
    row.append(name, button); host.append(row);
  }
  if (run.phase !== "build") {
    const note = document.createElement("p"); note.textContent = "本編の終了後も、未受取報酬はこの構成の書き出しに含まれます。"; host.append(note);
  }
}
function modalHead(kicker: string, title: string) {
  return `<div class="modal-head"><div><div class="modal-kicker">${esc(kicker)}</div><h2>${esc(title)}</h2></div><button data-close-modal aria-label="閉じる">×</button></div>`;
}
function help() {
  const content = getHelpContent({ storyActive, mode: run.mode });
  openModal(
    `<div class="modal-inner">${modalHead(content.kicker, content.title)}${renderHelpBody(content)}<div class="modal-footer"><button data-close-modal class="primary">わかった</button></div></div>`,
  );
}
function menu() {
  const hasCamp = (() => {
    try {
      return !!localStorage.getItem(KEY + "campaign");
    } catch {
      return false;
    }
  })();
  openModal(`<div class="modal-inner">${modalHead("MENU", "メニュー")}<div class="menu-grid">
 <button id="m-story"><b>THE LAST BROWSER</b><small>物語とジャンクの作業場</small></button>
 <button id="m-new-story"><b>新しい物語</b><small>旧ラン・オンラインとは別保存</small></button>
 <button id="m-campaign" class="${run.mode === "campaign" ? "on" : ""}"><b>▶ ラン${hasCamp ? "を続ける" : "を始める"}</b><small>旧8ラウンドの遠征</small></button>
 <button id="m-new-campaign"><b>↺ 新しいラン</b><small>真っ白なページから</small></button>
 <button id="m-tutorial"><b>チュートリアル</b><small>最初から手順つきで</small></button>
 <button id="m-lab" class="${run.mode === "lab" ? "on" : ""}"><b>実験室</b><small>全UIを無料で試す</small></button>
 <button id="m-online"><b>非同期オンライン</b><small>保存された他のプレイヤーと対戦</small></button>
 <button id="m-raid"><b>URLレイド</b><small>${run.mode === "lab" && !storyActive ? "URL・ローカルHTMLからUIを回収" : "ページを巡回してUIを回収"}</small></button>
 <button id="m-collection"><b>個人コレクション</b><small>持ち帰ったUIを使う</small></button>
 <button id="m-overflow"><b>報酬の受取箱</b><small>未受取 ${(run.pendingInventory ?? []).length} 個</small></button>
 <button id="m-preview"><b>◉ サイトを触ってみる</b><small>検索窓やボタンを操作</small></button>
 <button id="m-help"><b>？ 遊び方</b><small>ルールと操作</small></button>
 <button id="m-settings"><b>✎ サイト名とヘッダー</b><small>${esc(run.page.name)}</small></button></div>
 ${
   run.mode === "lab"
     ? `<div class="menu-row"><label>ページのお手本<select id="preset-select" class="select-input"><option value="">選んで読み込む</option><optgroup label="お手本">${Object.entries(D.PRESETS)
         .map(([id, p]) => `<option value="${id}">${esc(p.name)}</option>`)
         .join("")}</optgroup><optgroup label="完成構成例">${BUILDS.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</optgroup></select></label><button id="m-builds" class="side-btn">構成例図鑑・相性表</button></div>`
     : ""
 }
 <div class="menu-row"><button id="export-button" class="side-btn">構成を書き出す</button><button id="import-button" class="side-btn">読み込む</button></div>
 <div class="menu-row"><label><input id="motion-setting" type="checkbox" ${fx.reduced ? "checked" : ""}> モーションを抑える</label><button id="m-sound" class="side-btn">サウンド...</button><button id="m-wm-reset" class="side-btn">ウィンドウの配置を初期化</button><button id="m-title" class="side-btn">タイトルへ戻る</button></div></div>`);
}
/* ---------- Lab: archetype build book + live matchup table ---------- */
function enemyOptions(selected: number) {
  const opt = (e: { name: string }, i: number) =>
    `<option value="${i}" ${i === selected ? "selected" : ""}>${esc(e.name)}</option>`;
  const all = R.labEnemies().map((e, i) => [e, i] as const);
  const sites = all.filter(([e]) => !e.id.startsWith("b_"));
  const builds = all.filter(([e]) => e.id.startsWith("b_"));
  return `<optgroup label="サイト">${sites.map(([e, i]) => opt(e, i)).join("")}</optgroup><optgroup label="完成構成例">${builds.map(([e, i]) => opt(e, i)).join("")}</optgroup>`;
}
function loadBuild(asPage?: string, asFoe?: string) {
  if (battle) return;
  if (asFoe) {
    const list = R.labEnemies();
    const index = list.findIndex((e) => e.id === asFoe);
    if (index < 0) { toast("この構成は対戦相手には選べません。"); return; }
    if (run.mode !== "lab") switchMode("lab");
    run.stage = index;
    closeModal();
    save();
    render();
    toast(`対戦相手を「${list[run.stage].name}」にしました。`);
    return;
  }
  const b = BUILDS.find((q) => q.id === asPage);
  if (!b) return;
  if (run.mode !== "lab") switchMode("lab");
  closeModal();
  editor.commit(() => {
    const stage = run.stage,
      fresh = R.newRun("lab", b.id);
    fresh.stage = stage;
    fresh.admin = [...b.admin];
    fresh.page.name = b.pageName;
    fresh.page.theme = b.theme;
    Object.assign(run, fresh);
    editor.selection.clear();
    return true;
  }, `「${b.name}」を自分のページに読み込みました。Ctrl+Zで戻せます。`);
}
function buildBook() {
  const cards = BUILDS.map((b) => {
    const info = Lab.inspect(b.layout),
      f = D.FACTIONS[b.faction];
    return `<article class="bd-card" style="--c:${f.color}">
      <header><span class="bd-fav fav fav-${b.faction}">${esc(f.short)}</span><div><h3>${esc(b.name.replace("【理想形】", ""))}</h3><p class="bd-concept">${esc(b.concept)}</p></div></header>
      <ol class="bd-how">${b.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>
      <p class="bd-weak"><b>弱点</b>${esc(b.weakness)}</p>
      <div class="bd-meta"><span>重さ ${info.load}</span><span>余白 ${Math.round(info.free * 100)}%</span>${info.groups.map((g) => `<span class="bd-g">${esc(g)}</span>`).join("")}${info.sets.map((x) => `<span class="bd-s">${esc(x)}</span>`).join("")}<span>管理画面：${b.admin.map((a) => esc(D.ADMIN[a]?.name ?? a)).join("・")}</span></div>
      <div class="bd-actions"><button data-build-load="${b.id}" class="side-btn bd-primary">自分のページに読み込む</button>${b.labOpponent === false ? '<span class="muted">自分のページ用のお手本</span>' : `<button data-build-foe="${b.id}" class="side-btn">対戦相手にする</button>`}</div>
    </article>`;
  }).join("");
  openModal(`<div class="modal-inner bd">${modalHead("BUILD BOOK", "構成例図鑑")}
    <p class="muted">配置と相性を調べるための完成構成例です。入手費用・必要な処理能力・弱点を確認して使ってください。実験室では読み込んで中身を触れます。「対戦相手にする」がある構成は相手にも選べます。</p>
    <div class="bd-grid">${cards}</div>
    <h3 class="bd-h">相性表 <small>行が自分・列が相手。両者 閲覧者${Lab.DEFAULT_CONDITIONS.hp}・CPU${Lab.DEFAULT_CONDITIONS.capacity}・管理画面${Lab.DEFAULT_CONDITIONS.adminSlots}枠（各自の設備）。共通条件で実際のエンジンを使用</small></h3>
    <div id="bd-matrix" class="bd-matrix"></div>
    <div class="modal-footer"><button data-close-modal class="primary">閉じる</button></div></div>`);
  const host = $("#bd-matrix"), loadingHead = host.parentElement!;
  let disposed = false, generation = 0;
  let active: AbortController | undefined;
  const ownsOpenDialog = (): boolean => !disposed && modalFeatureDispose === feature.dispose &&
    host.isConnected && $<HTMLDialogElement>("#modal").open;
  const feature = deferredModalFeature(host, async () => {
    try {
      const helper = await import("./buildlab-async.js");
      // Native close can precede its queued close event while these nodes remain connected.
      if (!ownsOpenDialog()) feature.dispose();
      return helper;
    } catch (error) {
      if (!ownsOpenDialog()) feature.dispose();
      throw error;
    }
  }, ({ roundRobinAsync }) => {
    if (!ownsOpenDialog()) return { dispose() {} };
    const status = document.createElement("p"), progress = document.createElement("progress"),
      action = document.createElement("button"), result = document.createElement("div");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    progress.setAttribute("aria-label", "相性表の計算進捗");
    action.type = "button";
    host.replaceChildren(status, progress, action, result);
    const calculate = () => {
      if (!ownsOpenDialog()) return;
      active?.abort();
      const controller = new AbortController(), token = ++generation;
      active = controller;
      const current = () => ownsOpenDialog() && generation === token && active === controller && !controller.signal.aborted;
      let announced = -1, completedMatches = 0, totalMatches = 0;
      progress.hidden = false;
      progress.max = 1;
      progress.value = 0;
      action.textContent = "計算を中止";
      const stopped = (message: string) => {
        status.textContent = message;
        progress.hidden = true;
        // Keep the live control itself, preserving only focus it actually still owns.
        action.textContent = "計算を再試行";
        action.onclick = () => {
          if (ownsOpenDialog() && action.isConnected && generation === token && active === controller && controller.signal.aborted)
            calculate();
        };
      };
      action.onclick = () => {
        if (!current() || !action.isConnected) return;
        controller.abort();
        stopped(`計算を中止しました（${completedMatches} / ${totalMatches}試合）。`);
      };
      void roundRobinAsync(undefined, {
        signal: controller.signal,
        onProgress: ({ completed, total }) => {
          if (!current()) { controller.abort(); return; }
          completedMatches = completed;
          totalMatches = total;
          progress.max = Math.max(1, total);
          progress.value = completed;
          const percent = total ? Math.floor(completed / total * 10) * 10 : 100;
          if (percent !== announced) {
            announced = percent;
            status.textContent = `計算中… ${percent}%（${completed} / ${total}試合）`;
          }
        },
        schedule: resume => {
          // The helper uses soft batches; one real match is indivisible, not an 8ms guarantee.
          const timer = window.setTimeout(() => {
            if (current()) resume();
            else controller.abort();
          }, 0);
          return () => window.clearTimeout(timer);
        },
      }).then(({ list, cells, wins }) => {
        if (!current()) { controller.abort(); return; }
        const order = list.map((_, i) => i).sort((a, b) => wins[b] - wins[a]);
        const head = `<tr><th></th>${order.map((j) => `<th class="${list[j].build ? "is-build" : ""}" title="${esc(list[j].name)}">${esc(list[j].name.slice(0, 5))}</th>`).join("")}<th>勝</th></tr>`;
        const rows = order
          .map((i) => {
            const tds = order
              .map((j) => {
                const c = cells[i][j];
                if (!c) return `<td class="bd-self">—</td>`;
                const k = c.winner === "player" ? "w" : c.winner === "draw" ? "d" : "l";
                return `<td class="bd-${k}" title="${esc(list[i].name)} vs ${esc(list[j].name)}：${c.time.toFixed(1)}秒 / 残り ${Math.round(c.hpA * 100)}% 対 ${Math.round(c.hpB * 100)}%">${k === "w" ? "勝" : k === "d" ? "分" : "負"}<small>${c.time.toFixed(0)}s</small></td>`;
              })
              .join("");
            return `<tr><th class="${list[i].build ? "is-build" : ""}">${esc(list[i].name)}</th>${tds}<td class="bd-wins">${wins[i]}</td></tr>`;
          })
          .join("");
        result.innerHTML = `<table>${head}${rows}</table>`;
        status.textContent = `計算完了：${completedMatches} / ${totalMatches}試合（100%）`;
        const follow = document.activeElement === action;
        progress.remove();
        action.remove();
        if (follow && current() && document.activeElement === document.body) {
          const close = loadingHead.querySelector<HTMLButtonElement>("[data-close-modal]");
          if (close?.isConnected && !close.disabled) close.focus({ preventScroll: true });
        }
      }).catch((error: unknown) => {
        if (!current()) return;
        controller.abort();
        stopped("相性表を計算できませんでした。" + (error instanceof Error ? " " + error.message : ""));
      });
    };
    calculate();
    return { dispose() { generation++; active?.abort(); } };
  }, { loadingHead, closeSelector: "[data-close-modal]" });
  const start = feature.start, dispose = feature.dispose;
  feature.start = () => {
    if (!ownsOpenDialog()) { feature.dispose(); return Promise.resolve(); }
    return start();
  };
  feature.dispose = () => {
    if (disposed) return;
    disposed = true;
    dispose();
  };
  modalFeatureDispose = feature.dispose;
  void feature.start();
}
function settings() {
  openModal(
    `<div class="modal-inner">${modalHead("SITE", "サイト名とヘッダー")}<label class="field-label">サイト名<input class="text-input" id="page-name" maxlength="40" value="${esc(run.page.name)}"></label><label class="field-label">ヘッダーのデザイン<select id="page-theme" class="select-input">${[["mixed", "ごちゃ混ぜ"], ...Object.entries(D.FACTIONS).map(([k, v]) => [k, v.name.endsWith("風") ? v.name : v.name + "風"])].map(([v, t]) => `<option value="${v}" ${v === run.page.theme ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label><div class="modal-footer"><button data-close-modal class="primary">閉じる</button></div></div>`,
  );
}
function resultModal(s: BattleSummary, incomeView: BattleIncomeResultView | null = null) {
  const win = s.winner === "player",
    camp = run.mode === "campaign",
    v = s.visitors || { player: 0, enemy: 0 },
    tot = Math.max(1, v.player + v.enemy),
    best = (s.stats || []).filter((p) => p.damage > 0).slice(0, 3);
  const next =
    run.phase === "reward"
      ? '<button id="reward-next" class="primary">報酬を受け取る</button>'
      : run.phase === "gameover" || run.phase === "complete"
        ? '<button id="finish-next" class="primary">ランの結果へ</button>'
        : camp
          ? `<button id="result-edit" class="primary">次のラウンドへ（ROUND ${run.stage + 1}）</button>`
          : '<button id="result-replay">もう一度</button><button id="result-edit" class="primary">編集に戻る</button>';
  openModal(`<div class="modal-inner result ${win ? "win" : "lose"}">${modalHead(s.round ? `ROUND ${s.round}` : "TEST BATTLE", win ? "勝利！ 閲覧者を奪い取った" : s.winner === "draw" ? "引き分け" : "敗北…閲覧者を奪われた")}
 <div class="res-share"><div><small>あなた</small><b>${v.player}人</b></div><div class="res-bar"><i style="width:${(100 * v.player) / tot}%"></i></div><div class="foe"><small>${esc(s.enemy)}</small><b>${v.enemy}人</b></div></div>
 ${camp ? `<div class="res-money"><div><span>基本収入</span><b>+$${s.base}</b></div><div><span>勝利ボーナス</span><b>+$${s.bonus}</b></div><div><span>サイト収益：戦闘中に稼いだ $${s.rawIncome} の半分（上限 $10）</span><b>+$${s.income}</b></div><div class="sum"><span>所持金</span><b>$${run.cash}</b></div></div>${!win && run.lives > 0 ? `<p class="res-note">ライフ残り ${"♥".repeat(run.lives)}。次のラウンドに進みます。</p>` : ""}` : ""}
 ${renderBattleIncomeResult(incomeView)}
 ${best.length ? `<h4>活躍したUI</h4><div class="res-mvp">${best.map((p, i) => `<div><em>${i + 1}</em><b>${esc(P[p.type]?.name || "UI")}</b><span>${s.visitors ? `約${Math.max(1, Math.round((p.damage / s.visitors.max) * s.visitors.base))}人を奪取` : Math.round(p.damage) + "ダメージ"} ・ ${p.fires}回発動</span></div>`).join("")}</div>` : ""}
 <div class="result-actions">${next}</div></div>`);
}
function rewardModal() {
  const pending = run.pending;
  if (!pending) return;
  audio.sfx("reward");
  openModal(
    `<div class="modal-inner">${modalHead("REWARD", "相手のサイトから1つ奪う")}<p>選んだUIは「手持ち」に入ります。設備は管理画面に入ります。</p><div class="reward-grid">${pending.loot
      .map((k) => {
        if (k.startsWith("admin:")) {
          const id = k.slice(6),
            a = D.ADMIN[id];
          return `<button class="reward-card admin" data-loot="${k}"><span class="rc-tag">管理画面の設備</span><div class="rc-vis dark">${adminViz(id, "player")}</div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></button>`;
        }
        const d = P[k],
          f = D.FACTIONS[d.faction];
        return `<button class="reward-card" data-loot="${k}"><span class="rc-tag"><i style="background:${f.color}"></i>${esc(f.name)}・${KIND[d.kind]}</span><div class="rc-vis" data-loot-visual="${k}"></div><b>${esc(d.name)}</b><small>${esc(shortDesc(d))}</small><em>${esc(connectText(k))}</em></button>`;
      })
      .join(
        "",
      )}</div><div class="modal-footer"><button data-loot="skip">何も取らずに進む</button></div></div>`,
  );
  $$("[data-loot-visual]").forEach((el) => {
    const p = P[el.dataset.lootVisual!],
      n = V.palettePreview(p.id);
    n.style.transform = `scale(${Math.min(190 / p.w, 70 / p.h, 1)})`;
    el.append(n);
  });
}
function finishModal() {
  const done = run.phase === "complete";
  openModal(
    `<div class="modal-inner">${modalHead(done ? "RUN COMPLETE" : "RUN OVER", done ? "すべてのサイトに挑み終えた！" : "ライフが尽きた…")}<div class="res-money"><div><span>勝利数</span><b>${run.wins} / ${R.ROUNDS}</b></div><div><span>到達ラウンド</span><b>${Math.min(run.stage + 1, R.ROUNDS)}</b></div><div><span>最終ページのUI</span><b>${run.owned.filter(C.placed).length}個</b></div></div><p>最後に作ったページはそのまま残っています。</p><div class="result-actions"><button id="go-lab">実験室へ</button><button id="new-campaign" class="primary">新しいランを始める</button></div></div>`,
  );
}

/* ---------- Battle ---------- */
async function start() {
  if (battle) return;
  if (storyActive && storySession && (storySession.reward || storySession.story.phase !== "hub" || !currentStoryEncounter(storySession.story) || run.lives <= 0)) { openStoryHub(); return; }
  if (run.phase === "reward") {
    rewardModal();
    return;
  }
  if (["complete", "gameover"].includes(run.phase)) {
    finishModal();
    return;
  }
  preBattle = clone(run);
  save();
  const matchId = storyActive ? crypto.randomUUID() : null;
  const storyPrepared = storyActive && storySession && matchId ? StorySession.prepareStoryBattle(storySession, matchId) : null;
  const result = storyPrepared ?? labBattleController.start(run, storyActive);
  if (!result.ok) {
    toast(result.error);
    preBattle = null;
    return;
  }
  if (storyPrepared?.ok) {
    try { commitStorySession(storyPrepared.session); } catch (error) { toast(error instanceof Error ? error.message : "保存できません。"); preBattle=null; return; }
    storyMatchId=matchId; storyBattleEncounter=storyPrepared.encounter; run.phase="battle"; closeModal();
  }
  battle = result.battle;
  settling = false;
  paused = false;
  speed = 1;
  fx.reset();
  lastTime = performance.now();
  preview = false;
  view = "self";
  manualZoom = null;
  editor.selection.clear();
  editor.pending = null;
  coachHidden = true;
  $("#pause-button").textContent = "一時停止";
  $$("[data-speed]").forEach((b) =>
    b.classList.toggle("active", b.dataset.speed === "1"),
  );
  battleStage = run.stage;
  render();
  const current = battle;
  audio.setMusic("battle");
  audio.setIntensity(0.2);
  await Cer.showPublish(publishLog());
  if (battle !== current) return;
  if (!storyActive) await Cer.showVersus({
    round: appOpponent().round,
    totalRounds: R.ROUNDS,
    you: siteCardYou(),
    foe: siteCardFoe(),
    foeTip: appOpponent().tip,
    isBoss: appOpponent().round === R.ROUNDS,
  });
  if (battle !== current) return;
  audio.sfx("versus");
  particles.flash("#ffffff", 160, 0.3);
  traffic.start(current);
  lastTime = performance.now();
  requestAnimationFrame(tick);
}
function tick(now: number) {
  if (!battle) return;
  const delta = Math.max(0, Math.min(0.1, (now - lastTime) / 1000));
  lastTime = now;
  traffic.speed = speed;
  traffic.paused = paused;
  if (!paused && !battle.result) {
    const events = battle.step(delta * speed);
    for (const ev of events) {
      fx.emit(ev, battle);
      if (ev.kind === "server-pressure") renderTopbar();
      traffic.event(ev);
      battleSfx(ev as unknown as { kind: string; [k: string]: unknown }, battle);
    }
    battleIntensity(battle);
    fx.update(battle);
    $("#battle-clock").textContent = battle.elapsed.toFixed(1) + "s";
  }
  if (battle.result && !settling) {
    settling = true;
    const current = battle;
    setTimeout(() => {
      if (battle === current) finishBattle();
    }, 2600);
  } else if (!battle.result) requestAnimationFrame(tick);
}
function abort() {
  if (!battle || battle.result) return;
  if (storyActive && storySession && storyMatchId) {
    const cancelled=StorySession.commandStorySession(storySession,{type:"cancel-encounter",matchId:storyMatchId});
    if (!cancelled.ok) { toast(cancelled.error); return; }
    try { commitStorySession(cancelled.session); } catch(error) { toast(error instanceof Error ? error.message : "保存できません。"); return; }
    preBattle=clone(run); storyMatchId=null; storyBattleEncounter=null;
  }
  battle = null;
  settling = false;
  fx.clear();
  traffic.stop();
  if (preBattle) run = preBattle;
  preBattle = null;
  preview = false;
  view = "self";
  paused = false;
  save();
  render();
  toast("対戦をやめて、編集に戻りました。");
}
async function finishBattle() {
  if (!battle) return;
  if (storyActive && storySession && storyMatchId) { await finishStoryBattle(); return; }
  const current = battle, incomeView = battleIncomeResult(current);
  const visitors = traffic.active
    ? { ...traffic.final(), base: traffic.base.enemy, max: battle.enemy.maxHp }
    : null;
  const result = R.settleBattle(run, battle);
  if (!result.ok) {
    toast(result.error);
    return;
  }
  if (run.phase !== "gameover") pendingFusions = R.fuse(run);
  fx.update(battle);
  document.body.classList.remove("battling");
  editor.history = [];
  editor.future = [];
  const s = result.summary;
  s.visitors = visitors;
  save();
  const win = s.winner === "player";
  audio.setMusic(win ? "victory" : "defeat");
  if (win) particles.confetti(2800);
  const best = (s.stats || []).find((p) => p.damage > 0);
  await Cer.showOutcome({
    win,
    draw: s.winner === "draw",
    round: s.round ?? null,
    you: visitors?.player ?? 0,
    foe: visitors?.enemy ?? 0,
    mvp: best ? P[best.type]?.name : undefined,
  });
  if (battle !== current) return;
  resultModal(s, incomeView);
}
function leaveBattle() {
  if (pendingStorySettlement) return;
  const advanced =
    !!battle && !storyActive && run.mode === "campaign" && run.stage !== battleStage;
  battle = null;
  settling = false;
  preBattle = null;
  storyMatchId = null; storyBattleEncounter = null;
  fx.clear();
  traffic.stop();
  particles.clear();
  view = "self";
  preview = false;
  manualZoom = null;
  closeModal();
  render();
  resetBuildSnap();
  audio.setMusic("build");
  if (advanced && run.phase === "build") void roundIntro().then(celebrateFusions);
  else celebrateFusions();
}
function exportFile() {
  const copy = pendingStorySettlement ? clone(pendingStorySettlement) : storyActive && storySession ? clone(storySession) : clone(run);
  const blob = new Blob([JSON.stringify(copy, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = storyActive ? "the-last-browser-story.json" : "ui-raid-page.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("構成JSONを書き出しました。取得外観の一式は別保存です。別の端末へ移す時は、個人コレクションの「取得外観を書き出す」も使ってください。");
}
let importRequestId = 0;
async function importFile(file: File | undefined) {
  if (!file) return;
  const requestId = ++importRequestId;
  const sourceRun = run, sourceStory = storySession, sourceStoryMode = storyActive;
  const sourceSnapshot = JSON.stringify(run);
  let applying = false;
  const canApply = () => requestId === importRequestId && run === sourceRun &&
    storySession === sourceStory && storyActive === sourceStoryMode &&
    !battle && !pendingStorySettlement && JSON.stringify(run) === sourceSnapshot;
  try {
    if (battle || pendingStorySettlement) {
      toast("対戦と結果の保存を終えてから、構成を読み込んでください。"); return;
    }
    if (file.size > 300000) throw new Error("構成ファイルが大きすぎます。");
    const text = await file.text();
    // A file read may finish after another import, navigation, edit or battle.
    if (!canApply()) return;
    const parsed: unknown = JSON.parse(text);
    if (storyActive) {
      if (!StorySession.validateStorySession(parsed)) throw new Error("物語専用の保存JSONを選んでください。旧ランの構成は旧ランから読み込めます。");
      applying = true;
      commitStorySession(parsed); editor.reset(); preview=false; view="self"; render(); openStoryHub(); return;
    }
    if (!R.validateRun(parsed))
      throw new Error("このバージョンの有効な構成JSONではありません。");
    applying = true;
    save();
    run = parsed;
    labBattleController.reset();
    editor.reset();
    preview = false;
    view = "self";
    save();
    render();
    toast("構成を読み込みました。この端末にない取得外観は標準表示になります。外観のバックアップは個人コレクションから追加して復元できます。");
  } catch (e) {
    if (requestId === importRequestId && (applying || canApply()))
      toast(e instanceof Error ? e.message : "読み込めませんでした。");
  } finally {
    if (requestId === importRequestId) $<HTMLInputElement>("#import-file").value = "";
  }
}
function switchMode(mode: Mode, fresh = false, tutorial = !tutorialDone()) {
  if (battle) return;
  save();
  storyActive=false; storyMatchId=null; storyBattleEncounter=null;
  labBattleController.reset();
  run = fresh
    ? R.newRun(mode, "mixed", { tutorial: mode === "campaign" && tutorial })
    : load(mode);
  preview = false;
  view = "self";
  editor.reset();
  closeModal();
  save();
  eraInstant = true;
  render();
  resetBuildSnap();
  audio.setMusic("build");
  if (run.phase === "reward") rewardModal();
  else if (["complete", "gameover"].includes(run.phase)) finishModal();
  else if (fresh && mode === "campaign") void roundIntro();
}

/* ---------- Game feel: sound, particles and ceremonies around every decision ---------- */
type BuildSnap = {
  groups: Set<string>;
  sets: Set<string>;
  nested: Set<string>;
  cash: number;
  owned: number;
  capacity: number;
  pos: string;
};
function buildSnap(): BuildSnap {
  const info = E.analyze(run.owned);
  return {
    groups: new Set(info.groups.map((g) => g.id)),
    sets: new Set(activeFactionSets(info).map(set => set.faction)),
    nested: new Set(Object.keys(info.parents)),
    cash: run.cash,
    owned: run.owned.length,
    capacity: R.capacity(run),
    pos: run.owned
      .filter(C.placed)
      .map((p) => `${p.id}:${p.x},${p.y},${p.w},${p.h}`)
      .join("|"),
  };
}
let snap: BuildSnap | null = null;
let lastPickRect: DOMRect | null = null;
let lastTutorialStep: number | null = null;
let battleStage = 0;
function resetBuildSnap() {
  snap = buildSnap();
}
function centerOf(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function nodeRect(id: string) {
  return (
    document
      .querySelector(`#player-body .web-node[data-id="${id}"]`)
      ?.getBoundingClientRect() ?? null
  );
}
function bumpMoney() {
  const m = document.querySelector(".tb-money");
  if (!m) return;
  m.classList.remove("bump");
  void (m as HTMLElement).offsetWidth;
  m.classList.add("bump");
  setTimeout(() => m.classList.remove("bump"), 320);
}
function afterBuildChange() {
  const prev = snap,
    next = buildSnap();
  snap = next;
  if (!prev || battle) return;
  const info = E.analyze(run.owned);
  let celebrated = false;
  if (next.owned > prev.owned && next.cash < prev.cash) {
    audio.sfx("buy");
    bumpMoney();
    const newest = run.owned[run.owned.length - 1],
      to = nodeRect(newest.id) ?? $("#stash-list").getBoundingClientRect();
    if (lastPickRect) particles.purchase(lastPickRect, to);
  } else if (next.owned < prev.owned && next.cash > prev.cash) {
    audio.sfx("sell");
    bumpMoney();
    const m = document.querySelector(".tb-money")?.getBoundingClientRect();
    if (m) {
      const c = centerOf(m);
      particles.burst(c.x, c.y, { shape: "coin", count: 8, speed: 220 });
    }
  }
  if (
    next.capacity > prev.capacity &&
    eraFor(prev.capacity, run.mode) === eraFor(next.capacity, run.mode)
  ) {
    audio.sfx("levelup");
    const r = document.querySelector(".tb-load")?.getBoundingClientRect();
    if (r) {
      const c = centerOf(r);
      particles.ring(c.x, c.y, "#5fb3ff", 140);
      particles.burst(c.x, c.y, {
        shape: ["square", "spark"],
        colors: ["#5fb3ff", "#ffffff"],
        count: 26,
      });
    }
    Cer.showBanner(
      "サーバー増強！",
      `処理能力 ${prev.capacity} → ${next.capacity}`,
      "#5fb3ff",
    );
    celebrated = true;
  }
  const fresh = info.groups.filter((g) => !prev.groups.has(g.id));
  for (const g of fresh.slice(0, 2)) {
    const el = document.querySelector(
      `#player-body [data-group="${CSS.escape(g.id)}"]`,
    );
    const r = el?.getBoundingClientRect();
    if (r) {
      const c = centerOf(r);
      particles.snap(c.x, c.y, "#8a7cea");
    }
  }
  if (fresh.length) {
    audio.sfx("snap");
    const g = fresh[0];
    Cer.showBanner(
      `連結：${E.groupNames[g.kind]}`,
      GROUP_BONUS[g.kind] || "",
      "#6d5ce8",
    );
    celebrated = true;
  } else {
    const nest = [...next.nested].find((id) => !prev.nested.has(id));
    const r = nest ? nodeRect(nest) : null;
    if (r) {
      const c = centerOf(r);
      audio.sfx("snap");
      particles.snap(c.x, c.y, "#1f8a70");
      celebrated = true;
    }
  }
  for (const f of [...next.sets].filter((f) => !prev.sets.has(f))) {
    const fa = D.FACTIONS[f as Faction];
    audio.sfx("set");
    Cer.showBanner("セット効果 発動！", `${fa.name}×3 ─ ${fa.set}`, fa.color);
    particles.setActivate($("#player-body").getBoundingClientRect(), fa.color);
    celebrated = true;
  }
  if (!celebrated && next.pos !== prev.pos && next.owned === prev.owned) {
    audio.sfx("drop");
    const id = [...editor.selection][0],
      r = id ? nodeRect(id) : null;
    if (r) particles.dropDust(r);
  }
}
function audioSettings() {
  openModal(
    `<div class="modal-inner">${modalHead("SOUND", "サウンド")}<div class="audio-row"><span>音楽</span><input type="range" id="vol-music" min="0" max="100" value="${Math.round(audio.musicVolume * 100)}"><b>${Math.round(audio.musicVolume * 100)}</b></div><div class="audio-row"><span>効果音</span><input type="range" id="vol-sfx" min="0" max="100" value="${Math.round(audio.sfxVolume * 100)}"><b>${Math.round(audio.sfxVolume * 100)}</b></div><label class="audio-row"><span>ミュート</span><input type="checkbox" id="mute-all" ${audio.muted ? "checked" : ""}></label><div class="modal-footer"><button data-close-modal class="primary">閉じる</button></div></div>`,
  );
}
// The publish log reads the actual page: parts, composites, set bonuses, pending fusions, load.
function publishLog(): Cer.PublishLine[] {
  const info = E.analyze(run.owned),
    cap = R.capacity(run),
    o = appOpponent(),
    lab = run.mode === "lab",
    groups = [...new Set(info.groups.map((g) => E.groupNames[g.kind]))],
    sets = activeFactionSets(info).map((x) => `${D.FACTIONS[x.faction as Faction].name}×${x.count}`),
    fusions = R.fusionPairs(run.owned),
    score = Math.min(99, 38 + info.groups.length * 9 + sets.length * 14 + info.relations.length * 2),
    slug = run.page.name.replace(/\s/g, "-");
  const lines: Cer.PublishLine[] = [
    { kind: "cmd", text: `raid publish ./${slug} --target ${o.address}` },
    { kind: "step", text: `UIコンポーネントを束ねています（${info.board.length}個）` },
    {
      kind: "step",
      text: groups.length ? `連結を解決: ${groups.slice(0, 3).join("・")}` : "連結を解決",
      result: groups.length ? `ok (${info.groups.length})` : "なし",
    },
    { kind: "meter", text: sets.length ? `ui-synergy ${sets.join(" ")}` : "ui-synergy", value: score },
  ];
  for (const f of fusions.slice(0, 2))
    lines.push({ kind: "info", text: `統合候補: ${P[f.a.type].name} ＋ ${P[f.b.type].name} → ${P[f.recipe.into].name}（公開後）` });
  if (lab) lines.push({ kind: "step", text: `基本CPU ${info.load}`, result: labPressureCapacity() ? `実験: 双方CPU ${labPressureCapacity()}` : "実験室: 無制限" });
  else if (info.load > cap)
    lines.push({ kind: "warn", text: `負荷 ${info.load} / 処理能力 ${cap} — 表示が遅くなり、閲覧者が離れます` });
  else lines.push({ kind: "step", text: `負荷チェック ${info.load} / ${cap}`, result: "ok" });
  if ((run.admin || []).length)
    lines.push({ kind: "step", text: `管理画面を起動: ${run.admin.map((a) => D.ADMIN[a]?.name ?? a).join("・")}` });
  lines.push({ kind: "upload", text: "アップロード", result: `local://${slug}` });
  lines.push({ kind: "done", text: "公開完了", result: `${o.pageName} に接続します…` });
  return lines;
}
function siteCardYou(): Cer.SiteCard {
  const info = E.analyze(run.owned),
    cap = R.capacity(run),
    sets = activeFactionSets(info)
      .map(({ faction }) => D.FACTIONS[faction as Faction].name + " セット");
  return {
    name: run.page.name,
    url: "local://" + run.page.name.replace(/\s/g, "-"),
    color: "#2fb47c",
    stats: [
      { label: "UI", value: info.board.length + "個" },
      { label: "連結", value: String(info.groups.length) },
      {
        label: "重さ",
        value: run.mode === "lab" ? String(info.load) : `${info.load}/${cap}`,
      },
    ],
    tags: [...sets, ...info.groups.slice(0, 3).map((g) => E.groupNames[g.kind])],
  };
}
function siteCardFoe(): Cer.SiteCard {
  const o = appOpponent();
  return {
    name: o.pageName,
    url: o.address,
    color: "#e5484d",
    faction: o.faction,
    stats: [
      { label: "UI", value: o.size + "個" },
      { label: "閲覧者の粘り", value: String(o.hp) },
      { label: "管理画面", value: o.admin.length ? o.admin.length + "個" : "なし" },
    ],
    tags: o.admin.map((a) => D.ADMIN[a].name),
  };
}
function ladderResults() {
  const results: Record<number, "win" | "lose"> = {};
  for (const h of run.history)
    if (h.round) results[h.round - 1] = h.winner === "player" ? "win" : "lose";
  return results;
}
async function roundIntro() {
  if (run.mode !== "campaign" || run.phase !== "build") return;
  const results = ladderResults(),
    prevF = run.stage
      ? R.shopFactions({ ...run, stage: run.stage - 1 })
      : new Set<string>(),
    unlocked = run.stage
      ? [...R.shopFactions(run)]
          .filter((f) => !prevF.has(f))
          .map((f) => D.FACTIONS[f as Faction].name)
      : [];
  audio.sfx("reward");
  await Cer.showRoundIntro({
    round: run.stage + 1,
    totalRounds: R.ROUNDS,
    ladder: R.LADDER.map((r, i) => {
      const e = D.ENEMIES[r.e];
      return {
        name: e.pageName,
        color: D.FACTIONS[e.faction].color,
        state: results[i] ?? (i === run.stage ? "next" : "future"),
        boss: i === R.ROUNDS - 1,
      };
    }),
    unlocked,
    lives: run.lives,
    cash: run.cash,
    capacity: R.capacity(run),
    tip: appOpponent().tip,
  });
}
function battleSfx(ev: { kind: string; [k: string]: unknown }, b: Battle) {
  const side = ev.side === "player" ? "player" : "enemy",
    pan = side === "player" ? -0.35 : 0.35;
  if (ev.kind === "damage") {
    if (ev.admin === "troll") return audio.sfx("block", { pan });
    const src = b[side].parts.find((p) => p.id === ev.id);
    audio.sfx(src && traffic.isBlock(src.type) ? "block" : "hit", { pan });
    if (Math.random() < 0.35) audio.sfx("steal", { pan });
  } else if (ev.kind === "income" && side === "player") audio.sfx("coin");
  else if (ev.kind === "lag" && side === "player") audio.sfx("lag");
  else if (ev.kind === "end") {
    audio.sfx("crash");
    const loser =
      ev.winner === "player" ? "enemy" : ev.winner === "enemy" ? "player" : null;
    if (loser) {
      const paper = document.querySelector(`#${loser}-frame .browser-paper`);
      if (paper)
        particles.crash(
          paper.getBoundingClientRect(),
          loser === "enemy"
            ? ["#e5484d", "#ffffff", "#9aa0ad"]
            : ["#2fb47c", "#ffffff", "#9aa0ad"],
        );
      particles.shake($("#scene"), 14, 600);
      particles.flash("#ffffff", 220, 0.4);
    }
  }
}
let leader: "player" | "enemy" | null = null;
function battleIntensity(b: Battle) {
  const n = traffic.counts(),
    tot = n.player + n.enemy;
  if (!tot) return;
  // A lead change is the most dramatic moment of a fight: call it out.
  if (b.elapsed < 0.5) leader = null;
  const diff = n.player - n.enemy,
    now = diff > 6 ? "player" : diff < -6 ? "enemy" : leader;
  if (now && leader && now !== leader && b.elapsed > 3 && !b.result) {
    Cer.showBanner(
      now === "player" ? "逆転！" : "逆転された！",
      now === "player" ? "あなたのサイトがリード" : "相手のサイトがリード",
      now === "player" ? "#2fb47c" : "#e5484d",
    );
    audio.sfx(now === "player" ? "set" : "error");
  }
  leader = now;
  const close = 1 - Math.abs(n.player - n.enemy) / tot,
    danger = Math.min(b.player.hp / b.player.maxHp, b.enemy.hp / b.enemy.maxHp);
  audio.setIntensity(Math.min(1, 0.2 + 0.55 * close + (danger < 0.3 ? 0.35 : 0)));
}
let titleIntroPlayed = false;
function showTitleScreen() {
  if (battle) return;
  // The 1999 boot + upgrade intro plays once per session; later visits go straight to the 2025 title.
  const intro = !titleIntroPlayed && !fx.reduced;
  titleIntroPlayed = true;
  audio.setMusic(intro ? "none" : "title");
  const hasSave = (() => {
    try {
      const raw = localStorage.getItem(KEY + "campaign");
      if (!raw) return false;
      const v = JSON.parse(raw) as Partial<Run>;
      return !!(v.history?.length || v.owned?.length);
    } catch {
      return false;
    }
  })();
  const enter = (fn: () => void) => {
    audio.unlock();
    title.close();
    fn();
  };
  const title = Title.showTitle({
    hasSave,
    intro,
    onFirstInteraction: () => {
      audio.unlock();
      if (!intro) audio.setMusic("title");
    },
    onStory: () => enter(() => enterStory()),
    onContinue: () => enter(() => switchMode("campaign")),
    onNewRun: () => enter(() => switchMode("campaign", true)),
    onTutorial: () => enter(() => switchMode("campaign", true, true)),
    onLab: () => enter(() => switchMode("lab")),
    onSettings: () => {
      audio.unlock();
      audioSettings();
    },
  });
}
function previewVideoComment(form: HTMLFormElement | null) {
  if (!form || !preview || battle) return;
  const source=form.closest<HTMLElement>(".web-node"),id=source?.dataset.id;
  const info=E.analyze(run.owned);
  const target=id?run.owned.find(item=>(info.near[id]??[]).includes(item.id)&&P[item.type].tags.includes("video")&&P[item.type].kind==="attack"):undefined;
  if(!target){toast("近くに動画プレイヤーを置くと、コメントが動画の上を流れます（ページ内の操作デモ）。");return;}
  const node=document.querySelector<HTMLElement>(`#player-body .web-node[data-id="${target.id}"]`);
  fx.comment(node,form.querySelector("input")?.value||"ここ好き");
}
function previewAction(e: MouseEvent) {
  if (!(e.target instanceof Element)) return;
  const act = e.target.closest<HTMLElement>("[data-ui]"),
    body = e.target.closest(".browser-paper");
  if (!body || !act) return;
  if (act.tagName === "A") e.preventDefault();
  if (!preview || battle) return;
  if ("disabled" in act && act.disabled) return;
  const node = act.closest<HTMLElement>(".web-node");
  if (storyActive && storySession && node?.dataset.id === storySession.endingLinkId) {
    const visited=StorySession.commandStorySession(storySession,{type:"visit-restored-page"});
    if (visited.ok) { try { commitStorySession(visited.session); openStoryHub(); } catch(error) { toast(error instanceof Error ? error.message : "保存できません。"); } }
    return;
  }
  if (node) fx.pulse(node);
  if(previewCatalogueAction(act,node))return;
  const kind = act.dataset.ui ?? "";
  if (kind === "vote-up" || kind === "vote-down") {
    const group=act.closest<HTMLElement>(".native-vote-column"),selected=act.getAttribute("aria-pressed")==="true";
    group?.querySelectorAll("button[data-ui]").forEach(button=>button.setAttribute("aria-pressed","false"));
    act.setAttribute("aria-pressed",String(!selected));
    const score=group?.querySelector<HTMLElement>(".vote-score");
    if(score){const base=Number(score.dataset.previewBase??score.textContent??128);score.dataset.previewBase=String(base);score.textContent=String(base+(selected?0:kind==="vote-up"?1:-1));}
  } else if (kind === "comment" && act.tagName === "BUTTON") {
    previewVideoComment(act.closest("form"));
  } else if (kind === "like") {
    const n = act.querySelector(".like-value");
    if (n) n.textContent = String(Number(n.textContent) + 1);
  } else if (["caption", "notify", "wish"].includes(kind)) {
    act.classList.toggle("is-on");
  } else if (kind === "play") {
    node?.classList.toggle("video-paused");
  } else if (["tab", "font"].includes(kind)) {
    for (const b of act.parentElement?.querySelectorAll("button") ?? [])
      b.classList.remove("current");
    act.classList.add("current");
  } else if (kind === "accordion") {
    const c = act.closest(".native-accordion"),
      is = c?.classList.toggle("collapsed");
    if (c) act.setAttribute("aria-expanded", String(!is));
    act.querySelector("span")!.textContent = is ? "＋" : "−";
  } else if (kind === "buy") {
    const cart = body.querySelector(".cart-state");
    if (cart) cart.textContent = String(Number(cart.textContent) + 1);
    toast("カートに追加しました（実際の購入はしません）。");
  } else if (kind === "submit") {
    const form = node?.closest(".node-gov_form")?.querySelector(".native-form");
    if (form) form.classList.add("accepted");
  } else if (kind === "link" || kind === "header" || kind === "download")
    toast("ページ内のプレビューです。外部には移動しません。");
}

/* ---------- Events ---------- */
document.addEventListener("click", (e) => {
  if (!(e.target instanceof Element)) return;
  previewAction(e);
  if (e.target.closest("#enemy-thumbnail") && !battle) {
    view = "enemy";
    render();
    return;
  }
  const target = e.target.closest("button");
  if (!target) return;
  if (target.hasAttribute("data-close-modal")) {
    closeModal();
    if (battle?.result) leaveBattle();
    return;
  }
  if (target.dataset.sidechannelPlacement !== undefined) {
    setSidechannelPlacementFromControl(target);
    return;
  }
  if (target.dataset.editorAction) {
    const a = target.dataset.editorAction;
    if (a === "horizontal" || a === "vertical") editor.join(a);
    else if (a === "remove" && storyActive && storySession && editor.selected().some(item=>storySession!.protectedKitIds.includes(item.id) || (storySession!.story.phase!=="complete"&&item.id===storySession!.endingLinkId))) toast("物語で使うこのUIは、合成や最初の訪問が終わるまで残してください。");
    else if (a === "stash" || a === "remove") editor[a]();
    return;
  }
  if (target.dataset.shape) {
    editor.update({ shape: target.dataset.shape });
    return;
  }
  if (target.dataset.buildLoad || target.dataset.buildFoe) {
    loadBuild(target.dataset.buildLoad, target.dataset.buildFoe);
    return;
  }
  if (target.dataset.skinAll) {
    editor.updateAll({ shape: target.dataset.skinAll });
    return;
  }
  if (target.dataset.speed) {
    speed = +target.dataset.speed;
    $$("[data-speed]").forEach((b) =>
      b.classList.toggle("active", b === target),
    );
    return;
  }
  if (target.dataset.plan) {
    if (editor.commit(() => R.purchase(run, "plan:" + target.dataset.plan)))
      toast(`サーバーを契約。処理能力が ${R.capacity(run)} になりました。`);
    return;
  }
  if (target.dataset.adminAdd !== undefined) {
    if (!battle && run.phase === "build") adminPicker();
    return;
  }
  if (target.dataset.adminPick) {
    const id = target.dataset.adminPick;
    closeModal();
    editor.commit(() => {
      const list = run.admin || [];
      if (list.length >= R.adminSlots(run) || list.includes(id))
        return { ok: false, error: "スロットが埋まっています。" };
      run.admin = [...list, id];
      return true;
    }, `管理画面に「${D.ADMIN[id].name}」を導入しました。`);
    return;
  }
  if (target.dataset.adminRemove) {
    const id = target.dataset.adminRemove;
    editor.commit(() => {
      run.admin = (run.admin || []).filter((a) => a !== id);
      return true;
    }, `「${D.ADMIN[id].name}」を外しました。`);
    return;
  }
  if (target.dataset.loot) {
    const k = target.dataset.loot,
      pickRect = target.getBoundingClientRect(),
      out = R.claimLoot(run, k === "skip" ? null : k);
    if (!out.ok) {
      toast(out.error);
      return;
    }
    if (k !== "skip") {
      audio.sfx("buy");
      const c = pickRect;
      particles.burst(c.left + c.width / 2, c.top + c.height / 2, {
        shape: ["star", "pill", "square"],
        colors: ["#f5c542", "#2fb47c", "#ffffff"],
        count: 34,
        speed: 420,
      });
    }
    save();
    leaveBattle();
    if (run.phase === "complete") finishModal();
    else
      toast(
        out.admin
          ? `管理画面に「${D.ADMIN[out.admin].name}」を導入しました。`
          : out.pending
            ? "手持ちが満杯のため、報酬を受取箱に保存しました。メニューから受け取れます。"
          : out.item
            ? `「${P[out.item.type].name}」を手持ちに加えました。ページにドラッグして使おう。`
            : `ROUND ${run.stage + 1} へ。`,
      );
    return;
  }
  switch (target.id) {
    case "m-story":
      enterStory(); break;
    case "m-new-story":
      if(window.confirm("物語の現在の旅を、新しい白紙のページで始め直しますか？旧ランとオンラインはそのままです。"))enterStory(true); break;
    case "story-hub-button":
      if(!battle)openStoryHub(); break;
    case "story-use-saved": {
      if(!pendingStorySettlement||!window.confirm("未保存のこの対戦結果を破棄して、保存されている記録に戻りますか？必要なら先に結果をバックアップしてください。"))break;
      const latest=storyPersistence.load();
      if(latest.status!=="loaded"){toast("保存済みの記録を確認できないため、この結果を保全しています。");break;}
      pendingStorySettlement=null;storySession=clone(latest.session);run=clone(latest.session.run);editor.reset();leaveBattle();openStoryHub();break;
    }
    case "story-export-pending":
      exportFile(); break;
    case "story-retry-save":
      void finishStoryBattle(); break;
    case "menu-button":
      menu();
      break;
    case "battle-button":
      void start();
      break;
    case "undo-button":
      editor.undo();
      break;
    case "redo-button":
      editor.redo();
      break;
    case "zoom-in":
      manualZoom = Math.min(
        1.5,
        (manualZoom ??
          parseInt(($("#zoom-value").textContent ?? "").replace("FIT ", "")) /
            100) + 0.1,
      );
      scheduleFit();
      break;
    case "zoom-out":
      manualZoom = Math.max(
        0.25,
        (manualZoom ??
          parseInt(($("#zoom-value").textContent ?? "").replace("FIT ", "")) /
            100) - 0.1,
      );
      scheduleFit();
      break;
    case "zoom-value":
      manualZoom = null;
      scheduleFit();
      break;
    case "view-enemy":
      view = "enemy";
      render();
      break;
    case "back-to-page":
      view = "self";
      preview = false;
      render();
      break;
    case "dismiss-coach":
      coachHidden = true;
      renderCoach();
      break;
    case "reroll-button":
      if (storyActive && storySession) { const rolled=StorySession.rerollStoryMarket(storySession); if(rolled.ok){try{commitStorySession(rolled.session);render();}catch(error){toast(error instanceof Error?error.message:"保存できません。");}}else toast(rolled.error); }
      else editor.commit(() => R.reroll(run));
      break;
    case "export-button":
      exportFile();
      break;
    case "toggle-fusion-lock":
      editor.commit(() => { const item = editor.selected()[0]; if (!item) return false; item.fusionLocked = !item.fusionLocked; return true; });
      break;
    case "import-button":
      $<HTMLInputElement>("#import-file").click();
      break;
    case "pause-button":
      if (battle && !battle.result) {
        paused = !paused;
        $("#pause-button").textContent = paused ? "再開" : "一時停止";
        document.body.classList.toggle("battling", !paused);
      }
      break;
    case "abort-button":
      abort();
      break;
    case "result-edit":
      leaveBattle();
      break;
    case "result-replay":
      leaveBattle();
      void start();
      break;
    case "reward-next":
      rewardModal();
      break;
    case "finish-next":
      leaveBattle();
      finishModal();
      break;
    case "new-campaign":
      leaveBattle();
      switchMode("campaign", true);
      break;
    case "go-lab":
      leaveBattle();
      switchMode("lab");
      break;
    case "m-campaign":
      switchMode("campaign");
      break;
    case "m-new-campaign":
      switchMode("campaign", true);
      break;
    case "m-lab":
      switchMode("lab");
      break;
    case "m-online":
      onlinePanel();
      break;
    case "m-raid":
      void raidPanel();
      break;
    case "m-collection":
      void collectionPanel();
      break;
    case "m-overflow":
      if(storyActive)storyInboxPanel(); else overflowPanel();
      break;
    case "m-builds":
    case "open-builds":
      buildBook();
      break;
    case "m-sound":
      audioSettings();
      break;
    case "m-wm-reset":
      manualZoom = null;
      wm.reset();
      closeModal();
      toast("ウィンドウを初期の配置に戻しました。");
      break;
    case "m-title":
      closeModal();
      showTitleScreen();
      break;
    case "m-tutorial":
      switchMode("campaign", true, true);
      break;
    case "tut-next": {
      const s = tutStep();
      if (s?.n === 5) {
        run.tutorialAck = true;
        save();
        render();
      } else if (s?.n === 7) finishTutorial();
      break;
    }
    case "tut-skip":
      finishTutorial();
      break;
    case "m-help":
      help();
      break;
    case "m-settings":
      settings();
      break;
    case "m-preview":
      closeModal();
      preview = true;
      editor.selection.clear();
      render();
      break;
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement))
    return;
  if (el.id === "sel-income-route" && el instanceof HTMLSelectElement) {
    setIncomeRouteFromControl(el);
    return;
  }
  if (el.id === "part-label") {
    editor.update({ label: el.value });
    return;
  }
  if (el.id === "page-name") {
    run.page.name = el.value.trim() || "mixspace.";
    save();
    render();
    return;
  }
  if (el.id === "page-theme" && isTheme(el.value)) {
    run.page.theme = el.value;
    save();
    render();
    return;
  }
  if (el.id === "preset-select" && el.value) {
    const id = el.value;
    closeModal();
    editor.commit(() => {
      const stage = run.stage,
        fresh = R.newRun("lab", id);
      fresh.stage = stage;
      if (!fresh.page.templateId) fresh.admin = run.admin || [];
      const build = BUILDS.find((b) => b.id === id);
      if (build) {
        fresh.admin = [...build.admin];
        fresh.page.name = build.pageName;
        fresh.page.theme = build.theme;
      } else if (id === "commerce") {
        fresh.page.theme = "amazon";
        fresh.page.name = "mixstore.";
      } else if (id === "form") {
        fresh.page.theme = "gov";
        fresh.page.name = "電子申請のページ";
      }
      Object.assign(run, fresh);
      editor.selection.clear();
      return true;
    }, "お手本を読み込みました。Ctrl+Zで戻せます。");
    return;
  }
  if (el.id === "enemy-select") {
    run.stage = +el.value;
    save();
    render();
    return;
  }
  if (el.id === "family-filter") renderShop();
  if (el.id === "import-file" && el instanceof HTMLInputElement)
    importFile(el.files?.[0]);
  if (el.id === "motion-setting" && el instanceof HTMLInputElement) {
    fx.reduced = el.checked;
    particles.reduced = el.checked;
    Cer.setReducedMotion(el.checked);
    document.body.classList.toggle("reduced-motion", fx.reduced);
  }
  if (el.id === "mute-all" && el instanceof HTMLInputElement)
    audio.setMuted(el.checked);
  if (el.id === "sound-setting" && el instanceof HTMLInputElement) {
    fx.sound = el.checked;
    fx.tone("income");
  }
});
$<HTMLInputElement>("#library-query").addEventListener("input", renderShop);
document.addEventListener("input", (e) => {
  if (!(e.target instanceof HTMLInputElement)) return;
  if (e.target.id === "vol-music" || e.target.id === "vol-sfx") {
    const v = Number(e.target.value) / 100;
    if (e.target.id === "vol-music") audio.setMusicVolume(v);
    else {
      audio.setSfxVolume(v);
      audio.sfx("coin");
    }
    const out = e.target.parentElement?.querySelector("b");
    if (out) out.textContent = e.target.value;
    return;
  }
  if (preview && e.target.matches(".native-seek input"))
    e.target
      .closest<HTMLElement>(".web-node")
      ?.style.setProperty("--seek", String(Number(e.target.value) / 100));
});
document.addEventListener("submit", (e) => {
  if (!(e.target instanceof HTMLFormElement)) return;
  if (e.target.closest(".browser-paper")) {
    e.preventDefault();
    if(e.target.matches(".native-comment-input")){previewVideoComment(e.target);return;}
    if (preview)
      toast(
        "「" +
          (e.target.querySelector("input")?.value || "UI") +
          "」を検索（ページ内の操作デモ）",
      );
  }
});
document.addEventListener("keydown", (e) => {
  if (!(e.target instanceof HTMLElement)) return;
  if (
    (e.key === "Enter" || e.key === " ") &&
    !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.isComposing &&
    e.target === document.activeElement &&
    e.target.isConnected &&
    e.target.matches('.shop-card[data-palette-type][role="button"], .hs-el[data-palette-type][role="button"]') &&
    $("#library-list").contains(e.target) &&
    !e.target.isContentEditable &&
    !e.target.closest('input,button,select,textarea,[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"]') &&
    !document.querySelector("dialog[open]") &&
    !editor.drag && editor.o.enabled()
  ) {
    // These wrappers are buttons; native children keep their own key defaults.
    // Held Space must not scroll the library or create repeated purchases.
    e.preventDefault();
    if (e.repeat) return;
    const source = e.target, library = $("#library-list"), originalRun = run,
      mode = run.mode, stage = run.stage, storyMode = storyActive,
      type = source.dataset.paletteType!, shopIndex = source.dataset.shopIndex,
      stock = shopIndex === undefined ? undefined : run.shop[Number(shopIndex)],
      selector = source.matches(".shop-card") ? '.shop-card[data-palette-type][role="button"]'
        : '.hs-el[data-palette-type][role="button"]',
      owned = new Set(run.owned.map(item => item.id));
    editor.add(type);
    // add() returns void; follow only an actual new, still-selected purchase.
    // Repainting alone (including a rejected transaction's toast) is not success.
    const added = run.owned.filter(item => !owned.has(item.id));
    if (run !== originalRun || editor.run !== originalRun || run.mode !== mode || run.stage !== stage ||
      storyActive !== storyMode || run.owned.length !== owned.size + 1 || added.length !== 1 ||
      added[0].type !== type || editor.selection.size !== 1 || !editor.selection.has(added[0].id) ||
      source.isConnected || !library.isConnected || document.querySelector("#library-list") !== library ||
      editor.drag || !editor.o.enabled() || document.querySelector("dialog[open]") ||
      (document.activeElement !== document.body && document.activeElement !== null)) return;
    // Campaign stock has slot identity: a sold source must not jump to another
    // same-type offer, even when that offer survives the synchronous redraw.
    if (mode === "campaign" && (!stock || stock.type !== type || stock.sold ||
      run.shop[Number(shopIndex)] !== stock)) return;
    const replacement = [...library.querySelectorAll<HTMLElement>(selector)].find(card =>
      card.dataset.paletteType === type && (mode === "lab" || card.dataset.shopIndex === shopIndex));
    if (replacement?.isConnected && replacement.tabIndex === 0 && !replacement.isContentEditable &&
      !replacement.closest('input,button,select,textarea,[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"]'))
      replacement.focus({ preventScroll: true });
    return;
  }
  if (e.key === "Enter" && e.target.matches?.("#enemy-thumbnail") && !battle) {
    view = "enemy";
    render();
  }
  if (
    e.code === "Space" &&
    battle &&
    !e.target.closest?.("input,button,select,textarea") &&
    !$<HTMLDialogElement>("#modal").open
  ) {
    e.preventDefault();
    $("#pause-button").click();
  }
});
$<HTMLDialogElement>("#modal").addEventListener("cancel", (event) => {
  if (pendingStorySettlement) { event.preventDefault(); return; }
  modalFeatureDispose?.(); modalFeatureDispose = undefined;
  if (battle?.result) setTimeout(leaveBattle, 0);
});
new ResizeObserver(scheduleFit).observe($("#canvas-scroll"));
window.addEventListener("resize", scheduleFit);
window.addEventListener("beforeunload", save);
const appInspector = Object.freeze({
  inspect: () => ({
    run: clone(run),
    story: storyActive && storySession ? clone(storySession.story) : null,
    storyProfile: storyActive && storySession ? clone(storySession) : null,
    view,
    preview,
    selected: [...editor.selection],
    battle: battle
      ? {
          time: battle.elapsed,
          result: battle.result,
          playerHp: battle.player.hp,
          enemyHp: battle.enemy.hp,
          playerIncome: battle.player.income,
        }
      : null,
  }),
});
declare global {
  interface Window {
    UIRaidApp: typeof appInspector;
  }
}
window.UIRaidApp = appInspector;
if (
  run.mode === "campaign" &&
  !run.history.length &&
  !run.owned.length &&
  !tutorialDone() &&
  !run.tutorial
)
  run = R.newRun("campaign", "mixed", { tutorial: true });
for (const [id, faction] of Object.entries(D.FACTIONS)) {
  if (!Object.values(P).some(part => part.faction === id)) continue;
  const select = $<HTMLSelectElement>("#family-filter");
  if (![...select.options].some(option => option.value === id)) {
    const option = document.createElement("option"); option.value = id; option.textContent = faction.name; select.append(option);
  }
}
render();
save();
resetBuildSnap();
particles.reduced = fx.reduced;
Cer.setReducedMotion(fx.reduced);
document.addEventListener(
  "pointerdown",
  (e) => {
    audio.unlock();
    if (!(e.target instanceof Element)) return;
    const card = e.target.closest<HTMLElement>("[data-palette-type]");
    if (card) {
      lastPickRect = card.getBoundingClientRect();
      audio.sfx("pick");
      return;
    }
    if (!battle && e.target.closest("#player-body .web-node")) {
      audio.sfx("pick");
      return;
    }
    if (e.target.closest("button, [role=button], select")) audio.sfx("click");
  },
  true,
);
document.addEventListener("click", (e) => {
  if (!(e.target instanceof Element)) return;
  const add = e.target.closest<HTMLElement>("[data-add-type]");
  if (add) lastPickRect = add.closest(".shop-card")?.getBoundingClientRect() ?? null;
}, true);
let lastHover: Element | null = null;
document.addEventListener("pointerover", (e) => {
  if (!(e.target instanceof Element)) return;
  const card = e.target.closest(".shop-card, .reward-card, .plan-card, .tb-primary");
  if (card && card !== lastHover) audio.sfx("hover");
  lastHover = card;
});
initModernUI(() => fx.reduced);
showTitleScreen();
