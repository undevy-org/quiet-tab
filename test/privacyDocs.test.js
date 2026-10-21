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

  it("docs/privacy.md Background Activity names the return and online triggers and still says no polling (run 50)", async () => {
    const text = normalize(await readRepoFile("docs/privacy.md"));
    const start = text.indexOf("## Background Activity");
    const end = text.indexOf("## OpenStreetMap");
    assert.ok(start >= 0 && end > start, "the Background Activity section is there");
    const section = text.slice(start, end);

    // still no polling, and nothing on a timer; a hidden tab that has loaded starts no request
    assert.match(section, /no background polling/);
    assert.match(section, /nothing is polled or repeated on a timer/);
    assert.match(section, /once a tab has loaded, a hidden tab starts no request/);
    // every way a weather request leaves is named: the return, online, the retry press (and the two that always were)
    assert.match(section, /A weather request happens only in these cases:/);
    assert.match(section, /when a new tab opens with a stale cache and a chosen city/);
    assert.match(section, /come back to a tab/);
    assert.match(section, /network is back/);
    assert.match(section, /press a weather tile/);
    assert.match(section, /when you explicitly change the city/);
    // the requests go to the endpoints already listed and send nothing new; the Nominatim sentence is kept
    assert.match(section, /Open-Meteo endpoints listed under Data Sent/);
    assert.match(section, /send nothing new/);
    assert.match(section, /A Nominatim request happens only when you activate \*\*use your location\*\*/);
    // the old, now false, sentence and the broader wording that the code does not keep are gone
    assert.doesNotMatch(text, /happens only when a new tab opens with a stale cache and a chosen city, or when you explicitly change the city/);
    assert.doesNotMatch(text, /nothing runs on a timer/);
    // and the phrases the case above forbids stay out
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
