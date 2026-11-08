/**
 * BOLIMGFX — V4.2 MOBILE REFRACTION HANDOFF PATCH (V4.3)
 *
 * KEEP THIS FILENAME: fix-mobile-v42.cjs
 * From your Next.js project root, run:
 *   node fix-mobile-v42.cjs
 *
 * This is a narrow patch for the existing V4.2 project. It does not
 * replace the full page, CSS or shader files. It injects a prepared 2D
 * glass transition into page.tsx + globals.css (mobile only).
 * liquidGlass.js and rearCardRaster.ts are untouched.
 *
 * Front glass stays WebGL; the 2D preview is only used during a swipe
 * to prevent the glass from appearing late when Mobile Safari settles.
 */

"use strict";
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = process.cwd();
const pagePath = path.join(root, "app", "page.tsx");
const cssPath = path.join(root, "app", "globals.css");
const MARK = "BOLIM_MOBILE_GLASS_V43";

if (!fs.existsSync(pagePath) || !fs.existsSync(cssPath)) {
  throw new Error("Run from the Next.js project root (beside package.json). No files changed.");
}

const inputPage = fs.readFileSync(pagePath, "utf8").replace(/\r\n/g, "\n");
const inputCss = fs.readFileSync(cssPath, "utf8").replace(/\r\n/g, "\n");
let page = inputPage;
let css = inputCss;

if (page.includes(MARK) && css.includes(MARK)) {
  console.log("Mobile glass patch V4.3 is already installed. Nothing changed.");
  process.exit(0);
}
if (page.includes(MARK) || css.includes(MARK)) {
  throw new Error("Partial V4.3 patch detected; restore your V4.2 files first. Nothing changed.");
}
if (
  !page.includes('createRearRaster') ||
  !page.includes('mobile-glass-settling') ||
  !page.includes('renderSettledGlass') ||
  !css.includes('BOLIM V4.2')
) {
  throw new Error("Expected the uploaded V4.2 baseline. Nothing changed.");
}

