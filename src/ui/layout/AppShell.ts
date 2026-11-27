import { CATEGORIES, type AppModule } from "../../exercises/types";
import type { Services } from "../../services";
import { summarize } from "../../state/stats";
import { h, clear } from "../dom";
import { ExerciseRunner } from "../runner/ExerciseRunner";
import { renderSettingsPage } from "./SettingsPage";

type Route = { page: "home" } | { page: "settings" } | { page: "stats" } | { page: "module"; id: string };

function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "settings") return { page: "settings" };
  if (parts[0] === "stats") return { page: "stats" };
  if ((parts[0] === "ex" || parts[0] === "tool") && parts[1]) return { page: "module", id: decodeURIComponent(parts[1]) };
  return { page: "home" };
}

const href = (r: string) => `#/${r}`;

/**
 * App shell: header + navigation, a hash router (works on GitHub Pages
 * without server rewrites), the "tap to start" overlay and toasts.
 */
export class AppShell {
  private readonly main = h("main", { id: "main", tabindex: "-1" });
  private readonly header = h("header", { class: "app-header" });
  private readonly toasts = h("div", { class: "toasts", "aria-live": "polite" });
  private readonly overlay = h("div", { class: "start-overlay", hidden: true });
  private cleanup: (() => void) | null = null;
  private currentNeedsAudio = false;
  private overlayMode: "hidden" | "start" | "unsupported" = "hidden";

  constructor(
    private readonly root: HTMLElement,
    private readonly app: Services,
    private readonly modules: readonly AppModule[],
  ) {
    for (const m of modules) if (m.messages) app.i18n.register({ en: m.messages.en, de: m.messages.de ?? {} });
    root.append(h("a", { class: "skip-link", href: "#main" }, "Skip to content"), this.header, this.main, this.overlay, this.toasts);
    window.addEventListener("hashchange", () => this.route());
    app.i18n.onChange(() => this.route());

    // First user gesture anywhere unlocks audio (autoplay policy)
    const unlock = () => void app.audio.unlock().then(() => this.updateOverlay());
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    app.audio.onStateChange(() => this.updateOverlay());
    this.route();
  }

  toast(message: string, action?: { label: string; run: () => void }, ms = 6000): void {
    const el = h(
      "div",
      { class: "toast", role: "status" },
      h("span", null, message),
      action ? h("button", { type: "button", class: "btn small primary", onClick: () => (action.run(), el.remove()) }, action.label) : null,
      h("button", { type: "button", class: "btn small ghost", "aria-label": this.app.t("common.close"), onClick: () => el.remove() }, "×"),
    );
    this.toasts.append(el);
    if (!action) setTimeout(() => el.remove(), ms);
  }

  private renderHeader(route: Route): void {
    const t = this.app.t;
    clear(this.header);
    const link = (r: string, label: string, active: boolean) => h("a", { href: href(r), class: ["nav-link", active && "active"], "aria-current": active ? "page" : undefined }, label);
    this.header.append(
      h("a", { href: href(""), class: "brand" }, h("img", { src: `${import.meta.env.BASE_URL}favicon.svg`, alt: "", width: 28, height: 28 }), h("span", null, t("app.title"))),
      h(
        "nav",
        { "aria-label": t("nav.menu") },
        link("", t("nav.home"), route.page === "home" || route.page === "module"),
        link("stats", t("nav.stats"), route.page === "stats"),
        link("settings", t("nav.settings"), route.page === "settings"),
      ),
      h("span", { class: "tuning-pill", title: t("settings.tuning") }, this.app.tuningName(this.app.tuning)),
    );
  }

  private route(): void {
    const route = parseRoute(location.hash);
    this.cleanup?.();
    this.cleanup = null;
    clear(this.main);
    this.renderHeader(route);
    this.currentNeedsAudio = false;
    this.overlayMode = "hidden";
    clear(this.overlay);
    this.overlay.hidden = true;
    const unsubHeader = this.app.onSettingsChange(() => this.renderHeader(route));

    let cleanup: () => void = () => undefined;
    if (route.page === "settings") cleanup = renderSettingsPage(this.main, this.app, (m) => this.toast(m));
    else if (route.page === "stats") cleanup = this.renderStats();
    else if (route.page === "module") cleanup = this.renderModule(route.id);
    else cleanup = this.renderHome();
    this.cleanup = () => {
      unsubHeader();
      cleanup();
    };
    this.updateOverlay();
    document.title = this.app.t("app.title");
  }

