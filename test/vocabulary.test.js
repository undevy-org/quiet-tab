// Run 49 (docs/typography-copy.md decision 4, AS-TYP-04, AS-TYP-05): the vocabulary guard. The product speaks of links, tiles
// and the grid; "favorite", "widget", "desktop" and "bookmark" stay in identifiers (class names, ids, data attributes, storage
// keys, the "favorite" type value) but not in any string a person can read or hear, and no string uses a hyphen as a dash.
//
// The repository has no parser and no dependencies, so the test carries a small tokenizer. A comment stripped with a regular
// expression (`//.*$`) would cut every line that holds a URL string (src/weatherApi.js, src/icons.js, ...) and the guard would
// pass for the wrong reason. The tokenizer fails loudly instead of passing silently: a file that ends inside a string, a
// template, a comment or a regular expression throws, a line break inside '…' or "…" throws, and the residual code of every
// src/*.js file must hold no quote character. Fixtures run before the scan of src.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { describe, it } from "node:test";

// ---- the tokenizer ---------------------------------------------------------------------------------------------------------
// A `/` starts a regular expression after one of these characters or keywords (and at the start of the file); after `)`, `]`, an
// identifier, a number or a postfix `++` / `--` it is a division.
const REGEX_AFTER_CHARS = new Set("(,=>:[!&|?{};+-*%<~^".split(""));
const REGEX_AFTER_WORDS = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do"]);
const isIdStart = (c) => /[A-Za-z_$]/.test(c);
const isIdPart = (c) => /[A-Za-z0-9_$]/.test(c);

// Returns { parts: [{ text, line }], residual }: the string parts (the literal parts of a template are separate parts, a `${…}`
// is scanned again as code) as written in the source, and the code with comments, strings and regular expression bodies blanked.
export function tokenize(src, name = "source") {
  const parts = [];
  let residual = "";
  let i = 0;
  let line = 1;
  let prev = "start"; // "start" | "value" (identifier, number, `)`, `]`, postfix ++/--) | "op" | "word:<keyword>"
  const fail = (what, at) => {
    throw new Error(`${name}:${at}: ${what}`);
  };
  const blank = (text) => text.replace(/[^\n]/g, " ");

  function readString(quote) {
    const startLine = line;
    let j = i + 1;
    let text = "";
    for (;;) {
      if (j >= src.length) fail("the file ends inside a string", startLine);
      const c = src[j];
      if (c === "\\") {
        text += c + (src[j + 1] ?? "");
        if (src[j + 1] === "\n") line += 1;
        j += 2;
        continue;
      }
      if (c === "\n") fail("a line break inside a string", startLine);
      if (c === quote) break;
      text += c;
      j += 1;
    }
    parts.push({ text, line: startLine });
    residual += blank(src.slice(i, j + 1));
    i = j + 1;
  }

  function readTemplate() {
    const startLine = line;
    let text = "";
    let partLine = line;
    residual += " ";
    i += 1;
    const flush = () => {
      if (text !== "") parts.push({ text, line: partLine }); // an empty literal part (before or after a ${…}) is no string anyone reads
      text = "";
    };
    for (;;) {
      if (i >= src.length) fail("the file ends inside a template literal", startLine);
      const c = src[i];
      if (c === "\\") {
        text += c + (src[i + 1] ?? "");
        if (src[i + 1] === "\n") line += 1;
        residual += "  ";
        i += 2;
        continue;
      }
      if (c === "`") {
        flush();
        residual += " ";
        i += 1;
        return;
      }
      if (c === "$" && src[i + 1] === "{") {
        flush();
        residual += "  ";
        i += 2;
        scan(true);
        partLine = line;
        continue;
      }
      if (c === "\n") {
        line += 1;
        residual += "\n";
        text += c;
        i += 1;
        continue;
      }
      text += c;
      residual += " ";
      i += 1;
    }
  }

  function readRegex() {
    const startLine = line;
    let j = i + 1;
    let inClass = false;
    for (;;) {
      if (j >= src.length || src[j] === "\n") fail("a regular expression literal that does not end", startLine);
      const c = src[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) break;
      j += 1;
    }
    j += 1;
    while (j < src.length && isIdPart(src[j])) j += 1; // flags
    residual += blank(src.slice(i, j));
    i = j;
    prev = "value";
  }

  // Scans code; with `untilBrace` it returns at the `}` that closes a template `${`.
  function scan(untilBrace) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      const next = src[i + 1];
      if (c === "\n") {
        line += 1;
        residual += c;
        i += 1;
        continue;
      }
      if (/\s/.test(c)) {
        residual += c;
        i += 1;
        continue;
      }
      if (c === "/" && next === "/") {
        while (i < src.length && src[i] !== "\n") {
          residual += " ";
          i += 1;
        }
        continue;
      }
      if (c === "/" && next === "*") {
        const end = src.indexOf("*/", i + 2);
        if (end < 0) fail("the file ends inside a block comment", line);
        const text = src.slice(i, end + 2);
        line += (text.match(/\n/g) ?? []).length;
        residual += blank(text);
        i = end + 2;
        continue;
      }
      if (c === "'" || c === '"') {
        readString(c);
        prev = "value";
        continue;
      }
      if (c === "`") {
        readTemplate();
        prev = "value";
        continue;
      }
      if (c === "/") {
        if (prev === "start" || prev === "op" || prev.startsWith("word:")) {
          readRegex();
          continue;
        }
        residual += c; // a division
        i += 1;
        prev = "op";
        continue;
      }
      if (c === "{") {
        depth += 1;
        residual += c;
        i += 1;
        prev = "op";
        continue;
      }
      if (c === "}") {
        if (untilBrace && depth === 0) {
          residual += " ";
          i += 1;
          return;
        }
        depth -= 1;
        residual += c;
        i += 1;
        prev = "op";
        continue;
      }
      if ((c === "+" || c === "-") && next === c) {
        residual += c + c;
        i += 2;
        prev = prev === "value" ? "value" : "op"; // postfix after a value, prefix otherwise
        continue;
      }
      if (isIdStart(c)) {
        let j = i;
        while (j < src.length && isIdPart(src[j])) j += 1;
        const word = src.slice(i, j);
        residual += word;
        i = j;
        prev = REGEX_AFTER_WORDS.has(word) ? `word:${word}` : "value";
        continue;
      }
      if (/[0-9]/.test(c)) {
        let j = i;
        while (j < src.length && /[0-9A-Za-z_.]/.test(src[j])) j += 1;
        residual += src.slice(i, j);
        i = j;
        prev = "value";
        continue;
      }
      residual += c;
      i += 1;
      prev = c === ")" || c === "]" ? "value" : REGEX_AFTER_CHARS.has(c) ? "op" : "value";
    }
    if (untilBrace) fail("the file ends inside a template literal expression", line);
  }

  scan(false);
  return { parts, residual };
}

