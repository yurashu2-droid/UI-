import D from "../data.js";
import { raidAnalysisSummary } from "./analysis-summary.js";
import { createRaidCaptureSession } from "./capture.js";
import { mountLocalImportControls } from "./local-import-controls.js";
import { createRaidEncounterController } from "./encounter.js";
import { createFixtureRaid, listRaidFixtures } from "./fixtures.js";
import { raidComponentCaption, renderRaidScene } from "./render.js";
import { verifyRaidBlueprint } from "./blueprint.js";
import { normalizePublicPageUrl } from "./url.js";
export { createLocalRaidSelection } from "./local-selection.js";
import type {
  RaidBlueprint,
  RaidPanelCallbacks,
  RaidResume,
  RaidInitialRequest,
} from "./types.js";

const REFERENCES: Record<string, string> = {
  archive: new URL("../../fixtures/raid/archive.html", import.meta.url).href,
  commerce: new URL("../../fixtures/raid/commerce.html", import.meta.url).href,
};
/** The panel never mutates a run or writes a receipt; integration callbacks own those transactions. */
export function mountRaidPanel(
  host: HTMLElement,
  callbacks: RaidPanelCallbacks,
  resume?: RaidResume,
  initialRequest?: RaidInitialRequest,
): { dispose(): void } {
  const doc = host.ownerDocument;
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className = "",
    value = "",
  ): HTMLElementTagNameMap[K] => {
    const el = doc.createElement(tag);
    el.className = className;
    el.textContent = value;
    return el;
  };
  const button = (label: string, className = "") => {
    const el = make("button", className, label);
    el.type = "button";
    return el;
  };
  const localAllowed = () => {
    try {
      return (
        !disposed &&
        host.isConnected &&
        callbacks.isLocalImportAllowed?.() === true
      );
    } catch {
      return false;
    }
  };
  const localBlocked = (blueprint: RaidBlueprint | null) =>
    blueprint?.source.kind === "local-file" && !localAllowed();
  const localUnavailable = "ローカルHTMLの読込・対戦・回収は実験室限定です。";
  const encounter = createRaidEncounterController({
      ...callbacks,
      onChallenge: (blueprint) => {
        if (localBlocked(blueprint)) throw new Error(localUnavailable);
        return callbacks.onChallenge(blueprint);
      },
      onClaim: (reward, blueprint) =>
        localBlocked(blueprint)
          ? Promise.resolve({ ok: false as const, error: localUnavailable })
          : callbacks.onClaim(reward, blueprint),
    }),
    capture = createRaidCaptureSession();
  let disposed = false,
    loading = false,
    localLoading = false,
    restoring = !!resume,
    saving = false,
    generation = 0,
    view: "reconstructed" | "reference" = "reconstructed",
    claimedComponent = "";
  let localControls: ReturnType<typeof mountLocalImportControls> | undefined;
  host.replaceChildren();
  host.classList.add("raid-panel");
  const heading = make("div", "raid-heading");
  heading.append(
    make("span", "raid-eyebrow", "URL RAID"),
    make("h2", "", "ページと戦い、そのUIを持ち帰る"),
  );
  const description = make(
    "p",
    "raid-description",
    "公開HTMLのタグ・名前・限定したCSSから、対戦できるページを近似再構成します。現在は公開テストページのURLに対応しています。",
  );
  const form = make("form", "raid-url-form"),
    input = make("input");
  input.type = "url";
  input.placeholder = "https://example.com/";
  input.setAttribute("aria-label", "取得する公開ページのURL");
  input.autocomplete = "off";
  input.spellcheck = false;
  const load = button("公開ページを取得", "raid-action"),
    cancel = button("取得を中止", "raid-subtle");
  load.type = "submit";
  cancel.hidden = true;
  form.append(input, load, cancel);
  const fixtureBar = make("div", "raid-fixtures");
  fixtureBar.append(make("span", "", "付属の検証用ページ"));
  const fixtureButtons: HTMLButtonElement[] = [];
  const publicTest = button("Booksを近似再構成");
  publicTest.addEventListener("click", () => {
    input.value = "https://books.toscrape.com/";
    void beginCapture();
  });
  fixtureButtons.push(publicTest);
  fixtureBar.append(publicTest);
  const localHost = make("div");
  localHost.hidden = !callbacks.isLocalImportAllowed;
  const localReturn = make("section", "raid-local-return"),
    localReturnNote = make("p"),
    localReturnActions = make("div", "raid-actions"),
    resumeLocal = button("前のローカル近似を再開"),
    clearLocal = button("一時保持だけを消去", "raid-subtle"),
    editLocal = button("自分のページを編集して再戦", "raid-subtle");
  resumeLocal.dataset.localSelection = "resume";
  clearLocal.dataset.localSelection = "clear";
  editLocal.dataset.localSelection = "edit";
  localReturnActions.append(resumeLocal, clearLocal);
  localReturn.append(localReturnNote, localReturnActions);
  const status = make("p", "raid-status", "付属ページを読み込んでいます。");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const tabs = make("div", "raid-tabs"),
    reconstruction = button("戦闘用に再構成", "is-selected"),
    reference = button("静的ページと比較");
  tabs.append(reconstruction, reference);
  const meta = make("p", "raid-meta"),
    analysisSummary = make("p", "raid-analysis-summary raid-description"),
    viewport = make("div", "raid-viewport"),
    canvas = make("div", "raid-canvas");
  analysisSummary.hidden = true;
  viewport.append(canvas);
  const details = make("div", "raid-mapping"),
    actions = make("div", "raid-actions"),
    challenge = button("このページに挑戦", "raid-action"),
    skip = button("今回は回収を見送る", "raid-subtle");
  skip.hidden = true;
  actions.append(challenge, editLocal, skip);
  const privacy = make(
    "p",
    "raid-privacy",
    "取得した外観と由来は個人コレクションに保存。非同期対戦では相手に標準の見た目を表示します。JSON書き出しに画像は含まれません。",
  );
  host.append(
    heading,
    description,
    form,
    fixtureBar,
    localHost,
    localReturn,
    status,
    tabs,
    meta,
    analysisSummary,
    viewport,
    details,
    actions,
    privacy,
  );
  const say = (message: string, error = false) => {
    if (disposed) return;
    status.textContent = message;
    status.classList.toggle("is-error", error);
  };
  const fit = () => {
    if (!disposed) {
      canvas.style.transform = `scale(${Math.max(0.1, viewport.clientWidth / 960)})`;
      viewport.style.height = `${(viewport.clientWidth * 680) / 960}px`;
    }
  };
  const resize =
    typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
  resize?.observe(viewport);
  const selectionAvailable = () =>
    !!callbacks.localSelection &&
    localAllowed() &&
    !saving &&
    !restoring &&
    !["battling", "won", "claiming"].includes(encounter.state.phase);
  const readLocal = () => {
    if (!selectionAvailable()) return undefined;
    try {
      return callbacks.localSelection?.read();
    } catch {
      return undefined;
    }
  };
  const sync = () => {
    const state = encounter.state,
      locked =
        saving ||
        restoring ||
        ["battling", "claiming", "won"].includes(state.phase);
    load.disabled = locked;
    input.disabled = locked;
    fixtureButtons.forEach((b) => (b.disabled = locked));
    challenge.disabled =
      loading ||
      localLoading ||
      restoring ||
      localBlocked(state.blueprint) ||
      !state.blueprint ||
      !["ready", "lost", "claimed"].includes(state.phase);
    challenge.textContent =
      state.phase === "battling" ? "対戦中…" : "このページに挑戦";
    skip.hidden = state.phase !== "won" || !callbacks.onDiscard;
    cancel.hidden = !(loading || localLoading) || saving;
    const remembered = readLocal();
    localReturn.hidden = !remembered;
    resumeLocal.hidden = clearLocal.hidden = !remembered;
    resumeLocal.disabled = clearLocal.disabled = !remembered;
    editLocal.hidden =
      !remembered ||
      !callbacks.onEditLocal ||
      state.blueprint?.source.kind !== "local-file" ||
      state.blueprint.captureId !== remembered.captureId;
    editLocal.disabled = editLocal.hidden || loading || localLoading;
    localReturnNote.textContent = remembered
      ? `${remembered.source.name}（近似 ${remembered.captureId.slice(-8)}）を、このタブの同じ実験室で一時保持しています。閉じて自分のページを編集した後、再解析せず明示的に再開できます。再読み込みや別のランへの切替で失われます。この再開用の一時保持には、元ファイルや生HTML・CSSを含めません。一時保持を消しても、表示中の相手・取得済み外観は変更しません。`
      : "";
    localControls?.refresh();
    reconstruction.classList.toggle("is-selected", view === "reconstructed");
    reference.classList.toggle("is-selected", view === "reference");
  };
  const draw = () => {
    if (disposed) return;
    const state = encounter.state,
      b = state.blueprint;
    sync();
    analysisSummary.textContent = b ? raidAnalysisSummary(b) : "";
    analysisSummary.hidden = !analysisSummary.textContent;
    if (!b) return;
    meta.textContent = `${b.source.name}  ·  ${b.source.kind === "local-file" ? "ローカルHTMLの近似配置・実験室限定" : b.fidelity === "code-approximation" ? "コード解析による近似配置" : b.source.kind === "fixture" ? "付属の検証用ページ" : "静的取得"}  ·  ${b.components.length}個の戦闘UI  ·  960×680`;
    details.replaceChildren();
    for (const c of b.components) {
      const def = D.PARTS[c.canonicalType];
      details.append(
        make("span", "", `${raidComponentCaption(c)} / CPU ${def.load}`),
      );
    }
    reference.disabled = b.source.kind !== "fixture";
    reference.textContent =
      b.source.kind === "fixture"
        ? "静的ページと比較"
        : b.source.kind === "local-file"
          ? "元HTMLの比較は利用できません"
          : "元サイトの比較画像は未取得";
    canvas.replaceChildren();
    if (view === "reference" && b.source.kind === "fixture") {
      const key = b.source.displayUrl.replace("fixture://", ""),
        src = REFERENCES[key];
      if (src) {
        const frame = make("iframe", "raid-reference");
        frame.title = `${b.source.name}の付属静的ページ`;
        frame.setAttribute("sandbox", "");
        frame.src = src;
        frame.width = "960";
        frame.height = "680";
        canvas.append(frame);
      }
    } else {
      const scene = make("div");
      renderRaidScene(scene, b);
      canvas.append(scene);
      for (const item of scene.querySelectorAll<HTMLElement>(
        "[data-component-id]",
      )) {
        const component = b.components.find(
          (c) => c.componentId === item.dataset.componentId,
        );
        if (!component) continue;
        const caption = `${raidComponentCaption(component)}${b.source.kind === "local-file" ? "（ローカルHTMLの近似再構成UI・実験室限定）" : b.fidelity === "code-approximation" ? "（近似再構成のUI）" : ""}`;
        if (state.phase === "won") {
          item.classList.add("raid-loot-ready");
          item.tabIndex = localBlocked(b) ? -1 : 0;
          if (localBlocked(b)) item.setAttribute("aria-disabled", "true");
          item.setAttribute("role", "button");
          item.setAttribute("aria-label", `${caption}を回収`);
        }
        if (
          state.phase === "claimed" &&
          item.dataset.componentId === claimedComponent
        ) {
          item.classList.add("raid-claimed");
          item.setAttribute("aria-label", `${caption} / 回収済みのUI`);
        }
      }
    }
    fit();
  };
  const select = async (
    blueprint: RaidBlueprint,
    isCurrent: () => boolean = () => !disposed,
    rememberLocal = false,
  ) => {
    const result = await encounter.select(blueprint, isCurrent);
    if (disposed || !isCurrent()) return result;
    if (result.ok) {
      let retentionError = "";
      if (
        rememberLocal &&
        result.value.source.kind === "local-file" &&
        callbacks.localSelection &&
        localAllowed()
      ) {
        // Selection has already committed. Keep the painted opponent in step
        // while return-memory verification waits or is explicitly cancelled.
        view = "reconstructed";
        claimedComponent = "";
        say("ローカル近似を選択しました。再開用の一時保持を検証しています。");
        draw();
        try {
          const retained = await callbacks.localSelection.remember(
            result.value,
            () => !disposed && localAllowed() && isCurrent(),
          );
          if (!retained.ok) retentionError = retained.error;
        } catch {
          retentionError =
            "近似配置は選択しましたが、一時保持できませんでした。閉じた後は再読込が必要です。";
        }
        if (disposed || !isCurrent()) return result;
      }
      view = "reconstructed";
      claimedComponent = "";
      say(retentionError || blueprint.warnings.join(" "), !!retentionError);
      draw();
    } else say(result.error, true);
    return result;
  };
  const fixture = async (id: string) => {
    if (
      disposed ||
      restoring ||
      saving ||
      ["battling", "won", "claiming"].includes(encounter.state.phase)
    )
      return;
    localControls?.cancel();
    capture.cancel();
    loading = false;
    const mine = ++generation;
    sync();
    try {
      const b = await createFixtureRaid(id);
      if (!disposed && mine === generation)
        await select(b, () => !disposed && mine === generation);
    } catch (error) {
      say(
        error instanceof Error
          ? error.message
          : "付属ページを読み込めませんでした。",
        true,
      );
    }
  };
  for (const item of listRaidFixtures()) {
    const b = button(item.name);
    b.dataset.raidFixture = item.id;
    b.addEventListener("click", () => void fixture(item.id));
    fixtureButtons.push(b);
    fixtureBar.append(b);
  }
  const stop = () => {
    if (saving) return;
    localControls?.cancel();
    capture.cancel();
    generation++;
    loading = false;
    say("取得を中止しました。選択中のページは変更していません。");
    sync();
  };
  const beginCapture = async (kind: "new" | "reanalyze" = "new") => {
    if (
      saving ||
      restoring ||
      ["battling", "won", "claiming"].includes(encounter.state.phase)
    )
      return;
    localControls?.cancel();
    const mine = ++generation;
    loading = true;
    say("公開HTMLを取得し、タグ・名前・CSSから近似再構成しています。");
    sync();
    const result = await capture.capture(input.value);
    if (disposed || mine !== generation) return;
    if (result.ok) {
      try {
        if (callbacks.onCaptured) {
          saving = true;
          say("取得したページを保存しています。");
          sync();
          await callbacks.onCaptured(structuredClone(result.value), kind);
        }
        if (!disposed && mine === generation)
          await select(result.value, () => !disposed && mine === generation);
      } catch (error) {
        if (!disposed && mine === generation)
          say(
            error instanceof Error
              ? error.message
              : "取得したページを保存できませんでした。",
            true,
          );
      } finally {
        saving = false;
      }
    } else say(result.error, result.code !== "cancelled");
    loading = false;
    sync();
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void beginCapture();
  });
  cancel.addEventListener("click", stop);
  resumeLocal.addEventListener("click", async () => {
    const remembered = readLocal();
    if (!remembered) return;
    localControls?.cancel();
    capture.cancel();
    const mine = ++generation;
    const current = () =>
      !disposed && mine === generation && selectionAvailable();
    loading = true;
    say(
      "一時保持したローカル近似を検証しています。元ファイルの再読込・外部通信は行いません。",
    );
    sync();
    try {
      await select(remembered, current);
    } catch {
      if (current())
        say(
          "ローカル近似を再開できませんでした。ファイルを選び直して再試行できます。",
          true,
        );
    } finally {
      if (!disposed && mine === generation) {
        loading = false;
        if (localAllowed()) sync();
      }
    }
  });
  clearLocal.addEventListener("click", () => {
    if (!selectionAvailable()) return;
    localControls?.cancel();
    capture.cancel();
    generation++;
    loading = false;
    callbacks.localSelection!.clear();
    say(
      "一時保持だけを消去しました。表示中の相手・取得済み外観は変更しません。閉じた後は再読込が必要です。",
    );
    sync();
  });
  editLocal.addEventListener("click", () => {
    if (loading || localLoading || !callbacks.onEditLocal) return;
    const remembered = readLocal(),
      selected = encounter.state.blueprint;
    if (
      !remembered ||
      selected?.source.kind !== "local-file" ||
      selected.captureId !== remembered.captureId
    )
      return;
    callbacks.onEditLocal();
  });
  input.addEventListener("input", () => {
    if (loading || localLoading) stop();
  });
  reconstruction.addEventListener("click", () => {
    view = "reconstructed";
    draw();
  });
  reference.addEventListener("click", () => {
    view = "reference";
    draw();
  });
  challenge.addEventListener("click", async () => {
    if (disposed || loading || localLoading || restoring) return;
    if (localBlocked(encounter.state.blueprint)) {
      say(localUnavailable, true);
      sync();
      return;
    }
    localControls?.cancel();
    capture.cancel();
    loading = false;
    generation++;
    view = "reconstructed";
    claimedComponent = "";
    const promise = encounter.challenge();
    sync();
    say("現在のビルドのコピーで対戦しています。");
    const result = await promise;
    if (disposed) return;
    say(result.ok ? encounter.state.message : result.error, !result.ok);
    draw();
  });
  skip.addEventListener("click", async () => {
    const promise = encounter.discard();
    sync();
    const result = await promise;
    if (disposed) return;
    say(result.ok ? encounter.state.message : result.error, !result.ok);
    draw();
  });
  const claim = async (id: string) => {
    if (localBlocked(encounter.state.blueprint)) {
      say(localUnavailable, true);
      sync();
      return;
    }
    const promise = encounter.claim(id);
    sync();
    const result = await promise;
    if (disposed) return;
    if (result.ok) claimedComponent = id;
    say(result.ok ? encounter.state.message : result.error, !result.ok);
    draw();
  };
  canvas.addEventListener("click", (e) => {
    const target =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>("[data-component-id]")
        : null;
    if (target && encounter.state.phase === "won")
      void claim(target.dataset.componentId!);
  });
  canvas.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>("[data-component-id]")
        : null;
    if (target && encounter.state.phase === "won") {
      e.preventDefault();
      void claim(target.dataset.componentId!);
    }
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && (loading || localLoading)) {
      e.preventDefault();
      stop();
    }
  };
  doc.addEventListener("keydown", onKey);
  const beginInitial = async (request: RaidInitialRequest) => {
    if (
      typeof request.url !== "string" ||
      !["new", "cached", "reanalyze"].includes(request.kind)
    ) {
      say("巡回のURLまたは取得方法が正しくありません。", true);
      return;
    }
    input.value = request.url;
    if (request.kind !== "cached") {
      await beginCapture(request.kind);
      return;
    }
    const mine = ++generation;
    const url = normalizePublicPageUrl(request.url);
    if (!url.ok) {
      say(url.error, true);
      return;
    }
    if (!request.cachedBlueprint) {
      say("保存済みのページがありません。新規取得を選んでください。", true);
      return;
    }
    const verified = await verifyRaidBlueprint(request.cachedBlueprint);
    if (disposed || mine !== generation) return;
    if (
      !verified.ok ||
      verified.value.source.kind !== "static-public" ||
      verified.value.source.displayUrl !== new URL(url.value).origin + "/"
    ) {
      say("保存済みのページと指定URLの一致を確認できませんでした。", true);
      return;
    }
    await select(verified.value, () => !disposed && mine === generation);
  };
  if (typeof callbacks.isLocalImportAllowed === "function") {
    localControls = mountLocalImportControls(localHost, {
      isAllowed: localAllowed,
      isLocked: () =>
        saving ||
        restoring ||
        ["battling", "won", "claiming"].includes(encounter.state.phase),
      onStart: () => {
        capture.cancel();
        generation++;
        loading = false;
      },
      onBusyChange: (value) => {
        localLoading = value;
        sync();
      },
      onSelected: (blueprint, isCurrent) =>
        select(
          blueprint,
          () => !disposed && localAllowed() && isCurrent(),
          true,
        ),
    });
  }
  sync();
  if (resume) {
    void encounter.restore(resume).then((result) => {
      if (disposed) return;
      restoring = false;
      say(result.ok ? encounter.state.message : result.error, !result.ok);
      draw();
    });
  } else if (initialRequest) void beginInitial(initialRequest);
  else void fixture("archive");
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      capture.cancel();
      localControls?.dispose();
      encounter.dispose();
      resize?.disconnect();
      doc.removeEventListener("keydown", onKey);
    },
  };
}
