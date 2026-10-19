import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPm25,
  formatPrecipitation,
  formatTemperature,
  formatUpdatedAge,
  rainTone,
  temperatureTone,
  usAqiTone,
  uvTone
} from "../src/weatherPresentation.js";

describe("temperatureTone", () => {
  it("uses the fixed cool and hot thresholds", () => {
    assert.equal(temperatureTone({ todayAt15: 25, yesterdayAt15: 23 }), "green");
    assert.equal(temperatureTone({ todayAt15: 30, yesterdayAt15: 35 }), "orange");
  });

  it("compares moderate temperatures with yesterday at 15:00", () => {
    assert.equal(temperatureTone({ todayAt15: 27, yesterdayAt15: 28 }), "green");
    assert.equal(temperatureTone({ todayAt15: 27, yesterdayAt15: 27 }), "yellow");
    assert.equal(temperatureTone({ todayAt15: 27, yesterdayAt15: 26 }), "orange");
  });
});

describe("uvTone", () => {
  it("handles inclusive continuous boundaries", () => {
    assert.equal(uvTone(2), "green");
    assert.equal(uvTone(2.1), "orange");
    assert.equal(uvTone(5.9), "orange");
    assert.equal(uvTone(6), "red");
  });
});

describe("usAqiTone", () => {
  it("maps every inclusive AQI band", () => {
    assert.equal(usAqiTone(50), "green");
    assert.equal(usAqiTone(51), "yellow");
    assert.equal(usAqiTone(100), "yellow");
    assert.equal(usAqiTone(101), "orange");
    assert.equal(usAqiTone(150), "orange");
    assert.equal(usAqiTone(151), "red");
    assert.equal(usAqiTone(200), "red");
    assert.equal(usAqiTone(201), "purple");
    assert.equal(usAqiTone(300), "purple");
    assert.equal(usAqiTone(301), "maroon");
  });
});

describe("rainTone", () => {
  it("uses neutral for dry conditions and 20-point tiers for rain", () => {
    assert.equal(rainTone(0), "neutral");
    assert.equal(rainTone(1), "rain-1");
    assert.equal(rainTone(20), "rain-1");
    assert.equal(rainTone(21), "rain-2");
    assert.equal(rainTone(40), "rain-2");
    assert.equal(rainTone(41), "rain-3");
    assert.equal(rainTone(60), "rain-3");
    assert.equal(rainTone(61), "rain-4");
    assert.equal(rainTone(80), "rain-4");
    assert.equal(rainTone(81), "rain-5");
    assert.equal(rainTone(90), "rain-5");
    assert.equal(rainTone(100), "rain-5");
  });
});

describe("weather formatting", () => {
  it("keeps weather metric values unrounded", () => {
    assert.equal(formatTemperature(26.7), "26.7");
    assert.deepEqual(formatPrecipitation(90, "17:00"), ["90%", "17:00"]);
    assert.deepEqual(formatPrecipitation(0, null), ["0%", null]);
    assert.equal(formatPm25(9.3), "9.3");
    assert.equal(formatPm25(225.4321), "225.4");
  });
});

describe("formatUpdatedAge", () => {
  const NOW = 1_700_000_000_000;
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const age = (ms) => formatUpdatedAge(NOW - ms, NOW);

  it("says just now under one minute, including 0 and 59 s", () => {
    assert.equal(age(0), "Updated just now");
    assert.equal(age(59 * 1000), "Updated just now");
    assert.equal(age(59 * 1000 + 999), "Updated just now");
  });

  it("switches to minutes at exactly 60 s and floors", () => {
    assert.equal(age(60 * 1000), "Updated 1 min ago");
    assert.equal(age(90 * 1000), "Updated 1 min ago");
    assert.equal(age(45 * MIN), "Updated 45 min ago");
    assert.equal(age(59 * MIN), "Updated 59 min ago");
    assert.equal(age(59 * MIN + 59 * 1000), "Updated 59 min ago");
  });

  it("switches to hours at exactly 60 min and floors", () => {
    assert.equal(age(60 * MIN), "Updated 1 h ago");
    assert.equal(age(130 * MIN), "Updated 2 h ago");
    assert.equal(age(23 * HOUR + 59 * MIN), "Updated 23 h ago");
  });

  it("switches to days at exactly 24 h and floors, with no upper bound", () => {
    assert.equal(age(24 * HOUR), "Updated 1 d ago");
    assert.equal(age(26 * HOUR), "Updated 1 d ago");
    assert.equal(age(48 * HOUR), "Updated 2 d ago");
    assert.equal(age(400 * 24 * HOUR), "Updated 400 d ago");
  });

  it("treats a clock that moved backwards (negative age) as just now", () => {
    assert.equal(formatUpdatedAge(NOW + 5 * MIN, NOW), "Updated just now");
  });

  it("returns null when either time is not a finite number", () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined, null, "1", {}]) {
      assert.equal(formatUpdatedAge(bad, NOW), null, String(bad));
      assert.equal(formatUpdatedAge(NOW, bad), null, String(bad));
    }
  });
});
