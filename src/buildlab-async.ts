/** Cooperative, read-only build-book calculations using the unchanged real combat engine. */
import {
  DEFAULT_CONDITIONS,
  entrants,
  measureMatch,
  type Entrant,
  type MatchConditions,
  type roundRobin,
} from "./buildlab.js";

export type RoundRobinResult = ReturnType<typeof roundRobin>;
export interface RoundRobinProgress {
  readonly completed: number;
  readonly total: number;
}
/** Queue a later host turn and return a non-throwing function that cancels that turn. */
export type RoundRobinScheduler = (resume: () => void) => () => void;
export interface RoundRobinOptions {
  signal?: AbortSignal;
  onProgress?: (progress: RoundRobinProgress) => void;
  /** Scheduling seam for deterministic tests; production must yield to a host task. */
  schedule?: RoundRobinScheduler;
}

const MAX_MATCHES_PER_TURN = 4;
const TURN_BUDGET_MS = 8;
const scheduleHostTurn: RoundRobinScheduler = (resume) => {
  const timer = setTimeout(resume, 0);
  return () => clearTimeout(timer);
};

function abortError() {
  const error = new Error("Build matrix calculation cancelled");
  error.name = "AbortError";
  return error;
}
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}
function nextHostTurn(schedule: RoundRobinScheduler, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    checkAbort(signal);
    let settled = false;
    let aborted = false;
    let cancel: (() => void) | undefined;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      aborted = true;
      cleanup();
      cancel?.();
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      cancel = schedule(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      });
      // Also cover an abort raised by an injected scheduler during registration.
      if (aborted) cancel();
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });
}

/**
 * Snapshot before the first await, then complete the same ordered matches as roundRobin.
 * Four matches or roughly 8ms end a batch, whichever comes first. A single real match
 * is indivisible and may exceed that soft time budget; no combat/result shortcut is used.
 * Aborting rejects with AbortError and removes the pending host task. Progress describes
 * only completed real matches, including a single initial { completed: 0, total } report.
 */
export async function roundRobinAsync(
  list: Entrant[] = entrants(),
  { signal, onProgress, schedule = scheduleHostTurn }: RoundRobinOptions = {},
): Promise<RoundRobinResult> {
  checkAbort(signal);
  const copies = new Map<Entrant, Entrant>();
  const snapshot = list.map((entry) => {
    let copy = copies.get(entry);
    if (!copy) {
      copy = {
        ...entry,
        layout: entry.layout.map((part) => [...part]),
        admin: [...entry.admin],
      };
      copies.set(entry, copy);
    }
    return copy;
  });
  const conditions: MatchConditions = { ...DEFAULT_CONDITIONS };
  if (conditions.commonAdmin)
    conditions.commonAdmin = [...conditions.commonAdmin];
  const cells: RoundRobinResult["cells"] = snapshot.map(() =>
    snapshot.map(() => null),
  );
  const wins = snapshot.map(() => 0);
  const total = snapshot.reduce(
    (sum, a) => sum + snapshot.filter((b) => a !== b).length,
    0,
  );
  let completed = 0;
  let row = 0;
  let column = 0;
  const report = () => {
    checkAbort(signal);
    onProgress?.({ completed, total });
    checkAbort(signal);
  };
  report();
  while (completed < total) {
    await nextHostTurn(schedule, signal);
    checkAbort(signal);
    const started = performance.now();
    let batchMatches = 0;
    while (row < snapshot.length) {
      checkAbort(signal);
      const a = snapshot[row];
      const b = snapshot[column];
      if (a !== b) {
        const cell = measureMatch(a, b, conditions);
        cells[row][column] = cell;
        if (cell.winner === "player") wins[row]++;
        completed++;
        batchMatches++;
      }
      column++;
      if (column === snapshot.length) {
        row++;
        column = 0;
      }
      if (
        batchMatches > 0 &&
        (batchMatches >= MAX_MATCHES_PER_TURN ||
          performance.now() - started >= TURN_BUDGET_MS)
      )
        break;
    }
    report();
  }
  return { list: snapshot, cells, wins };
}
