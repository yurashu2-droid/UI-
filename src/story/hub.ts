import {
  ARCHIVE_COORDINATES,
  ENDING,
  STORY_TITLE,
  STORY_WORLD,
} from "./content.js";
import {
  analysisCost,
  currentStoryEncounter,
  currentStoryStage,
} from "./state.js";
import type { StoryCommand, StoryHubCallbacks, StoryState } from "./types.js";

type ObjectId =
  | "junk"
  | "machine"
  | "workbench"
  | "shelf"
  | "server"
  | "power"
  | "radio"
  | "exit";
/** A small clickable workshop. It never navigates the player's browser or performs network I/O. */
export function mountStoryHub(
  host: HTMLElement,
  callbacks: StoryHubCallbacks,
): { render(): void; dispose(): void } {
  const doc = host.ownerDocument;
  let ownPreview: { viewport: HTMLElement; paper: HTMLElement } | null = null;
  let previewResize: ResizeObserver | null = null;
  let namingDraft: { owner: StoryState; input: HTMLInputElement } | null = null;
  let machineDraft: {
    owner: StoryState;
    stageId: StoryState["stageId"];
    input: HTMLInputElement;
    kind: HTMLSelectElement;
    details: HTMLDetailsElement;
  } | null = null;
  let postgameWorkshop = false;
  let selected: ObjectId = "junk",
    busy = false,
    disposed = false,
    message = "";
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls = "",
    text = "",
  ): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };
  const button = (
    text: string,
    action: string,
    handler: () => void | Promise<void>,
    cls = "",
  ): HTMLButtonElement => {
    const node = make("button", cls, text);
    node.type = "button";
    node.dataset.storyAction = action;
    node.disabled = busy;
    node.addEventListener("click", () => {
      if (!busy && !disposed) return handler();
    });
    return node;
  };
  const paragraph = (parent: HTMLElement, lines: readonly string[], cls = "") =>
    lines.forEach((text) => parent.append(make("p", cls, text)));
  const transact = async (command: StoryCommand) => {
    if (busy || disposed) return;
    busy = true;
    message = "";
    try {
      const result = await callbacks.onCommand(command);
      if (!result.ok) message = result.error;
    } catch (error) {
      message =
        error instanceof Error ? error.message : "記録を保存できませんでした。";
    } finally {
      busy = false;
      if (!disposed) render();
    }
  };
  const invoke = async (fn: () => void | Promise<void>) => {
    if (busy || disposed) return;
    busy = true;
    message = "";
    render();
    try {
      await fn();
    } catch (error) {
      message =
        error instanceof Error ? error.message : "接続を完了できませんでした。";
    } finally {
      busy = false;
      if (!disposed) render();
    }
  };
  const screen = (label: string) => {
    const panel = make("section", "story-terminal");
    panel.append(make("div", "story-terminal-chrome", label));
    return panel;
  };
  function renderNaming(root: HTMLElement) {
    const owner = callbacks.getState();
    const pane = screen("拾ったブラウザ端末 / about:blank");
    pane.append(make("div", "story-blank-mark", "□"));
    paragraph(pane, STORY_WORLD.blank, "story-blank-message");
    pane.append(make("p", "story-muted", STORY_WORLD.premise));
    const form = make("form", "story-name-form");
    form.dataset.storyForm = "name";
    const label = make("label", "", "このホームページの名前"),
      input = make("input");
    input.dataset.storyField = "page-name";
    input.name = "siteName";
    input.type = "text";
    input.maxLength = 40;
    input.required = true;
    input.autocomplete = "off";
    input.placeholder = "あなたのページの名前";
    // A rejected command repaints the form. Preserve its live draft only for
    // this exact naming owner, including edits made while the command waited.
    input.value = namingDraft?.owner === owner ? namingDraft.input.value : "";
    namingDraft = { owner, input };
    label.append(input);
    const submit = make("button", "story-primary", "このページを始める");
    submit.type = "submit";
    submit.disabled = busy;
    form.append(label, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (
        disposed || busy || namingDraft?.input !== input ||
        callbacks.getState() !== owner || owner.phase !== "naming"
      ) return;
      await transact({ type: "name-page", name: input.value });
    });
    pane.append(form);
    root.append(pane);
  }
  function object(id: ObjectId, title: string, sub: string) {
    const node = button(
      "",
      id,
      async () => {
        selected = id;
        message = "";
        if (id === "junk") await transact({ type: "talk-junk" });
        else if (id === "machine") await transact({ type: "inspect-machine" });
        else if (id === "workbench") callbacks.onEdit("page");
        else render();
      },
      `story-object story-object-${id}${selected === id ? " is-selected" : ""}`,
    );
    node.setAttribute("aria-label", `${title}：${sub}`);
    const art = make("span", "story-object-art");
    art.setAttribute("aria-hidden", "true");
    if (id === "junk")
      art.append(
        make("span", "story-crt-eyes", "▰  ▰"),
        make("span", "story-crt-mouth", "▔▔"),
      );
    else if (id === "machine")
      art.append(
        make("span", "story-machine-display", ">_"),
        make("span", "story-machine-disc", "◉"),
      );
    else if (id === "workbench")
      art.append(make("span", "story-laptop-screen", "< / >"));
    else if (id === "shelf")
      art.append(
        make(
          "span",
          "story-shelf-parts",
          "[OK]   000128\n───────\n▶   <a>   PDF",
        ),
      );
    else if (id === "server")
      art.append(
        make("span", "story-server-units", "● ━━━━━\n● ━━━━━\n● ━━━━━"),
      );
    else if (id === "power") art.append(make("span", "story-power-core", "ϟ"));
    else if (id === "radio")
      art.append(make("span", "story-radio-dial", "◉  ◌"));
    else art.append(make("span", "story-door-mark", "EXIT"));
    node.append(
      art,
      make("strong", "story-object-title", title),
      make("small", "story-object-sub", sub),
    );
    return node;
  }
  function machine(panel: HTMLElement) {
    const state = callbacks.getState(),
      encounter = currentStoryEncounter(state),
      stage = currentStoryStage(state);
    panel.append(make("h3", "", "接続・解析機械"));
    paragraph(panel, [STORY_WORLD.machine], "story-muted");
    if (encounter && state.phase !== "encounter") {
      panel.append(
        make("div", "story-address", encounter.enemy.address),
        make("h4", "", encounter.title),
        make("p", "", encounter.briefing),
      );
      panel.append(
        make(
          "p",
          "story-energy-note",
          "本編用エネルギー：支給済み。追加解析の残量が0でも接続できます。",
        ),
      );
      panel.append(
        button(
          busy ? "接続中…" : "この記録へ接続する",
          "main-encounter",
          () => invoke(() => callbacks.onBattle(encounter)),
          "story-primary",
        ),
      );
    } else if (
      state.readRecords.includes(stage.record.id) &&
      stage.number < 8 &&
      (stage.id !== "delivery" || state.fusionWitnessed)
    ) {
      panel.append(
        make("p", "", "回収記録から、次の接続座標が見つかりました。"),
      );
      panel.append(
        button(
          "次の段階へ接続する",
          "advance-stage",
          () => transact({ type: "advance-stage" }),
          "story-primary",
        ),
      );
    }
    const details = make("details", "story-optional");
    details.append(make("summary", "", "寄り道：公開URL・解析履歴"));
    const form = make("form", "story-machine-form");
    form.dataset.storyForm = "machine";
    const label = make("label", "", "機械側のアドレス欄"),
      input = make("input");
    input.dataset.storyField = "machine-url";
    input.type = "url";
    input.required = true;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "https://example.com/";
    input.maxLength = 2048;
    // Repair stays only in this machine view's live controls, never the save.
    const draft = machineDraft;
    input.value = draft?.input.value ?? "";
    details.open = draft?.details.open ?? false;
    label.append(input);
    const kind = make("select");
    kind.setAttribute("aria-label", "解析方法");
    for (const [value, title] of [
      ["new", "新しく解析 / エネルギー1"],
      ["cached", "保存済みの結果を使う / 0"],
      ["reanalyze", "同じURLを再解析 / 2"],
    ]) {
      const option = make("option", "", title);
      option.value = value;
      kind.append(option);
    }
    kind.value = draft && ["new", "cached", "reanalyze"].includes(draft.kind.value)
      ? draft.kind.value : "new";
    machineDraft = { owner: state, stageId: state.stageId, input, kind, details };
    const submit = make("button", "story-secondary", "追加接続へ");
    submit.type = "submit";
    submit.disabled = busy || !callbacks.onOptionalRaid;
    form.append(label, kind, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (
        busy || disposed || machineDraft?.input !== input ||
        callbacks.getState() !== state || machineDraft.stageId !== state.stageId
      ) return;
      let url: URL;
      try {
        url = new URL(input.value);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.hostname.toLowerCase().endsWith(".onion") ||
          url.href.length > 2048
        )
          throw new Error();
      } catch {
        message =
          "認証情報を含まない公開HTTP/HTTPS URLを入力してください。実際のダークウェブには接続しません。";
        render();
        return;
      }
      const mode = kind.value as "new" | "cached" | "reanalyze";
      if (!["new", "cached", "reanalyze"].includes(mode)) return;
      if (callbacks.getState().analysisEnergy < analysisCost(mode)) {
        message =
          "追加解析用のエネルギーが足りません。本編の接続は利用できます。";
        render();
        return;
      }
      if (callbacks.onOptionalRaid)
        await invoke(() => callbacks.onOptionalRaid!(url.href, mode));
    });
    details.append(
      form,
      make(
        "p",
        "story-muted",
        "本編の攻略には実URLの取得は不要です。解析に成功したときだけ、機械のエネルギーを使います。",
      ),
    );
    panel.append(details);
  }
  function showObject(panel: HTMLElement) {
    const state = callbacks.getState(),
      stage = currentStoryStage(state);
    if (selected === "machine") {
      machine(panel);
      return;
    }
    if (selected === "junk") {
      panel.append(make("h3", "", "店主AI ジャンク"));
      const latest = stage.record;
      const speech = state.records.includes(latest.id)
        ? latest.junk
        : stage.number === 1
          ? [
              "その端末、まだ動くのか。古い部品なら棚にある。",
              "まずは、自分のページに載せてみな。",
            ]
          : stage.intro;
      paragraph(panel, speech, "story-dialogue");
      if (state.fusionWitnessed && stage.number === 2)
        paragraph(panel, STORY_WORLD.fusion, "story-dialogue");
      else if (state.fusionWitnessed)
        panel.append(
          make(
            "p",
            "story-muted",
            "異種合成を見たジャンクは、あなたの端末の働きを気にしている。",
          ),
        );
      panel.append(
        button(
          "棚のUIを見せてもらう",
          "open-shop",
          () => callbacks.onEdit("shop"),
          "story-secondary",
        ),
      );
      if (state.records.length) {
        const journal = make("details", "story-journal");
        journal.append(make("summary", "", "回収記録を読む"));
        for (const id of state.records) {
          const record = storyRecords().find((r) => r.id === id)!;
          journal.append(make("h4", "", record.title));
          paragraph(journal, record.text);
        }
        panel.append(journal);
      }
    } else if (selected === "shelf") {
      panel.append(make("h3", "", "拾われたUIの棚"));
      paragraph(panel, [
        "別のサイトから外されたリンク、ボタン、カウンター。元の場所とは違う組み合わせで、自分のページに載せてみる。",
      ]);
      if (state.records.includes("broken-counter"))
        panel.append(
          make(
            "p",
            "story-keepsake",
            "壊れた訪問カウンターは、ジャンクのCRTのそばに置かれている。",
          ),
        );
      panel.append(
        button(
          "UIの取引を開く",
          "open-shop",
          () => callbacks.onEdit("shop"),
          "story-primary",
        ),
      );
    } else if (selected === "server") {
      panel.append(make("h3", "", "サーバーラック"));
      paragraph(panel, [
        "ここは自分のホームページを動かす設備。相手を読み取る機械の解析用エネルギーとは別もの。",
        "店の奥のサーバーだけは、いつも電源が切られていない。",
      ]);
      panel.append(
        button(
          "自分の処理能力を確認",
          "open-server",
          () => callbacks.onEdit("server"),
          "story-primary",
        ),
      );
    } else if (selected === "power") {
      panel.append(
        make("h3", "", "機械用の電源設備"),
        make("div", "story-energy", String(state.analysisEnergy)),
      );
      paragraph(panel, [
        "追加解析：新しいURLは1、再解析は2、保存済みの結果は0。",
        "本編用は支給されます。エネルギーがなくても、物語の接続先は開けます。",
      ]);
    } else if (selected === "radio") {
      panel.append(make("h3", "", "奥の古い通信設備"));
      paragraph(
        panel,
        stage.number >= 7
          ? [
              "ジャンクが電源を入れた。通常の検索網から切り離された、架空のネットワークにつながっている。",
              "実際のダークウェブへの通信は行いません。",
            ]
          : ["古い通信機が、布をかぶっている。今は電源が入っていない。"],
      );
      if (stage.number >= 7)
        panel.append(
          button(
            "接続座標を機械で開く",
            "radio-machine",
            () => {
              selected = "machine";
              render();
            },
            "story-primary",
          ),
        );
    } else if (selected === "exit") {
      panel.append(make("h3", "", "廃棄場への出入口"));
      paragraph(panel, [
        "旅の準備は、この小さな作業場でできる。繰り返す配置や対戦へは、すぐ戻れる。",
      ]);
      panel.append(
        button(
          "自分のページへ戻る",
          "leave-workshop",
          () => callbacks.onEdit("page"),
          "story-primary",
        ),
      );
    }
  }
  function renderRecord(root: HTMLElement) {
    const stage = currentStoryStage(callbacks.getState()),
      pane = screen("回収記録 / 本編攻略で必ず入手");
    pane.append(
      make("span", "story-eyebrow", `STAGE ${stage.number} / 記録回収`),
      make("h2", "", stage.record.title),
    );
    paragraph(pane, stage.record.text);
    paragraph(pane, stage.record.junk, "story-dialogue");
    pane.append(
      button(
        "記録を端末に残す",
        "collect-record",
        () => transact({ type: "collect-record" }),
        "story-primary",
      ),
    );
    root.append(pane);
  }
  function archivePage() {
    const page = make("article", "story-old-home");
    page.append(
      make("h2", "", "ようこそ！ わたしのホームページへ"),
      make("p", "story-old-welcome", "★ 好きなものを、少しずつ集めています ★"),
    );
    const nav = make(
      "p",
      "story-old-links",
      "自己紹介　好きなもの　リンク集　工事中",
    );
    page.append(nav);
    page.append(
      make("h3", "", "短い日記"),
      make("p", "", ENDING.diary),
      make("p", "story-old-construction", "🚧 このページは工事中です 🚧"),
    );
    return page;
  }
  function renderEnding(root: HTMLElement) {
    const state = callbacks.getState(),
      pane = screen("接続・解析機械 / Web Time Machine");
    if (state.phase === "archive") {
      pane.append(make("h2", "", "そのページが、まだそこにあった時間"));
      const form = make("form", "story-archive-form");
      form.dataset.storyForm = "archive";
      const url = make("input"),
        date = make("input");
      url.type = "text";
      date.type = "date";
      url.value = ARCHIVE_COORDINATES.url;
      date.value = ARCHIVE_COORDINATES.date;
      url.setAttribute("aria-label", "回収したURL");
      date.setAttribute("aria-label", "回収した保存日時");
      const u = make("label", "", "URL"),
        d = make("label", "", "日付");
      u.append(url);
      d.append(date);
      const open = make("button", "story-primary", "保存されたページを開く");
      open.type = "submit";
      open.disabled = busy;
      form.append(u, d, open);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await transact({
          type: "open-archive",
          url: url.value,
          date: date.value,
        });
      });
      pane.append(
        form,
        make(
          "p",
          "story-muted",
          "回収記録から復元した、ゲーム内のURLと日付です。実際の外部サイトには接続しません。",
        ),
      );
    } else {
      pane.append(archivePage());
      if (state.phase === "restoration") {
        paragraph(pane, ENDING.recognition, "story-dialogue");
        pane.append(
          make("p", "story-muted", ENDING.archiveNotice),
          make("p", "", ENDING.restoration),
        );
        pane.append(
          button(
            "現在のネットワークへ復元する",
            "restore-archive",
            () => transact({ type: "restore-archive" }),
            "story-primary",
          ),
        );
      } else if (state.phase === "link") {
        if (callbacks.renderOwnPage) {
          const viewport = make("div", "story-own-preview"),
            paper = make("div", "story-own-preview-paper browser-paper");
          viewport.inert = true;
          viewport.setAttribute(
            "aria-label",
            `${state.pageName} の現在のページ`,
          );
          callbacks.renderOwnPage(paper);
          viewport.append(paper);
          pane.append(viewport);
          ownPreview = { viewport, paper };
        }
        paragraph(pane, ENDING.farewell, "story-dialogue");
        pane.append(
          make("p", "", `${state.pageName} から、復元したホームページへ。`),
        );
        if (!state.endingLinkPlaced)
          pane.append(
            button(
              "自分のページへ一本のリンクを置く",
              "place-ending-link",
              () => transact({ type: "place-ending-link" }),
              "story-primary",
            ),
          );
        else
          pane.append(
            button(
              "あの人のホームページ",
              "visit-restored-page",
              () => transact({ type: "visit-restored-page" }),
              "story-restored-link",
            ),
          );
      } else {
        pane.append(
          make("h2", "", ENDING.title),
          make(
            "p",
            "story-present-counter",
            `現在の訪問カウンター　${String(state.restoredVisits).padStart(6, "0")}　(+1)`,
          ),
          make(
            "p",
            "",
            "世界全部が元に戻ったわけではない。切れていたつながりが、一つ戻った。",
          ),
        );
        pane.append(
          button(
            "作業場と接続・解析機械へ",
            "postgame-workshop",
            () => {
              postgameWorkshop = true;
              selected = "machine";
              render();
            },
            "story-secondary",
          ),
        );
        pane.append(
          button(
            "自分のページを育て続ける",
            "postgame-editor",
            () => callbacks.onEdit("page"),
            "story-primary",
          ),
        );
      }
    }
    root.append(pane);
  }
  function render() {
    if (disposed) return;
    previewResize?.disconnect();
    previewResize = null;
    ownPreview = null;
    const state = callbacks.getState(),
      stage = currentStoryStage(state),
      root = make("section", "story-hub");
    const endingVisible =
      ["archive", "restoration", "link", "complete"].includes(state.phase) &&
      !(state.phase === "complete" && postgameWorkshop);
    if (state.phase !== "naming") namingDraft = null;
    if (
      machineDraft?.owner !== state || machineDraft?.stageId !== state.stageId ||
      selected !== "machine" || state.phase === "naming" ||
      state.phase === "record" || endingVisible
    ) machineDraft = null;
    const header = make("header", "story-header"),
      brand = make("div");
    brand.append(
      make("p", "story-eyebrow", STORY_TITLE),
      make("h2", "", STORY_WORLD.place),
    );
    const progress = make("div", "story-progress");
    progress.append(
      make("span", "", `STAGE ${stage.number} / 8`),
      make("strong", "", stage.title),
    );
    header.append(brand, progress);
    if (callbacks.onClose)
      header.append(
        button("作業場を閉じる", "close", callbacks.onClose, "story-close"),
      );
    root.append(header);
    if (state.pageName) {
      const own = make("div", "story-own-page");
      own.append(
        make("span", "", "自分のブラウザ端末"),
        make("strong", "", state.pageName),
      );
      root.append(own);
    }
    if (state.phase === "naming") renderNaming(root);
    else if (state.phase === "record") renderRecord(root);
    else if (endingVisible) renderEnding(root);
    else {
      root.append(make("p", "story-objective", stage.objective));
      if (stage.id === "delivery" && !state.fusionWitnessed) {
        const lesson = make("section", "story-fusion-lesson");
        lesson.append(
          make("h3", "", "異なる時代の部品を、ひとつの機能へ"),
          make(
            "p",
            "",
            "保証支給：メールリンク ＋ クーポン → メルマガ登録。手持ちの2つを隣に配置して、試験公開してみよう。",
          ),
        );
        lesson.append(
          button(
            "作業台で2つを隣に置く",
            "prepare-fusion",
            () => callbacks.onEdit("page"),
            "story-secondary",
          ),
        );
        if (callbacks.onPracticeFusion)
          lesson.append(
            button(
              "配置したUIを試験公開",
              "practice-fusion",
              () => {
                selected = "junk";
                return invoke(() => callbacks.onPracticeFusion!());
              },
              "story-primary",
            ),
          );
        root.append(lesson);
      }
      const scene = make("div", "story-workshop");
      scene.setAttribute(
        "aria-label",
        "ジャンクの店兼作業場。装置を選んで操作できます。",
      );
      scene.append(
        make("div", "story-wall-sign", "JUNK / SALVAGE & REPAIR"),
        make("div", "story-floor-cable"),
      );
      scene.append(
        object("junk", "ジャンクのCRT", "話す・記録を見せる"),
        object("machine", "接続・解析機械", "本編座標・URL・履歴"),
        object("workbench", "作業台", "自分のページを編集"),
        object("shelf", "UIの棚", "取引・回収品"),
        object("server", "サーバーラック", "自分の処理能力"),
        object("power", "電源設備", "機械の解析用エネルギー"),
        object("radio", "古い通信機", "店の奥"),
        object("exit", "出入口", "ページへ戻る"),
      );
      if (state.records.includes("broken-counter"))
        scene.append(
          make(
            "div",
            "story-keepsake-counter",
            state.stageId === "salvage" ? "▨ 000---" : "▨ 修理済み",
          ),
        );
      const panel = make("section", "story-detail");
      panel.setAttribute("aria-live", "polite");
      showObject(panel);
      root.append(scene, panel);
      if (state.phase === "encounter" && state.pendingEncounter) {
        const interrupted = make("section", "story-interrupted");
        interrupted.append(
          make(
            "p",
            "",
            "前の接続の決着を確認できません。元の構成を保ったまま作業場へ戻り、改めて接続できます。",
          ),
        );
        const matchId = state.pendingEncounter.matchId;
        interrupted.append(
          button(
            "中断した接続から作業場へ戻る",
            "recover-encounter",
            () => transact({ type: "cancel-encounter", matchId }),
            "story-secondary",
          ),
        );
        root.append(interrupted);
      }
    }
    const status = make("p", "story-status", message);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    root.append(status);
    host.classList.add("story-host");
    host.replaceChildren(root);
    const renderedPreview = ownPreview as {
      viewport: HTMLElement;
      paper: HTMLElement;
    } | null;
    if (renderedPreview) {
      const { viewport, paper } = renderedPreview;
      const fit = () => {
        const scale = Math.max(0.1, (viewport.clientWidth || 600) / 960);
        paper.style.transform = `scale(${scale})`;
        viewport.style.height = `${680 * scale}px`;
      };
      fit();
      if (typeof ResizeObserver !== "undefined") {
        previewResize = new ResizeObserver(fit);
        previewResize.observe(viewport);
      }
    }
  }
  render();
  return {
    render,
    dispose() {
      previewResize?.disconnect();
      disposed = true;
      namingDraft = null;
      machineDraft = null;
      host.replaceChildren();
    },
  };
}
// The journal only exposes records actually present in progress.
import { STORY_STAGES } from "./content.js";
function storyRecords() {
  return STORY_STAGES.map((stage) => stage.record);
}
