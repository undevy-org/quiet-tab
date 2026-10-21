import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  citySuggestions,
  cityModalMode,
  closeCityModal,
  createInitialWeatherUiState,
  hideSuggestions,
  isCityModalOpen,
  isSuggestionsOpen,
  openCityModal,
  showSuggestions,
  WEATHER_RETRY_COOLDOWN_MS,
  startWeatherRetry,
  finishWeatherRetry,
  resetWeatherRetry,
  weatherRetryPhase,
  weatherRetryOutcome,
  weatherRefreshDue
} from "../src/weatherUiState.js";
import { WEATHER_CACHE_TTL_MS } from "../src/weatherShared.js";

describe("weatherUiState", () => {
  it("starts with the modal closed, with no suggestions", () => {
    const state = createInitialWeatherUiState();
    assert.equal(isCityModalOpen(state), false);
    assert.equal(cityModalMode(state), null);
    assert.equal(isSuggestionsOpen(state), false);
    assert.deepEqual(citySuggestions(state), []);
  });

  it("opens and closes the city modal", () => {
    let state = createInitialWeatherUiState();
    state = openCityModal(state, "change");
    assert.equal(isCityModalOpen(state), true);
    assert.equal(cityModalMode(state), "change");

    state = closeCityModal(state);
    assert.equal(isCityModalOpen(state), false);
    assert.equal(cityModalMode(state), null);
  });

  it("keeps the modal state when suggestions change, and drops suggestions when the modal opens or closes", () => {
    const candidates = [{ name: "Tbilisi", country: "Georgia", latitude: 41.72, longitude: 44.78 }];
    let state = openCityModal(createInitialWeatherUiState(), "change");
    state = showSuggestions(state, candidates);
    assert.equal(isCityModalOpen(state), true);
    assert.equal(cityModalMode(state), "change");
    assert.equal(isSuggestionsOpen(state), true);
    assert.deepEqual(citySuggestions(state), candidates);

    state = closeCityModal(state);
    assert.equal(isSuggestionsOpen(state), false);
    assert.deepEqual(citySuggestions(state), []);

    state = openCityModal(showSuggestions(state, candidates), "onboarding");
    assert.equal(isSuggestionsOpen(state), false);
    assert.deepEqual(citySuggestions(state), []);
  });

  it("shows and hides suggestions", () => {
    let state = createInitialWeatherUiState();
    const candidates = [
      { name: "Tbilisi", country: "Georgia", latitude: 41.72, longitude: 44.78 },
      { name: "Tblisi", country: "Georgia", latitude: 41.7, longitude: 44.8 }
    ];

    state = showSuggestions(state, candidates);
    assert.equal(isSuggestionsOpen(state), true);
    assert.deepEqual(citySuggestions(state), candidates);

    state = hideSuggestions(state);
    assert.equal(isSuggestionsOpen(state), false);
    assert.deepEqual(citySuggestions(state), []);
  });

  it("treats an empty suggestion list as closed", () => {
    let state = createInitialWeatherUiState();
    state = showSuggestions(state, []);
    assert.equal(isSuggestionsOpen(state), false);
  });
});

