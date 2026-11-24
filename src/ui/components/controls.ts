import { h, uid, type Child } from "../dom";

/** Small, accessible form controls shared by settings panels. */

export function section(title: string, ...children: Child[]): HTMLElement {
  return h("section", { class: "panel-section" }, h("h3", null, title), ...children);
}

export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = control.id || uid("f");
  control.id = id;
  return h(
    "div",
    { class: "field" },
    h("label", { for: id }, label),
    control,
    hint ? h("p", { class: "hint" }, hint) : null,
  );
}

export function checkbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h("input", { type: "checkbox", checked, onChange: () => onChange(input.checked) });
  return h("label", { class: "check" }, input, h("span", null, label));
}

export function select<T extends string | number>(options: { value: T; label: string }[], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const el = h(
    "select",
    { onChange: () => onChange(options[el.selectedIndex]?.value as T) },
    ...options.map((o) => h("option", { value: String(o.value), selected: o.value === value }, o.label)),
  );
  return el;
}

/** Radio-button group styled as a segmented control (keyboard accessible). */
export function segmented<T extends string | number>(name: string, options: { value: T; label: string }[], value: T, onChange: (v: T) => void): HTMLElement {
  const group = uid(name);
  return h(
    "div",
    { class: "segmented", role: "radiogroup", "aria-label": name },
    ...options.map((o) => {
      const input = h("input", { type: "radio", name: group, value: String(o.value), checked: o.value === value, onChange: () => input.checked && onChange(o.value) });
      return h("label", null, input, h("span", null, o.label));
    }),
  );
}

export function numberInput(value: number, min: number, max: number, onChange: (v: number) => void, step = 1): HTMLInputElement {
  const el = h("input", {
    type: "number",
    min,
    max,
    step,
    value,
    inputmode: "numeric",
    onChange: () => {
      const v = Math.max(min, Math.min(max, Number(el.value)));
      if (Number.isFinite(v)) {
        el.value = String(v);
        onChange(v);
      }
    },
  });
  return el;
}

export function slider(value: number, min: number, max: number, step: number, format: (v: number) => string, onChange: (v: number) => void): HTMLElement {
  const out = h("output", null, format(value));
  const input = h("input", {
    type: "range",
    min,
    max,
    step,
    value,
    onInput: () => {
      out.textContent = format(Number(input.value));
    },
    onChange: () => onChange(Number(input.value)),
  });
  return h("div", { class: "slider" }, input, out);
}

/**
 * A group of checkboxes with "all"/"none" shortcuts. `presets` add buttons
 * that select a predefined subset.
 */
export function checkboxGroup(
  items: { id: string; label: string }[],
  selected: readonly string[],
  onChange: (ids: string[]) => void,
  labels: { all: string; none: string },
  presets: { label: string; ids: string[] }[] = [],
): HTMLElement {
  const state = new Set(selected);
  const inputs = new Map<string, HTMLInputElement>();
  const emit = () => onChange(items.map((i) => i.id).filter((id) => state.has(id)));
  const setAll = (ids: string[]) => {
    state.clear();
    for (const id of ids) state.add(id);
    for (const [id, inp] of inputs) inp.checked = state.has(id);
    emit();
  };
  const boxes = items.map((it) => {
    const input = h("input", {
      type: "checkbox",
      checked: state.has(it.id),
      onChange: () => {
        if (input.checked) state.add(it.id);
        else state.delete(it.id);
        emit();
      },
    });
    inputs.set(it.id, input);
    return h("label", { class: "chip" }, input, h("span", null, it.label));
  });
  return h(
    "div",
    { class: "checkbox-group" },
    h(
      "div",
      { class: "chip-actions" },
      ...presets.map((p) => h("button", { type: "button", class: "btn small ghost", onClick: () => setAll(p.ids) }, p.label)),
      h("button", { type: "button", class: "btn small ghost", onClick: () => setAll(items.map((i) => i.id)) }, labels.all),
      h("button", { type: "button", class: "btn small ghost", onClick: () => setAll([]) }, labels.none),
    ),
    h("div", { class: "chips" }, ...boxes),
  );
}

export function fretRangeInput(
  range: { min: number; max: number },
  onChange: (r: { min: number; max: number }) => void,
  labels: { from: string; to: string },
  maxFret = 24,
): HTMLElement {
  let cur = { ...range };
  const lo = numberInput(cur.min, 0, maxFret, (v) => {
    cur = { min: v, max: Math.max(v, cur.max) };
    hi.value = String(cur.max);
    onChange(cur);
  });
  const hi = numberInput(cur.max, 0, maxFret, (v) => {
    cur = { min: Math.min(v, cur.min), max: v };
    lo.value = String(cur.min);
    onChange(cur);
  });
  lo.setAttribute("aria-label", labels.from);
  hi.setAttribute("aria-label", labels.to);
  return h("div", { class: "fret-range" }, h("span", null, labels.from), lo, h("span", null, labels.to), hi);
}
