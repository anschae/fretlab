import "./styles.css";
import { MODULES } from "./exercises/registry";
import { setupPwa } from "./pwa";
import { Services } from "./services";
import { AppShell } from "./ui/layout/AppShell";

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");

const app = new Services();
const shell = new AppShell(root, app, MODULES);

// Save before the tab goes away (writes are debounced).
window.addEventListener("pagehide", () => app.storage.flush());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") app.storage.flush();
});

setupPwa((reload) => {
  shell.toast(app.t("update.available"), { label: app.t("update.reload"), run: reload });
});

if (import.meta.env.DEV) (window as unknown as { fretlab: unknown }).fretlab = app;