describe("city modal state", () => {
  it("starts closed", () => {
    const state = createInitialWeatherUiState();
    assert.equal(isCityModalOpen(state), false);
    assert.equal(cityModalMode(state), null);
  });

  it("opens in either mode and closes, dropping suggestions", () => {
    let state = showSuggestions(createInitialWeatherUiState(), [{ name: "Tbilisi" }]);
    state = openCityModal(state, "onboarding");
    assert.equal(isCityModalOpen(state), true);
    assert.equal(cityModalMode(state), "onboarding");
    assert.equal(isSuggestionsOpen(state), false);

    state = closeCityModal(openCityModal(state, "change"));
    assert.equal(isCityModalOpen(state), false);
    assert.equal(cityModalMode(state), null);
  });

  it("empties the suggestions when the modal closes", () => {
    let state = openCityModal(createInitialWeatherUiState(), "change");
    state = showSuggestions(state, [{ name: "Tbilisi" }, { name: "Tbilisi Beach" }]);
    assert.equal(citySuggestions(state).length, 2);
    state = closeCityModal(state);
    assert.equal(isSuggestionsOpen(state), false);
    assert.deepEqual(citySuggestions(state), []);
  });

  it("rejects an unknown mode", () => {
    assert.throws(() => openCityModal(createInitialWeatherUiState(), "other"), /mode/);
  });

  describe("weather retry (AS-WR-13)", () => {
    it("starts ready with no attempt in flight", () => {
      const state = createInitialWeatherUiState();
      assert.equal(weatherRetryPhase(state, 1000), "ready");
      assert.equal(WEATHER_RETRY_COOLDOWN_MS, 3000);
    });

    it("an attempt in flight returns the same state object for a second start", () => {
      const state = createInitialWeatherUiState();
      const started = startWeatherRetry(state, 1000);
      assert.notEqual(started, state);
      assert.equal(weatherRetryPhase(started, 1000), "retrying");
      assert.equal(startWeatherRetry(started, 1001), started);
    });

    it("a failed finish pauses for 3 s from the end, then starts again", () => {
      let state = startWeatherRetry(createInitialWeatherUiState(), 1000);
      state = finishWeatherRetry(state, 5000, false);
      assert.equal(weatherRetryPhase(state, 5000), "cooldown");
      assert.equal(weatherRetryPhase(state, 7999), "cooldown");
      assert.equal(startWeatherRetry(state, 7999), state);
      assert.equal(weatherRetryPhase(state, 8000), "ready");
      const again = startWeatherRetry(state, 8000);
      assert.notEqual(again, state);
      assert.equal(weatherRetryPhase(again, 8000), "retrying");
    });

    it("a successful finish leaves no cooldown", () => {
      let state = startWeatherRetry(createInitialWeatherUiState(), 1000);
      state = finishWeatherRetry(state, 2000, true);
      assert.equal(weatherRetryPhase(state, 2000), "ready");
    });

    it("a clock that moved backwards counts as ready", () => {
      let state = startWeatherRetry(createInitialWeatherUiState(), 1000);
      state = finishWeatherRetry(state, 100000, false);
      assert.equal(weatherRetryPhase(state, 100000), "cooldown");
      assert.equal(weatherRetryPhase(state, 100000 - 10000), "ready");
    });

    it("resetWeatherRetry clears both fields", () => {
      let state = startWeatherRetry(createInitialWeatherUiState(), 1000);
      state = resetWeatherRetry(finishWeatherRetry(state, 2000, false));
      assert.equal(weatherRetryPhase(state, 2000), "ready");
      assert.deepEqual(state.retry, { inFlight: false, availableAt: 0 });
      state = resetWeatherRetry(startWeatherRetry(createInitialWeatherUiState(), 1000));
      assert.equal(weatherRetryPhase(state, 1000), "ready");
    });

    it("opening and closing the city modal keeps the retry fields", () => {
      let state = startWeatherRetry(createInitialWeatherUiState(), 1000);
      state = finishWeatherRetry(state, 2000, false);
      const kept = state.retry;
      state = openCityModal(state, "change");
      assert.deepEqual(state.retry, kept);
      state = closeCityModal(state);
      assert.deepEqual(state.retry, kept);
    });

    it("maps a service result to an outcome and never reads a message from anything else", () => {
      assert.equal(weatherRetryOutcome({ status: "ready", error: null }), "updated");
      assert.equal(weatherRetryOutcome({ status: "no-location", error: null }), "gone");
      assert.deepEqual(weatherRetryOutcome({ status: "error", error: "No network" }), { failed: "No network" });
      assert.deepEqual(weatherRetryOutcome({ status: "stale", error: "Slow" }), { failed: "Slow" });
      const generic = "Couldn't load weather. Try again in a moment.";
      assert.deepEqual(weatherRetryOutcome(null), { failed: generic });
      assert.deepEqual(weatherRetryOutcome({ status: "weird", message: "raw" }), { failed: generic });
      assert.deepEqual(weatherRetryOutcome({ status: "error", error: 42, message: "raw" }), { failed: generic });
    });
  });
  describe("start with ignorePause (run 50, AS-TRR-04)", () => {
    it("an online event may start inside the pause; only an attempt in flight blocks it", () => {
      let state = startWeatherRetry(createInitialWeatherUiState(), 1000);
      state = finishWeatherRetry(state, 2000, false);
      assert.equal(weatherRetryPhase(state, 3000), "cooldown");
      assert.equal(startWeatherRetry(state, 3000), state, "a plain start inside the pause is still refused");
      assert.equal(startWeatherRetry(state, 3000, {}), state);
      assert.equal(startWeatherRetry(state, 3000, { ignorePause: false }), state);
      const started = startWeatherRetry(state, 3000, { ignorePause: true });
      assert.notEqual(started, state);
      assert.equal(weatherRetryPhase(started, 3000), "retrying");
      assert.deepEqual(started.retry, { inFlight: true, availableAt: 0 });
      assert.equal(startWeatherRetry(started, 3001, { ignorePause: true }), started, "the same object while in flight, whatever the option");
    });

    it("a fresh state and the two-argument call behave as before", () => {
      const state = createInitialWeatherUiState();
      const started = startWeatherRetry(state, 1000, { ignorePause: true });
      assert.deepEqual(started.retry, { inFlight: true, availableAt: 0 });
      assert.equal(weatherRetryPhase(startWeatherRetry(state, 1000), 1000), "retrying");
    });
  });

  describe("weatherRefreshDue (run 50, AS-TRR-03)", () => {
    const MIN = 60 * 1000;
    const now = 1_800_000_000_000;
    const ready = (ageMs, extra = {}) => ({ status: "ready", location: { name: "Tbilisi" }, data: { fetchedAt: now - ageMs, ...extra }, error: null });

    it("the 30 minute rule is one shared constant", () => {
      assert.equal(WEATHER_CACHE_TTL_MS, 30 * MIN);
    });

    it("an error is due, with and without a location", () => {
      assert.equal(weatherRefreshDue({ status: "error", location: { name: "Tbilisi" }, data: null, error: "x" }, now), true);
      assert.equal(weatherRefreshDue({ status: "error", location: null, data: null, error: "x" }, now), true);
    });

    it("a stale result is due", () => {
      assert.equal(weatherRefreshDue({ status: "stale", location: { name: "Tbilisi" }, data: { fetchedAt: now - 5 * MIN }, error: "x" }, now), true);
    });

    it("a ready result is due from exactly 30 minutes (a cache is fresh while now - fetchedAt < 30 min)", () => {
      assert.equal(weatherRefreshDue(ready(0), now), false);
      assert.equal(weatherRefreshDue(ready(29 * MIN + 59 * 1000), now), false);
      assert.equal(weatherRefreshDue(ready(30 * MIN - 1), now), false);
      assert.equal(weatherRefreshDue(ready(30 * MIN), now), true);
      assert.equal(weatherRefreshDue(ready(30 * MIN + 1000), now), true);
      assert.equal(weatherRefreshDue(ready(31 * MIN), now), true);
      assert.equal(weatherRefreshDue(ready(24 * 60 * MIN), now), true);
    });

    it("a fetchedAt in the future (the clock moved back) is not due", () => {
      assert.equal(weatherRefreshDue(ready(-5 * MIN), now), false);
      assert.equal(weatherRefreshDue(ready(-24 * 60 * MIN), now), false);
    });

    it("a ready result without usable data is not due", () => {
      assert.equal(weatherRefreshDue({ status: "ready", data: null }, now), false);
      assert.equal(weatherRefreshDue({ status: "ready" }, now), false);
      assert.equal(weatherRefreshDue({ status: "ready", data: {} }, now), false);
      for (const fetchedAt of [NaN, Infinity, -Infinity, "123", null, undefined, {}]) {
        assert.equal(weatherRefreshDue({ status: "ready", data: { fetchedAt } }, now), false, String(fetchedAt));
      }
    });

    it("no city, a missing result, loading and unknown shapes are not due", () => {
      assert.equal(weatherRefreshDue({ status: "no-location", location: null, data: null, error: null }, now), false);
      assert.equal(weatherRefreshDue(null, now), false);
      assert.equal(weatherRefreshDue(undefined, now), false);
      assert.equal(weatherRefreshDue({ status: "loading" }, now), false);
      assert.equal(weatherRefreshDue({}, now), false);
    });

    it("a non-finite clock is not due", () => {
      assert.equal(weatherRefreshDue(ready(40 * MIN), NaN), false);
    });
  });
});
