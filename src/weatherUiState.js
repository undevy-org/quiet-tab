// Pure UI-state machine for the city modal: whether it is open (in "first-run"
// or "change" mode), and the live city-suggestion list of its form (candidate
// list plus whether it's open). Opening or closing the modal drops the list.
// It also holds the weather-tile retry sub-state (an attempt in flight, the earliest next attempt).

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

const CITY_MODAL_MODES = new Set(["first-run", "change"]);

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

// Returns the SAME state object when no attempt may start (in flight, or inside the pause).
export function startWeatherRetry(state, now) {
  if (weatherRetryPhase(state, now) !== "ready") return state;
  return { ...state, retry: { inFlight: true, availableAt: 0 } };
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
