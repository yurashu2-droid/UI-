import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import D from "../../src/data.js";
import C from "../../src/document.js";
import E from "../../src/engine.js";
import R from "../../src/run.js";
import { BATTLE_RULES_VERSION } from "../../src/combat-rules.js";
import { arenaCatalogDefinition } from "../../src/online/catalog.js";
import type { BattleSummary, Item, Run } from "../../src/types.js";
import type {
  ArenaRules,
  BuildSnapshot,
  OnlineMatch,
  OnlineView,
  OnlineSideStatistics,
} from "../../src/online/types.js";

export const DEFAULT_ARENA_RULES: ArenaRules = Object.freeze({
  version: "arena-v1",
  rounds: 8,
  lives: 3,
  startingCash: 10,
  baseReward: 6,
  winBonus: 4,
  incomeDivisor: 2,
  incomeCap: 10,
  initialRating: 1000,
  ratingStep: 16,
  snapshotMaxAgeMs: 30 * 24 * 60 * 60 * 1000,
});
// Bump whenever combat behavior changes; shared combat-rules export is integrated below.
const COMBAT_VERSION = BATTLE_RULES_VERSION;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export function onlineRewardPool(run: Run): string[] {
  return Object.keys(D.PARTS).filter(
    (t) =>
      !D.PARTS[t].fused &&
      D.PARTS[t].status !== "experimental" &&
      D.PARTS[t].price <= R.priceCap(run) + 1,
  );
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clone = <T>(value: T): T => structuredClone(value);
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 100): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const catalogHash = () => hash(arenaCatalogDefinition());

export class ArenaError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public detail = code,
  ) {
    super(`${code}: ${detail}`);
  }
}
interface Session {
  runId: string;
  expiresAt: number;
  rating: number;
}
interface Receipt {
  fingerprint: string;
  outcome: { code: string; message: string };
}
interface ServerRun {
  id: string;
  owner: string;
  revision: number;
  state: Run;
  rules: ArenaRules;
  rating: number;
  publishedSnapshotId: string | null;
  pendingMatchId: string | null;
  lastMatchId: string | null;
  tickets: Record<string, string>;
  recentOpponents: string[];
  receipts: Record<string, Receipt>;
  inbox: Item[];
  combatVersion: string;
  catalogHash: string;
}
interface Store {
  version: 1;
  sessions: Record<string, Session>;
  runs: Record<string, ServerRun>;
  snapshots: Record<string, BuildSnapshot>;
  matches: Record<string, OnlineMatch>;
}
const empty = (): Store => ({
  version: 1,
  sessions: {},
  runs: {},
  snapshots: {},
  matches: {},
});

