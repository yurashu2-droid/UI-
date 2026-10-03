import D from "./data.js";
import C from "./document.js";
import R from "./run.js";
import V from "./components.js";
import E from "./engine.js";
import type { Item, Run, Rect } from "./types.js";

/* Pixel document editing. Geometry changes are atomic; DOM groups are derived. */

const clone = <T>(o: T): T => structuredClone(o);
function restoreRun(run: Run, snapshot: Run): void {
  // Keep the app's live object, but do not retain optional fields absent before.
  for (const key of Object.keys(run))
    if (!Object.hasOwn(snapshot, key)) Reflect.deleteProperty(run, key);
  Object.assign(run, snapshot);
}
type ItemPatch = Partial<Pick<Item, "w" | "h" | "label" | "shape">> & {
  x?: number;
  y?: number;
};
type PlacedItem = Item & { x: number; y: number };
const isPlaced = (p: Item | null | undefined): p is PlacedItem =>
  !!p && C.placed(p) && typeof p.x === "number" && typeof p.y === "number";
type CommitResult = boolean | { ok: boolean; error?: string };
type Pending = { type: string; id?: never } | { id: string; type?: never };
type DragKind = "resize" | "new" | "stash" | "move" | "blank";
interface Proposal extends Rect {
  guides?: { axis: "x" | "y"; value: number }[];
  hint?: string;
}
interface Coordinates {
  x: number;
  y: number;
  scale: number;
  r: DOMRect;
}
interface DragState {
  kind: DragKind;
  item: Item | null;
  ids: string[];
  handle: string;
  startX: number;
  startY: number;
  start: Coordinates;
  active: boolean;
  proposal: Proposal | null;
  pointer: number;
  pending: Pending | null;
  shift: boolean;
  offsetX: number;
  offsetY: number;
  valid: boolean;
  liveIds: string[];
  test: Item[] | null;
}
export interface EditorOptions {
  getRun: () => Run;
  getHost: () => HTMLElement;
  getOverlay: () => HTMLElement | null;
  enabled: () => boolean;
  onChange: () => void;
  onSelect: () => void;
  onToast: (message: string) => void;
  paint: (board: Item[], lifted: string[]) => void;
}
function validAll(board: Item[]): boolean {
  return (
    board.every((p) => {
      const d = D.PARTS[p.type];
      return (
        d &&
        Number.isFinite(p.w) &&
        Number.isFinite(p.h) &&
        p.w >= d.minW &&
        p.w <= d.maxW &&
        p.h >= d.minH &&
        p.h <= d.maxH
      );
    }) && board.filter(isPlaced).every((p) => C.canPlace(board, p, p.x, p.y))
  );
}
function patchItem(board: Item[], id: string, patch: ItemPatch): boolean {
  const old = board.find((p) => p.id === id);
  if (!old) return false;
  const next = clone(board),
    p = next.find((p) => p.id === id);
  if (!p) return false;
  if (
    "label" in patch &&
    (typeof patch.label !== "string" || patch.label.length > 80)
  )
    return false;
  if (
    "shape" in patch &&
    (typeof patch.shape !== "string" || !Object.hasOwn(D.SKINS, patch.shape))
  )
    return false;
  const dx = patch.x !== undefined && p.x !== null ? patch.x - p.x : 0,
    dy = patch.y !== undefined && p.y !== null ? patch.y - p.y : 0;
  Object.assign(p, patch);
  // Resizing a connected control reflows that one flex row, not the whole page.
  if (
    isPlaced(old) &&
    p.x === old.x &&
    p.y === old.y &&
    (p.w !== old.w || p.h !== old.h)
  ) {
    const info = C.analyze(board),
      row = (info.member[id] || [])
        .filter((g) =>
          ["button-group", "search-form", "nav-row"].includes(g.kind),
        )
        .at(-1);
    if (row)
      for (const rid of row.items) {
        if (rid === id) continue;
        const q = next.find((v) => v.id === rid);
        if (q && isPlaced(q) && q.x > old.x) q.x += p.w - old.w;
        if (q && p.h !== old.h) q.h = p.h;
      }
  }
  if (isPlaced(old) && [dx, dy].every(Number.isFinite))
    for (const cid of C.descendants(board, id)) {
      const q = next.find((v) => v.id === cid);
      if (isPlaced(q)) {
        q.x += dx;
        q.y += dy;
      }
    }
  if (!validAll(next)) return false;
  next.forEach((p, i) => Object.assign(board[i], p));
  return true;
}
function joinSelection(
  board: Item[],
  ids: string[],
  direction: "horizontal" | "vertical" = "horizontal",
): boolean {
  const parts = board
    .filter((p): p is PlacedItem => ids.includes(p.id) && isPlaced(p))
    .sort((a, b) => (direction === "horizontal" ? a.x - b.x : a.y - b.y));
  if (parts.length < 2 || parts.some((p) => D.PARTS[p.type].container))
    return false;
  const next = clone(board),
    first = parts[0];
  if (!first) return false;
  let x = first.x,
    y = first.y;
  const minHeight = Math.max(...parts.map((p) => D.PARTS[p.type].minH)),
    height = Math.max(first.h, minHeight);
  for (const part of parts) {
    const p = next.find((q) => q.id === part.id);
    if (!p) return false;
    p.x = x;
    p.y = y;
    if (direction === "horizontal") {
      p.h = height;
      x += p.w;
    } else {
      p.w = first.w;
      y += p.h;
    }
  }
  if (
    !validAll(next) ||
    next.some((p) => {
      const d = D.PARTS[p.type];
      return (
        !Number.isFinite(p.w) ||
        !Number.isFinite(p.h) ||
        p.w < d.minW ||
        p.w > d.maxW ||
        p.h < d.minH ||
        p.h > d.maxH
      );
    })
  )
    return false;
  next.forEach((p, i) => Object.assign(board[i], p));
  return true;
}
function duplicateSelection(
  run: Run,
  ids: string[],
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (run.mode !== "lab")
    return { ok: false, error: "遠征ではストアから購入してください。" };
  const all = new Set(ids);
  for (const id of ids)
    for (const child of C.descendants(run.owned, id)) all.add(child);
  const selected = run.owned.filter((p) => all.has(p.id));
  if (!selected.length || run.owned.length + selected.length > D.MAX_ITEMS)
    return { ok: false, error: "所持上限64個です。" };
  const copies: Item[] = selected.map((p) => ({
    ...R.nextItem(run, p.type, null, null, p.w, p.h),
    shape: p.shape,
    label: p.label,
  }));
  const positioned = selected.filter(isPlaced);
  let found = false;
  if (positioned.length) {
    const box = C.bounding(positioned);
    outer: for (let y = 16; y + box.h <= D.HEIGHT; y += 16)
      for (let x = 32; x + box.w <= D.WIDTH; x += 16) {
        for (let i = 0; i < copies.length; i++) {
          const source = selected[i];
          if (isPlaced(source)) {
            copies[i].x = x + source.x - box.x;
            copies[i].y = y + source.y - box.y;
          }
        }
        if (validAll(run.owned.concat(copies))) {
          found = true;
          break outer;
        }
      }
  }
  if (!found)
    for (const p of copies) {
      p.x = null;
      p.y = null;
    }
  run.owned.push(...copies);
  return { ok: true, ids: copies.map((p) => p.id) };
}
export class Editor {
  o: EditorOptions;
  selection: Set<string>;
  history: Run[];
  future: Run[];
  pending: Pending | null;
  drag: DragState | null;
  suppressClick: boolean;
  raf = 0;
  constructor(options: EditorOptions) {
    this.o = options;
    this.selection = new Set<string>();
    this.history = [];
    this.future = [];
    this.pending = null;
    this.drag = null;
    this.suppressClick = false;
    document.addEventListener("pointerdown", (e) => this.down(e));
    document.addEventListener("pointermove", (e) => this.motion(e));
    document.addEventListener("pointerup", (e) => this.up(e));
    document.addEventListener("pointercancel", () => this.cancelDrag());
    document.addEventListener("keydown", (e) => this.key(e));
    document.addEventListener("click", (e) => {
      if (!this.o.enabled() || this.suppressClick) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const add = target.closest<HTMLElement>("[data-add-type]");
      if (add) {
        if (add.dataset.addType) this.add(add.dataset.addType);
        return;
      }
      const pal = target.closest<HTMLElement>("[data-palette-type]");
      if (pal?.dataset.paletteType) {
        this.pending = { type: pal.dataset.paletteType };
        this.selection.clear();
        this.o.onSelect();
        this.o.onToast(
          "ページ上をクリックして配置。ドラッグでも配置できます。",
        );
        return;
      }
      const st = target.closest<HTMLElement>("[data-stash-id]");
      if (st?.dataset.stashId) {
        this.select([st.dataset.stashId]);
        this.pending = { id: st.dataset.stashId };
        this.o.onToast("ページの空いている場所をクリックして配置。");
      }
    });
  }
  get run() {
    return this.o.getRun();
  }
  get board() {
    return this.run.owned;
  }
  get host() {
    return this.o.getHost();
  }
  get overlay() {
    return this.o.getOverlay();
  }
  snapshot(): Run {
    return clone(this.run);
  }
  reset() {
    this.history = [];
    this.future = [];
    this.selection.clear();
    this.pending = null;
    this.cancelDrag();
  }
  commit(fn: () => CommitResult, message = ""): boolean {
    if (!this.o.enabled()) return false;
    const before = this.snapshot(),
      result = fn();
    if (
      result === false ||
      (typeof result === "object" && result.ok === false)
    ) {
      restoreRun(this.run, before);
      this.o.onToast(
        (typeof result === "object" ? result.error : undefined) ||
          "ここには配置できません。重なり・ページの端を確認してください。",
      );
      return false;
    }
    if (JSON.stringify(before) === JSON.stringify(this.run)) return true;
    this.history.push(before);
    if (this.history.length > 60) this.history.shift();
    this.future = [];
    this.o.onChange();
    if (message) this.o.onToast(message);
    return true;
  }
  undo() {
    if (!this.history.length || !this.o.enabled()) return;
    this.future.push(this.snapshot());
    restoreRun(this.run, this.history.pop()!);
    this.selection.clear();
    this.o.onChange();
  }
  redo() {
    if (!this.future.length || !this.o.enabled()) return;
    this.history.push(this.snapshot());
    restoreRun(this.run, this.future.pop()!);
    this.selection.clear();
    this.o.onChange();
  }
  select(ids: string[]): void {
    this.selection = new Set(
      ids.filter((id) => this.board.some((p) => p.id === id)),
    );
    this.pending = null;
    this.o.onSelect();
  }
  selected() {
    return this.board.filter((p) => this.selection.has(p.id));
  }
  groupSelect(id: string) {
    const p = this.board.find((q) => q.id === id);
    if (!p) return;
    const info = C.analyze(this.board),
      groups = info.member[id] || [];
    if (groups.length) this.select(groups[0].items);
    else if (D.PARTS[p.type].container)
      this.select([id, ...C.descendants(this.board, id)]);
    else this.select([id]);
  }
  update(patch: ItemPatch): void {
    const p = this.selected()[0];
    if (p) this.commit(() => patchItem(this.board, p.id, patch));
  }
  updateAll(patch: ItemPatch): void {
    const ids = this.selected()
      .filter((p) => D.SKINNABLE.includes(D.PARTS[p.type].layout))
      .map((p) => p.id);
    if (ids.length)
      this.commit(
        () => ids.every((id) => patchItem(this.board, id, patch)),
        "スタイルをまとめて変更しました。",
      );
  }
  join(direction: "horizontal" | "vertical"): void {
    this.commit(
      () => joinSelection(this.board, [...this.selection], direction),
      direction === "horizontal"
        ? "同じ高さで連結しました。"
        : "縦に整列しました。",
    );
  }
  stash() {
    const ids = [...this.selection];
    this.commit(() => {
      for (const id of ids)
        R.move(this.run, id, null, null, undefined, undefined);
      return true;
    }, "未配置のUIに戻しました。");
    this.selection.clear();
    this.o.onSelect();
  }
  remove() {
    const ids = [...this.selection];
    this.commit(
      () => {
        for (const id of ids) {
          const result = R.sell(this.run, id);
          if (!result.ok) return result;
        }
        return true;
      },
      this.run.mode === "lab" ? "UIを削除しました。" : "UIを売却しました。",
    );
    this.selection.clear();
    this.o.onSelect();
  }
  duplicate() {
    this.commit(() => {
      const out = duplicateSelection(this.run, [...this.selection]);
      if (!out.ok) return out;
      this.selection = new Set(out.ids);
      return true;
    }, "まとまりを保って複製しました。空きがなければ未配置に保存されます。");
  }
  add(type: string): void {
    this.commit(() => {
      const out = R.purchase(this.run, type);
      if (!out.ok) return out;
      if (!("item" in out) || !out.item) return false;
      const s = C.findSpace(this.board, out.item);
      if (s) Object.assign(out.item, s);
      this.selection = new Set([out.item.id]);
      return true;
    }, "UIを追加しました。");
  }
  coords(e: PointerEvent): Coordinates {
    const r = this.host.getBoundingClientRect(),
      scale = r.width / D.WIDTH;
    return {
      x: (e.clientX - r.left) / scale,
      y: (e.clientY - r.top) / scale,
      scale,
      r,
    };
  }
  down(e: PointerEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (
      e.button !== 0 ||
      !this.o.enabled() ||
      (target.closest("input,select,textarea") &&
        !target.closest("#player-body"))
    )
      return;
    const pal = target.closest<HTMLElement>("[data-palette-type]"),
      stash = target.closest<HTMLElement>("[data-stash-id]"),
      handle = target.closest<HTMLElement>(".selection-handle"),
      part = target.closest<HTMLElement>("#player-body .web-node");
    if (target.closest("[data-add-type]")) return;
    let kind: DragKind,
      item: Item | undefined,
      ids: string[] = [];
    if (handle) {
      kind = "resize";
      item = this.selected()[0];
      if (!isPlaced(item)) return;
    } else if (pal?.dataset.paletteType) {
      kind = "new";
      item = C.makeItem(pal.dataset.paletteType, "drag", 0, 0);
    } else if (stash?.dataset.stashId) {
      kind = "stash";
      item = this.board.find((p) => p.id === stash.dataset.stashId);
      if (!item) return;
    } else if (part?.dataset.id) {
      kind = "move";
      item = this.board.find((p) => p.id === part.dataset.id);
      if (!item) return;
      if (e.shiftKey) {
        if (this.selection.has(item.id)) this.selection.delete(item.id);
        else this.selection.add(item.id);
        this.o.onSelect();
        return;
      }
      if (!this.selection.has(item.id)) this.select([item.id]);
      ids = [...this.selection];
    } else if (target.closest("#player-body") || target === this.host) {
      kind = "blank";
    } else return;
    e.preventDefault();
    const c = this.coords(e);
    this.drag = {
      kind,
      item: item ? clone(item) : null,
      ids,
      handle: handle?.dataset.handle ?? "",
      startX: e.clientX,
      startY: e.clientY,
      start: c,
      active: false,
      proposal: null,
      pointer: e.pointerId,
      pending: this.pending ? { ...this.pending } : null,
      shift: e.shiftKey,
      offsetX: 0,
      offsetY: 0,
      valid: false,
      liveIds: [],
      test: null,
    };
    if (item) {
      this.drag.offsetX =
        kind === "move" || kind === "resize" ? c.x - (item.x ?? 0) : item.w / 2;
      this.drag.offsetY =
        kind === "move" || kind === "resize"
          ? c.y - (item.y ?? 0)
          : Math.min(item.h / 2, 24);
    }
    if (kind === "move" || kind === "blank" || kind === "resize") {
      this.host.tabIndex = -1;
      this.host.focus({ preventScroll: true });
    }
    try {
      document.body.setPointerCapture(e.pointerId);
    } catch {}
  }
  motion(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointer) return;
    const distance = Math.hypot(
      e.clientX - drag.startX,
      e.clientY - drag.startY,
    );
    if (!drag.active && distance < 5) return;
    drag.active = true;
    e.preventDefault();
    const c = this.coords(e),
      o = this.overlay;
    if (!o) return;
    if (drag.kind === "blank") {
      const box = {
        x: Math.min(c.x, drag.start.x),
        y: Math.min(c.y, drag.start.y),
        w: Math.abs(c.x - drag.start.x),
        h: Math.abs(c.y - drag.start.y),
      };
      drag.proposal = box;
      o.innerHTML = `<div class="marquee-selection" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px"></div>`;
      return;
    }
    const p = drag.item;
    if (!p) return;
    let prop: Proposal;
    let test: Item[];
    if (drag.kind === "resize") {
      const dx = Math.round(c.x - drag.start.x),
        dy = Math.round(c.y - drag.start.y);
      if (!isPlaced(p)) return;
      prop = { x: p.x, y: p.y, w: p.w, h: p.h };
      if (drag.handle.includes("e")) prop.w += dx;
      if (drag.handle.includes("s")) prop.h += dy;
      if (drag.handle.includes("w")) {
        prop.x += dx;
        prop.w -= dx;
      }
      if (drag.handle.includes("n")) {
        prop.y += dy;
        prop.h -= dy;
      }
      prop.guides = [];
      prop.hint = "";
      test = clone(this.board);
      drag.valid = patchItem(test, p.id, {
        x: prop.x,
        y: prop.y,
        w: prop.w,
        h: prop.h,
      });
      drag.liveIds = [p.id];
    } else {
      const ignored = new Set(drag.ids.length ? drag.ids : [p.id]);
      for (const id of [...ignored])
        for (const child of C.descendants(this.board, id)) ignored.add(child);
      const other = this.board.filter((q) => !ignored.has(q.id));
      prop = C.snap(other, p, c.x - drag.offsetX, c.y - drag.offsetY, {
        disabled: e.altKey,
      });
      test = clone(this.board);
      if (drag.kind === "move") {
        drag.liveIds = drag.ids;
        if (drag.ids.length === 1 && (prop.h !== p.h || prop.w !== p.w)) {
          drag.valid = patchItem(test, p.id, {
            x: prop.x,
            y: prop.y,
            w: prop.w,
            h: prop.h,
          });
        } else if (isPlaced(p))
          drag.valid = C.moveMany(test, drag.ids, prop.x - p.x, prop.y - p.y);
      } else {
        drag.valid = C.canPlace(other, p, prop.x, prop.y, prop.w, prop.h);
        if (drag.kind === "new") {
          drag.liveIds = ["__drag"];
          test.push({
            ...p,
            id: "__drag",
            x: prop.x,
            y: prop.y,
            w: prop.w,
            h: prop.h,
          });
        } else {
          drag.liveIds = [p.id];
          const target = test.find((q) => q.id === p.id);
          if (target)
            Object.assign(target, {
              x: prop.x,
              y: prop.y,
              w: prop.w,
              h: prop.h,
            });
        }
      }
      if (c.x < 0 || c.y < 0 || c.x > D.WIDTH || c.y > D.HEIGHT)
        drag.valid = false;
    }
    drag.proposal = prop;
    drag.test = drag.valid ? test : null;
    this.queueDraw(drag);
  }
  queueDraw(drag: DragState): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (this.drag === drag && drag.active) this.drawGhost(drag);
    });
  }
  pageBox(el: Element): Rect {
    const r = el.getBoundingClientRect(),
      h = this.host.getBoundingClientRect(),
      k = h.width / D.WIDTH;
    return {
      x: (r.left - h.left) / k,
      y: (r.top - h.top) / k,
      w: r.width / k,
      h: r.height / k,
    };
  }
  // The page itself is re-laid out while dragging: rows merge and containers accept children before the drop.
  drawGhost(drag: DragState): void {
    const p = drag.proposal,
      o = this.overlay;
    if (!o || !p) return;
    const live = drag.valid && drag.test !== null;
    this.o.paint(
      live && drag.test ? drag.test : this.board,
      live ? drag.liveIds : [],
    );
    o.replaceChildren();
    if (!live) {
      const ghost = document.createElement("div");
      ghost.className = "drag-ghost invalid";
      Object.assign(ghost.style, {
        left: p.x + "px",
        top: p.y + "px",
        width: Math.max(1, p.w) + "px",
        height: Math.max(1, p.h) + "px",
      });
      if (drag.item) {
        const el = V.create(
          { ...drag.item, w: p.w, h: p.h },
          { preview: true },
        );
        el.style.width = "100%";
        el.style.height = "100%";
        ghost.append(el);
      }
      o.append(ghost);
    }
    for (const g of p.guides || []) {
      const el = document.createElement("div");
      el.className = "snap-guide axis-" + g.axis;
      el.style[g.axis === "x" ? "left" : "top"] = g.value + "px";
      o.append(el);
    }
    let label = p.hint || "";
    if (live) {
      const first = this.host.querySelector<HTMLElement>(
          `.web-node[data-id="${drag.liveIds[0]}"]`,
        ),
        chain: HTMLElement[] = [];
      let up = first?.closest<HTMLElement>(".ui-composite");
      while (up) {
        chain.push(up);
        up = up.parentElement?.closest<HTMLElement>(".ui-composite");
      }
      const comp = chain.at(-1),
        parent = first?.parentElement?.closest<HTMLElement>(".web-node");
      const target = comp || parent;
      if (target) {
        const b = this.pageBox(target),
          box = document.createElement("div");
        box.className = "forming-box" + (comp ? "" : " is-container");
        Object.assign(box.style, {
          left: b.x + "px",
          top: b.y + "px",
          width: b.w + "px",
          height: b.h + "px",
        });
        const tag = document.createElement("span");
        const parentItem = this.board.find((q) => q.id === parent?.dataset.id);
        tag.textContent = comp
          ? chain
              .map(
                (g) =>
                  Object.entries(E.groupNames).find(
                    ([kind]) => kind === g.dataset.composition,
                  )?.[1] || "グループ",
              )
              .join(" › ") + " を形成"
          : (parentItem ? D.PARTS[parentItem.type]?.name : undefined) +
            " の内側";
        box.append(tag);
        o.append(box);
      }
    }
    const hint = document.createElement("div");
    hint.className =
      "drag-hint" + (drag.valid ? (label ? " is-joining" : "") : " invalid");
    hint.textContent = drag.valid
      ? label ||
        `${Math.round(p.x)}, ${Math.round(p.y)} · ${Math.round(p.w)} × ${Math.round(p.h)}`
      : "この位置には配置できません";
    hint.style.left = Math.min(p.x, 640) + "px";
    hint.style.top =
      (p.y + p.h + 8 > D.HEIGHT - 26 ? Math.max(0, p.y - 30) : p.y + p.h + 8) +
      "px";
    o.append(hint);
  }
  up(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointer) return;
    this.drag = null;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    try {
      document.body.releasePointerCapture(e.pointerId);
    } catch {}
    if (!d.active) {
      if (d.kind === "new" && d.item) {
        this.selection.clear();
        this.pending = { type: d.item.type };
        this.o.onSelect();
        this.o.onToast("ページの空いている場所をクリックして配置。");
      } else if (d.kind === "stash" && d.item) {
        this.select([d.item.id]);
        this.pending = { id: d.item.id };
        this.o.onToast("ページの空いている場所をクリックして配置。");
      }
      if (d.kind === "blank") {
        if (d.pending) {
          this.pending = d.pending;
          this.placePending(this.coords(e));
        } else this.select([]);
      }
      this.drawSelection();
      return;
    }
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 20);
    if (d.kind === "blank") {
      const b = d.proposal;
      if (!b) return;
      this.select(
        this.board
          .filter((p) => C.placed(p) && C.contains(b, C.rect(p)))
          .map((p) => p.id),
      );
      return;
    }
    if (!d.valid) {
      this.o.paint(this.board, []);
      this.drawSelection();
      this.o.onToast(
        "重なり・ページの端により配置できません。元の位置に戻しました。",
      );
      return;
    }
    const p = d.proposal;
    if (!p || !d.item) return;
    const draggedItem = d.item;
    const ok = this.commit(() => {
      if (d.kind === "resize")
        return patchItem(this.board, draggedItem.id, {
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
        });
      if (d.kind === "move") {
        if (
          d.ids.length === 1 &&
          (p.h !== draggedItem.h || p.w !== draggedItem.w)
        )
          return patchItem(this.board, draggedItem.id, {
            x: p.x,
            y: p.y,
            w: p.w,
            h: p.h,
          });
        if (!isPlaced(draggedItem)) return false;
        return C.moveMany(
          this.board,
          d.ids,
          p.x - draggedItem.x,
          p.y - draggedItem.y,
        );
      }
      let item;
      if (d.kind === "new") {
        const out = R.purchase(this.run, draggedItem.type);
        if (!out.ok) return out;
        if (!("item" in out) || !out.item) return false;
        item = out.item;
      } else item = this.board.find((q) => q.id === draggedItem.id);
      if (!item || !R.move(this.run, item.id, p.x, p.y, p.w, p.h)) return false;
      this.selection = new Set([item.id]);
      return true;
    }, p.hint || "");
    this.pending = null;
    this.host.tabIndex = -1;
    this.host.focus({ preventScroll: true });
    if (!ok) this.o.paint(this.board, []);
    else if (p.hint)
      this.celebrate(
        d.kind === "new" ? [...this.selection][0] : draggedItem.id,
      );
    this.drawSelection();
  }
  celebrate(id: string): void {
    const el = this.host.querySelector(`.web-node[data-id="${id}"]`),
      target =
        el?.closest(".ui-composite") ||
        el?.parentElement?.closest(".web-node") ||
        el;
    if (!target) return;
    target.classList.remove("just-joined");
    void (target instanceof HTMLElement ? target.offsetWidth : 0);
    target.classList.add("just-joined");
  }
  placePending(c: Coordinates): void {
    const pending = this.pending;
    if (!pending) return;
    const p = pending.id
      ? this.board.find((q) => q.id === pending.id)
      : pending.type
        ? C.makeItem(pending.type, "drag", 0, 0)
        : undefined;
    if (!p) return;
    const s = C.snap(this.board, p, c.x - p.w / 2, c.y - Math.min(p.h / 2, 24));
    if (!C.canPlace(this.board, p, s.x, s.y, s.w, s.h)) {
      this.o.onToast("空いている場所か、フォームの内側を選んでください。");
      return;
    }
    this.commit(() => {
      let item = p;
      if (pending.type) {
        const out = R.purchase(this.run, pending.type);
        if (!out.ok) return out;
        if (!("item" in out) || !out.item) return false;
        item = out.item;
      }
      if (!R.move(this.run, item.id, s.x, s.y, s.w, s.h)) return false;
      this.selection = new Set([item.id]);
      return true;
    }, s.hint || "配置しました。");
    this.pending = null;
  }
  cancelDrag() {
    const was = this.drag?.active;
    this.drag = null;
    if (was) this.o.paint(this.board, []);
    this.drawSelection();
  }
  drawSelection() {
    const o = this.overlay;
    if (!o || this.drag?.active) return;
    o.replaceChildren();
    if (!this.o.enabled()) return;
    for (const el of this.host.querySelectorAll<HTMLElement>(".web-node"))
      el.classList.toggle(
        "is-selected",
        !!el.dataset.id && this.selection.has(el.dataset.id),
      );
    const selected = this.selected().filter(isPlaced);
    if (!selected.length) return;
    const b = C.bounding(selected),
      box = document.createElement("div");
    box.className = "selection-box";
    Object.assign(box.style, {
      left: b.x + "px",
      top: b.y + "px",
      width: b.w + "px",
      height: b.h + "px",
    });
    const label = document.createElement("div");
    label.className = "selection-label";
    label.textContent =
      selected.length === 1
        ? D.PARTS[selected[0].type].name
        : `${selected.length} 個のUI`;
    box.append(label);
    const dimensions = document.createElement("div");
    dimensions.className = "dimension-label";
    dimensions.textContent = `${Math.round(b.w)} × ${Math.round(b.h)}`;
    box.append(dimensions);
    if (selected.length === 1)
      for (const h of ["nw", "ne", "sw", "se"]) {
        const el = document.createElement("span");
        el.className = "selection-handle handle-" + h;
        el.dataset.handle = h;
        box.append(el);
      }
    o.append(box);
  }
  key(e: KeyboardEvent): void {
    const target = e.target;
    if (
      !this.o.enabled() ||
      (target instanceof Element &&
        target.closest("input,textarea,select,[contenteditable=true]")) ||
      (target instanceof HTMLElement && target.isContentEditable) ||
      document.querySelector("dialog[open]")
    )
      return;
    const mod = e.ctrlKey || e.metaKey;
    if (
      !mod &&
      !e.altKey &&
      !e.isComposing &&
      (e.key === "Enter" || e.key === " ") &&
      target instanceof HTMLElement &&
      target === document.activeElement &&
      target.matches('.web-node[data-side="player"]') &&
      this.host.contains(target)
    ) {
      const item = this.board.find((p) => p.id === target.dataset.id);
      if (!isPlaced(item)) return;
      e.preventDefault();
      // Holding Space must neither scroll nor toggle the same part repeatedly.
      if (e.repeat) return;
      if (e.shiftKey) {
        if (this.selection.has(item.id)) this.selection.delete(item.id);
        else this.selection.add(item.id);
        this.o.onSelect();
      } else if (!this.selection.has(item.id)) this.select([item.id]);
      return;
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? this.redo() : this.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.redo();
      return;
    }
    if (e.key === "Escape") {
      this.pending = null;
      this.cancelDrag();
      this.select([]);
      return;
    }
    if (e.key === "g" || e.key === "G") {
      if (this.selection.size) this.groupSelect([...this.selection][0]);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.stash();
      return;
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      this.duplicate();
      return;
    }
    const delta = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[e.key];
    if (delta && this.selection.size) {
      e.preventDefault();
      const m = e.shiftKey ? 10 : 1;
      this.commit(() =>
        C.moveMany(this.board, [...this.selection], delta[0] * m, delta[1] * m),
      );
    }
  }
}
const api = { Editor, joinSelection, patchItem, duplicateSelection };
export default api;
