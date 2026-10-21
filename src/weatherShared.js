// Shared weather constants. They live here, not in weatherService.js, so that the pure UI-state module can use them without
// importing the service (which pulls in the HTTP client).

// A cached forecast is fresh while now - fetchedAt < 30 minutes: the service serves it without a request, and a tile whose
// data is 30 minutes old or more is due for a refresh when the tab is shown again (weatherUiState.weatherRefreshDue).
export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
