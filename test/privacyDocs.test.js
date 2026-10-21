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
    const heading = "## Background Activity";
    const start = text.indexOf(heading);
    assert.ok(start >= 0, "the Background Activity section is there");
    const rest = text.slice(start + heading.length);
    const next = rest.search(/ ## /);
    assert.ok(next >= 0, "another section follows Background Activity (the section has an end)");
    const section = rest.slice(0, next);

    // still no polling, nothing on a timer; a hidden tab that has loaded starts no request
    assert.match(section, /no background polling/i);
    assert.match(section, /nothing is polled or repeated on a timer/i);
    assert.match(section, /once a tab has loaded, a hidden tab starts no request/i);
    // every way a weather request leaves is named: the return (with its 30 minute condition), online (while the tab is visible), the retry press,
    // and the two that always were
    assert.match(section, /A weather request happens only in these cases:/i);
    assert.match(section, /when a new tab opens with a stale cache and a chosen city/i);
    assert.match(section, /come back to a tab/i);
    assert.match(section, /30 minutes old or more/i);
    assert.match(section, /network is back while the tab is visible/i);
    assert.match(section, /press a weather tile/i);
    assert.match(section, /when you explicitly change the city/i);
    // the requests go to the endpoints already listed and send nothing new; the Nominatim sentence is kept
    assert.match(section, /Open-Meteo endpoints listed under Data Sent/i);
    assert.match(section, /send nothing new/i);
    assert.match(section, /A Nominatim request happens only when you activate \*\*use your location\*\*/i);
    // the old, now false, sentence and the wording that the code does not keep stay out of the whole file
    assert.doesNotMatch(text, /happens only when a new tab opens with a stale cache and a chosen city, or when you explicitly change the city/i);
    assert.doesNotMatch(text, /nothing is scheduled on a timer/i, "the wording is polled or repeated on a timer (a return and online do schedule a request)");
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
