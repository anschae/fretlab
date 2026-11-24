import { h, clear } from "../dom";

/** Result line under a question. Uses an icon + text, announced to screen readers. */
export class Feedback {
  readonly el = h("div", { class: "feedback", role: "status", "aria-live": "polite" });

  show(kind: "correct" | "wrong" | "info", title: string, lines: string[] = []): void {
    clear(this.el);
    this.el.className = `feedback ${kind}`;
    const icon = kind === "correct" ? "✓" : kind === "wrong" ? "✗" : "ℹ";
    this.el.append(
      h("span", { class: "feedback-icon", "aria-hidden": "true" }, icon),
      h("div", { class: "feedback-text" }, h("strong", null, title), ...lines.map((l) => h("div", null, l))),
    );
  }

  clear(): void {
    clear(this.el);
    this.el.className = "feedback";
  }
}
