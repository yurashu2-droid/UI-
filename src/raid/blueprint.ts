import { PARTS, LOAD_LIMIT } from "../part-registry.js";
import C from "../document.js";
import {
  RAID_LIMITS,
  type RaidAppearance,
  type RaidBlueprint,
  type RaidComponent,
  type RaidPrimitive,
  type RaidResult,
  type RaidReward,
  type RaidItem,
} from "./types.js";
import type { Rect } from "../types.js";
import { normalizePublicPageUrl } from "./url.js";

// Only JSON data is accepted. Never invoke accessors or toString hooks while
// deciding whether a caller-supplied object is safe to paint or persist.
const record = (v: unknown): v is Record<string, unknown> => {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(v))
  )
    return false;
  return Reflect.ownKeys(v).every((key) => {
    const d = Object.getOwnPropertyDescriptor(v, key);
    return (
      typeof key === "string" && !!d?.enumerable && Object.hasOwn(d, "value")
    );
  });
};
const list = (v: unknown, max: number, min = 0): v is unknown[] => {
  if (
    !Array.isArray(v) ||
    v.length < min ||
    v.length > max ||
    Object.getPrototypeOf(v) !== Array.prototype ||
    Reflect.ownKeys(v).length !== v.length + 1
  )
    return false;
  for (let i = 0; i < v.length; i++) {
    const d = Object.getOwnPropertyDescriptor(v, String(i));
    if (!d?.enumerable || !Object.hasOwn(d, "value")) return false;
  }
  return true;
};
const exact = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const number = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const text = (v: unknown, max = 80): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v);
const color = (v: unknown): v is string =>
  typeof v === "string" && /^#[a-f0-9]{6}$/i.test(v);
const captureId = (v: unknown): v is string =>
  typeof v === "string" && /^capture_[a-f0-9]{64}$/.test(v);
const appearanceId = (v: unknown): v is string =>
  typeof v === "string" && /^appearance_[a-f0-9]{64}$/.test(v);
const rect = (v: unknown, width: number, height: number): v is Rect =>
  record(v) &&
  exact(v, ["x", "y", "w", "h"]) &&
  number(v.x, 0, width) &&
  number(v.y, 0, height) &&
  number(v.w, 1, width) &&
  number(v.h, 1, height) &&
  v.x + v.w <= width &&
  v.y + v.h <= height;
const invalid = (error: string): RaidResult<never> => ({
  ok: false,
  code: "invalid-blueprint",
  error,
});

function primitive(
  v: unknown,
  width: number,
  height: number,
): v is RaidPrimitive {
  if (!record(v) || !rect(v.rect, width, height)) return false;
  if (v.kind === "text")
    return (
      exact(v, [
        "kind",
        "rect",
        "text",
        "color",
        "size",
        "weight",
        "font",
        "align",
      ]) &&
      text(v.text) &&
      color(v.color) &&
      number(v.size, 8, 64) &&
      typeof v.weight === "string" &&
      ["normal", "bold"].includes(v.weight) &&
      typeof v.font === "string" &&
      ["sans", "serif", "mono"].includes(v.font) &&
      typeof v.align === "string" &&
      ["left", "center", "right"].includes(v.align)
    );
  return (
    v.kind === "rect" &&
    exact(v, [
      "kind",
      "rect",
      "fill",
      "radius",
      "borderColor",
      "borderWidth",
    ]) &&
    color(v.fill) &&
    color(v.borderColor) &&
    number(v.radius, 0, 80) &&
    number(v.borderWidth, 0, 8)
  );
}
export function validateRaidAppearance(
  value: unknown,
): value is RaidAppearance {
  return (
    record(value) &&
    exact(value, ["width", "height", "background", "primitives"]) &&
    number(value.width, 1, 960) &&
    number(value.height, 1, 680) &&
    color(value.background) &&
    list(value.primitives, RAID_LIMITS.primitives) &&
    value.primitives.every((p) =>
      primitive(p, value.width as number, value.height as number),
    )
  );
}
const EVIDENCE: Record<RaidComponent["evidence"], string> = {
  search: "go_search",
  navigation: "ab_nav",
  heading: "ab_heading",
  purchase: "am_buy",
  product: "am_product",
  rating: "am_rating",
  quantity: "am_quantity",
  notice: "gov_notice",
  pdf: "gov_pdf",
  checkbox: "gov_check",
};
export function canonicalTypeFor(evidence: RaidComponent["evidence"]): string {
  return EVIDENCE[evidence];
}

