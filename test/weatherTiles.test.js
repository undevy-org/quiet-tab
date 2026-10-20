import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeWeatherMetric } from "../src/weatherTiles.js";

const data = {
  temperature: 21, temperatureTodayAt15: 24, temperatureYesterdayAt15: 22,
  uvIndex: 3, uvIndexMax: 6, precipitationProbabilityMax: 40, precipitationStartHour: "15:00",
  usAqi: 40, pm2_5: 9
};
const ready = { status: "ready", data, error: null };
const stale = { status: "stale", data, error: "offline" };
const failed = { status: "error", data: null, error: "boom" };
const keys = ["temperature", "precipitation", "airQuality", "uv"];

describe("describeWeatherMetric", () => {
  it("tall: precipitation and air quality carry the same secondary as wide", () => {
    for (const k of ["precipitation", "airQuality"]) {
      const wide = describeWeatherMetric({ metricKey: k, result: ready, size: "wide" });
      const tall = describeWeatherMetric({ metricKey: k, result: ready, size: "tall" });
      assert.deepEqual(tall, wide, k);
      assert.notEqual(tall.secondary, null, k);
    }
  });

  it("tall: temperature and uv have no secondary", () => {
    for (const k of ["temperature", "uv"]) {
      const tall = describeWeatherMetric({ metricKey: k, result: ready, size: "tall" });
      assert.equal(tall.secondary, null, k);
      assert.deepEqual(tall, describeWeatherMetric({ metricKey: k, result: ready, size: "square" }), k);
    }
  });

  it("tall: loading, error and stale keep the shape of the other sizes", () => {
    for (const k of keys) {
      assert.deepEqual(
        describeWeatherMetric({ metricKey: k, result: null, size: "tall" }),
        describeWeatherMetric({ metricKey: k, result: null, size: "square" })
      );
      assert.deepEqual(
        describeWeatherMetric({ metricKey: k, result: failed, size: "tall" }),
        describeWeatherMetric({ metricKey: k, result: failed, size: "square" })
      );
      assert.equal(describeWeatherMetric({ metricKey: k, result: stale, size: "tall" }).stale, true);
    }
  });

  it("returns null when there is nothing to render (no city)", () => {
    for (const k of keys) assert.equal(describeWeatherMetric({ metricKey: k, result: { status: "no-location", data: null }, size: "wide" }), null);
  });

  it("loading: '…', busy, no tone, 'Loading weather…'", () => {
    for (const k of keys) {
      const m = describeWeatherMetric({ metricKey: k, result: null, size: "square" });
      assert.deepEqual([m.primary, m.busy, m.tone, m.description], ["…", true, null, "Loading weather…"]);
    }
  });

  it("error: '—' and the reason", () => {
    const m = describeWeatherMetric({ metricKey: "uv", result: failed, size: "square" });
    assert.deepEqual([m.primary, m.tone, m.description, m.stale], ["—", null, "Weather unavailable: boom", false]);
  });

  it("ready temperature/uv are the same in square and wide (no secondary)", () => {
    for (const k of ["temperature", "uv"]) {
      const a = describeWeatherMetric({ metricKey: k, result: ready, size: "square" });
      const b = describeWeatherMetric({ metricKey: k, result: ready, size: "wide" });
      assert.deepEqual(a, b);
      assert.equal(a.secondary, null);
    }
    assert.equal(describeWeatherMetric({ metricKey: "temperature", result: ready, size: "square" }).primary, "21");
    assert.equal(describeWeatherMetric({ metricKey: "temperature", result: ready, size: "square" }).tone, "green"); // todayAt15 24 <= 25
  });

  it("precipitation shows the start hour only when wide", () => {
    assert.equal(describeWeatherMetric({ metricKey: "precipitation", result: ready, size: "wide" }).secondary, "15:00");
    assert.equal(describeWeatherMetric({ metricKey: "precipitation", result: ready, size: "square" }).secondary, null);
    assert.equal(describeWeatherMetric({ metricKey: "precipitation", result: ready, size: "wide" }).primary, "40%");
    assert.equal(
      describeWeatherMetric({ metricKey: "precipitation", result: { status: "ready", data: { ...data, precipitationStartHour: null } }, size: "wide" }).secondary,
      null
    );
  });

  it("air quality shows PM2.5 only when wide; description is complete either way", () => {
    const wide = describeWeatherMetric({ metricKey: "airQuality", result: ready, size: "wide" });
    const square = describeWeatherMetric({ metricKey: "airQuality", result: ready, size: "square" });
    assert.equal(wide.secondary, "9.0 PM2.5");
    assert.equal(square.secondary, null);
    assert.equal(wide.description, "US AQI 40 (Good), PM2.5 9.0 µg/m³.");
    assert.equal(square.description, wide.description);
  });

  it("stale prefixes the description, sets stale and keeps the data", () => {
    const m = describeWeatherMetric({ metricKey: "uv", result: stale, size: "square" });
    assert.equal(m.stale, true);
    assert.equal(m.primary, "3");
    assert.match(m.description, /^Couldn't refresh — showing saved data\. Current UV index 3/);
  });

  it("labels", () => {
    assert.deepEqual(keys.map((k) => describeWeatherMetric({ metricKey: k, result: null, size: "square" }).label),
      ["Temperature", "Precipitation", "Air quality", "UV index"]);
  });

  const sizes = ["square", "wide"];
  const expectedTone = { temperature: "green", precipitation: "rain-2", airQuality: "green", uv: "orange" };
  const descPrefix = {
    temperature: "Currently 21°.",
    precipitation: "Chance of rain for the rest of the day — 40%",
    airQuality: "US AQI 40 (Good)",
    uv: "Current UV index 3 (Moderate)."
  };

  it("loading is identical in shape for every metric and size", () => {
    for (const k of keys) for (const z of sizes) {
      const m = describeWeatherMetric({ metricKey: k, result: null, size: z });
      assert.deepEqual([m.primary, m.secondary, m.tone, m.stale, m.busy, m.description],
        ["…", null, null, false, true, "Loading weather…"]);
    }
  });

  it("error is identical in shape for every metric and size", () => {
    for (const k of keys) for (const z of sizes) {
      const m = describeWeatherMetric({ metricKey: k, result: failed, size: z });
      assert.deepEqual([m.primary, m.secondary, m.tone, m.stale, m.busy, m.description],
        ["—", null, null, false, false, "Weather unavailable: boom"]);
    }
  });

  it("ready sets the tone for each metric, not busy, not stale", () => {
    for (const k of keys) for (const z of sizes) {
      const m = describeWeatherMetric({ metricKey: k, result: ready, size: z });
      assert.equal(m.tone, expectedTone[k]);
      assert.deepEqual([m.stale, m.busy], [false, false]);
      assert.ok(m.description.startsWith(descPrefix[k]), m.description);
    }
  });

  it("stale keeps the data, tone and secondary of ready and only prefixes the description", () => {
    for (const k of keys) for (const z of sizes) {
      const r = describeWeatherMetric({ metricKey: k, result: ready, size: z });
      const s = describeWeatherMetric({ metricKey: k, result: stale, size: z });
      assert.equal(s.stale, true);
      assert.equal(s.busy, false);
      assert.equal(s.tone, expectedTone[k]);
      assert.equal(s.primary, r.primary);
      assert.equal(s.secondary, r.secondary);
      assert.equal(s.description, `Couldn't refresh — showing saved data. ${r.description}`);
    }
  });

  describe("retry fields (AS-WR-13)", () => {
    it("loading, ready and no-location carry retry: null", () => {
      for (const k of keys) {
        assert.equal(describeWeatherMetric({ metricKey: k, result: null, size: "square" }).retry, null);
        assert.equal(describeWeatherMetric({ metricKey: k, result: ready, size: "square" }).retry, null);
        assert.equal(describeWeatherMetric({ metricKey: k, result: ready, size: "square", retry: "retrying" }).retry, null);
      }
    });

    it("error and stale are 'ready' by default and carry the given phase", () => {
      for (const k of keys) {
        for (const result of [failed, stale]) {
          assert.equal(describeWeatherMetric({ metricKey: k, result, size: "square" }).retry, "ready");
          for (const phase of ["ready", "retrying", "cooldown"]) {
            assert.equal(describeWeatherMetric({ metricKey: k, result, size: "square", retry: phase }).retry, phase);
          }
        }
      }
    });

    it("an error tile retrying shows '…', is busy and says it is trying again", () => {
      for (const k of keys) {
        const m = describeWeatherMetric({ metricKey: k, result: failed, size: "square", retry: "retrying" });
        assert.deepEqual([m.primary, m.busy, m.description, m.stale], ["…", true, "Trying again…", false]);
      }
    });

    it("a stale tile retrying keeps its values and prefixes the description", () => {
      for (const k of keys) {
        const plain = describeWeatherMetric({ metricKey: k, result: stale, size: "wide" });
        const m = describeWeatherMetric({ metricKey: k, result: stale, size: "wide", retry: "retrying" });
        assert.equal(m.busy, true);
        assert.equal(m.primary, plain.primary);
        assert.equal(m.secondary, plain.secondary);
        assert.equal(m.tone, plain.tone);
        assert.equal(m.stale, true);
        assert.ok(m.description.startsWith("Trying again… "), m.description);
        assert.ok(!m.description.includes("Couldn't refresh"), m.description);
        assert.equal(m.description, `Trying again… ${plain.description.replace("Couldn't refresh — showing saved data. ", "")}`);
      }
    });

    it("the cooldown phase does not change content or busy", () => {
      for (const k of keys) {
        for (const result of [failed, stale]) {
          const plain = describeWeatherMetric({ metricKey: k, result, size: "square" });
          const m = describeWeatherMetric({ metricKey: k, result, size: "square", retry: "cooldown" });
          assert.deepEqual({ ...m, retry: null }, { ...plain, retry: null });
          assert.equal(m.busy, false);
        }
      }
    });

    it("with retry omitted the models equal today's (plus the new retry field)", () => {
      const expectedError = { label: "UV index", secondary: null, tone: null, stale: false, busy: false, primary: "—", description: "Weather unavailable: boom", retry: "ready" };
      assert.deepEqual(describeWeatherMetric({ metricKey: "uv", result: failed, size: "square" }), expectedError);
      const t = describeWeatherMetric({ metricKey: "temperature", result: ready, size: "square" });
      assert.deepEqual(t, { label: "Temperature", primary: "21", secondary: null, tone: t.tone, stale: false, busy: false, description: t.description, retry: null });
      const l = describeWeatherMetric({ metricKey: "uv", result: null, size: "square" });
      assert.deepEqual(l, { label: "UV index", primary: "…", secondary: null, tone: null, stale: false, busy: true, description: "Loading weather…", retry: null });
    });
  });
});

describe("describeWeatherMetric stale age (run 48)", () => {
  const NOW = 1_700_000_000_000;
  const HOUR = 60 * 60 * 1000;
  const staleAt = (ageMs) => ({ status: "stale", data: { ...data, fetchedAt: NOW - ageMs }, error: "offline" });
  const PREFIX = "Couldn't refresh — showing saved data. ";

  it("puts the age sentence between the prefix and the values when now and fetchedAt are given", () => {
    const m = describeWeatherMetric({ metricKey: "temperature", result: staleAt(2 * HOUR), size: "square", now: NOW });
    assert.equal(m.description, `${PREFIX}Updated 2 h ago. Currently 21°. Today at 15:00 — 24°, yesterday at 15:00 — 22°.`);
    assert.equal(m.stale, true);
    assert.equal(m.primary, "21");
  });

  it("says the age on every metric", () => {
    for (const k of keys) {
      const m = describeWeatherMetric({ metricKey: k, result: staleAt(45 * 60 * 1000), size: "square", now: NOW });
      assert.match(m.description, /^Couldn't refresh — showing saved data\. Updated 45 min ago\. \S/, k);
    }
  });

  it("without now the description has no age sentence, as before", () => {
    const m = describeWeatherMetric({ metricKey: "uv", result: staleAt(2 * HOUR), size: "square" });
    assert.match(m.description, /^Couldn't refresh — showing saved data\. Current UV index 3/);
    assert.doesNotMatch(m.description, /Updated|ago/);
  });

  it("without a finite fetchedAt the sentence is omitted", () => {
    for (const fetchedAt of [undefined, NaN, "x", Infinity]) {
      const result = { status: "stale", data: { ...data, fetchedAt }, error: "offline" };
      const m = describeWeatherMetric({ metricKey: "uv", result, size: "square", now: NOW });
      assert.match(m.description, /^Couldn't refresh — showing saved data\. Current UV index 3/);
    }
  });

  it("retrying, ready and error ignore now and carry no age", () => {
    const retrying = describeWeatherMetric({ metricKey: "uv", result: staleAt(2 * HOUR), size: "square", retry: "retrying", now: NOW });
    assert.match(retrying.description, /^Trying again… Current UV index 3/);
    assert.doesNotMatch(retrying.description, /Updated|ago/);
    const rdy = describeWeatherMetric({ metricKey: "uv", result: { status: "ready", data: { ...data, fetchedAt: NOW - 2 * HOUR }, error: null }, size: "square", now: NOW });
    assert.doesNotMatch(rdy.description, /Updated|ago|Couldn't refresh/);
    const err = describeWeatherMetric({ metricKey: "uv", result: failed, size: "square", now: NOW });
    assert.equal(err.description, "Weather unavailable: boom");
  });
});

// Run 49 (docs/typography-copy.md decision 5): the dash of the stale description is an em dash with a space on both sides.
describe("the stale description uses an em dash, not a hyphen (run 49)", () => {
  const data = { temperature: 21, uvIndex: 3, uvIndexMax: 6, precipitationProbabilityMax: 10, temperatureTodayAt15: 24, temperatureYesterdayAt15: 22, precipitationStartHour: null, usAqi: 40, pm2_5: 9, fetchedAt: 1_700_000_000_000 - 2 * 3600 * 1000 };
  const stale = { status: "stale", data, error: "offline" };

  it("the prefix is `Couldn't refresh — showing saved data. ` on every metric, with and without the age sentence", () => {
    for (const key of ["temperature", "precipitation", "airQuality", "uv"]) {
      for (const now of [undefined, 1_700_000_000_000]) {
        const m = describeWeatherMetric({ metricKey: key, result: stale, size: "square", now });
        assert.ok(m.description.startsWith("Couldn't refresh — showing saved data. "), `${key}: ${m.description}`);
        assert.doesNotMatch(m.description, /Couldn't refresh - /, "no hyphen used as a dash");
      }
    }
  });

  it("the description reads as the spec gives it: prefix, age, then the values (the em dash of the values is the existing one)", () => {
    const m = describeWeatherMetric({ metricKey: "temperature", result: stale, size: "square", now: 1_700_000_000_000 });
    assert.equal(m.description, "Couldn't refresh — showing saved data. Updated 2 h ago. Currently 21°. Today at 15:00 — 24°, yesterday at 15:00 — 22°.");
  });

  it("no description of any state holds a hyphen with spaces on both sides", () => {
    for (const result of [stale, { status: "ready", data, error: null }, { status: "error", data: null, error: "boom" }]) {
      for (const retry of [undefined, "retrying"]) {
        const m = describeWeatherMetric({ metricKey: "temperature", result, size: "wide", retry, now: 1_700_000_000_000 });
        assert.doesNotMatch(m.description, / - /, m.description);
      }
    }
  });
});
