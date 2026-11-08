
/**
 * bolimgfx — V4.3 Mobile Glass TypeScript Build Fix
 * Fixes TS18047: 'deck' is possibly 'null'.
 *
 * Run: node fix-mobile-v42.cjs
 *
 * Only updates app/page.tsx.
 * Does not modify globals.css or liquidGlass.js.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "app",
  "page.tsx"
);

if (!fs.existsSync(pagePath)) {
  throw new Error(
    "app/page.tsx not found. Run from your project root."
  );
}

const original = fs.readFileSync(pagePath, "utf8");

if (!original.includes("BOLIM_MOBILE_GLASS_V43")) {
  throw new Error(
    "V4.3 mobile glass patch not found. No files changed."
  );
}

let updated = original;

const EOL = original.includes("\r\n")
  ? "\r\n"
  : "\n";

let changes = 0;

function addDeckGuard(
  functionHeader,
  fallback,
  description
) {
  const oldPart =
    `${functionHeader}${EOL}      if (`;

  const newPart =
    `${functionHeader}${EOL}` +
    `      const deck = deckRef.current;${EOL}` +
    `      if (!deck) return${fallback};${EOL}` +
    `      if (`;

  const count = updated.split(oldPart).length - 1;

  if (count === 1) {
    updated = updated.replace(oldPart, newPart);
    changes++;

    console.log(`Fixed: ${description}`);
  } else if (
    count === 0 &&
    updated.includes(newPart)
  ) {
    console.log(`Already fixed: ${description}`);
  } else {
    throw new Error(
      `Unexpected ${description} structure. No files changed.`
    );
  }
}

addDeckGuard(
  "    function prepareFrontLens(targetIndex: number): boolean {",
  " false",
  "prepareFrontLens"
);

addDeckGuard(
  "    function warmNeighbors() {",
  "",
  "warmNeighbors"
);

if (changes === 0) {
  console.log(
    "TypeScript deck guards already installed. No changes needed."
  );

  process.exit(0);
}

const backupPath =
  pagePath + ".before-deck-null-fix";

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(pagePath, backupPath);
}

fs.writeFileSync(pagePath, updated, "utf8");

console.log(
  "Saved app/page.tsx. globals.css and liquidGlass.js untouched."
);

console.log("Next: npm run build");