function once(text, oldText, newText, name) {
  const first = text.indexOf(oldText);
  if (first < 0 || text.indexOf(oldText, first + 1) !== -1) {
    const count = first < 0 ? 0 : 2;
    throw new Error(`Cannot safely match ${name} (count ${count}). Nothing changed.`);
  }
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

function exactlyTwice(text, oldText, newText, name) {
  const occurrences = text.split(oldText).length - 1;
  if (occurrences !== 2) {
    throw new Error(`Expected 2 occurrences of ${name}; found ${occurrences}. Nothing changed.`);
  }
  return text.split(oldText).join(newText);
}

// ------------------------------------------------------------------
// 1. Stable refs for one prepared mobile frame and background prewarm.
// ------------------------------------------------------------------
page = once(
  page,
  `  const renderSettledGlass =\n    useRef<() => void>(() => {});`,
  `  const renderSettledGlass =\n    useRef<() => void>(() => {});\n\n  // ${MARK}: mobile-only pre-rendered glass handoff.\n  const prepareIncomingGlass =\n    useRef<(index: number) => boolean>(() => false);\n  const warmAdjacentGlass =\n    useRef<() => void>(() => {});`,
  "mobile glass refs"
);

page = once(
  page,
  `    let previewSize = "";`,
  `    let previewSize = "";\n\n    // All previews are cached by the existing snapshot geometry.\n    const preparedLens = new Set<number>();\n    let preparedKey = "";\n    let warmTimer: number | null = null;`,
  "mobile lens cache"
);

// ------------------------------------------------------------------
// 2. A forced render is allowed only for the future front card.
//    Desktop and the regular mobile idle render remain unchanged.
// ------------------------------------------------------------------
page = once(
  page,
  `    function paint() {\n      if (disposed || document.hidden || !deck) return;\n\n      // Avoid mobile WebKit compositing jitter.\n      if (\n        mobileGlassDevice() &&\n        flightRunning.current\n      ) {\n        return;\n      }`,
  `    function paint(\n      force = false,\n      onlyIndex: number | null = null\n    ): boolean {\n      if (disposed || document.hidden || !deck) return false;\n\n      // No live WebGL redraw while moving in iOS WebKit.\n      if (\n        !force &&\n        mobileGlassDevice() &&\n        flightRunning.current\n      ) {\n        return false;\n      }\n\n      let painted = false;`,
  "render entry"
);
page = once(
  page,
  `      if (!stageW || !stageH) return;`,
  `      if (!stageW || !stageH) return false;`,
  "stage size guard"
);
page = once(
  page,
  `        const index = Number(card.dataset.cardIndex);\n        const nextIndex = (index + 1) % TOTAL;`,
  `        const index = Number(card.dataset.cardIndex);\n        if (onlyIndex !== null && index !== onlyIndex) continue;\n        const nextIndex = (index + 1) % TOTAL;`,
  "future card selector"
);
page = once(
  page,
  `          lightY: mouse.current.y + 0.5,\n        });\n\n        if (\n          isFront &&`,
  `          lightY: mouse.current.y + 0.5,\n        });\n        painted = true;\n\n        if (\n          !force &&\n          isFront &&`,
  "render completion and glass-ready guard"
);
page = once(
  page,
  `      lastPaint = performance.now();\n    }\n\n    function queue() {`,
  `      lastPaint = performance.now();\n      return painted;\n    }\n\n    function queue() {`,
  "return rendered status"
);

// ------------------------------------------------------------------
// 3. Prepare a texture in the incoming card's FINAL 3D geometry,
//    while preserving the existing WebGL canvas and shader settings.
//    Copy immediately to a 2D layer (works with preserveDrawingBuffer=false).
// ------------------------------------------------------------------
const prepareBlock = `
    function prepareFrontLens(targetIndex: number): boolean {
      if (
        disposed ||
        !mobileGlassDevice() ||
        document.hidden ||
        flightRunning.current ||
        deck.classList.contains("swiping-live")
      ) {
        return false;
      }

      const geometry = [
        snapshots.current.key,
        deck.clientWidth,
        deck.clientHeight,
      ].join(":");

      if (geometry !== preparedKey) {
        preparedKey = geometry;
        preparedLens.clear();
      }

      const sourceIndex = (targetIndex + 1) % TOTAL;
      if (!snapshots.current.images[sourceIndex]) return false;
      if (preparedLens.has(targetIndex)) return true;

      const incoming = cards.find(
        (c) => Number(c.dataset.cardIndex) === targetIndex
      );
      const preview = incoming?.querySelector<HTMLCanvasElement>(
        ".card-glass-preview"
      );
      const live = incoming?.querySelector<HTMLCanvasElement>(
        ".card-liquid-canvas"
      );
      if (!incoming || !preview || !live) return false;

      const originalClasses = cards.map((card) => card.className);
      const slots = [
        "front", "rear-one", "rear-two", "rear-three", "rear-four"
      ];

      try {
        // There is no browser paint between these synchronous DOM changes.
        // Avoid interpolated transforms when measuring future card corners.
        deck.classList.add("glass-preparing");
        cards.forEach((card, i) => {
          const index = Number(card.dataset.cardIndex);
          const slot = slots[(index - targetIndex + TOTAL) % TOTAL];
          card.className =
            "deck-card " + slot +
            (originalClasses[i].includes("has-rear-preview")
              ? " has-rear-preview" : "");
        });

        if (!paint(true, targetIndex) || !live.width || !live.height) {
          return false;
        }

        // Important: copy in the same task as WebGL draw, BEFORE the
        // WebGL drawing buffer can be discarded by the compositor.
        preview.width = live.width;
        preview.height = live.height;
        const ctx = preview.getContext("2d");
        if (!ctx) return false;
        ctx.drawImage(live, 0, 0);
        preparedLens.add(targetIndex);
        return true;
      } catch (error) {
        console.warn("Mobile glass preparation skipped:", error);
        return false;
      } finally {
        cards.forEach((card, i) => {
          card.className = originalClasses[i];
        });
        // Flush the restored poses while transitions are disabled.
        void deck.offsetWidth;
        deck.classList.remove("glass-preparing");
      }
    }

    prepareIncomingGlass.current = prepareFrontLens;

    function warmNeighbors() {
      if (
        disposed || !mobileGlassDevice() ||
        flightRunning.current || warmTimer !== null
      ) return;

      // Schedule preparation off the swipe's animation frames.
      warmTimer = window.setTimeout(() => {
        warmTimer = null;
        if (
          disposed || document.hidden || flightRunning.current ||
          deck.classList.contains("mobile-glass-settling")
        ) return;

        const current = activeRef.current;
        prepareFrontLens((current + 1) % TOTAL);

        window.setTimeout(() => {
          if (
            disposed || document.hidden || flightRunning.current ||
            deck.classList.contains("mobile-glass-settling")
          ) return;
          prepareFrontLens((activeRef.current + TOTAL - 1) % TOTAL);
        }, 100);
      }, 65);
    }

    warmAdjacentGlass.current = warmNeighbors;
`;

page = once(
  page,
  `    repaint.current = queue;\n    renderSettledGlass.current = paint;`,
  `    repaint.current = queue;\n    renderSettledGlass.current = () => { void paint(); };\n${prepareBlock}`,
  "preparing front glass texture"
);

// ------------------------------------------------------------------
// 4. Prioritize the glass source for the next swipe. Existing rear
//    raster builder remains in place; only non-urgent depths are deferred.
// ------------------------------------------------------------------
page = once(
  page,
  `      const priority = (frontIndex + 1) % TOTAL;\n\n      const order = [\n        priority,\n        ...Array.from(\n          { length: TOTAL },\n          (_, i) => i\n        ).filter((i) => i !== priority),\n      ];`,
  `      const priority = (frontIndex + 1) % TOTAL;\n      const lookahead = (frontIndex + 2) % TOTAL;\n      const previous = (frontIndex + TOTAL - 1) % TOTAL;\n\n      // Refraction for the NEXT front card uses TWO cards ahead.\n      const order = [priority, lookahead, frontIndex, previous,\n        ...Array.from({ length: TOTAL }, (_, i) => i)\n      ].filter((index, pos, all) => all.indexOf(index) === pos);`,
  "capture priority"
);

// Preserve the depth-specific blur itself: only move extra variants to
// idle work after snapshots have been captured.
const rasterStart = `            // Create blur textures only\n            // when the browser is idle.\n\n            if (mobileGlassDevice()) {`;
const rasterEnd = `            if (index === priority) {`;
const s = page.indexOf(rasterStart);
const e = page.indexOf(rasterEnd, s + rasterStart.length);
if (s < 0 || e < 0 || page.indexOf(rasterStart, s + 1) !== -1) {
  throw new Error("Cannot locate the V4.2 rear-raster block. Nothing changed.");
}
page = page.slice(0, s) + `            warmNeighbors();

            // Keep the immediate depth raster for visual continuity.
            // Alternate depths are finished after source-card captures.
            if (mobileGlassDevice()) {
              const slot = (index - activeRef.current + TOTAL) % TOTAL;
              const depth = slot || 4;
              let variants = previewCache.get(index);
              if (!variants) {
                variants = new Map();
                previewCache.set(index, variants);
              }

              await waitForSwipe();
              await idle();
              await waitForSwipe();
              if (
                !disposed && previewSize === key &&
                images[index] && !variants.has(depth)
              ) {
                variants.set(
                  depth,
                  createRearRaster(images[index]!, width, height, depth)
                );
                refreshRearPreviews();
              }
            }

` + page.slice(e);

// Compute other depth variants later, without holding up source capture.
const idleRasterBuilder = `
    async function finishOtherRearDepths(
      key: string,
      width: number,
      height: number,
      images: (HTMLCanvasElement | null)[]
    ) {
      if (!mobileGlassDevice()) return;
      for (let index = 0; index < TOTAL; index++) {
        const image = images[index];
        if (!image) continue;
        let variants = previewCache.get(index);
        if (!variants) {
          variants = new Map();
          previewCache.set(index, variants);
        }
        for (const depth of [1, 2, 3, 4]) {
          if (disposed || previewSize !== key) return;
          if (variants.has(depth)) continue;
          await waitForSwipe();
          await idle();
          await waitForSwipe();
          if (disposed || previewSize !== key) return;
          if (!variants.has(depth)) {
            variants.set(
              depth, createRearRaster(image, width, height, depth)
            );
            refreshRearPreviews();
          }
        }
      }
    }
`;
page = once(
  page,
  `    async function captureCards() {`,
  `${idleRasterBuilder}\n    async function captureCards() {`,
  "remaining blur worker"
);
page = once(
  page,
  `      if (!disposed) {\n        snapshots.current = {\n          key,\n          images: [...images],\n        };\n\n        queue();\n      }\n    }`,
  `      if (!disposed) {\n        snapshots.current = {\n          key,\n          images: [...images],\n        };\n\n        queue();\n        warmNeighbors();\n        void finishOtherRearDepths(key, width, height, images)\n          .catch((error) => console.warn("Rear raster idle work:", error));\n      }\n    }`,
  "background blur generation"
);
page = once(
  page,
  `      repaint.current = () => {};\n      renderSettledGlass.current = () => {};\n      updateRearPreview.current = () => {};`,
  `      if (warmTimer !== null) window.clearTimeout(warmTimer);\n\n      repaint.current = () => {};\n      renderSettledGlass.current = () => {};\n      prepareIncomingGlass.current = () => false;\n      warmAdjacentGlass.current = () => {};\n      updateRearPreview.current = () => {};`,
  "renderer cleanup"
);
page = once(
  page,
  `  useEffect(() => {\n    repaint.current();\n    updateRearPreview.current();\n  }, [active]);`,
  `  useEffect(() => {\n    repaint.current();\n    updateRearPreview.current();\n    warmAdjacentGlass.current();\n  }, [active]);`,
  "card active prewarm"
);

// ------------------------------------------------------------------
// 5. Before any mobile orbit: use the pre-warmed frame (or render once
//    synchronously when the cache is cold). Never animate a blank lens.
// ------------------------------------------------------------------
page = once(
  page,
  `    if (!incoming) return;\n\n    busy.current = true;`,
  `    if (!incoming) return;\n\n    if (mobileGlassDevice()) {\n      incoming.dataset.glassPrepared =\n        prepareIncomingGlass.current(toActive) ? "1" : "0";\n    }\n\n    busy.current = true;`,
  "pre-orbit glass handoff"
);

page = once(
  page,
  `        rearRaster:\n          card.querySelector<HTMLElement>(\n            ".card-rear-raster"\n          ),`,
  `        rearRaster:\n          card.querySelector<HTMLElement>(\n            ".card-rear-raster"\n          ),\n        glassPreview:\n          card.querySelector<HTMLElement>(\n            ".card-glass-preview"\n          ),`,
  "incoming lens animation ref"
);

page = once(
  page,
  `      if (mobileGlassDevice()) {\n        tween(\n          item.rearRaster,\n          "opacity",\n          item.startRasterOpacity,\n          item.endRasterOpacity,\n          fadeBegin,\n          fadeEnd\n        );\n      }`,
  `      if (mobileGlassDevice()) {\n        tween(\n          item.rearRaster,\n          "opacity",\n          item.startRasterOpacity,\n          item.endRasterOpacity,\n          fadeBegin,\n          fadeEnd\n        );\n\n        if (\n          isArriving &&\n          item.card.dataset.glassPrepared === "1"\n        ) {\n          tween(\n            item.glassPreview, "opacity",\n            0, 1, fadeBegin, fadeEnd\n          );\n        }\n      }`,
  "prepared preview fade with existing animation timing"
);

page = once(
  page,
  `            <canvas\n              className="card-rear-raster"\n              aria-hidden="true"\n            />`,
  `            <canvas\n              className="card-rear-raster"\n              aria-hidden="true"\n            />\n\n            <canvas\n              className="card-glass-preview"\n              aria-hidden="true"\n            />`,
  "prepared 2D canvas"
);

// Two mobile exit paths share the same handoff. Clean any data marker
// and warm the neighbors for the next swipe after the settled render.
for (const indent of ["            ", "              "]) {
  page = once(
    page,
    `${indent}stageElement.classList.remove(\n${indent}  "mobile-glass-flight",\n${indent}  "mobile-glass-settling"\n${indent});`,
    `${indent}stageElement.classList.remove(\n${indent}  "mobile-glass-flight",\n${indent}  "mobile-glass-settling"\n${indent});\n${indent}incomingCard.removeAttribute("data-glass-prepared");\n${indent}warmAdjacentGlass.current();`,
    "settle completion"
  );
}

// ------------------------------------------------------------------
// 6. CSS overlay is mobile-only. Desktop's WebGL / 3D styling is untouched.
// ------------------------------------------------------------------
css += `

/* ${MARK}: prepared mobile refraction during each 3D swipe. */
.card-glass-preview { display: none; }
.deck-card.lens-capture .card-glass-preview { display: none !important; }

@media (max-width: 600px) and (pointer: coarse) {
  .deck-stage.glass-preparing .deck-card,
  .deck-stage.glass-preparing .deck-card :is(
    .card-header, .card-body, .card-footer
  ) { transition: none !important; }

  .deck-stage .deck-card > .card-glass-preview {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    display: block;
    opacity: 0;
    border-radius: inherit;
    pointer-events: none;
  }

  /* The frozen prepared preview covers the solid fallback while WebGL
     renders the same lens at the final resting coordinates. */
  .deck-stage.mobile-glass-settling
  .deck-card.front[data-glass-prepared="1"]
  > .card-glass-preview {
    opacity: 1 !important;
  }
}
`;

// ------------------------------------------------------------------
// 7. Parse-check FIRST. No partial writes if a baseline patch fails.
// ------------------------------------------------------------------
const parsed = ts.createSourceFile(
  "page.tsx", page, ts.ScriptTarget.Latest,
  true, ts.ScriptKind.TSX
);
if (parsed.parseDiagnostics.length) {
  const error = parsed.parseDiagnostics[0];
  const loc = parsed.getLineAndCharacterOfPosition(error.start ?? 0);
  throw new Error(
    `Generated TSX syntax error ${loc.line + 1}:${loc.character + 1}: ` +
    ts.flattenDiagnosticMessageText(error.messageText, " ")
  );
}

fs.copyFileSync(pagePath, pagePath + ".before-v43");
fs.copyFileSync(cssPath, cssPath + ".before-v43");
fs.writeFileSync(pagePath, page, "utf8");
fs.writeFileSync(cssPath, css, "utf8");

console.log("Mobile glass handoff V4.3 installed via fix-mobile-v42.cjs.");
console.log("Targeted patches: app/page.tsx and app/globals.css (mobile only).");
console.log("Untouched: app/liquidGlass.js and app/rearCardRaster.ts.");
console.log("Backups: app/page.tsx.before-v43, app/globals.css.before-v43.");
