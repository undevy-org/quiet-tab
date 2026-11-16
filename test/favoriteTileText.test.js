import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { favoriteTileName, favoriteTileText } from "../src/favoritesShared.js";

// Decision 2 of docs/tile-text-options.md: the table of what a link tile shows. Expected values are written out cell by cell,
// not derived from the rule, so a wrong rule cannot agree with its own test.
const NAME = { name: true, host: false };
const BOTH = { name: true, host: true };
const HOST = { name: false, host: true };
const NONE = { name: false, host: false };

// [showName, showLink, expectation per size], the order of the table: name on/link on, name on/link off, name off/link on, both off.
const TABLE = [
  { showName: true, showLink: true, "1x1": NONE, "2x1": NAME, "1x2": BOTH, "2x2": BOTH },
  { showName: true, showLink: false, "1x1": NONE, "2x1": NAME, "1x2": NAME, "2x2": NAME },
  { showName: false, showLink: true, "1x1": NONE, "2x1": HOST, "1x2": HOST, "2x2": HOST },
  { showName: false, showLink: false, "1x1": NONE, "2x1": NONE, "1x2": NONE, "2x2": NONE }
];
const SIZES = { "1x1": { w: 1, h: 1 }, "2x1": { w: 2, h: 1 }, "1x2": { w: 1, h: 2 }, "2x2": { w: 2, h: 2 } };

describe("favoriteTileText (docs/tile-text-options.md decision 2)", () => {
  for (const row of TABLE) {
    for (const [label, size] of Object.entries(SIZES)) {
      it(`${label}, showName ${row.showName}, showLink ${row.showLink}`, () => {
        assert.deepEqual(favoriteTileText({ showName: row.showName, showLink: row.showLink }, size), row[label]);
      });
    }
  }

  it("1x1 shows no text whatever the switches are", () => {
    for (const item of [{}, { showName: false }, { showLink: false }, { showName: false, showLink: false }, { showName: true, showLink: true }]) {
      assert.deepEqual(favoriteTileText(item, { w: 1, h: 1 }), NONE);
    }
  });

  it("2x1 with the name and the link on shows the name only (the host takes the place of the name, never both)", () => {
    assert.deepEqual(favoriteTileText({ showName: true, showLink: true }, { w: 2, h: 1 }), { name: true, host: false });
  });

  it("an item without the fields is today's tile: everything shown at every size", () => {
    for (const [label, size] of Object.entries(SIZES)) {
      assert.deepEqual(favoriteTileText({}, size), TABLE[0][label], label);
    }
  });

  it("a stored false on one field leaves the other one shown (a missing field means shown)", () => {
    assert.deepEqual(favoriteTileText({ showName: false }, { w: 1, h: 2 }), HOST);
    assert.deepEqual(favoriteTileText({ showLink: false }, { w: 1, h: 2 }), NAME);
  });

  it("an undefined item counts as an item without the fields", () => {
    assert.deepEqual(favoriteTileText(undefined, { w: 2, h: 2 }), BOTH);
    assert.deepEqual(favoriteTileText(undefined, { w: 1, h: 1 }), NONE);
  });

  it("a value that is not a boolean counts as shown, as `!== false` does", () => {
    for (const value of ["no", 0, null, "", undefined]) {
      assert.deepEqual(favoriteTileText({ showName: value, showLink: value }, { w: 2, h: 2 }), BOTH, JSON.stringify(value));
      assert.deepEqual(favoriteTileText({ showName: value, showLink: value }, { w: 2, h: 1 }), NAME, JSON.stringify(value));
    }
  });

  it("does not change the item it reads", () => {
    const item = Object.freeze({ showName: false });
    assert.deepEqual(favoriteTileText(item, { w: 2, h: 2 }), HOST);
  });
});

// Decision 3 of docs/tile-text-options.md (changed by the review of the branch, I1): the accessible name of a link tile. It is the
// action plus the label; when the host is the only text a tile draws, the host is part of the name (WCAG 2.5.3 Label in Name).
describe("favoriteTileName (docs/tile-text-options.md decision 3)", () => {
  const item = (extra) => ({ label: "GitHub", domain: "github.com", ...extra });

  it("a tile that draws only the host names the host after the label, in normal and in edit mode", () => {
    for (const size of [SIZES["2x1"], SIZES["1x2"], SIZES["2x2"]]) {
      assert.equal(favoriteTileName(item({ showName: false }), size, false), "Open GitHub, github.com");
      assert.equal(favoriteTileName(item({ showName: false }), size, true), "Edit GitHub, github.com");
    }
  });

  it("every other tile keeps the action plus the label", () => {
    for (const row of TABLE.filter((r) => !(r.showName === false && r.showLink === true))) {
      for (const size of Object.values(SIZES)) {
        const stored = { ...(row.showName ? {} : { showName: false }), ...(row.showLink ? {} : { showLink: false }) };
        assert.equal(favoriteTileName(item(stored), size, false), "Open GitHub");
        assert.equal(favoriteTileName(item(stored), size, true), "Edit GitHub");
      }
    }
  });

  it("a 1x1 tile draws no text, so its name is the label even with the name off", () => {
    assert.equal(favoriteTileName(item({ showName: false }), SIZES["1x1"], false), "Open GitHub");
    assert.equal(favoriteTileName(item({ showName: false }), SIZES["1x1"], true), "Edit GitHub");
  });

  it("a tile with no switches keeps the label alone at every size", () => {
    for (const size of Object.values(SIZES)) {
      assert.equal(favoriteTileName(item({}), size, false), "Open GitHub");
    }
  });

  it("agrees with favoriteTileText: the host is in the name exactly when it is the only line drawn", () => {
    for (const row of TABLE) {
      for (const size of Object.values(SIZES)) {
        const stored = { ...(row.showName ? {} : { showName: false }), ...(row.showLink ? {} : { showLink: false }) };
        const lines = favoriteTileText(stored, size);
        assert.equal(favoriteTileName(item(stored), size, false).includes("github.com"), !lines.name && lines.host);
      }
    }
  });
});
