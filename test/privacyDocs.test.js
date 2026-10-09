import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

async function readRepoFile(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("privacy documentation (AS-UL-22)", () => {
  it("docs/privacy.md describes location lookup and Nominatim", async () => {
    const text = normalize(await readRepoFile("docs/privacy.md"));

    assert.match(text, /browser.*geolocation|geolocation/i);
    assert.match(text, /nominatim\.openstreetmap\.org/i);
    assert.match(text, /openstreetmap/i);
    assert.doesNotMatch(text, /no browser geolocation api is used/i);
    assert.doesNotMatch(text, /sends requests only to open-meteo/i);
    assert.doesNotMatch(text, /no other request is made/i);
  });

  it("store/privacy-disclosure.md describes tap-only location and Nominatim", async () => {
    const text = normalize(await readRepoFile("store/privacy-disclosure.md"));

    assert.match(text, /nominatim\.openstreetmap\.org/i);
    assert.match(text, /openstreetmap/i);
    assert.match(text, /geolocation|browser location/i);
    assert.doesNotMatch(text, /no browser geolocation api is used/i);
    assert.doesNotMatch(text, /sends requests only to open-meteo/i);
    assert.doesNotMatch(text, /no other request is made/i);
  });
});
