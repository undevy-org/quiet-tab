import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { locationErrorMessage, roundCoordinate } from "../src/cityLocation.js";

describe("roundCoordinate", () => {
  it("rounds to two decimal places", () => {
    assert.equal(roundCoordinate(41.7151), 41.72);
    assert.equal(roundCoordinate(-122.4567), -122.46);
    assert.equal(roundCoordinate(10.005), 10.01);
  });

  it("leaves values that are already rounded unchanged", () => {
    assert.equal(roundCoordinate(41.72), 41.72);
    assert.equal(roundCoordinate(-10.5), -10.5);
  });

  it("normalizes negative zero and tiny negatives to zero", () => {
    assert.equal(roundCoordinate(-0), 0);
    assert.equal(roundCoordinate(-0.004), 0);
  });
});

describe("locationErrorMessage", () => {
  const onboardingTail = "Enter a city or skip.";
  const changeTail = "Search for a city instead.";

  const cases = [
    [{ source: "position", code: "denied" }, "Couldn't get your location."],
    [{ source: "position", code: "unsupported" }, "Couldn't get your location."],
    [{ source: "position", code: "unavailable" }, "Finding your location took too long."],
    [{ source: "position", code: "timeout" }, "Finding your location took too long."],
    [{ source: "reverse", kind: "notFound" }, "Couldn't find a city for your location."],
    [{ source: "reverse", kind: "network" }, "Couldn't look up your city. Check your connection."],
    [{ source: "reverse", kind: "timeout" }, "Couldn't look up your city. Check your connection."],
    [{ source: "reverse", kind: "http" }, "The location service isn't responding."],
    [{ source: "reverse", kind: "unknown" }, "The location service isn't responding."]
  ];

  for (const [failure, reason] of cases) {
    it(`wizard: ${reason}`, () => {
      assert.equal(locationErrorMessage("onboarding", failure), `${reason} ${onboardingTail}`);
    });

    it(`change: ${reason}`, () => {
      assert.equal(locationErrorMessage("change", failure), `${reason} ${changeTail}`);
    });
  }

  it("maps an unknown position code to the took-too-long reason", () => {
    assert.equal(
      locationErrorMessage("onboarding", { source: "position", code: "mystery" }),
      `Finding your location took too long. ${onboardingTail}`
    );
  });

  it("maps an unknown reverse kind to the isn't-responding reason", () => {
    assert.equal(
      locationErrorMessage("change", { source: "reverse", kind: "mystery" }),
      `The location service isn't responding. ${changeTail}`
    );
  });
});
