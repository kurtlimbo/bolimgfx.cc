
/**
 * bolimgfx V4.5.1 — TypeScript Deck Null Fix
 * Run: node fix-mobile-v42.cjs
 *
 * Repairs already-applied V4.5.
 * Only modifies app/page.tsx.
 * Preserves drag, refraction, blur, and orbit.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(
  process.cwd(),
  "app/page.tsx"
);

const v45 = "BOLIM_GLASS_DRAG_SYNC_V45";
const marker = "BOLIM_GLASS_DRAG_V451_DECK_GUARD";

if (!fs.existsSync(file)) {
  throw new Error(
    "Missing app/page.tsx. Run from project root."
  );
}

let ts;

try {
  ts = require("typescript");
} catch {
  throw new Error(
    "TypeScript not found. Run npm install."
  );
}

const original = fs.readFileSync(file, "utf8");
const eol = original.includes("\r\n")
  ? "\r\n"
  : "\n";

const sourceText = original.replace(/\r\n/g, "\n");

if (!sourceText.includes(v45)) {
  throw new Error(
    "V4.5 is not applied. No changes made."
  );
}

if (sourceText.includes(marker)) {
  console.log("V4.5.1 already applied.");
  process.exit(0);
}

const tree = ts.createSourceFile(
  "page.tsx",
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

const queues = [];

function collect(node) {
  if (
    ts.isFunctionDeclaration(node) &&
    node.name?.text === "queue" &&
    node.body
  ) {
    queues.push(node);
  }

  ts.forEachChild(node, collect);
}

collect(tree);

if (queues.length !== 1) {
  throw new Error(
    `Expected one queue(), found ${queues.length}.`
  );
}

const queue = queues[0];
const callbacks = [];

function collectRaf(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(tree) ===
      "requestAnimationFrame" &&
    node.arguments.length === 1 &&
    ts.isArrowFunction(node.arguments[0]) &&
    ts.isBlock(node.arguments[0].body)
  ) {
    callbacks.push(node.arguments[0]);
  }

  ts.forEachChild(node, collectRaf);
}

collectRaf(queue.body);

if (callbacks.length !== 1) {
  throw new Error(
    "Expected one animation callback. No changes made."
  );
}

const callback = callbacks[0];
const first = callback.body.statements[0];

if (
  !first ||
  first.getText(tree).replace(/\s+/g, "") !==
    "scheduled=0;"
) {
  throw new Error(
    "Unexpected callback structure. No changes made."
  );
}

const pos = first.getEnd();

const indent = sourceText
  .slice(
    sourceText.lastIndexOf(
      "\n",
      first.getStart(tree) - 1
    ) + 1,
    first.getStart(tree)
  )
  .match(/^\s*/)[0];

const insertion = `
${indent}// ${marker}
${indent}const deck = deckRef.current;
${indent}if (!deck) return;`;

const updated =
  sourceText.slice(0, pos) +
  insertion +
  sourceText.slice(pos);

// Validate TSX syntax before writing.

const parsed = ts.createSourceFile(
  "page.tsx",
  updated,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

if (parsed.parseDiagnostics.length) {
  const issue = parsed.parseDiagnostics[0];

  const location =
    parsed.getLineAndCharacterOfPosition(
      issue.start ?? 0
    );

  throw new Error(
    `TSX syntax error at line ${location.line + 1}.`
  );
}

// Create backup.

const backup = file + ".before-v451";

if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
}

// Save atomically.

const temp = file + ".v451tmp";

try {
  fs.writeFileSync(
    temp,
    updated.replace(/\n/g, eol),
    "utf8"
  );

  fs.renameSync(temp, file);
} catch (error) {
  if (fs.existsSync(temp)) {
    fs.unlinkSync(temp);
  }

  throw error;
}

console.log("V4.5.1 TypeScript fix applied.");
console.log("Only app/page.tsx updated.");
console.log("Backup: app/page.tsx.before-v451");
console.log("Glass, drag, blur and orbit preserved.");
console.log("Next: npm run build");
