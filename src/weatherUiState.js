// Pure UI-state machine for the city modal: whether it is open ("change" mode, or
// "onboarding" while the wizard city field is active), and the live city-suggestion list
// list plus whether it's open). Opening or closing the modal drops the list.
// It also holds the weather-tile retry sub-state (an attempt in flight, the earliest next attempt).
import { WEATHER_CACHE_TTL_MS } from "./weatherShared.js";

export function createInitialWeatherUiState() {
  return { suggestions: [], suggestionsOpen: false, modal: null, retry: { inFlight: false, availableAt: 0 } };
}

export function showSuggestions(state, suggestions) {
  return { ...state, suggestions, suggestionsOpen: suggestions.length > 0 };
}

export function hideSuggestions(state) {
  return { ...state, suggestions: [], suggestionsOpen: false };
}

export function citySuggestions(state) {
  return state.suggestions;
}

export function isSuggestionsOpen(state) {
  return state.suggestionsOpen === true;
}

const CITY_MODAL_MODES = new Set(["change", "onboarding"]);

export function openCityModal(state, mode) {
  if (!CITY_MODAL_MODES.has(mode)) {
    throw new Error("Unknown city modal mode");
  }
  return { ...state, modal: { mode }, suggestions: [], suggestionsOpen: false };
}

export function closeCityModal(state) {
  return { ...state, modal: null, suggestions: [], suggestionsOpen: false };
}

export function isCityModalOpen(state) {
  return state.modal != null;
}

export function cityModalMode(state) {
  return state.modal?.mode ?? null;
}

// ---- weather tile retry (error and stale tiles) ----------------------------------------------------------
// One attempt for all tiles; presses are ignored while it runs and for 3 s after it failed.

export const WEATHER_RETRY_COOLDOWN_MS = 3000;
const GENERIC_RETRY_FAILURE = "Couldn't load weather. Try again in a moment.";

export function weatherRetryPhase(state, now) {
  const retry = state.retry;
  if (retry?.inFlight) return "retrying";
  const wait = (retry?.availableAt ?? 0) - now;
  // A clock that moved backwards (the wait is longer than the cooldown can be) counts as ready.
  return wait > 0 && wait <= WEATHER_RETRY_COOLDOWN_MS ? "cooldown" : "ready";
}

// Returns the SAME state object when no attempt may start: one in flight, or inside the pause. With `ignorePause` (a browser `online`
// event: the network has just come back) only an attempt in flight blocks.
export function startWeatherRetry(state, now, { ignorePause = false } = {}) {
  const phase = weatherRetryPhase(state, now);
  if (phase === "retrying" || (phase === "cooldown" && !ignorePause)) return state;
  return { ...state, retry: { inFlight: true, availableAt: 0 } };
}

// Whether the weather the tab shows is due for a refresh when the tab comes back or the network returns (docs/tab-return-refresh.md
// decision 2): an error, a stale result, or a ready result whose data is 30 minutes old or more (a cache is fresh while
// now - fetchedAt < WEATHER_CACHE_TTL_MS, so exactly 30 minutes is due). Not due: nothing shown yet (loading, or a boot load in flight),
// no city, a younger result, and a fetchedAt that is missing, not finite or in the future (the clock moved back).
export function weatherRefreshDue(result, now) {
  const status = result?.status;
  if (status === "error" || status === "stale") return true;
  if (status !== "ready") return false;
  const fetchedAt = result.data?.fetchedAt;
  return Number.isFinite(fetchedAt) && now - fetchedAt >= WEATHER_CACHE_TTL_MS;
}

export function finishWeatherRetry(state, now, ok) {
  return { ...state, retry: { inFlight: false, availableAt: ok ? 0 : now + WEATHER_RETRY_COOLDOWN_MS } };
}

export function resetWeatherRetry(state) {
  return { ...state, retry: { inFlight: false, availableAt: 0 } };
}

// "updated" (ready), "gone" (the city was removed elsewhere) or { failed: <user-safe text> } (error, stale, anything malformed).
// The text is the result's own `error`; nothing else is ever read.
export function weatherRetryOutcome(result) {
  const status = result?.status;
  if (status === "ready") return "updated";
  if (status === "no-location") return "gone";
  const text = (status === "error" || status === "stale") && typeof result.error === "string" && result.error !== "" ? result.error : GENERIC_RETRY_FAILURE;
  return { failed: text };
}