// ---- the words -------------------------------------------------------------------------------------------------------------
// Whole words and plurals, any case.
const BANNED = /\b(?:favou?rite|widget|desktop|bookmark)s?\b/gi;
const SPACED_HYPHEN = " - ";

// Every banned word of every string part with the line it is on (a template part can span lines).
export function bannedHits(src, name = "source") {
  const hits = [];
  for (const part of tokenize(src, name).parts) {
    for (const m of part.text.matchAll(BANNED)) {
      hits.push({ text: part.text, word: m[0], line: part.line + (part.text.slice(0, m.index).match(/\n/g) ?? []).length });
    }
  }
  return hits;
}

// ---- fixtures: the tokenizer is proven before it is trusted on src -------------------------------------------------------------
describe("vocabulary guard: tokenizer fixtures (run before the scan of src)", () => {
  // `parts` is the exact list of string parts the tokenizer must return, `found` the parts that hold a banned word. A fixture that
  // reads a division as a regular expression (or the other way round) changes `parts`, so it cannot pass for the wrong reason.
  const fixtures = [
    { name: "a banned word after a URL string on the same line (the // of the URL is not a comment)", src: 'const u = "https://a.example/x"; const t = "Favorite not found";', parts: ["https://a.example/x", "Favorite not found"], found: ["Favorite not found"] },
    { name: "a banned word in a ternary", src: 'const t = ok ? "fine" : "Widget gone";', parts: ["fine", "Widget gone"], found: ["Widget gone"] },
    { name: "a banned word after ${…} in a template literal", src: "const t = `up to ${n} favorites`;", parts: ["up to ", " favorites"], found: [" favorites"] },
    { name: "a banned word in a string nested in ${…}", src: 'const t = `a ${ cond ? "widget" : "b" } c`;', parts: ["a ", "widget", "b", " c"], found: ["widget"] },
    { name: "a banned word on the second line of a template literal", src: "const t = `line one\nFavorites here`;", parts: ["line one\nFavorites here"], found: ["line one\nFavorites here"], lines: [2] },
    { name: "a URL inside a template literal is not a comment", src: 'const t = `https://a.example/${p}`; const u = "Favorite";', parts: ["https://a.example/", "Favorite"], found: ["Favorite"] },
    { name: "after a regular expression that holds a quote and \\/\\/", src: 'const r = /"[a-z]\\/\\//; const t = "Favorite";', parts: ["Favorite"], found: ["Favorite"] },
    { name: "after a regular expression that follows =>", src: 'const f = (s) => /"/.test(s); const t = "widget";', parts: ["widget"], found: ["widget"] },
    { name: "after a regular expression that follows +", src: "const x = 1 + /'/.source.length; const t = \"desktop\";", parts: ["desktop"], found: ["desktop"] },
    { name: "after a regular expression that follows return", src: 'function f(s) { return /"/.test(s); }\nconst t = "bookmark";', parts: ["bookmark"], found: ["bookmark"] },
    { name: "after a regular expression with a class that holds a slash, and flags", src: 'const r = /[/"]+/gi; const t = "favourites";', parts: ["favourites"], found: ["favourites"] },
    { name: "after a division that follows ) and ++ (not read as a regular expression)", src: "const a = (b) / 2, s = \"it's\"; let d = 1; const c = d++ / 2; const t = \"favorite\";", parts: ["it's", "favorite"], found: ["favorite"] },
    { name: "after a division that follows ] and an identifier", src: "const q = a[0] / 2, s = \"o'k\", z = n / 3; const t = \"Desktop\";", parts: ["o'k", "Desktop"], found: ["Desktop"] },
    { name: "in a string with an escaped quote", src: 'const t = "say \\"favorite\\" now";', parts: ['say \\"favorite\\" now'], found: ['say \\"favorite\\" now'] },
    { name: "the same words in // and /* */ comments are not found (also after a URL string on the same line)", src: 'const u = "https://a.example/"; // favorite in a line comment\n/* widget in a block comment */ const k = 1; // don\'t', parts: ["https://a.example/"], found: [] },
    { name: "an apostrophe in a comment does not start a string", src: "// don't\nconst t = \"Widget\";", parts: ["Widget"], found: ["Widget"] }
  ];
  for (const f of fixtures) {
    it(f.name, () => {
      const { parts } = tokenize(f.src, "fixture");
      assert.deepEqual(parts.map((p) => p.text), f.parts);
      const hits = bannedHits(f.src, "fixture");
      assert.deepEqual([...new Set(hits.map((h) => h.text))], f.found);
      if (f.lines) assert.deepEqual(hits.map((h) => h.line), f.lines);
    });
  }

  it("words with a hyphen and spaces on both sides are found, a hyphen inside a word or at an edge is not", () => {
    const dash = (src) => tokenize(src, "fixture").parts.filter((p) => p.text.includes(SPACED_HYPHEN)).map((p) => p.text);
    assert.deepEqual(dash('const a = "one - two"; const b = "a-b"; const c = "-x"; const d = "x -";'), ["one - two"]);
    assert.deepEqual(dash("// one - two\nconst a = 1; /* a - b */"), []);
  });

  describe("it fails loudly instead of passing silently", () => {
    const loud = [
      ["a string that ends the file", 'const a = "abc'],
      ["a line break inside a string", 'const a = "abc\nconst b = 1;'],
      ["a block comment that is never closed", "const a = 1; /* never closed"],
      ["a template literal that ends the file", "const t = `abc"],
      ["a template expression that ends the file", "const t = `abc ${ n"],
      ["a regular expression that does not end", "const r = /abc"]
    ];
    for (const [name, src] of loud) {
      it(`throws on ${name}`, () => {
        assert.throws(() => tokenize(src, "fixture"), /fixture:\d+: /);
      });
    }
  });
});