/** Single-process durable arena. Every command commits a whole atomic transaction before acknowledgement. */
export class ArenaService {
  private data: Store;
  private lockPath: string;
  private closed = false;
  private rules: ArenaRules;
  constructor(
    private options: { filePath: string; rules?: Partial<ArenaRules> },
  ) {
    this.rules = { ...DEFAULT_ARENA_RULES, ...options.rules };
    if (
      !Number.isInteger(this.rules.rounds) ||
      this.rules.rounds < 1 ||
      this.rules.rounds > 8 ||
      !Number.isInteger(this.rules.lives) ||
      this.rules.lives < 1 ||
      this.rules.lives > 3
    )
      throw new ArenaError("INVALID_RULES");
    for (const key of [
      "startingCash",
      "baseReward",
      "winBonus",
      "incomeCap",
      "initialRating",
      "ratingStep",
      "snapshotMaxAgeMs",
    ] as const)
      if (!Number.isFinite(this.rules[key]) || this.rules[key] < 0)
        throw new ArenaError("INVALID_RULES");
    if (
      !Number.isFinite(this.rules.incomeDivisor) ||
      this.rules.incomeDivisor <= 0
    )
      throw new ArenaError("INVALID_RULES");
    // Configurable progression is part of compatibility, not merely a human release label.
    this.rules.version = `${this.rules.version}-${hash(this.rules).slice(0, 12)}`;
    mkdirSync(dirname(options.filePath), { recursive: true, mode: 0o700 });
    this.lockPath = options.filePath + ".lock";
    if (existsSync(this.lockPath)) {
      const pid = Number(readFileSync(this.lockPath, "utf8"));
      if (!Number.isInteger(pid) || pid < 1)
        throw new ArenaError("STORE_LOCKED", 503);
      try {
        process.kill(pid, 0);
        throw new ArenaError("STORE_LOCKED", 503);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        // Only a confirmed dead owner is recoverable; a live/unknown process is never displaced.
        if (readFileSync(this.lockPath, "utf8") !== String(pid))
          throw new ArenaError("STORE_LOCKED", 503);
        unlinkSync(this.lockPath);
      }
    }
    const lock = openSync(this.lockPath, "wx", 0o600);
    writeFileSync(lock, String(process.pid));
    closeSync(lock);
    try {
      this.data = existsSync(options.filePath)
        ? JSON.parse(readFileSync(options.filePath, "utf8"))
        : empty();
      if (
        this.data.version !== 1 ||
        !record(this.data.runs) ||
        !record(this.data.sessions) ||
        !record(this.data.snapshots) ||
        !record(this.data.matches)
      )
        throw new ArenaError(
          "STORE_INVALID",
          500,
          "保存データを読み込めません。元データは保持しています。",
        );
    } catch (error) {
      unlinkSync(this.lockPath);
      throw error;
    }
  }
  close() {
    if (!this.closed) {
      this.closed = true;
      unlinkSync(this.lockPath);
    }
  }
  private persist(next: Store) {
    if (this.closed) throw new ArenaError("SERVICE_CLOSED", 503);
    const temp = this.options.filePath + ".tmp";
    const fd = openSync(temp, "w", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(next));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, this.options.filePath);
    const dir = openSync(dirname(this.options.filePath), "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
    this.data = next;
  }
  private auth(token: string, data = this.data) {
    if (!text(token, 128)) throw new ArenaError("SESSION_REQUIRED", 401);
    const key = hash(token),
      session = data.sessions[key];
    if (!session || session.expiresAt <= Date.now())
      throw new ArenaError(
        "SESSION_EXPIRED",
        401,
        "ゲスト接続の有効期限が切れたか、接続を確認できません。前のランを復元した状態ではありません。新しく始める場合は「新しいゲストで開始」を選んでください。",
      );
    return { key, session, run: data.runs[session.runId] };
  }
  private createRun(owner: string, rating: number): ServerRun {
    const state = R.newRun("campaign", "mixed", { tutorial: false });
    state.seed = randomBytes(4).readUInt32BE();
    state.cash = this.rules.startingCash;
    state.lives = this.rules.lives;
    state.shop = R.market(state);
    // Ensure the first shop can always start a run without spending on blind rerolls.
    if (
      !state.shop.some(
        (s) =>
          D.PARTS[s.type]?.kind === "attack" &&
          D.PARTS[s.type].price <= state.cash,
      )
    )
      state.shop[0] = { type: "ab_link", sold: false };
    return {
      id: randomUUID(),
      owner,
      revision: 0,
      state,
      rules: clone(this.rules),
      rating,
      publishedSnapshotId: null,
      pendingMatchId: null,
      lastMatchId: null,
      tickets: {},
      recentOpponents: [],
      receipts: {},
      inbox: [],
      combatVersion: COMBAT_VERSION,
      catalogHash: catalogHash(),
    };
  }
  openSession(existing?: string): { token: string; view: OnlineView } {
    if (existing) {
      this.renewSession(existing);
      return { token: existing, view: this.view(existing) };
    }
    const token = randomBytes(32).toString("base64url"),
      key = hash(token),
      next = clone(this.data);
    const run = this.createRun(key, this.rules.initialRating);
    next.sessions[key] = {
      runId: run.id,
      rating: run.rating,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    next.runs[run.id] = run;
    this.persist(next);
    return { token, view: this.view(token) };
  }
  private renewSession(token: string): void {
    // Authenticate before changing anything: expired guests cannot be revived.
    this.auth(token);
    const next = clone(this.data);
    const { session } = this.auth(token, next);
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    this.persist(next);
  }
  sessionExpiresAt(token: string): number {
    return this.auth(token).session.expiresAt;
  }
  view(token: string): OnlineView {
    const { run } = this.auth(token);
    const state = clone(run.state);
    state.seed = 0; // The shop seed is server state, never accepted from the browser.
    return {
      revision: run.revision,
      online: {
        id: run.id,
        roundLimit: run.rules.rounds,
        rating: run.rating,
        rulesVersion: run.rules.version,
        requiresNewRun:
          run.rules.version !== this.rules.version ||
          run.combatVersion !== COMBAT_VERSION ||
          run.catalogHash !== catalogHash(),
        publishedSnapshotId: run.publishedSnapshotId,
        pendingMatchId: run.pendingMatchId,
        inbox: clone(run.inbox),
      },
      run: state,
      rules: clone(run.rules),
      match:
        run.pendingMatchId || run.lastMatchId
          ? clone(this.data.matches[(run.pendingMatchId || run.lastMatchId)!])
          : null,
    };
  }
  getMatch(token: string, id: string): OnlineMatch {
    const { key } = this.auth(token),
      match = this.data.matches[id];
    if (!match || this.data.runs[match.runId]?.owner !== key)
      throw new ArenaError("MATCH_NOT_OWNED", 404);
    return clone(match);
  }
  command(token: string, input: unknown): OnlineView {
    if (
      !record(input) ||
      !text(input.commandId, 100) ||
      !Number.isInteger(input.expectedRevision) ||
      !text(input.kind, 30)
    )
      throw new ArenaError("INVALID_COMMAND");
    const existing = this.auth(token),
      fingerprint = hash(input),
      prior = existing.run.receipts[input.commandId];
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new ArenaError("COMMAND_ID_REUSED", 409);
      this.renewSession(token);
      return { ...this.view(token), outcome: clone(prior.outcome) };
    }
    const fields: Record<string, string[]> = {
      purchase: ["type"],
      sell: ["id"],
      placement: ["items"],
      reroll: [],
      publish: [],
      match: [],
      "new-run": [],
      inbox: [],
      fuse: ["a", "b"],
      settle: ["matchId"],
      claim: ["matchId", "choice"],
    };
    if (!Object.hasOwn(fields, input.kind))
      throw new ArenaError("UNKNOWN_COMMAND");
    const allowed = new Set([
      "commandId",
      "expectedRevision",
      "kind",
      ...fields[input.kind],
    ]);
    if (
      Object.keys(input).some((key) => !allowed.has(key)) ||
      fields[input.kind].some((key) => !(key in input))
    )
      throw new ArenaError("INVALID_COMMAND");
    for (const key of ["type", "id", "a", "b", "matchId"])
      if (key in input && !text(input[key]))
        throw new ArenaError("INVALID_COMMAND");
    if ("choice" in input && input.choice !== null && !text(input.choice))
      throw new ArenaError("INVALID_COMMAND");
    if (input.expectedRevision !== existing.run.revision)
      throw new ArenaError(
        "STALE_REVISION",
        409,
        "最新の状態を読み込み、操作をやり直してください。",
      );
    const next = clone(this.data),
      { key, session, run } = this.auth(token, next);
    if (
      !["new-run", "settle", "claim"].includes(input.kind) &&
      (run.rules.version !== this.rules.version ||
        run.combatVersion !== COMBAT_VERSION ||
        run.catalogHash !== catalogHash())
    )
      throw new ArenaError(
        "VERSION_MISMATCH",
        409,
        "ルールが更新されました。保存された対戦は閲覧できます。新しいランを開始してください。",
      );
    const outcome = this.apply(next, run, session, input);
    const current = next.runs[session.runId];
    current.revision++;
    current.receipts[input.commandId] = { fingerprint, outcome };
    // Keep a bounded replay window; settled match/round locks remain permanent in this run.
    const ids = Object.keys(current.receipts);
    for (const id of ids.slice(0, Math.max(0, ids.length - 512)))
      delete current.receipts[id];
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    next.sessions[key] = session;
    this.persist(next);
    return { ...this.view(token), outcome };
  }
  private apply(
    data: Store,
    online: ServerRun,
    session: Session,
    input: Record<string, unknown>,
  ) {
    const run = online.state;
    const ok = (code = "OK", message = "保存しました。") => ({ code, message });
    const requireBuild = () => {
      if (run.phase !== "build" || online.pendingMatchId)
        throw new ArenaError("RUN_LOCKED", 409);
    };
    const transaction = (result: { ok: boolean; error?: string }) => {
      if (!result.ok)
        throw new ArenaError("COMMAND_REJECTED", 400, result.error);
    };
    switch (input.kind) {
      case "purchase":
        requireBuild();
        if (!text(input.type)) throw new ArenaError("INVALID_COMMAND");
        transaction(R.purchase(run, input.type));
        break;
      case "sell":
        requireBuild();
        if (!text(input.id)) throw new ArenaError("INVALID_COMMAND");
        transaction(R.sell(run, input.id));
        for (const p of run.owned) if (p.routeTo === input.id) delete p.routeTo;
        break;
      case "reroll":
        requireBuild();
        transaction(R.reroll(run));
        break;
      case "placement": {
        requireBuild();
        if (
          !Array.isArray(input.items) ||
          input.items.length !== run.owned.length ||
          input.items.length > D.MAX_ITEMS
        )
          throw new ArenaError("INVALID_PLACEMENT");
        const byId = new Map<string, Record<string, unknown>>();
        for (const item of input.items) {
          if (
            !record(item) ||
            !text(item.id) ||
            byId.has(item.id) ||
            !run.owned.some((p) => p.id === item.id) ||
            !finite(item.w) ||
            !finite(item.h) ||
            !(
              (finite(item.x) && finite(item.y)) ||
              (item.x === null && item.y === null)
            )
          )
            throw new ArenaError("INVALID_PLACEMENT");
          if (item.routeTo !== undefined && !text(item.routeTo))
            throw new ArenaError("INVALID_PLACEMENT");
          if (
            Object.keys(item).some(
              (k) => !["id", "x", "y", "w", "h", "routeTo"].includes(k),
            )
          )
            throw new ArenaError("INVALID_PLACEMENT");
          byId.set(item.id, item);
        }
        const board = run.owned.map((p) => {
          const v = byId.get(p.id)!;
          return {
            ...p,
            x: v.x as number | null,
            y: v.y as number | null,
            w: v.w as number,
            h: v.h as number,
            routeTo: typeof v.routeTo === "string" ? v.routeTo : undefined,
          };
        });
        for (const p of board) {
          const d = D.PARTS[p.type];
          if (
            p.w < d.minW ||
            p.w > d.maxW ||
            p.h < d.minH ||
            p.h > d.maxH ||
            (p.x !== null && !C.canPlace(board, p, p.x, p.y)) ||
            (p.routeTo !== undefined &&
              (p.routeTo === p.id || !board.some((q) => q.id === p.routeTo)))
          )
            throw new ArenaError("INVALID_PLACEMENT");
        }
        run.owned = board;
        break;
      }
      case "fuse": {
        requireBuild();
        const pair = R.fusionPairs(run.owned, {
          pair: [input.a as string, input.b as string],
        }).find(
          (p) =>
            (p.a.id === input.a && p.b.id === input.b) ||
            (p.a.id === input.b && p.b.id === input.a),
        );
        if (!pair) throw new ArenaError("INVALID_FUSION");
        if (D.PARTS[pair.recipe.into].status === "experimental")
          throw new ArenaError(
            "EXPERIMENTAL_RECIPE",
            400,
            "この合成は実験室のみで利用できます。",
          );
        const fused = R.fuse(run, { pair: [pair.a.id, pair.b.id] });
        if (fused.length !== 1) throw new ArenaError("INVALID_FUSION");
        break;
      }
      case "publish":
        requireBuild();
        this.publish(data, online);
        return ok(
          "PUBLISHED",
          "保存ビルドを公開しました。本人がオフラインでも対戦相手になります。",
        );
      case "match": {
        if (online.pendingMatchId)
          return ok("MATCH_READY", "確定済みの対戦を復元しました。");
        requireBuild();
        const player = this.publish(data, online);
        const candidates = Object.values(data.snapshots).filter(
          (s) =>
            s.ownerRunId !== online.id &&
            data.runs[s.ownerRunId]?.owner !== online.owner &&
            s.rulesVersion === online.rules.version &&
            s.combatVersion === online.combatVersion &&
            s.catalogHash === online.catalogHash &&
            s.round === run.stage &&
            s.resourceTier === player.resourceTier &&
            Date.now() - s.createdAt <= online.rules.snapshotMaxAgeMs,
        );
        if (!candidates.length)
          return ok(
            "NO_OPPONENT",
            "同じラウンドの保存ビルドがまだありません。公開は完了しました。資金・残機は減りません。",
          );
        const fresh = candidates.filter(
          (s) => !online.recentOpponents.includes(s.ownerRunId),
        );
        const pool = fresh.length ? fresh : candidates;
        pool.sort(
          (a, b) =>
            Math.abs(a.wins - run.wins) - Math.abs(b.wins - run.wins) ||
            Math.abs(a.rating - online.rating) -
              Math.abs(b.rating - online.rating) ||
            b.createdAt - a.createdAt,
        );
        const best = pool[0],
          near = pool
            .filter(
              (s) =>
                Math.abs(s.wins - run.wins) ===
                  Math.abs(best.wins - run.wins) &&
                Math.abs(s.rating - online.rating) <=
                  Math.abs(best.rating - online.rating) + 100,
            )
            .slice(0, 20);
        const opponent = near[randomInt(near.length)];
        const match = this.simulate(online, player, opponent);
        data.matches[match.id] = match;
        online.tickets[String(run.stage)] = match.id;
        online.pendingMatchId = match.id;
        online.lastMatchId = match.id;
        run.phase = "battle";
        online.recentOpponents = [
          ...online.recentOpponents,
          opponent.ownerRunId,
        ].slice(-5);
        return ok("MATCH_READY", "保存ビルドとの対戦が確定しました。");
      }
      case "settle": {
        const match =
          typeof input.matchId === "string"
            ? data.matches[input.matchId]
            : undefined;
        if (!match || match.runId !== online.id)
          throw new ArenaError("MATCH_NOT_OWNED", 404);
        if (match.settled)
          return ok("ALREADY_SETTLED", "この結果は反映済みです。");
        if (online.pendingMatchId !== match.id || run.phase !== "battle")
          throw new ArenaError("MATCH_NOT_PENDING", 409);
        run.cash += match.summary.total;
        run.history.push(clone(match.summary));
        run.history = run.history.slice(-30);
        if (match.winner === "player") {
          run.wins++;
          run.phase = "reward";
          run.pending = {
            loot: clone(match.rewardChoices),
            summary: clone(match.summary),
          };
        } else {
          run.lives--;
          if (run.lives <= 0) {
            run.phase = "gameover";
            run.pending = null;
          } else this.advance(online);
          online.pendingMatchId = null;
        }
        online.rating = Math.max(
          0,
          online.rating +
            (match.winner === "draw"
              ? 0
              : match.winner === "player"
                ? online.rules.ratingStep
                : -online.rules.ratingStep),
        );
        session.rating = online.rating;
        match.settled = true;
        return ok("SETTLED", "対戦結果を一度だけ反映しました。");
      }
      case "claim": {
        const match =
          typeof input.matchId === "string"
            ? data.matches[input.matchId]
            : undefined;
        if (!match || match.runId !== online.id)
          throw new ArenaError("MATCH_NOT_OWNED", 404);
        if (match.claimed)
          return ok("ALREADY_CLAIMED", "この報酬は受け取り済みです。");
        if (
          !match.settled ||
          run.phase !== "reward" ||
          !run.pending ||
          online.pendingMatchId !== match.id ||
          !(
            input.choice === null ||
            (typeof input.choice === "string" &&
              run.pending.loot.includes(input.choice))
          )
        )
          throw new ArenaError("INVALID_REWARD");
        if (typeof input.choice === "string") {
          if (input.choice.startsWith("admin:"))
            run.admin.push(input.choice.slice(6));
          else {
            const template = match.rewardItems[input.choice];
            if (!template) throw new ArenaError("INVALID_REWARD");
            const item = { ...clone(template), id: "p" + run.nextId++ };
            if (run.owned.length < D.MAX_ITEMS) run.owned.push(item);
            else online.inbox.push(item);
          }
        }
        match.claimed = true;
        online.pendingMatchId = null;
        this.advance(online);
        return ok("CLAIMED", "報酬を保存しました。");
      }
      case "inbox":
        requireBuild();
        while (online.inbox.length && run.owned.length < D.MAX_ITEMS)
          run.owned.push(online.inbox.shift()!);
        break;
      case "new-run": {
        if (online.pendingMatchId)
          throw new ArenaError(
            "MATCH_NOT_SETTLED",
            409,
            "確定済みの結果と報酬を先に受け取ってください。",
          );
        if (
          run.phase !== "complete" &&
          run.phase !== "gameover" &&
          online.rules.version === this.rules.version &&
          online.catalogHash === catalogHash() &&
          online.combatVersion === COMBAT_VERSION
        )
          throw new ArenaError("RUN_NOT_FINISHED", 409);
        const next = this.createRun(online.owner, session.rating);
        data.runs[next.id] = next;
        session.runId = next.id;
        return ok("NEW_RUN", "新しいオンラインランを始めました。");
      }
      default:
        throw new ArenaError("UNKNOWN_COMMAND");
    }
    online.publishedSnapshotId = null;
    return ok();
  }
  private publish(data: Store, online: ServerRun): BuildSnapshot {
    const run = online.state;
    if (
      !run.owned.some((p) => C.placed(p) && D.PARTS[p.type]?.kind === "attack")
    )
      throw new ArenaError(
        "NO_ATTACKER",
        400,
        "攻撃UIを最低一つ配置してください。",
      );
    if (run.admin.length > R.adminSlots(run))
      throw new ArenaError("ADMIN_LIMIT");
    // Snapshot cosmetics and arbitrary source metadata are deliberately never copied.
    const items = run.owned.filter(C.placed).map((p) => ({
      id: p.id,
      type: p.type,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      shape: "source",
      label: "",
      ...("routeTo" in p && typeof p.routeTo === "string"
        ? { routeTo: p.routeTo }
        : {}),
    }));
    const payload = {
      items,
      admin: [...run.admin],
      capacity: R.capacity(run),
      hp: R.playerHp(run),
    };
    const digest = hash(payload);
    const old =
      online.publishedSnapshotId && data.snapshots[online.publishedSnapshotId];
    if (old && old.buildHash === digest) return old;
    // One current pool entry per run/round, while already assigned tickets retain their immutable copies.
    for (const [id, s] of Object.entries(data.snapshots))
      if (s.ownerRunId === online.id && s.round === run.stage)
        delete data.snapshots[id];
    const snapshot: BuildSnapshot = {
      id: randomUUID(),
      ownerRunId: online.id,
      source: "player",
      createdAt: Date.now(),
      rulesVersion: online.rules.version,
      combatVersion: online.combatVersion,
      catalogHash: online.catalogHash,
      round: run.stage,
      wins: run.wins,
      rating: online.rating,
      resourceTier: run.stage,
      ...payload,
      buildHash: digest,
    };
    data.snapshots[snapshot.id] = snapshot;
    online.publishedSnapshotId = snapshot.id;
    return snapshot;
  }
  private simulate(
    online: ServerRun,
    player: BuildSnapshot,
    opponent: BuildSnapshot,
  ): OnlineMatch {
    const battle = new E.Battle(player.items, opponent.items, {
      playerHp: player.hp,
      enemyHp: opponent.hp,
      playerAdmin: player.admin,
      enemyAdmin: opponent.admin,
      playerCapacity: player.capacity,
      enemyCapacity: opponent.capacity,
    });
    const events = [];
    for (let i = 0; i < 1200 && !battle.result; i++)
      events.push(...battle.step(0.05));
    if (!battle.result) throw new ArenaError("SIMULATION_FAILED", 500);
    const income = Math.min(
      online.rules.incomeCap,
      Math.floor(battle.player.income / online.rules.incomeDivisor),
    );
    const bonus = battle.result.winner === "player" ? online.rules.winBonus : 0;
    const summary: BattleSummary = {
      winner: battle.result.winner,
      time: battle.elapsed,
      enemy: "保存されたプレイヤーのページ",
      round: online.state.stage + 1,
      base: online.rules.baseReward,
      bonus,
      income,
      rawIncome: battle.player.income,
      total: online.rules.baseReward + bonus + income,
      stage: online.state.stage,
      damage: Math.round(battle.player.damage),
      hp: Math.ceil(battle.player.hp),
      maxHp: battle.player.maxHp,
      stats: battle.player.parts.map((p) => ({
        type: p.type,
        id: p.id,
        damage: Math.round(p.damage),
        earned: p.earned,
        shield: p.protected,
        heal: p.healed,
        fires: p.fires,
      })),
    };
    const statistics = Object.fromEntries(
      (["player", "enemy"] as const).map((side) => {
        const s = battle[side];
        return [
          side,
          {
            hp: s.hp,
            maxHp: s.maxHp,
            income: s.income,
            damage: s.damage,
            parts: s.parts.map((p) => ({
              type: p.type,
              id: p.id,
              damage: p.damage,
              earned: p.earned,
              shield: p.protected,
              heal: p.healed,
              fires: p.fires,
            })),
          },
        ];
      }),
    ) as { player: OnlineSideStatistics; enemy: OnlineSideStatistics };
    const id = randomUUID(),
      rewardChoices = this.loot(online, { id });
    const rewardItems = Object.fromEntries(
      rewardChoices
        .filter((type) => !type.startsWith("admin:"))
        .map((type) => [type, C.makeItem(type, "reward")]),
    );
    return {
      id,
      runId: online.id,
      round: online.state.stage,
      createdAt: Date.now(),
      rulesVersion: online.rules.version,
      combatVersion: online.combatVersion,
      catalogHash: online.catalogHash,
      player: clone(player),
      opponent: clone(opponent),
      inputHash: hash({
        player: player.buildHash,
        opponent: opponent.buildHash,
        combatVersion: online.combatVersion,
        catalogHash: online.catalogHash,
        rulesVersion: online.rules.version,
      }),
      winner: battle.result.winner,
      finalTick: battle.ticks,
      replayHash: hash(events),
      events,
      summary,
      statistics,
      rewardChoices,
      rewardItems,
      settled: false,
      claimed: false,
    };
  }
  private loot(online: ServerRun, match: { id: string }) {
    const run = online.state;
    const pool = onlineRewardPool(run);
    // Server-chosen, persisted choices: reconnect cannot reroll rewards.
    pool.sort((a, b) => hash([match.id, a]).localeCompare(hash([match.id, b])));
    const choices = pool.slice(0, 2);
    if (run.admin.length < R.adminSlots({ ...run, stage: run.stage + 1 })) {
      const admin = Object.keys(D.ADMIN).filter(
        (id) => !run.admin.includes(id),
      );
      if (admin.length) choices.push("admin:" + admin[randomInt(admin.length)]);
    }
    if (choices.length < 3 && pool[2]) choices.push(pool[2]);
    return choices;
  }
  private advance(online: ServerRun) {
    const run = online.state;
    run.stage++;
    run.pending = null;
    run.rerolls = 0;
    online.publishedSnapshotId = null;
    if (run.stage >= online.rules.rounds) {
      run.stage = online.rules.rounds;
      run.phase = "complete";
    } else {
      run.phase = "build";
      run.shop = R.market(run);
    }
  }
}
