// Regenerates the PWA PNG icons from public/favicon.svg.
// Requires `rsvg-convert` (librsvg) on PATH. The PNGs are committed, so this
// only needs to run when the icon changes.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const src = "public/favicon.svg";
mkdirSync("public/icons", { recursive: true });

for (const size of [192, 512]) {
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), src, "-o", `public/icons/icon-${size}.png`]);
}

// Maskable icon: the artwork must sit inside the 80 % safe zone.
const svg = readFileSync(src, "utf8")
  .replace('<rect width="512" height="512" rx="96" fill="#15120f"/>', '<rect width="512" height="512" fill="#15120f"/><g transform="translate(51 51) scale(0.8)">')
  .replace("</svg>", "</g></svg>");
writeFileSync("/tmp/fretlab-maskable.svg", svg);
execFileSync("rsvg-convert", ["-w", "512", "-h", "512", "/tmp/fretlab-maskable.svg", "-o", "public/icons/icon-maskable-512.png"]);
execFileSync("rsvg-convert", ["-w", "180", "-h", "180", src, "-o", "public/icons/apple-touch-icon.png"]);
console.warn("icons written to public/icons/");
