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
  weatherRetryOutcome
} from "../src/weatherUiState.js";

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

    state = openCityModal(showSuggestions(state, candidates), "first-run");
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
    state = openCityModal(state, "first-run");
    assert.equal(isCityModalOpen(state), true);
    assert.equal(cityModalMode(state), "first-run");
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
});