// ---- the allowlist ---------------------------------------------------------------------------------------------------------
// Identifiers that hold a banned word and are neither visible nor announced (renaming them is a storage or API change, not copy;
// docs/typography-copy.md decision 4 and Accepted exception 2). Keyed by the exact literal as written in the source, each entry with
// its reason class. A new entry shows as a diff here, and the test prints every hit.
const ALLOWED = {
  selector: [
    "#favorites", "#desktop-status", "#desktop-live", '[data-widget-id="', '.desktop-grid > [data-widget-id="',
    '[data-widget-id="chrome:add"]', '[data-widget-id="chrome:settings"]', '[data-widget-id="weather:hint"]', "[data-widget-id]", ".desktop-grid > [data-widget-id]",
    "[data-widget-id], [data-remove-for]", ':scope > [data-widget-id="', ".desktop-dialog, .desktop-backdrop", ".desktop-grid", ".favorite-form__footer",
    '[data-favorite-action="cancel"]', "[data-favorite-action]"
  ],
  "class name": [
    "desktop-status--info", "button desktop-status__reload", "favorite-letter", "favorite-icon", "favorite-tile", "favorite-tile__text", "favorite-tile__label", "favorite-tile__host",
    "favorite-form", "favorite-form__row", "favorite-form__row-label", "favorite-form__row--custom-icon", "favorite-form__color-controls", "favorite-form__footer", "favorite-input",
    "favorite-color-input", "desktop-dialog", "desktop-dialog__title", "desktop-dialog__body", "desktop-dialog__error", "desktop-backdrop", "desktop-grid"
  ],
  id: ["favorite-form-row-label-", "desktop-dialog-title", "desktop-dialog-body", "desktop-dialog-error-"],
  "style property": ["--favorite-accent-rgb"],
  "type value": ["favorite"],
  "lock name": ["quiet-tab:widgets-mutation"]
};
const ALLOWED_REASON = new Map();
for (const [reason, literals] of Object.entries(ALLOWED)) {
  for (const literal of literals) {
    assert.equal(ALLOWED_REASON.has(literal), false, `allowlist: ${JSON.stringify(literal)} is listed twice`);
    ALLOWED_REASON.set(literal, reason);
  }
}

