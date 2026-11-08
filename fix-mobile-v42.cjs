
/**
 * bolimgfx — V4.5.2 Mobile Footer Stability
 * Run: node fix-mobile-v42.cjs
 *
 * CSS-only patch.
 * Preserves WebGL, dragging, blur and 3D orbit.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(
  process.cwd(),
  "app",
  "globals.css"
);

const marker = "BOLIM_V452_MOBILE_FOOTER_STABILITY";

if (!fs.existsSync(file)) {
  throw new Error(
    "app/globals.css not found. Run from project root."
  );
}

const oldCss = fs.readFileSync(file, "utf8");

if (oldCss.includes(marker)) {
  console.log("V4.5.2 already applied.");
  process.exit(0);
}

if (
  !oldCss.includes(".deck-stage") ||
  !oldCss.includes(".deck-card") ||
  !oldCss.includes(".card-footer")
) {
  throw new Error(
    "Unexpected CSS structure. No files changed."
  );
}

const patch = `
/* ${marker} */

@media (max-width: 600px) and (pointer: coarse) {

  /*
   * Keep the front footer on a stable
   * compositor layer during glass movement.
   */

  .deck-stage
  .deck-card.front > .card-footer {
    position: relative;
    z-index: 3;

    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;

    -webkit-transform: translate3d(0, 0, 1px);
    transform: translate3d(0, 0, 1px);
  }

  /*
   * Keep the footer visible while holding
   * and returning to its resting position.
   *
   * Normal swipe opacity animations are
   * intentionally not overridden.
   */

  .deck-stage:not(.swiping-live)
  .deck-card.front > .card-footer {
    opacity: 1 !important;
  }
}
`;

const backup = file + ".before-v452";
const temp = file + ".v452tmp";

try {
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup);
  }

  const eol = oldCss.includes("\r\n")
    ? "\r\n"
    : "\n";

  const updated =
    oldCss.trimEnd() +
    eol + eol +
    patch.trim().replace(/\n/g, eol) +
    eol;

  fs.writeFileSync(temp, updated, "utf8");
  fs.renameSync(temp, file);

} catch (error) {
  if (fs.existsSync(temp)) {
    fs.unlinkSync(temp);
  }

  throw error;
}

console.log("V4.5.2 Mobile Footer Stability applied.");
console.log("Modified: app/globals.css only.");
console.log("Backup: app/globals.css.before-v452");
console.log("Next: npm run build");
