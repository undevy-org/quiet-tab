import {
  fetchAirQuality as defaultFetchAirQuality,
  fetchWeather as defaultFetchWeather,
  geocodeCity as defaultGeocodeCity,
  weatherErrorMessage
} from "./weatherApi.js";

const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;

function isCacheFresh(cache, location, now) {
  return (
    cache !== null &&
    location !== null &&
    cache.locationName === location.name &&
    now - cache.fetchedAt < WEATHER_CACHE_TTL_MS
  );
}

export function createWeatherService({
  locationStore,
  cacheStore,
  fetchWeather = defaultFetchWeather,
  fetchAirQuality = defaultFetchAirQuality,
  geocodeCity = defaultGeocodeCity,
  now = () => Date.now()
}) {
  async function fetchAndCache(location) {
    return cacheStore.setCache(buildCache(location, await fetchReading(location)));
  }

  async function fetchReading(location) {
    const [weather, airQuality] = await Promise.all([
      fetchWeather({ latitude: location.latitude, longitude: location.longitude }),
      fetchAirQuality({ latitude: location.latitude, longitude: location.longitude })
    ]);
    return { weather, airQuality };
  }

  function buildCache(location, { weather, airQuality }) {
    return {
      locationName: location.name,
      fetchedAt: now(),
      temperature: weather.temperature,
      uvIndex: weather.uvIndex,
      uvIndexMax: weather.uvIndexMax,
      precipitationProbabilityMax: weather.precipitationProbabilityMax,
      temperatureTodayAt15: weather.temperatureTodayAt15,
      temperatureYesterdayAt15: weather.temperatureYesterdayAt15,
      precipitationStartHour: weather.precipitationStartHour,
      usAqi: airQuality.usAqi,
      pm2_5: airQuality.pm2_5
    };
  }

  // Change-mode city flow. Why: a failed change of city must not replace a working city (and its cache) with one whose
  // forecast cannot be shown, so nothing is written until the forecast and air quality have both arrived. A failed fetch
  // rejects with the original error and leaves storage untouched; a cache write failure is not fatal (the cache is a cache).
  // The guarantee is "no write after the attempt is known to be stale" (timeout, newer attempt, teardown): the stale check
  // happens once, after the fetch. The window between isStale() and setLocation/setCache is accepted
  // (docs/city-modal-focus-copy.md, Accepted exceptions).
  async function persistAfterForecast(resolvedLocation, isStale) {
    const reading = await fetchReading(resolvedLocation);

    if (typeof isStale === "function" && isStale()) {
      throw new Error("City request is no longer current");
    }

    const location = await locationStore.setLocation(resolvedLocation);
    const cacheValue = buildCache(location, reading);
    let data = cacheValue;

    try {
      data = await cacheStore.setCache(cacheValue);
    } catch {
      // the cache is only a cache: keep the location and show the result
    }

    return { status: "ready", location, data, error: null };
  }

  function resolvePersist(resolvedLocation, options) {
    if (options && options.persist === "after-forecast") {
      return persistAfterForecast(resolvedLocation, options.isStale);
    }
    return persistAndFetch(resolvedLocation);
  }

  async function persistAndFetch(resolvedLocation) {
    const location = await locationStore.setLocation(resolvedLocation);

    try {
      const data = await fetchAndCache(location);
      return { status: "ready", location, data, error: null };
    } catch (error) {
      return { status: "error", location, data: null, error: weatherErrorMessage(error) };
    }
  }

  return {
    async initialize() {
      let location = null;

      try {
        location = await locationStore.getLocation();
      } catch (error) {
        return { status: "error", location: null, data: null, error: weatherErrorMessage(error) };
      }

      if (!location) {
        return { status: "no-location", location: null, data: null, error: null };
      }

      let cached = null;

      try {
        cached = await cacheStore.getCache();
      } catch (error) {
        return { status: "error", location, data: null, error: weatherErrorMessage(error) };
      }

      if (isCacheFresh(cached, location, now())) {
        return { status: "ready", location, data: cached, error: null };
      }

      try {
        const data = await fetchAndCache(location);
        return { status: "ready", location, data, error: null };
      } catch (error) {
        if (cached && cached.locationName === location.name) {
          return { status: "stale", location, data: cached, error: weatherErrorMessage(error) };
        }
        return { status: "error", location, data: null, error: weatherErrorMessage(error) };
      }
    },

    async setCity(name, options) {
      const resolved = await geocodeCity(name);
      return resolvePersist(resolved, options);
    },

    async selectLocation(location, options) {
      return resolvePersist(location, options);
    }
  };
}