const SRC_DIR = new URL("../src/", import.meta.url);
async function srcJsFiles() {
  const names = (await readdir(SRC_DIR)).filter((n) => n.endsWith(".js")).sort();
  assert.ok(names.length > 20, `src has its ${names.length} script files`);
  return Promise.all(names.map(async (name) => ({ name, text: await readFile(new URL(name, SRC_DIR), "utf8") })));
}

// Visible or announced text of an HTML file: its text nodes and the aria-label, title, alt and placeholder attributes.
export function htmlTexts(html) {
  const plain = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const attrs = [...plain.matchAll(/\b(?:aria-label|title|alt|placeholder)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2]);
  const nodes = plain.replace(/<[^>]*>/g, "\n").split("\n").map((t) => t.trim()).filter(Boolean);
  return [...attrs, ...nodes];
}

describe("vocabulary guard: src (decision 4, AS-TYP-04, AS-TYP-05)", () => {
  it("the tokenizer reads every src/*.js file to a clean end and leaves no quote in the residual code", async () => {
    for (const { name, text } of await srcJsFiles()) {
      const { residual } = tokenize(text, name);
      const stray = residual.match(/.{0,24}['"`].{0,24}/s);
      assert.equal(stray, null, `${name}: a quote is left in the code, the tokenizer went out of sync near ${JSON.stringify(stray?.[0])}`);
    }
  });

  it("no string of src/*.js that a person can read or hear has favorite, favourite, widget, bookmark or desktop in it (identifiers are on the allowlist)", async (t) => {
    const offenders = [];
    const used = new Map();
    for (const { name, text } of await srcJsFiles()) {
      for (const hit of bannedHits(text, name)) {
        if (ALLOWED_REASON.has(hit.text)) used.set(hit.text, (used.get(hit.text) ?? 0) + 1);
        else offenders.push(`${name}:${hit.line} ${JSON.stringify(hit.text.length > 90 ? `${hit.text.slice(0, 90)}…` : hit.text)}`);
      }
    }
    t.diagnostic(`allowlist hits: ${used.size} entries, ${[...used.values()].reduce((a, b) => a + b, 0)} literals`);
    for (const [literal, n] of [...used.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      t.diagnostic(`allowlist ${ALLOWED_REASON.get(literal).padEnd(14)} x${String(n).padEnd(3)} ${literal}`);
    }
    assert.deepEqual(offenders, [], "a banned word in a string that is not on the allowlist (visible or announced text must say link, tile or grid)");
  });

  it("the allowlist holds no entry that no string of src uses any more", async () => {
    const seen = new Set();
    for (const { name, text } of await srcJsFiles()) for (const hit of bannedHits(text, name)) seen.add(hit.text);
    assert.deepEqual([...ALLOWED_REASON.keys()].filter((literal) => !seen.has(literal)), []);
  });

  it("no string of src/*.js uses a hyphen with spaces on both sides as a dash (the dash is —)", async () => {
    const offenders = [];
    for (const { name, text } of await srcJsFiles()) {
      for (const part of tokenize(text, name).parts) {
        if (part.text.includes(SPACED_HYPHEN)) offenders.push(`${name}:${part.line} ${JSON.stringify(part.text.slice(0, 90))}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("src/newtab.html carries no banned word in a text node or in an aria-label, title, alt or placeholder", async () => {
    const html = await readFile(new URL("newtab.html", SRC_DIR), "utf8");
    const texts = htmlTexts(html);
    assert.ok(texts.includes("Quiet Tab"), "the scan sees the <title> text");
    assert.ok(texts.length >= 2, "the scan sees the aria-label of the main element as well");
    assert.deepEqual(texts.filter((t) => new RegExp(BANNED.source, "i").test(t)), []);
  });

  it("the html scan finds a banned word in an attribute and in a text node, and ignores comments and scripts", () => {
    const sample = '<!-- Widgets in a comment --><main aria-label="Widgets" title=\'Favorites\'>Desktop</main><script>const w = "widget";</script><img alt="" placeholder="Bookmarks">';
    const bad = htmlTexts(sample).filter((t) => new RegExp(BANNED.source, "i").test(t));
    assert.deepEqual(bad.sort(), ["Bookmarks", "Desktop", "Favorites", "Widgets"]);
  });
});
