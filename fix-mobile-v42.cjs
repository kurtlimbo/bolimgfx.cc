
/**
 * bolimgfx — V4.4.1 Smooth Hold & Drag
 * Run: node fix-mobile-v42.cjs
 *
 * Updates app/page.tsx only.
 * No CSS, shader, blur or orbit changes.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(
  process.cwd(),
  "app",
  "page.tsx"
);

const marker = "BOLIM_DRAG_SMOOTH_V44";

if (!fs.existsSync(file)) {
  throw new Error(
    "Missing app/page.tsx. Nothing changed."
  );
}

let ts;

try {
  ts = require("typescript");
} catch {
  throw new Error(
    "TypeScript not found. Run npm install first."
  );
}

const original = fs.readFileSync(file, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
let page = original.replace(/\r\n/g, "\n");

if (page.includes(marker)) {
  console.log("V4.4 already applied. No changes.");
  process.exit(0);
}

function ast() {
  return ts.createSourceFile(
    "page.tsx",
    page,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}

function findFunction(name) {
  const source = ast();
  const matches = [];

  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name &&
      node.body
    ) {
      matches.push(node);
    }

    ts.forEachChild(node, visit);
  }

  visit(source);

  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${name}(), found ${matches.length}. Nothing changed.`
    );
  }

  return { source, node: matches[0] };
}

function replaceExactly(regex, replacement, label) {
  const flags = regex.flags.includes("g")
    ? regex.flags
    : regex.flags + "g";

  const matches = [
    ...page.matchAll(
      new RegExp(regex.source, flags)
    ),
  ];

  if (matches.length !== 1) {
    throw new Error(
      `${label}: expected one match, found ${matches.length}. Nothing changed.`
    );
  }

  page = page.replace(regex, replacement);
}

function insertAtFunctionStart(name, text) {
  const { source, node } = findFunction(name);
  const at = node.body.getStart(source) + 1;

  const lineStart =
    page.lastIndexOf(
      "\n",
      node.getStart(source) - 1
    ) + 1;

  const indent = (
    page
      .slice(lineStart, node.getStart(source))
      .match(/^\s*/) || [""]
  )[0] + "  ";

  const insertion =
    "\n" +
    text
      .split("\n")
      .map((line) => indent + line)
      .join("\n");

  page =
    page.slice(0, at) +
    insertion +
    page.slice(at);
}

// 1. Drag animation refs

replaceExactly(
  /const dragStart\s*=\s*useRef<DragStart\s*\|\s*null>\(\s*null\s*\)\s*;/,
  (match) => `${match}
  // ${marker}
  const dragRaf = useRef<number | null>(null);
  const latestDragAmount = useRef(0);`,
  "drag state"
);

// 2. Cleanup pending frames

{
  const start = page.indexOf(
    "mounted.current = true;"
  );

  const end = page.indexOf(
    "  }, []);",
    start
  );

  if (start < 0 || end < start) {
    throw new Error(
      "Mounted cleanup not found. Nothing changed."
    );
  }

  const section = page.slice(start, end);

  const regex =
    /if\s*\(\s*raf\.current\s*!==\s*null\s*\)\s*cancelAnimationFrame\(raf\.current\)\s*;/g;

  const matches = [...section.matchAll(regex)];

  if (matches.length !== 1) {
    throw new Error(
      "Unmount cleanup not found uniquely."
    );
  }

  const updated = section.replace(
    regex,
    (match) => `${match}

      if (dragRaf.current !== null)
        cancelAnimationFrame(dragRaf.current);`
  );

  page =
    page.slice(0, start) +
    updated +
    page.slice(end);
}

// 3. Reduce expensive glass updates while dragging

const paintInterval =
  /const interval\s*=\s*flightRunning\.current\s*\?\s*GLASS_FLIGHT_INTERVAL\s*:\s*GLASS_IDLE_INTERVAL\s*;/;

if (paintInterval.test(page)) {
  replaceExactly(
    paintInterval,
    `const interval =
          dragStart.current !== null
            ? (mobileGlassDevice() ? 60 : 38)
            : flightRunning.current
              ? GLASS_FLIGHT_INTERVAL
              : GLASS_IDLE_INTERVAL;`,
    "glass repaint cadence"
  );
} else {
  console.log(
    "Glass cadence already customized; unchanged."
  );
}

// 4. Safe mobile glass prewarm guards

insertAtFunctionStart(
  "warmNeighbors",
  "if (dragStart.current !== null) return;"
);

insertAtFunctionStart(
  "prepareFrontLens",
  "if (dragStart.current !== null) return false;"
);

// Pause snapshot capture during dragging

const waitLoop =
  /while\s*\(\s*!disposed\s*&&\s*flightRunning\.current\s*\)/;

if (waitLoop.test(page)) {
  replaceExactly(
    waitLoop,
    "while (!disposed && (flightRunning.current || dragStart.current !== null))",
    "snapshot capture pause"
  );
} else {
  console.log(
    "Snapshot loop customized; unchanged."
  );
}

