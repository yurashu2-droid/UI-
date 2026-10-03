import D from "./data.js";

function positiveHp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value > 0 && value <= Number.MAX_SAFE_INTEGER;
}

/**
 * Presentation-only projection of opponent metadata (hp is the base, admin is
 * the exact launch equipment). Never pass current/damaged battle HP here.
 * The engine remains authoritative: canonical launches and rounding boundaries
 * are checked against real Battle construction in opponent-hp-guidance tests.
 * Missing equipment is unknown; callers must explicitly supply [] for none.
 */
export function opponentHpGuidance(opponent: unknown) {
  const input = opponent && typeof opponent === "object" && !Array.isArray(opponent)
    ? opponent as Record<string, unknown> : {};
  const baseHp = positiveHp(input.hp) ? input.hp : null;
  const admin = input.admin;
  // Array.from also visits sparse entries; unknown IDs must not silently become
  // a known no-server configuration. Duplicate IDs follow the engine's Set.
  const knownAdmin = Array.isArray(admin) && Array.from(admin).every(id =>
    typeof id === "string" && Object.hasOwn(D.ADMIN, id));
  const server = knownAdmin && admin.includes("server");
  const projected = baseHp !== null && knownAdmin
    ? server ? Math.round(baseHp * 1.25) : baseHp
    : null;
  const startingHp = positiveHp(projected) ? projected : null;
  return {
    baseHp,
    startingHp,
    baseLabel: "基礎HP",
    startingLabel: "開始HP",
    baseText: baseHp === null ? "不明" : String(baseHp),
    startingText: startingHp === null ? "不明" : String(startingHp),
    explanation: startingHp === null
      ? "HPまたは管理設備を確認できないため、開始HPは不明です。"
      : server
        ? "サーバー増強：基礎HP×1.25を四捨五入。CPU上限は変わりません。"
        : "開始HPへの設備補正なし。",
  };
}
