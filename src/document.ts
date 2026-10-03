import { PARTS as P, WIDTH, HEIGHT } from "./part-registry.js";
import type {
  CompositionNode,
  DocumentAnalysis,
  Item,
  ItemRect,
  PlacedItem,
  Rect,
} from "./types.js";

/* Pure spatial document. The composition tree is shared by rendering and combat. */

const EPS = 1;
const finite = (n: unknown): n is number => Number.isFinite(n),
  near = (a: number, b: number, t = EPS) => Math.abs(a - b) <= t;
function makeItem(
  type: string,
  id: string,
  x: number | null = null,
  y: number | null = null,
  w?: number,
  h?: number,
): Item {
  const p = P[type];
  if (!p) throw new Error("Unknown part " + type);
  return {
    id: String(id),
    type,
    x,
    y,
    w: w ?? p.w,
    h: h ?? p.h,
    shape: "source",
    label: "",
  };
}
function placed(p: Item | null | undefined): p is PlacedItem {
  return !!p && Object.hasOwn(P, p.type) && finite(p.x) && finite(p.y);
}
function rect(p: PlacedItem): Rect;
function rect(p: Item): ItemRect;
function rect(p: Item): ItemRect {
  return { x: p.x, y: p.y, w: p.w ?? P[p.type].w, h: p.h ?? P[p.type].h };
}
// Geometry operators coerce null coordinates to zero in JavaScript. Keep the
// public rect() result nullable while making that arithmetic explicit here.
function numericRect(p: Item): Rect {
  const r = rect(p);
  return { x: r.x ?? 0, y: r.y ?? 0, w: r.w, h: r.h };
}
function area(p: Item) {
  const r = numericRect(p);
  return r.w * r.h;
}
function overlaps(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.w - EPS &&
    a.x + a.w > b.x + EPS &&
    a.y < b.y + b.h - EPS &&
    a.y + a.h > b.y + EPS
  );
}
function contains(a: Rect, b: Rect) {
  return (
    b.x >= a.x - EPS &&
    b.y >= a.y - EPS &&
    b.x + b.w <= a.x + a.w + EPS &&
    b.y + b.h <= a.y + a.h + EPS
  );
}
function inner(p: Item) {
  const r = numericRect(p),
    pad = P[p.type].padding || [0, 0, 0, 0];
  return {
    x: r.x + pad[3],
    y: r.y + pad[0],
    w: r.w - pad[1] - pad[3],
    h: r.h - pad[0] - pad[2],
  };
}
function canContain(parent: Item, child: Item) {
  return (
    !!P[parent.type].container &&
    parent.id !== child.id &&
    area(parent) > area(child) &&
    contains(inner(parent), numericRect(child))
  );
}
function canPlace(
  board: Item[],
  item: Item,
  x: number | null,
  y: number | null,
  w = item.w ?? P[item.type]?.w,
  h = item.h ?? P[item.type]?.h,
) {
  const d = P[item.type];
  if (
    !d ||
    !finite(x) ||
    !finite(y) ||
    !finite(w) ||
    !finite(h) ||
    x < 0 ||
    y < 0 ||
    w < d.minW ||
    h < d.minH ||
    w > d.maxW ||
    h > d.maxH ||
    x + w > WIDTH ||
    y + h > HEIGHT
  )
    return false;
  const n = { ...item, x, y, w, h };
  return !board.some(
    (q) =>
      q.id !== item.id &&
      placed(q) &&
      overlaps(numericRect(n), numericRect(q)) &&
      !canContain(q, n) &&
      !canContain(n, q),
  );
}
function parentsOf(board: Item[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of board) {
    const c = board
      .filter((q) => canContain(q, p))
      .sort((a, b) => area(a) - area(b) || a.id.localeCompare(b.id));
    if (c[0]) map[p.id] = c[0].id;
  }
  return map;
}
function descendants(board: Item[], id: string) {
  const par = parentsOf(board.filter(placed)),
    out: string[] = [];
  function visit(pid: string) {
    for (const [c, p] of Object.entries(par))
      if (p === pid) {
        out.push(c);
        visit(c);
      }
  }
  visit(id);
  return out;
}
function moveMany(board: Item[], ids: string[], dx: number, dy: number) {
  if (
    !finite(dx) ||
    !finite(dy) ||
    ids.some((id) => !placed(board.find((p) => p.id === id)))
  )
    return false;
  const set = new Set(ids);
  for (const id of ids) for (const c of descendants(board, id)) set.add(c);
  const next = board.map((p) =>
    set.has(p.id) ? { ...p, x: p.x! + dx, y: p.y! + dy } : p,
  );
  for (const p of next.filter(placed))
    if (!canPlace(next, p, p.x, p.y)) return false;
  for (const p of board)
    if (set.has(p.id)) {
      p.x! += dx;
      p.y! += dy;
    }
  return true;
}
function isControl(p: Item) {
  return ["button", "search", "field", "toggle"].includes(P[p.type].layout);
}
function isNav(p: Item) {
  return P[p.type].layout === "link";
}
function isMediaSource(type?: string) {
  return !!type && P[type]?.layout === "media" && P[type].tags.includes("video");
}
function nearEdge(a: Item, b: Item, gap = 28) {
  const r = numericRect(a),
    s = numericRect(b);
  const vx = Math.min(r.x + r.w, s.x + s.w) - Math.max(r.x, s.x),
    vy = Math.min(r.y + r.h, s.y + s.h) - Math.max(r.y, s.y);
  return (
    (vy > 4 &&
      Math.min(Math.abs(r.x + r.w - s.x), Math.abs(s.x + s.w - r.x)) <= gap) ||
    (vx > 4 &&
      Math.min(Math.abs(r.y + r.h - s.y), Math.abs(s.y + s.h - r.y)) <= gap)
  );
}
function bounding(nodes: (CompositionNode | Item)[]): Rect {
  const rs = nodes.map((n) => ("box" in n ? n.box : numericRect(n))),
    x = Math.min(...rs.map((r) => r.x)),
    y = Math.min(...rs.map((r) => r.y));
  return {
    x,
    y,
    w: Math.max(...rs.map((r) => r.x + r.w)) - x,
    h: Math.max(...rs.map((r) => r.y + r.h)) - y,
  };
}
function partNode(p: Item): CompositionNode {
  return {
    id: p.id,
    kind: "part",
    type: p.type,
    items: [p.id],
    box: numericRect(p),
    children: [],
  };
}
function group(kind: string, children: CompositionNode[]): CompositionNode {
  return {
    id: "g:" + children.flatMap((n) => n.items).join("|"),
    kind,
    items: children.flatMap((n) => n.items),
    box: bounding(children),
    children,
  };
}
function analyze(input: Item[]): DocumentAnalysis {
  const board = input.filter(placed),
    byId = Object.fromEntries(board.map((p) => [p.id, p])),
    parents = parentsOf(board),
    groups: CompositionNode[] = [],
    nodes: Record<string, CompositionNode> = {},
    member: Record<string, CompositionNode[]> = {},
    nearMap: Record<string, Set<string>> = Object.fromEntries(
      board.map((p) => [p.id, new Set<string>()]),
    );
  function edge(a: string, b: string) {
    if (a !== b) {
      nearMap[a].add(b);
      nearMap[b].add(a);
    }
  }
  for (const a of board)
    for (const b of board)
      if (
        a.id < b.id &&
        (nearEdge(a, b) || parents[a.id] === b.id || parents[b.id] === a.id)
      )
        edge(a.id, b.id);
  function compose(siblings: PlacedItem[]): CompositionNode[] {
    let roots = siblings.map((p) => {
      const n = partNode(p);
      nodes[p.id] = n;
      const children = board.filter((q) => parents[q.id] === p.id);
      if (children.length) n.children = compose(children);
      return n;
    });
    const consumed = new Set<string>(),
      rows: CompositionNode[] = [];
    for (const n of [...roots].sort(
      (a, b) => a.box.y - b.box.y || a.box.x - b.box.x,
    )) {
      if (consumed.has(n.id)) continue;
      const p = byId[n.id],
        control = isControl(p),
        nav = isNav(p);
      if (!control && !nav) continue;
      const chain = [n];
      let last = n;
      for (;;) {
        const next = roots.find(
          (q) =>
            !consumed.has(q.id) &&
            !chain.includes(q) &&
            q.kind === "part" &&
            (control ? isControl(byId[q.id]) : isNav(byId[q.id])) &&
            near(q.box.y, last.box.y) &&
            near(q.box.h, last.box.h) &&
            q.box.x >= last.box.x + last.box.w - EPS &&
            q.box.x - (last.box.x + last.box.w) <= 8,
        );
        if (!next) break;
        chain.push(next);
        last = next;
      }
      if (chain.length > 1) {
        chain.forEach((c) => consumed.add(c.id));
        const kind = nav
          ? "nav-row"
          : chain.some((c) => c.type && P[c.type].layout === "search")
            ? "search-form"
            : "button-group";
        rows.push(group(kind, chain));
      }
    }
    roots = roots.filter((n) => !consumed.has(n.id)).concat(rows);
    // Vertical links become a real menu; no inventory card is introduced.
    const used = new Set<string>(),
      menus: CompositionNode[] = [];
    for (const n of roots
      .filter((n) => n.kind === "part" && isNav(byId[n.id]))
      .sort((a, b) => a.box.y - b.box.y)) {
      if (used.has(n.id)) continue;
      const chain = [n];
      let last = n;
      for (;;) {
        const next = roots.find(
          (q) =>
            q.kind === "part" &&
            !used.has(q.id) &&
            !chain.includes(q) &&
            isNav(byId[q.id]) &&
            near(q.box.x, last.box.x) &&
            near(q.box.w, last.box.w) &&
            q.box.y >= last.box.y + last.box.h - EPS &&
            q.box.y - (last.box.y + last.box.h) <= 8,
        );
        if (!next) break;
        chain.push(next);
        last = next;
      }
      if (chain.length > 1) {
        chain.forEach((c) => used.add(c.id));
        menus.push(group("nav-menu", chain));
      }
    }
    roots = roots.filter((n) => !used.has(n.id)).concat(menus);
    // Recognize source-native composite patterns, not simply any touching rectangles.
    const attached = new Set<string>(),
      stacks: CompositionNode[] = [];
    for (const n of roots) {
      if (attached.has(n.id)) continue;
      const start =
        isMediaSource(n.type)
          ? "media-stack"
          : n.type === "am_product"
            ? "commerce-stack"
            : n.kind === "search-form" || n.type === "go_search" || n.type === "go_instant"
              ? "search-stack"
              : null;
      if (!start) continue;
      const chain = [n];
      let last = n;
      for (let depth = 0; depth < 3; depth++) {
        const next = roots.find(
          (q) =>
            q !== n &&
            !attached.has(q.id) &&
            !chain.includes(q) &&
            near(q.box.x, n.box.x) &&
            q.box.w <= n.box.w + EPS &&
            q.box.y >= last.box.y + last.box.h - EPS &&
            q.box.y - (last.box.y + last.box.h) <= 8 &&
            (start === "media-stack"
              ? q.type === "yt_progress" ||
                q.items.every((id) => isControl(byId[id]))
              : start === "commerce-stack"
                ? q.items.some((id) =>
                    P[byId[id].type].tags.includes("commerce"),
                  )
                : q.type === "go_suggest"),
        );
        if (!next) break;
        chain.push(next);
        last = next;
      }
      if (chain.length > 1) {
        chain.forEach((c) => attached.add(c.id));
        stacks.push(group(start, chain));
      }
    }
    roots = roots.filter((n) => !attached.has(n.id)).concat(stacks);
    return roots.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  }
  const roots = compose(board.filter((p) => !parents[p.id]));
  function collect(n: CompositionNode) {
    if (n.kind !== "part") {
      groups.push(n);
      for (const id of n.items) {
        (member[id] ??= []).push(n);
        for (const other of n.items) edge(id, other);
      }
    }
    for (const c of n.children) collect(c);
  }
  roots.forEach(collect);
  const load = board.reduce((s, p) => s + P[p.type].load, 0),
    usedArea = board
      .filter((p) => !parents[p.id])
      .reduce((s, p) => s + area(p), 0);
  return {
    board,
    roots,
    groups,
    nodes,
    parents,
    member,
    near: Object.fromEntries(
      Object.entries(nearMap).map(([k, v]) => [k, [...v]]),
    ),
    load,
    freeRatio: Math.max(0, 1 - usedArea / (WIDTH * HEIGHT)),
  };
}
// How far down a vertical composite (player / product) already extends.
function stackBottom(board: Item[], anchor: Item) {
  const s = numericRect(anchor);
  let bottom = s.y + s.h;
  for (let i = 0; i < 4; i++) {
    const row = board.filter(
      (q) =>
        placed(q) &&
        q.id !== anchor.id &&
        Math.abs(q.y - bottom) <= 2 &&
        q.x >= s.x - EPS &&
        q.x < s.x + s.w,
    );
    if (!row.length) break;
    bottom = Math.max(...row.map((q) => q.y! + q.h));
  }
  return bottom;
}
function rowRight(board: Item[], start: Item) {
  const r = numericRect(start);
  let right = r.x + r.w;
  for (let i = 0; i < 8; i++) {
    const n = board.find(
      (q) =>
        placed(q) &&
        q.id !== start.id &&
        isControl(q) &&
        Math.abs(q.y - r.y) <= 1 &&
        Math.abs(q.x - right) <= 8,
    );
    if (!n) break;
    right = n.x! + n.w;
  }
  return right;
}
// Magnetic, structure-aware snapping: every option corresponds to a composite analyze() recognises.
type SnapGuide = { axis: "x" | "y"; value: number };
type SnapResult = Rect & {
  guides: SnapGuide[];
  hint: string;
  score?: number;
  target?: string;
  container?: string;
  exactH?: boolean;
};
type SnapOffer = Rect & {
  score: number;
  hint: string;
  target: string;
  container?: string;
  exactH?: boolean;
  guides?: SnapGuide[];
};
function snap(
  board: Item[],
  item: Item,
  x: number,
  y: number,
  { disabled = false }: { disabled?: boolean } = {},
): SnapResult {
  const r = numericRect(item),
    d = P[item.type],
    candidate: SnapResult = {
      x: Math.round(Math.max(0, Math.min(WIDTH - r.w, x))),
      y: Math.round(Math.max(0, Math.min(HEIGHT - r.h, y))),
      w: r.w,
      h: r.h,
      guides: [],
      hint: "",
    };
  if (disabled) return candidate;
  const others = board.filter(placed).filter((q) => q.id !== item.id),
    options: SnapResult[] = [];
  function offer(o: SnapOffer) {
    const w = Math.round(Math.max(d.minW, Math.min(d.maxW, o.w))),
      h = Math.round(Math.max(d.minH, Math.min(d.maxH, o.h)));
    if (o.exactH && h !== o.h) return;
    if (canPlace(others, item, o.x, o.y, w, h))
      options.push({ guides: [], ...o, w, h });
  }
  const cx = x + r.w / 2,
    cy = y + Math.min(r.h / 2, 24);
  for (const q of others) {
    const s = numericRect(q),
      qd = P[q.type];
    // [ A | B ] rows: button groups, search forms, nav rows.
    if ((isControl(item) && isControl(q)) || (isNav(item) && isNav(q)))
      for (const side of ["right", "left"]) {
        const nx = side === "right" ? s.x + s.w : s.x - r.w,
          ny = s.y,
          dist = Math.hypot(nx - x, (ny - y) * 1.4);
        if (dist < 60)
          offer({
            x: nx,
            y: ny,
            w: r.w,
            h: s.h,
            exactH: true,
            score: dist,
            target: q.id,
            hint: isNav(item)
              ? "ナビゲーションに連結"
              : item.type === "go_search" ||
                  q.type === "go_search" ||
                  P[item.type].layout === "search"
                ? "検索フォームに連結"
                : "ボタングループに連結",
            guides: [
              { axis: "x", value: side === "right" ? nx : s.x },
              { axis: "y", value: ny },
            ],
          });
      }
    // Stacked links become a menu.
    if (isNav(item) && isNav(q))
      for (const below of [true, false]) {
        const nx = s.x,
          ny = below ? s.y + s.h : s.y - r.h,
          dist = Math.hypot(nx - x, ny - y);
        if (dist < 48)
          offer({
            x: nx,
            y: ny,
            w: s.w,
            h: r.h,
            score: dist + 2,
            target: q.id,
            hint: "縦ナビに連結",
            guides: [
              { axis: "x", value: s.x },
              { axis: "y", value: below ? ny : s.y },
            ],
          });
      }
    // Video → seek bar → control row.
    if (
      isMediaSource(q.type) &&
      (item.type === "yt_progress" || isControl(item))
    ) {
      const hasSeek = others.some(
        (o) =>
          o.type === "yt_progress" &&
          Math.abs(o.y - (s.y + s.h)) <= 2 &&
          Math.abs(o.x - s.x) <= 2,
      );
      const ny =
          item.type === "yt_progress" && !hasSeek
            ? s.y + s.h
            : stackBottom(others, q),
        nx = s.x,
        dist = Math.hypot(nx - x, ny - y);
      if (dist < 64)
        offer({
          x: nx,
          y: ny,
          w: item.type === "yt_progress" ? s.w : r.w,
          h: r.h,
          score: dist * 0.8,
          target: q.id,
          hint:
            item.type === "yt_progress"
              ? "シークバーとして動画に連結"
              : "動画プレイヤーの操作列に連結",
          guides: [
            { axis: "x", value: s.x },
            { axis: "y", value: ny },
          ],
        });
    }
    // Search box / form → suggestion dropdown.
    if (item.type === "go_suggest" && (q.type === "go_search" || q.type === "go_instant")) {
      const nx = s.x,
        ny = s.y + s.h,
        w = rowRight(others, q) - s.x,
        dist = Math.hypot(nx - x, ny - y);
      if (dist < 64)
        offer({
          x: nx,
          y: ny,
          w,
          h: r.h,
          score: dist * 0.8,
          target: q.id,
          hint: "検索候補として連結",
          guides: [
            { axis: "x", value: nx },
            { axis: "y", value: ny },
          ],
        });
    }
    // Product → buy box.
    if (
      q.type === "am_product" &&
      item.type !== "am_product" &&
      d.tags.includes("commerce")
    ) {
      const ny = stackBottom(others, q),
        nx = s.x,
        dist = Math.hypot(nx - x, ny - y);
      if (dist < 64 && r.w <= s.w)
        offer({
          x: nx,
          y: ny,
          w: r.w,
          h: r.h,
          score: dist * 0.8,
          target: q.id,
          hint: "商品ページの購入欄に連結",
          guides: [
            { axis: "x", value: s.x },
            { axis: "y", value: ny },
          ],
        });
    }
    // Containers swallow components dropped on or near their body.
    if (qd.container && !d.container) {
      const inn = inner(q),
        pad = 24;
      if (
        cx > inn.x - pad &&
        cx < inn.x + inn.w + pad &&
        cy > inn.y - pad &&
        cy < inn.y + inn.h + pad
      ) {
        const w = Math.min(r.w, inn.w),
          h = r.h,
          clampX = (v: number) =>
            Math.max(inn.x, Math.min(inn.x + inn.w - w, v)),
          clampY = (v: number) =>
            Math.max(inn.y, Math.min(inn.y + inn.h - h, v)),
          hint = qd.name + "の中に入れる" + (w < r.w ? "（幅を合わせる）" : ""),
          before = options.length;
        offer({
          x: Math.round(clampX(x)),
          y: Math.round(clampY(y)),
          w,
          h,
          score: 14,
          target: q.id,
          container: q.id,
          hint,
        });
        if (options.length === before) {
          const kids = others.filter(
              (o) => o.id !== q.id && contains(inn, numericRect(o)),
            ),
            bottom = kids.length
              ? Math.max(...kids.map((o) => o.y + o.h)) + 8
              : inn.y;
          offer({
            x: inn.x,
            y: bottom,
            w,
            h,
            score: 16,
            target: q.id,
            container: q.id,
            hint,
          });
        }
      }
    }
  }
  if (options.length) return options.sort((a, b) => a.score! - b.score!)[0];
  for (const axis of ["x", "y"] as const) {
    let best = 9,
      v = candidate[axis],
      guide = null;
    const size: "w" | "h" = axis === "x" ? "w" : "h";
    const anchors = [32, axis === "x" ? WIDTH - 32 : HEIGHT - 24];
    for (const q of others) {
      const s = numericRect(q);
      anchors.push(s[axis], s[axis] + s[size], s[axis] + s[size] / 2);
    }
    for (const a of anchors)
      for (const offset of [0, r[size], r[size] / 2]) {
        const value = a - offset,
          dd = Math.abs(value - candidate[axis]);
        if (
          dd < best &&
          value >= 0 &&
          value + r[size] <= (axis === "x" ? WIDTH : HEIGHT)
        ) {
          best = dd;
          v = value;
          guide = a;
        }
      }
    candidate[axis] = Math.round(v);
    if (guide !== null) candidate.guides.push({ axis, value: guide });
  }
  return candidate;
}
function findSpace(board: Item[], item: Item) {
  for (let y = 16; y + item.h <= HEIGHT; y += 16)
    for (let x = 32; x + item.w <= WIDTH; x += 16)
      if (canPlace(board, item, x, y)) return { x, y };
  return null;
}
const api = {
  makeItem,
  placed,
  rect,
  area,
  inner,
  contains,
  canContain,
  canPlace,
  nearEdge,
  parentsOf,
  descendants,
  moveMany,
  analyze,
  snap,
  findSpace,
  isControl,
  isNav,
  bounding,
};
export default api;
