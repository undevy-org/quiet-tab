import assert from "node:assert/strict";
import { createHash, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function readManifest() {
  const contents = await readFile(
    new URL("../manifest.json", import.meta.url),
    "utf8"
  );
  return JSON.parse(contents);
}

async function readRules() {
  const contents = await readFile(
    new URL("../rules/nominatim-user-agent.json", import.meta.url),
    "utf8"
  );
  return JSON.parse(contents);
}

// Chrome derives the extension id from the key: first 16 bytes of SHA-256(DER), each nibble mapped to a-p.
function extensionIdFromKey(key) {
  const hex = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

// Id Chrome Web Store assigned to the draft listing (Developer Dashboard, Package tab, "View public key").
const PINNED_EXTENSION_ID = "dbcdpffdgfbjmdlomgheeijfkkjkhmma";

describe("manifest", () => {
  it("uses only the required storage, favicon, and weather-lookup privileges", async () => {
    const manifest = await readManifest();

    assert.deepEqual(manifest.permissions, [
      "storage",
      "favicon",
      "declarativeNetRequestWithHostAccess"
    ]);
    assert.deepEqual(manifest.host_permissions, [
      "https://api.open-meteo.com/*",
      "https://air-quality-api.open-meteo.com/*",
      "https://geocoding-api.open-meteo.com/*",
      "https://nominatim.openstreetmap.org/*"
    ]);
  });

  it("pins the extension id with a manifest key (see docs/architecture.md)", async () => {
    const manifest = await readManifest();

    assert.equal(typeof manifest.key, "string");
    assert.doesNotMatch(manifest.key, /\s|BEGIN|END/, "one base64 line, no PEM armor");
    const der = Buffer.from(manifest.key, "base64");
    assert.equal(der.toString("base64"), manifest.key, "canonical base64");
    const parsed = createPublicKey({ key: der, format: "der", type: "spki" });
    assert.equal(parsed.asymmetricKeyType, "rsa");
    assert.equal(extensionIdFromKey(manifest.key), PINNED_EXTENSION_ID);
  });

  it("limits the Nominatim User-Agent rule to requests from this extension", async () => {
    const manifest = await readManifest();
    const rules = await readRules();

    assert.equal(rules.length, 1);
    const [rule] = rules;
    assert.equal(rule.action.type, "modifyHeaders");
    assert.deepEqual(rule.action.requestHeaders, [
      {
        header: "user-agent",
        operation: "set",
        value: "QuietTab (+https://github.com/undevy-org/quiet-tab)"
      }
    ]);
    assert.equal(rule.condition.urlFilter, "||nominatim.openstreetmap.org^");
    assert.deepEqual(rule.condition.resourceTypes, ["xmlhttprequest", "other"]);
    // Without initiatorDomains the rule would also fire for pages on the other host-permission hosts.
    assert.deepEqual(rule.condition.initiatorDomains, [extensionIdFromKey(manifest.key)]);
    assert.equal(rule.condition.excludedInitiatorDomains, undefined);
  });
});