  private renderHome(): () => void {
    const t = this.app.t;
    const page = h("div", { class: "page home" }, h("p", { class: "tagline" }, t("app.tagline")));
    for (const cat of CATEGORIES) {
      const mods = this.modules.filter((m) => m.category === cat);
      if (mods.length === 0) continue;
      page.append(
        h(
          "section",
          { class: "home-section" },
          h("h2", null, t(`category.${cat}`)),
          h(
            "ul",
            { class: "card-list" },
            ...mods.map((m) => {
              const sum = m.kind === "exercise" ? summarize(this.app.stats[m.id]) : null;
              return h(
                "li",
                null,
                h(
                  "a",
                  { class: "card", href: href(`${m.kind === "tool" ? "tool" : "ex"}/${m.id}`) },
                  h("strong", null, t(m.titleKey)),
                  m.descriptionKey ? h("span", { class: "muted" }, t(m.descriptionKey)) : null,
                  m.kind === "tool"
                    ? h("span", { class: "badge" }, t("home.tool"))
                    : sum && sum.attempts
                      ? h("span", { class: "badge" }, `${Math.round((sum.accuracy ?? 0) * 100)} % · ${sum.attempts}`)
                      : null,
                ),
              );
            }),
          ),
        ),
      );
    }
    page.append(h("p", { class: "muted" }, t("home.comingSoon")));
    this.main.append(page);
    return () => page.remove();
  }

  private renderModule(id: string): () => void {
    const m = this.modules.find((x) => x.id === id);
    if (!m) {
      location.hash = "#/";
      return () => undefined;
    }
    const back = h("a", { href: href(""), class: "back-link" }, "← ", this.app.t("nav.back"));
    this.main.append(back);
    if (m.kind === "tool") {
      const box = h("div", { class: "page tool" });
      this.main.append(box);
      const app = this.app;
      const stop = m.render(box, {
        t: app.t,
        tuning: app.tuning,
        settings: app.settings,
        names: app.names(),
        audio: app.audioPort(),
        unlockAudio: async () => {
          await app.audio.unlock();
          return app.audio.ready();
        },
        load: (defaults) => app.exerciseSettings(m.id, defaults),
        save: (value) => app.setExerciseSettings(m.id, value),
      });
      return () => {
        stop();
        box.remove();
        back.remove();
      };
    }
    this.currentNeedsAudio = !!m.needsAudio;
    const runner = new ExerciseRunner(m, this.app);
    const page = h("div", { class: "page exercise" });
    this.main.append(page);
    runner.mount(page);
    return () => {
      runner.destroy();
      page.remove();
      back.remove();
    };
  }

  private renderStats(): () => void {
    const t = this.app.t;
    const page = h("div", { class: "page stats-page" }, h("h2", null, t("nav.stats")), h("p", { class: "muted" }, t("stats.placeholder")));
    const table = h("table", { class: "stats-table" });
    table.append(h("thead", null, h("tr", null, h("th", null, ""), h("th", null, t("runner.accuracy")), h("th", null, t("stats.attempts")), h("th", null, ""))));
    const body = h("tbody");
    for (const m of this.modules) {
      if (m.kind !== "exercise") continue;
      const sum = summarize(this.app.stats[m.id]);
      body.append(
        h(
          "tr",
          null,
          h("th", { scope: "row" }, t(m.titleKey)),
          h("td", null, sum.accuracy === null ? "–" : `${Math.round(sum.accuracy * 100)} %`),
          h("td", null, String(sum.attempts)),
          h(
            "td",
            null,
            h(
              "button",
              {
                type: "button",
                class: "btn small ghost",
                disabled: !sum.attempts,
                onClick: () => {
                  if (confirm(t("stats.resetConfirm", { name: t(m.titleKey) }))) {
                    this.app.resetStats(m.id);
                    this.route();
                  }
                },
              },
              t("stats.reset"),
            ),
          ),
        ),
      );
    }
    table.append(body);
    page.append(table);
    this.main.append(page);
    return () => page.remove();
  }

  /**
   * Shows "Tap to start" while an audio exercise is open and audio is locked.
   * Re-renders only when its mode changes (re-rendering during the tap would
   * swallow the click), and when audio becomes available after the overlay
   * was shown, asks the runner to play the pending question.
   */
  private updateOverlay(): void {
    const state = this.app.audio.state;
    const mode: "hidden" | "start" | "unsupported" = !this.currentNeedsAudio
      ? "hidden"
      : state === "unsupported"
        ? "unsupported"
        : state === "running"
          ? "hidden"
          : "start";
    if (mode === this.overlayMode) return;
    const wasStart = this.overlayMode === "start";
    this.overlayMode = mode;
    const t = this.app.t;
    clear(this.overlay);
    this.overlay.hidden = mode === "hidden";
    if (mode === "hidden") {
      if (wasStart && state === "running") {
        void this.app.audio.ready().then(() => window.dispatchEvent(new CustomEvent("fretlab:audio-ready")));
      }
      return;
    }
    if (mode === "unsupported") {
      this.overlay.append(h("div", { class: "start-box" }, h("p", null, t("audio.unsupported"))));
      return;
    }
    const btn = h(
      "button",
      { type: "button", class: "btn primary big", onClick: () => void this.app.audio.unlock() },
      "▶ ",
      t("audio.tapToStart"),
    );
    this.overlay.append(
      h(
        "div",
        { class: "start-box", role: "dialog", "aria-modal": "true", "aria-label": t("audio.tapToStart") },
        btn,
        h("p", { class: "muted" }, t("audio.tapToStartHint")),
        this.app.audio.features.ios ? h("p", { class: "notice" }, "ℹ ", t("audio.iosSilent")) : null,
      ),
    );
    queueMicrotask(() => btn.focus());
  }
}
