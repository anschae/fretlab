/**
 * Tiny DOM helpers — the whole "framework". `h()` creates HTML elements,
 * `s()` creates SVG elements.
 */
export type Child = Node | string | number | null | undefined | false | Child[];

type Handler = (e: Event) => void;
export interface Props {
  class?: string | (string | false | null | undefined)[];
  style?: string;
  dataset?: Record<string, string>;
  [attr: string]: unknown;
}

function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

function applyProps(el: Element, props: Props | undefined): void {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") {
      const cls = Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v);
      if (cls) el.setAttribute("class", cls);
    } else if (k === "dataset") {
      for (const [dk, dv] of Object.entries(v as Record<string, string>)) (el as HTMLElement).dataset[dk] = dv;
    } else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v as Handler);
    } else if (k === "value" && "value" in el) {
      (el as HTMLInputElement).value = String(v);
    } else if (k === "checked" && "checked" in el) {
      (el as HTMLInputElement).checked = Boolean(v);
    } else if (v === true) {
      el.setAttribute(k, "");
    } else {
      el.setAttribute(k, String(v));
    }
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyProps(el, props ?? undefined);
  append(el, children);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";
export function s<K extends keyof SVGElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props ?? undefined);
  append(el, children);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let idCounter = 0;
export function uid(prefix = "id"): string {
  return `${prefix}-${++idCounter}`;
}
