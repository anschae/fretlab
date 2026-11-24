/** Feature detection so the UI can degrade gracefully with a clear message. */
export interface AudioFeatures {
  webAudio: boolean;
  audioWorklet: boolean;
  getUserMedia: boolean;
  setSinkId: boolean;
  /** iOS / iPadOS: the ring/silent switch can mute web audio */
  ios: boolean;
}

export function detectAudioFeatures(): AudioFeatures {
  const w = typeof window !== "undefined" ? window : undefined;
  const AC = w && ((w as unknown as { AudioContext?: unknown }).AudioContext ?? (w as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return {
    webAudio: !!AC,
    audioWorklet: typeof AudioWorkletNode !== "undefined",
    getUserMedia: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    setSinkId: typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype,
    ios,
  };
}
