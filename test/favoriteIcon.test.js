import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FAVICON_SIZE,
  getFaviconUrl,
  getFavoriteIconModel,
  getFavoriteLetter
} from "../src/favoriteIcon.js";

const BASE = "chrome-extension://abc123/_favicon/";

function favorite(overrides = {}) {
  return {
    id: "fav-1",
    url: "https://example.com/",
    label: "Example",
    domain: "example.com",
    iconMode: "favicon",
    customIconUrl: null,
    backgroundColor: "#24292f",
    backgroundColorSource: "auto",
    ...overrides
  };
}

describe("getFaviconUrl", () => {
  it("appends pageUrl and size to the injected base URL", () => {
    assert.equal(
      getFaviconUrl({ baseUrl: BASE, pageUrl: "https://example.com/" }),
      `${BASE}?pageUrl=https%3A%2F%2Fexample.com%2F&size=${FAVICON_SIZE}`
    );
  });

  it("honors an explicit size", () => {
    assert.equal(
      getFaviconUrl({ baseUrl: BASE, pageUrl: "https://example.com/", size: 16 }),
      `${BASE}?pageUrl=https%3A%2F%2Fexample.com%2F&size=16`
    );
  });
});

describe("getFavoriteIconModel", () => {
  it("builds a favicon image URL from the base when in favicon mode", () => {
    const model = getFavoriteIconModel(favorite(), { faviconBaseUrl: BASE });
    assert.equal(model.type, "image");
    assert.equal(
      model.src,
      `${BASE}?pageUrl=https%3A%2F%2Fexample.com%2F&size=${FAVICON_SIZE}`
    );
  });

  it("falls back to a letter when no favicon base URL is available", () => {
    const model = getFavoriteIconModel(favorite(), { faviconBaseUrl: "" });
    assert.equal(model.type, "letter");
    assert.equal(model.letter, "E");
  });

  it("uses the custom image URL in custom mode", () => {
    const model = getFavoriteIconModel(
      favorite({ iconMode: "custom", customIconUrl: "https://x.test/i.png" }),
      { faviconBaseUrl: BASE }
    );
    assert.equal(model.type, "image");
    assert.equal(model.src, "https://x.test/i.png");
  });

  it("returns a letter in letter mode", () => {
    const model = getFavoriteIconModel(favorite({ iconMode: "letter" }), {
      faviconBaseUrl: BASE
    });
    assert.equal(model.type, "letter");
    assert.equal(model.letter, "E");
  });

  it("falls back to a letter in custom mode when the custom URL is null", () => {
    const model = getFavoriteIconModel(
      favorite({ iconMode: "custom", customIconUrl: null }),
      { faviconBaseUrl: BASE }
    );
    assert.equal(model.type, "letter");
    assert.equal(model.letter, "E");
  });

  it("marks favicon-mode images as safe to sample for accent color (same-origin proxy)", () => {
    const model = getFavoriteIconModel(favorite(), { faviconBaseUrl: BASE });
    assert.equal(model.sampleable, true);
  });

  it("marks custom-icon images as unsafe to sample — arbitrary hosts rarely send CORS headers", () => {
    const model = getFavoriteIconModel(
      favorite({ iconMode: "custom", customIconUrl: "https://x.test/i.png" }),
      { faviconBaseUrl: BASE }
    );
    assert.equal(model.sampleable, false);
  });
});

describe("custom icon links of every common image format (docs/tile-text-options.md decision 6, AS-TTO-16 and 22, run 58)", () => {
  // The format is the browser's business: the model never looks at the link's extension or the image's bytes, so SVG, PNG, JPEG, WebP, GIF, ICO and a link with no
  // extension all give the same plain image of the typed link, which is never sampled (no canvas read, no CORS request): `sampleable: false`.
  const LINKS = [
    "https://cdn.example.com/icon.svg",
    "https://cdn.example.com/icon.png",
    "https://cdn.example.com/icon.jpg",
    "https://cdn.example.com/icon.jpeg",
    "https://cdn.example.com/icon.webp",
    "https://cdn.example.com/icon.gif",
    "https://cdn.example.com/favicon.ico",
    "https://cdn.example.com/icon",
    "https://cdn.example.com/icon.svg?v=2",
    "http://localhost:8080/a%20b.png"
  ];

  it("gives a plain image of the typed link, never sampled, whatever the format", () => {
    for (const customIconUrl of LINKS) {
      const model = getFavoriteIconModel(favorite({ iconMode: "custom", customIconUrl }), { faviconBaseUrl: BASE });
      assert.deepEqual([model.type, model.src, model.sampleable], ["image", customIconUrl, false], customIconUrl);
    }
  });

  it("does not need the favicon service: a custom icon is an image with no faviconBaseUrl too", () => {
    const model = getFavoriteIconModel(favorite({ iconMode: "custom", customIconUrl: LINKS[0] }), {});
    assert.deepEqual([model.type, model.src, model.sampleable], ["image", LINKS[0], false]);
  });

  it("an empty custom icon link is the letter (nothing to draw)", () => {
    assert.equal(getFavoriteIconModel(favorite({ iconMode: "custom", customIconUrl: null }), { faviconBaseUrl: BASE }).type, "letter");
    assert.equal(getFavoriteIconModel(favorite({ iconMode: "custom", customIconUrl: "" }), { faviconBaseUrl: BASE }).type, "letter");
  });
});

describe("getFavoriteLetter", () => {
  it("uppercases the first character of the label", () => {
    assert.equal(getFavoriteLetter(favorite({ label: "notion" })), "N");
  });

  it("falls back to the domain's first letter when the label is blank", () => {
    assert.equal(getFavoriteLetter(favorite({ label: "   ", domain: "example.com" })), "E");
  });

  it("returns \"?\" when both label and domain are empty", () => {
    assert.equal(getFavoriteLetter(favorite({ label: "", domain: "" })), "?");
  });
});
