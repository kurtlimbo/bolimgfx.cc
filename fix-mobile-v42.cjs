
/**
 * BOLIMGFX Mobile Liquid Glass
 * V4.3.2 — No-Blink Handoff
 *
 * Run: node fix-mobile-v42.cjs
 *
 * Only patches app/globals.css.
 * Desktop, shader, and animations untouched.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const pagePath = path.join(root, "app", "page.tsx");
const cssPath = path.join(root, "app", "globals.css");

const marker = "BOLIM_MOBILE_GLASS_V432_NO_BLINK";

if (!fs.existsSync(pagePath) || !fs.existsSync(cssPath)) {
  throw new Error(
    "Run from your Next.js project root. Nothing changed."
  );
}

const page = fs.readFileSync(pagePath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");

// Require the existing V4.3 glass system.

if (
  !page.includes("BOLIM_MOBILE_GLASS_V43") ||
  !page.includes('className="card-glass-preview"') ||
  !css.includes("BOLIM_MOBILE_GLASS_V43")
) {
  throw new Error(
    "V4.3 glass system not found. Nothing changed."
  );
}

// Safe to run again.

if (css.includes(marker)) {
  console.log("V4.3.2 already applied.");
  process.exit(0);
}

const patch = `
/* ${marker} */

@media (max-width: 600px) and (pointer: coarse) {

  /* Preserve existing swipe animation. */

  .deck-stage.swiping-live
  .deck-card > .card-glass-preview {
    transition: none !important;
  }

  /* Prepare live WebGL behind the preview. */

  .deck-stage.mobile-glass-settling
  .deck-card.front[data-glass-prepared="1"]
  > .card-liquid-canvas {
    opacity: 1 !important;
  }

  /* Prevent the solid fallback from flashing. */

  .deck-stage.mobile-glass-settling
  .deck-card.front[data-glass-prepared="1"]
  > .card-surface {
    opacity: 0 !important;
    transition: none !important;
  }

  /* Smooth preview-to-WebGL handoff. */

  .deck-stage .deck-card.front
  > .card-glass-preview {
    transition: opacity 170ms ease-out;
    will-change: opacity;
  }
}
`;

const backup = cssPath + ".before-v432";

if (!fs.existsSync(backup)) {
  fs.copyFileSync(cssPath, backup);
}

fs.writeFileSync(
  cssPath,
  css.trimEnd() + "\n\n" + patch,
  "utf8"
);

console.log("V4.3.2 No-Blink Glass Handoff applied.");
console.log("Updated: app/globals.css only.");
console.log("Desktop and existing animations preserved.");
console.log("Next: npm run build");