export function validateRaidBlueprint(
  value: unknown,
): RaidResult<RaidBlueprint> {
  if (
    !record(value) ||
    !exact(value, [
      "schemaVersion",
      "extractorVersion",
      "mapperVersion",
      "captureId",
      "viewport",
      "source",
      "fidelity",
      "warnings",
      "background",
      "decor",
      "components",
      ...(value.extractorVersion === "code-v1" ? ["analysis"] : []),
    ])
  )
    return invalid("取得データの形式が正しくありません。");
  if (
    value.schemaVersion !== 1 ||
    !["static-v1", "code-v1"].includes(value.extractorVersion as string) ||
    value.mapperVersion !== "canonical-v1" ||
    !captureId(value.captureId)
  )
    return invalid("取得データの版またはIDが正しくありません。");
  const approximate = value.extractorVersion === "code-v1";
  if (approximate) {
    const a = value.analysis;
    if (
      value.fidelity !== "code-approximation" ||
      !record(a) ||
      !exact(a, [
        "sourceHash",
        "layout",
        "confidence",
        "styles",
        "candidateCount",
        "selectedCount",
        "omitted",
        ...(a.styles === "safe-css-subset-v1" ? ["css"] : []),
      ]) ||
      typeof a.sourceHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(a.sourceHash) ||
      a.layout !== "inferred-flow" ||
      a.confidence !== "low" ||
      (a.styles !== "inline-and-embedded-subset" &&
        a.styles !== "safe-css-subset-v1") ||
      !number(a.candidateCount, 1, 20000) ||
      !Number.isInteger(a.candidateCount) ||
      !number(a.selectedCount, 1, RAID_LIMITS.components) ||
      !Number.isInteger(a.selectedCount) ||
      !list(a.omitted, 3, 3) ||
      a.omitted[0] !==
        (a.styles === "safe-css-subset-v1"
          ? "unsupported-css"
          : "external-stylesheets") ||
      a.omitted[1] !== "images" ||
      a.omitted[2] !== "scripts"
    )
      return invalid("コード解析の由来・近似範囲が正しくありません。");
    if (a.styles === "safe-css-subset-v1") {
      const css = a.css;
      if (
        !record(css) ||
        !exact(css, ["rules", "limited", "stylesheetHashes"]) ||
        !number(css.rules, 0, 1024) ||
        !Number.isInteger(css.rules) ||
        typeof css.limited !== "boolean" ||
        !list(css.stylesheetHashes, 1) ||
        !css.stylesheetHashes.every(
          (h) => typeof h === "string" && /^[a-f0-9]{64}$/.test(h),
        )
      )
        return invalid("CSS解析の由来または上限が正しくありません。");
    }
  }
  const vp = value.viewport;
  if (
    !record(vp) ||
    !exact(vp, ["width", "height"]) ||
    vp.width !== 960 ||
    vp.height !== 680
  )
    return invalid("画面サイズは960×680に限られます。");
  const source = value.source;
  if (
    !record(source) ||
    !exact(source, ["kind", "name", "displayUrl", "capturedAt"]) ||
    (source.kind !== "fixture" &&
      source.kind !== "static-public" &&
      source.kind !== "local-file") ||
    !text(source.name) ||
    !text(source.displayUrl, 240) ||
    !text(source.capturedAt, 30) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(source.capturedAt) ||
    !Number.isFinite(Date.parse(source.capturedAt)) ||
    new Date(source.capturedAt).toISOString() !== source.capturedAt
  )
    return invalid("取得元の情報が正しくありません。");
  if (source.kind === "fixture") {
    if (
      !/^fixture:\/\/[a-z0-9-]+$/.test(source.displayUrl) ||
      value.fidelity !== "controlled-fixture" ||
      approximate
    )
      return invalid("検証用ページの識別子が正しくありません。");
  } else if (source.kind === "local-file") {
    if (
      !approximate ||
      value.fidelity !== "code-approximation" ||
      !record(value.analysis) ||
      value.analysis.styles !== "safe-css-subset-v1" ||
      source.displayUrl !== "local://" + value.analysis.sourceHash
    )
      return invalid("ローカルHTMLの由来と内容ハッシュが一致しません。");
  } else {
    try {
      const u = new URL(source.displayUrl);
      const normalized = normalizePublicPageUrl(source.displayUrl);
      if (
        !normalized.ok ||
        normalized.value !== source.displayUrl ||
        !["http:", "https:"].includes(u.protocol) ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== "/" ||
        u.port ||
        value.fidelity !==
          (approximate ? "code-approximation" : "static-reconstruction")
      )
        return invalid("公開元の表示は認証情報のないオリジンに限られます。");
    } catch {
      return invalid("取得元URLが正しくありません。");
    }
  }
  if (
    !list(value.warnings, 8) ||
    !value.warnings.every((w) => text(w, 160)) ||
    !color(value.background) ||
    !list(value.decor, RAID_LIMITS.primitives) ||
    !value.decor.every((p) => primitive(p, 960, 680))
  )
    return invalid("表示情報が正しくありません。");
  if (!list(value.components, RAID_LIMITS.components, 1))
    return invalid("戦闘UIは1〜12個に限られます。");
  const ids = new Set<string>();
  let count = value.decor.length;
  for (const comp of value.components) {
    if (
      !record(comp) ||
      !exact(comp, [
        "componentId",
        "canonicalType",
        "sourceRect",
        "combatRect",
        "appearanceId",
        "appearance",
        "evidence",
        ...(approximate ? ["sourceNode"] : []),
      ]) ||
      typeof comp.componentId !== "string" ||
      !/^component-\d{2}$/.test(comp.componentId) ||
      ids.has(comp.componentId) ||
      typeof comp.canonicalType !== "string" ||
      !Object.hasOwn(PARTS, comp.canonicalType) ||
      PARTS[comp.canonicalType].fused ||
      !(approximate
        ? comp.sourceRect === null
        : rect(comp.sourceRect, 960, 680)) ||
      !rect(comp.combatRect, 960, 680) ||
      !appearanceId(comp.appearanceId) ||
      !validateRaidAppearance(comp.appearance) ||
      typeof comp.evidence !== "string" ||
      !Object.hasOwn(EVIDENCE, comp.evidence) ||
      EVIDENCE[comp.evidence as RaidComponent["evidence"]] !==
        comp.canonicalType
    )
      return invalid("取得UIの種類・配置・外観が正しくありません。");
    if (approximate) {
      const n = comp.sourceNode;
      if (
        !record(n) ||
        !exact(n, ["tag", "path", "order", "group", "classes"]) ||
        typeof n.tag !== "string" ||
        !/^[a-z][a-z0-9-]{0,30}$/.test(n.tag) ||
        typeof n.path !== "string" ||
        !/^[a-z0-9/[\]-]{1,512}$/.test(n.path) ||
        !number(n.order, 1, 20000) ||
        !Number.isInteger(n.order) ||
        !number(n.group, 0, 20000) ||
        !Number.isInteger(n.group) ||
        !list(n.classes, 4) ||
        !n.classes.every(
          (c) =>
            typeof c === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(c),
        )
      )
        return invalid("コード上のUI要素を確認できません。");
    }
    const def = PARTS[comp.canonicalType],
      r = comp.combatRect;
    if (r.w < def.minW || r.w > def.maxW || r.h < def.minH || r.h > def.maxH)
      return invalid("取得UIのサイズが標準UIの範囲外です。");
    count += comp.appearance.primitives.length;
    ids.add(comp.componentId);
  }
  if (count > RAID_LIMITS.primitives)
    return invalid("表示要素が上限を超えています。");
  if (
    approximate &&
    (value.analysis as RaidBlueprint["analysis"])?.selectedCount !==
      value.components.length
  )
    return invalid("コード解析のUI数が一致しません。");
  const blueprint = value as unknown as RaidBlueprint;
  const board = enemyUnchecked(blueprint);
  if (
    !board.some((p) => PARTS[p.type].kind === "attack") ||
    C.analyze(board).load > LOAD_LIMIT ||
    board.some(
      (p) =>
        !C.canPlace(
          board.filter((q) => q.id !== p.id),
          p,
          p.x,
          p.y,
        ),
    )
  )
    return invalid("戦闘できる合法な配置ではありません。");
  if (JSON.stringify(value).length > RAID_LIMITS.manifestBytes)
    return invalid("取得データの容量が上限を超えています。");
  return { ok: true, value: blueprint };
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            stableJson((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function sealRaidBlueprint(
  draft: Omit<RaidBlueprint, "captureId">,
): Promise<RaidBlueprint> {
  const data = structuredClone(draft);
  for (const c of data.components)
    c.appearanceId = "appearance_" + (await contentHash(c.appearance));
  const complete: RaidBlueprint = {
    ...data,
    captureId: "capture_" + (await contentHash(data)),
  };
  const result = validateRaidBlueprint(complete);
  if (!result.ok) throw new Error(result.error);
  return complete;
}
export async function verifyRaidBlueprint(
  value: unknown,
): Promise<RaidResult<RaidBlueprint>> {
  const checked = validateRaidBlueprint(value);
  if (!checked.ok) return checked;
  // Digest and return one immutable submission, not a caller-owned object that
  // can change between awaits (or between verification and registration).
  const snapshot = structuredClone(checked.value);
  for (const component of snapshot.components)
    if (
      component.appearanceId !==
      "appearance_" + (await contentHash(component.appearance))
    )
      return invalid("外観データの一致を確認できませんでした。");
  const { captureId: id, ...rest } = snapshot;
  if (id !== "capture_" + (await contentHash(rest)))
    return invalid("取得スナップショットの一致を確認できませんでした。");
  return { ok: true, value: snapshot };
}
function enemyUnchecked(blueprint: RaidBlueprint): RaidItem[] {
  return blueprint.components.map((c, i) => ({
    ...C.makeItem(
      c.canonicalType,
      "e" + i,
      c.combatRect.x,
      c.combatRect.y,
      c.combatRect.w,
      c.combatRect.h,
    ),
    appearanceId: c.appearanceId,
    provenanceId: blueprint.captureId,
  }));
}
export function createRaidEnemy(blueprint: RaidBlueprint): RaidItem[] {
  const checked = validateRaidBlueprint(blueprint);
  if (!checked.ok) throw new Error(checked.error);
  return enemyUnchecked(blueprint);
}
export function prepareRaidRewards(
  blueprint: RaidBlueprint,
  battleId: string,
): RaidReward[] {
  const checked = validateRaidBlueprint(blueprint);
  if (!checked.ok || !/^[a-zA-Z0-9_-]{1,80}$/.test(battleId))
    throw new Error("報酬の対象を確認できません。");
  return blueprint.components.map((c) => ({
    kind: "raid-ui",
    rewardId: `raid:${battleId}:${c.componentId}`,
    battleId,
    captureId: blueprint.captureId,
    componentId: c.componentId,
    canonicalType: c.canonicalType,
    appearanceId: c.appearanceId,
    provenanceId: blueprint.captureId,
    width: c.combatRect.w,
    height: c.combatRect.h,
  }));
}
export function createRaidLootItem(reward: RaidReward, id: string): RaidItem {
  if (
    !record(reward) ||
    !exact(reward, [
      "kind",
      "rewardId",
      "battleId",
      "captureId",
      "componentId",
      "canonicalType",
      "appearanceId",
      "provenanceId",
      "width",
      "height",
    ]) ||
    typeof reward.battleId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(reward.battleId) ||
    typeof reward.componentId !== "string" ||
    !/^component-\d{2}$/.test(reward.componentId) ||
    reward.rewardId !== `raid:${reward.battleId}:${reward.componentId}`
  )
    throw new Error("回収するUIの形式が正しくありません。");
  const d = Object.hasOwn(PARTS, reward.canonicalType)
    ? PARTS[reward.canonicalType]
    : null;
  if (
    reward.kind !== "raid-ui" ||
    !d ||
    d.fused ||
    !/^p\d+$/.test(id) ||
    !captureId(reward.captureId) ||
    reward.provenanceId !== reward.captureId ||
    !appearanceId(reward.appearanceId) ||
    !number(reward.width, d.minW, d.maxW) ||
    !number(reward.height, d.minH, d.maxH)
  )
    throw new Error("回収するUIの形式が正しくありません。");
  return {
    ...C.makeItem(
      reward.canonicalType,
      id,
      null,
      null,
      reward.width,
      reward.height,
    ),
    appearanceId: reward.appearanceId,
    provenanceId: reward.provenanceId,
  };
}
