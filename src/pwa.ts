import { registerSW } from "virtual:pwa-register";

/**
 * Registers the service worker (scope = Vite base, /fretlab/) and calls
 * `onNeedRefresh` when a new build has been deployed and is waiting.
 * The returned function activates the waiting worker and reloads.
 */
export function setupPwa(onNeedRefresh: (reload: () => void) => void): void {
  if (!("serviceWorker" in navigator)) return;
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      onNeedRefresh(() => void update(true));
    },
    onRegisteredSW(_url, registration) {
      // Check for a new deployment once an hour while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
}
