#!/usr/bin/env node
/**
 * Kickoff run #20: check Nominatim User-Agent with the unpacked extension build.
 * From repo root: node scripts/check-nominatim-ua.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFromDir, freshProfile, launch, NEWTAB_URL } from "../.private/e2e/lib/harness.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUIET_TAB_UA = "QuietTab (+https://github.com/undevy-org/quiet-tab)";

const buildDir = buildFromDir("check-nominatim-ua", repo);
const profile = freshProfile("check-nominatim-ua");
const context = await launch(buildDir, profile, { width: 1280, height: 800 });

await context.unroute(/nominatim\.openstreetmap\.org/);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
let captured = "";
cdp.on("Network.requestWillBeSent", (e) => {
  if (e.request.url.includes("nominatim.openstreetmap.org")) {
    captured = e.request.headers["User-Agent"] || e.request.headers["user-agent"] || "";
  }
});

await page.goto(NEWTAB_URL, { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  await fetch("https://nominatim.openstreetmap.org/reverse?lat=41.72&lon=44.83&format=jsonv2");
});
await page.waitForTimeout(1500);

const ok = captured.includes("QuietTab");
console.log("");
console.log(ok ? "UA QuietTab есть" : "UA QuietTab нет");
console.log("");
console.log("User-Agent on wire:", captured || "(no request captured)");
console.log("Expected substring:", QUIET_TAB_UA);
console.log("");

await context.close();
process.exit(ok ? 0 : 1);