// 5. Reset pending drag frames

insertAtFunctionStart(
  "resetDrag",
  `if (dragRaf.current !== null) {
  cancelAnimationFrame(dragRaf.current);
  dragRaf.current = null;
}`
);

// 6. One drag update per animation frame

const {
  source: moveSource,
  node: moveNode,
} = findFunction("onPointerMove");

const moveLine =
  page.lastIndexOf(
    "\n",
    moveNode.getStart(moveSource) - 1
  ) + 1;

const moveIndent = (
  page
    .slice(moveLine, moveNode.getStart(moveSource))
    .match(/^\s*/) || [""]
)[0];

const painter = `${moveIndent}function applyDragFrame() {
${moveIndent}  dragRaf.current = null;
${moveIndent}  const deck = deckRef.current;
${moveIndent}  if (
${moveIndent}    !deck ||
${moveIndent}    !dragStart.current ||
${moveIndent}    busy.current ||
${moveIndent}    !deck.classList.contains("dragging")
${moveIndent}  ) return;

${moveIndent}  const amount = latestDragAmount.current;
${moveIndent}  deck.style.setProperty("--drag-x", \`\${amount}px\`);
${moveIndent}  deck.style.setProperty(
${moveIndent}    "--drag-rotate",
${moveIndent}    \`\${(-amount * 0.13).toFixed(2)}deg\`
${moveIndent}  );
${moveIndent}  mouse.current = { x: amount / 250, y: -0.12 };
${moveIndent}  deck.style.setProperty("--light-x", \`\${50 + amount * 0.28}%\`);
${moveIndent}  deck.style.setProperty("--light-y", "12%");
${moveIndent}  repaint.current();
${moveIndent}}

`;

page =
  page.slice(0, moveLine) +
  painter +
  page.slice(moveLine);

// Find held-drag branch structurally

const {
  source: heldSource,
  node: heldNode,
} = findFunction("onPointerMove");

const branches = heldNode.body.statements.filter(
  (node) =>
    ts.isIfStatement(node) &&
    /start\.pointerId\s*===\s*e\.pointerId/.test(
      node.expression.getText(heldSource)
    )
);

if (branches.length !== 1) {
  throw new Error(
    "Held-drag branch not found uniquely."
  );
}

const held = branches[0];

const oldHeld = page.slice(
  held.getStart(heldSource),
  held.getEnd()
);

if (
  !oldHeld.includes("resetParallax()") ||
  !oldHeld.includes("--drag-x") ||
  !oldHeld.includes("repaint.current()")
) {
  throw new Error(
    "Unexpected held-drag code. Nothing changed."
  );
}

const newHeld = `if (start && start.pointerId === e.pointerId) {
      if (busy.current || pendingFrame.current !== null) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      if (
        Math.abs(dx) > 8 &&
        Math.abs(dx) > Math.abs(dy) * 1.15
      ) {
        const deck = e.currentTarget;

        if (!deck.classList.contains("dragging")) {
          resetParallax();
          deck.classList.add("dragging");
        }

        latestDragAmount.current =
          Math.max(-100, Math.min(100, dx));

        if (dragRaf.current === null) {
          dragRaf.current =
            requestAnimationFrame(applyDragFrame);
        }
      }

      return;
    }`;

page =
  page.slice(0, held.getStart(heldSource)) +
  newHeld +
  page.slice(held.getEnd());

// 7. Finish pending drag frame before swipe

insertAtFunctionStart(
  "onPointerUp",
  `if (dragRaf.current !== null &&
    dragStart.current?.pointerId === e.pointerId) {
  cancelAnimationFrame(dragRaf.current);
  applyDragFrame();
}`
);

// Validate generated TypeScript

const parsed = ast();

if (parsed.parseDiagnostics.length) {
  const issue = parsed.parseDiagnostics[0];

  const pos = parsed.getLineAndCharacterOfPosition(
    issue.start || 0
  );

  throw new Error(
    `TSX syntax error at ${pos.line + 1}:${pos.character + 1}: ` +
    ts.flattenDiagnosticMessageText(
      issue.messageText,
      " "
    )
  );
}

// Backup and save only after successful validation

const backup = file + ".before-v44";

if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
}

const temp = file + ".v44tmp";

try {
  fs.writeFileSync(
    temp,
    page.replace(/\n/g, eol),
    "utf8"
  );

  fs.renameSync(temp, file);
} catch (err) {
  if (fs.existsSync(temp)) {
    fs.unlinkSync(temp);
  }

  throw err;
}

console.log(
  "V4.4.1 Smooth Hold & Drag applied successfully."
);
console.log(
  "Only app/page.tsx updated."
);
console.log(
  "Liquid Glass, CSS, blur and orbit preserved."
);
console.log(
  "Next: npm run build"
);
