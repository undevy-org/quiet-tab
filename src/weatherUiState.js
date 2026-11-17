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
// One attempt for all tiles; presses are ignored while it runs and for 3 s after it failed. A press, a return of the tab and an `online`
// event share this one in-flight guard (docs/tab-return-refresh.md); `online` alone may start inside the 3 s pause (`ignorePause`).

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

// ---- weather requests only while a weather tile is shown (docs/layers-weather-polish.md decisions 9 and 10) ---------------------------
// A shown weather tile: an item of type "weather-metric" that is enabled. The city hint tile is drawn in the cell of the first enabled
// metric, so it counts; the weather result is never asked. An unreadable or newer grid has no items, so no shown tile (the caller passes none).
export function hasShownWeatherTile(items) {
  return Array.isArray(items) && items.some((item) => item?.type === "weather-metric" && item.enabled === true);
}

// What the one hook (newtab.js) does after a render, from the facts of that moment. `wasShown` is the hook's remembered value (initially false:
// the first render of a tab that has a shown tile is the change "none to some", so the load at open starts from the hook), `shown` the displayed
// state now. Only "no shown tile -> a shown tile" starts anything. While a city change runs (`changing`) the change owns the tiles: nothing
// starts and the tab flag is not set. The branch is chosen by the tab flag `openLoadStarted` (never cleared), not by the weather result: the
// first appearance starts the load at open (also offline: it serves the cache or shows the error; also after a failed read of the city), every
// later one asks for the automatic attempt, which does not start offline or while a load is in flight (and `retryWeather` itself filters by
// `weatherRefreshDue` and the 3 s pause). Returns the action ("none" | "load" | "attempt") and the new value of the tab flag.
export function weatherAppearanceDecision({ wasShown, shown, openLoadStarted, changing, online, loadInFlight }) {
  const appeared = shown === true && wasShown !== true;
  if (!appeared || changing) return { action: "none", openLoadStarted };
  if (!openLoadStarted) return { action: "load", openLoadStarted: true };
  return { action: online && !loadInFlight ? "attempt" : "none", openLoadStarted };
}

// ---- an `online` that arrives while a load or an attempt runs (docs/backlog-closeout.md decision 2, Ruling 2, 154 (1)) -----------------------
// One memory, one value: the weather generation that was current when an `online` arrived while the load at open or an attempt was in flight.
// "No memory" is null; 0, the generation of the load at open, is a valid memory, so every comparison is with null or by value and never by truthiness.
// An `online` with nothing in flight remembers nothing (the ordinary attempt path handles it) and leaves what is there as it was.
export function rememberOnline(memory, { loadInFlight, generation }) {
  return loadInFlight === true ? generation : memory;
}

// What the end of a load or an attempt that is still the current one does with the memory: replay once when the remembered generation is the one
// that just ended, and in EVERY case clear it (a value of another generation is dropped, a replay that a guard refuses leaves nothing behind, and a
// replay that fails never starts another: only a new `online` can). A superseded load or attempt does not ask: the generations only grow, so its
// stale value can never equal a later generation.
export function onlineReplayDecision(memory, generation) {
  return { replay: typeof memory === "number" && memory === generation, memory: null };
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

// ---- what the city field says about its error slot (docs/backlog-closeout.md decision 13, Ruling 12, 184) ----------------------------------------
// While the slot shows a message the field is described by it; the field is invalid only when the message is about the typed value (`invalid`: the empty
// submit, a city that was not found), not for a network failure or a location lookup failure. An empty message (a hidden slot) means neither.
export function cityFieldErrorAttributes(message, invalid) {
  const described = typeof message === "string" && message !== "";
  return { describedBy: described, invalid: described && invalid === true };
}
