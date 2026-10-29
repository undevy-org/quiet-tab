import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStorageArea } from "./memoryStorageArea.js";
import { createWeatherCacheStore, createWeatherLocationStore } from "../src/weatherStore.js";
import { WeatherApiError } from "../src/weatherApi.js";
import { createWeatherService } from "../src/weatherService.js";

const TBILISI = { name: "Springfield", country: "Georgia", latitude: 41.72, longitude: 44.78 };
const WEATHER_READING = {
  temperature: 24,
  temperatureTodayAt15: 26.7,
  temperatureYesterdayAt15: 25.2,
  uvIndex: 5.4,
  uvIndexMax: 6.1,
  precipitationProbabilityMax: 20,
  precipitationStartHour: "17:00"
};
const AIR_READING = { usAqi: 34, pm2_5: 11.4 };

function createHarness({
  now = () => 1_000_000,
  fetchWeather = async () => WEATHER_READING,
  fetchAirQuality = async () => AIR_READING,
  geocodeCity = async () => TBILISI
} = {}) {
  const locationStore = createWeatherLocationStore(createMemoryStorageArea());
  const cacheStore = createWeatherCacheStore(createMemoryStorageArea());
  const service = createWeatherService({
    locationStore,
    cacheStore,
    fetchWeather,
    fetchAirQuality,
    geocodeCity,
    now
  });

  return { locationStore, cacheStore, service };
}

describe("createWeatherService", () => {
  it("reports no-location before any city is set", async () => {
    const { service } = createHarness();
    const result = await service.initialize();

    assert.equal(result.status, "no-location");
    assert.equal(result.location, null);
    assert.equal(result.data, null);
  });

  it("setCity geocodes, persists the location, and fetches weather+air quality", async () => {
    const calls = [];
    const { service, locationStore } = createHarness({
      fetchWeather: async (args) => {
        calls.push(["weather", args]);
        return WEATHER_READING;
      },
      fetchAirQuality: async (args) => {
        calls.push(["air", args]);
        return AIR_READING;
      }
    });

    const result = await service.setCity("Springfield");

    assert.equal(result.status, "ready");
    assert.equal(result.location.name, "Springfield");
    assert.equal(result.data.temperature, 24);
    assert.equal(result.data.usAqi, 34);
    assert.equal(result.data.temperatureTodayAt15, 26.7);
    assert.equal(result.data.temperatureYesterdayAt15, 25.2);
    assert.equal(result.data.precipitationStartHour, "17:00");
    assert.deepEqual(await locationStore.getLocation(), result.location);
    assert.deepEqual(
      calls.map(([kind, args]) => [kind, args.latitude, args.longitude]),
      [
        ["weather", 41.72, 44.78],
        ["air", 41.72, 44.78]
      ]
    );
  });

  it("propagates geocoding failure without persisting a location", async () => {
    const { service, locationStore } = createHarness({
      geocodeCity: async () => {
        throw new WeatherApiError('City "Nonexistent Place" was not found');
      }
    });

    await assert.rejects(
      () => service.setCity("Nonexistent Place"),
      (error) => error instanceof WeatherApiError
    );
    assert.equal(await locationStore.getLocation(), null);
  });

  it("selectLocation persists a pre-resolved location and fetches weather+air quality without geocoding", async () => {
    const calls = [];
    const { service, locationStore } = createHarness({
      geocodeCity: async () => {
        throw new Error("geocodeCity should not be called by selectLocation");
      },
      fetchWeather: async (args) => {
        calls.push(["weather", args]);
        return WEATHER_READING;
      },
      fetchAirQuality: async (args) => {
        calls.push(["air", args]);
        return AIR_READING;
      }
    });

    const result = await service.selectLocation(TBILISI);

    assert.equal(result.status, "ready");
    assert.equal(result.location.name, "Springfield");
    assert.equal(result.data.temperature, 24);
    assert.deepEqual(await locationStore.getLocation(), result.location);
    assert.deepEqual(
      calls.map(([kind, args]) => [kind, args.latitude, args.longitude]),
      [
        ["weather", 41.72, 44.78],
        ["air", 41.72, 44.78]
      ]
    );
  });

  it("selectLocation returns an error status without throwing when fetching fails, but still persists the location", async () => {
    const { service, locationStore } = createHarness({
      fetchWeather: async () => {
        throw new Error("network down");
      }
    });

    const result = await service.selectLocation(TBILISI);

    assert.equal(result.status, "error");
    assert.equal(result.error, "Couldn't load weather. Try again in a moment.");
    assert.doesNotMatch(result.error, /network down/);
    assert.deepEqual(await locationStore.getLocation(), result.location);
  });

  it("shows the mapped network text when the forecast cannot be reached, never the raw rejection", async () => {
    const harness = createHarness({
      fetchWeather: async () => {
        throw new WeatherApiError("Weather request could not reach the network", { kind: "network" });
      }
    });

    const result = await harness.service.selectLocation(TBILISI);

    assert.equal(result.status, "error");
    assert.equal(result.error, "Can't reach the weather service. Check your connection and try again.");
  });

  it("returns ready from a fresh cache without calling fetch again", async () => {
    let fetchCalls = 0;
    const harness = createHarness({
      fetchWeather: async () => {
        fetchCalls += 1;
        return WEATHER_READING;
      }
    });

    await harness.service.setCity("Springfield");
    fetchCalls = 0;

    const result = await harness.service.initialize();

    assert.equal(result.status, "ready");
    assert.equal(fetchCalls, 0);
  });

  it("refetches once the cache is older than 30 minutes", async () => {
    let clock = 1_000_000;
    let fetchCalls = 0;
    const harness = createHarness({
      now: () => clock,
      fetchWeather: async () => {
        fetchCalls += 1;
        return WEATHER_READING;
      }
    });

    await harness.service.setCity("Springfield");
    fetchCalls = 0;
    clock += 30 * 60 * 1000 + 1;

    const result = await harness.service.initialize();

    assert.equal(result.status, "ready");
    assert.equal(fetchCalls, 1);
  });

  it("falls back to a stale cache with an error message when a refetch fails", async () => {
    let clock = 1_000_000;
    let shouldFail = false;
    const harness = createHarness({
      now: () => clock,
      fetchWeather: async () => {
        if (shouldFail) {
          throw new WeatherApiError("Open-Meteo forecast request failed with status 503", { kind: "http" });
        }
        return WEATHER_READING;
      }
    });

    await harness.service.setCity("Springfield");
    clock += 30 * 60 * 1000 + 1;
    shouldFail = true;

    const result = await harness.service.initialize();

    assert.equal(result.status, "stale");
    assert.equal(result.data.temperature, 24);
    assert.equal(result.error, "The weather service isn't responding right now. Try again in a moment.");
  });

  it("reports error with no data when there is no cache and the fetch fails", async () => {
    const harness = createHarness({
      fetchWeather: async () => {
        throw new WeatherApiError("Open-Meteo forecast request failed with status 500", { kind: "http" });
      }
    });

    await harness.locationStore.setLocation(TBILISI);
    const result = await harness.service.initialize();

    assert.equal(result.status, "error");
    assert.equal(result.data, null);
    assert.equal(result.error, "The weather service isn't responding right now. Try again in a moment.");
    assert.doesNotMatch(result.error, /500|Open-Meteo/);
  });

  it("forces a fresh fetch when the city changes, ignoring TTL", async () => {
    let fetchCalls = 0;
    const harness = createHarness({
      fetchWeather: async () => {
        fetchCalls += 1;
        return WEATHER_READING;
      },
      geocodeCity: async (name) => ({ ...TBILISI, name })
    });

    await harness.service.setCity("Springfield");
    fetchCalls = 0;

    const result = await harness.service.setCity("Shelbyville");

    assert.equal(result.location.name, "Shelbyville");
    assert.equal(fetchCalls, 1);
  });

  it("resolves with status error instead of throwing when locationStore.getLocation() rejects", async () => {
    const cacheStore = createWeatherCacheStore(createMemoryStorageArea());
    const service = createWeatherService({
      locationStore: {
        getLocation: async () => {
          throw new Error("extension context invalidated");
        },
        setLocation: async () => {
          throw new Error("not expected to be called");
        }
      },
      cacheStore,
      fetchWeather: async () => WEATHER_READING,
      fetchAirQuality: async () => AIR_READING,
      geocodeCity: async () => TBILISI,
      now: () => 1_000_000
    });

    await assert.doesNotReject(() => service.initialize());
    const result = await service.initialize();

    assert.equal(result.status, "error");
    assert.equal(result.location, null);
    assert.equal(result.data, null);
    assert.equal(typeof result.error, "string");
    assert.notEqual(result.error, null);
  });

  it("resolves with status error and the resolved location when cacheStore.getCache() rejects", async () => {
    const locationStore = createWeatherLocationStore(createMemoryStorageArea());
    await locationStore.setLocation(TBILISI);

    const service = createWeatherService({
      locationStore,
      cacheStore: {
        getCache: async () => {
          throw new Error("extension context invalidated");
        },
        setCache: async () => {
          throw new Error("not expected to be called");
        }
      },
      fetchWeather: async () => WEATHER_READING,
      fetchAirQuality: async () => AIR_READING,
      geocodeCity: async () => TBILISI,
      now: () => 1_000_000
    });

    await assert.doesNotReject(() => service.initialize());
    const result = await service.initialize();

    assert.equal(result.status, "error");
    assert.notEqual(result.location, null);
    assert.equal(result.location.name, TBILISI.name);
    assert.equal(result.data, null);
    assert.equal(typeof result.error, "string");
    assert.notEqual(result.error, null);
  });

  describe("retry characterization (AS-WR-13: initialize() needs no change)", () => {
    const FRESH_MS = 30 * 60 * 1000;

    it("a failed initialize followed by a successful one returns ready and writes the cache once", async () => {
      let fail = true;
      let writes = 0;
      const harness = createHarness({
        fetchWeather: async () => {
          if (fail) throw new WeatherApiError("offline", { kind: "network" });
          return WEATHER_READING;
        }
      });
      const originalSet = harness.cacheStore.setCache;
      harness.cacheStore.setCache = async (...args) => {
        writes += 1;
        return originalSet(...args);
      };
      await harness.locationStore.setLocation(TBILISI);

      const first = await harness.service.initialize();
      assert.equal(first.status, "error");
      assert.equal(writes, 0);

      fail = false;
      const second = await harness.service.initialize();
      assert.equal(second.status, "ready");
      assert.equal(second.data.temperature, 24);
      assert.equal(writes, 1);
    });

    it("a cache written meanwhile by another tab is served as ready with no fetch", async () => {
      let clock = 1_000_000;
      let fetchCalls = 0;
      const harness = createHarness({
        now: () => clock,
        fetchWeather: async () => {
          fetchCalls += 1;
          throw new WeatherApiError("offline", { kind: "network" });
        }
      });
      await harness.locationStore.setLocation(TBILISI);
      assert.equal((await harness.service.initialize()).status, "error");
      fetchCalls = 0;

      await harness.cacheStore.setCache({ ...WEATHER_READING, ...AIR_READING, locationName: TBILISI.name, fetchedAt: clock - 1000 });
      const result = await harness.service.initialize();

      assert.equal(result.status, "ready");
      assert.equal(fetchCalls, 0);
      assert.ok(FRESH_MS > 1000);
    });

    it("a stale cache stays stale on failure and is not rewritten", async () => {
      let clock = 1_000_000;
      let fail = false;
      const harness = createHarness({
        now: () => clock,
        fetchWeather: async () => {
          if (fail) throw new WeatherApiError("offline", { kind: "network" });
          return WEATHER_READING;
        }
      });
      await harness.service.setCity("Springfield");
      const before = await harness.cacheStore.getCache();
      clock += FRESH_MS + 1;
      fail = true;

      const first = await harness.service.initialize();
      const second = await harness.service.initialize();

      assert.equal(first.status, "stale");
      assert.equal(second.status, "stale");
      assert.deepEqual(await harness.cacheStore.getCache(), before);
    });

    it("a rejecting location store gives error, then a working one gives ready", async () => {
      let broken = true;
      const locationStore = createWeatherLocationStore(createMemoryStorageArea());
      await locationStore.setLocation(TBILISI);
      const service = createWeatherService({
        locationStore: {
          getLocation: async () => {
            if (broken) throw new Error("extension context invalidated");
            return locationStore.getLocation();
          },
          setLocation: (value) => locationStore.setLocation(value)
        },
        cacheStore: createWeatherCacheStore(createMemoryStorageArea()),
        fetchWeather: async () => WEATHER_READING,
        fetchAirQuality: async () => AIR_READING,
        geocodeCity: async () => TBILISI,
        now: () => 1_000_000
      });

      assert.equal((await service.initialize()).status, "error");
      broken = false;
      const result = await service.initialize();
      assert.equal(result.status, "ready");
      assert.equal(result.location.name, TBILISI.name);
    });
  });

  describe("persist: after-forecast (run 44, spec docs/city-modal-focus-copy.md decision 3)", () => {
    const BERLIN = { name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.41 };

    // Wraps both stores so every write is logged in call order and can be made to fail.
    function createRecordingHarness({
      fetchWeather = async () => WEATHER_READING,
      fetchAirQuality = async () => AIR_READING,
      failSetCache = false
    } = {}) {
      const log = [];
      const realLocationStore = createWeatherLocationStore(createMemoryStorageArea());
      const realCacheStore = createWeatherCacheStore(createMemoryStorageArea());
      const locationStore = {
        getLocation: () => realLocationStore.getLocation(),
        setLocation: async (value) => {
          log.push("setLocation");
          return realLocationStore.setLocation(value);
        }
      };
      const cacheStore = {
        getCache: () => realCacheStore.getCache(),
        setCache: async (value) => {
          log.push("setCache");
          if (failSetCache) throw new Error("quota exceeded");
          return realCacheStore.setCache(value);
        }
      };
      const service = createWeatherService({
        locationStore,
        cacheStore,
        fetchWeather,
        fetchAirQuality,
        geocodeCity: async () => BERLIN,
        now: () => 1_000_000
      });
      return { log, service, realLocationStore, realCacheStore };
    }

    const entries = [
      ["setCity", (service, options) => service.setCity("Berlin", options)],
      ["selectLocation", (service, options) => service.selectLocation(BERLIN, options)]
    ];

    for (const [name, call] of entries) {
      it(`${name}: a forecast failure writes neither the location nor the cache and rejects with the original error`, async () => {
        const original = new WeatherApiError("Weather request could not reach the network", { kind: "network" });
        const harness = createRecordingHarness({
          fetchWeather: async () => {
            throw original;
          }
        });

        await assert.rejects(
          () => call(harness.service, { persist: "after-forecast", isStale: () => false }),
          (error) => error === original
        );
        assert.deepEqual(harness.log, []);
        assert.equal(await harness.realLocationStore.getLocation(), null);
        assert.equal(await harness.realCacheStore.getCache(), null);
      });

      it(`${name}: an air-quality failure also leaves both stores untouched and rejects`, async () => {
        const original = new WeatherApiError("Air quality request failed", { kind: "network" });
        const harness = createRecordingHarness({
          fetchAirQuality: async () => {
            throw original;
          }
        });

        await assert.rejects(
          () => call(harness.service, { persist: "after-forecast", isStale: () => false }),
          (error) => error === original
        );
        assert.deepEqual(harness.log, []);
      });

      it(`${name}: success writes the location first, then the cache, one write each, and returns ready`, async () => {
        const harness = createRecordingHarness();

        const result = await call(harness.service, { persist: "after-forecast", isStale: () => false });

        assert.deepEqual(harness.log, ["setLocation", "setCache"]);
        assert.equal(result.status, "ready");
        assert.equal(result.error, null);
        assert.equal(result.location.name, "Berlin");
        assert.equal(result.data.temperature, 24);
        assert.equal(result.data.usAqi, 34);
        assert.deepEqual(await harness.realLocationStore.getLocation(), result.location);
        assert.equal((await harness.realCacheStore.getCache()).locationName, "Berlin");
      });

      it(`${name}: the location is not written before the forecast has resolved`, async () => {
        let releaseWeather;
        const gate = new Promise((resolve) => {
          releaseWeather = resolve;
        });
        const harness = createRecordingHarness({
          fetchWeather: async () => {
            await gate;
            return WEATHER_READING;
          }
        });

        const pending = call(harness.service, { persist: "after-forecast", isStale: () => false });
        try {
          await new Promise(setImmediate);
          await new Promise(setImmediate);
          assert.deepEqual(harness.log, [], "no write while the forecast is pending");
          assert.equal(await harness.realLocationStore.getLocation(), null);
        } finally {
          releaseWeather();
        }
        await pending;
        assert.deepEqual(harness.log, ["setLocation", "setCache"]);
      });

      it(`${name}: isStale() true after the fetch and before the write drops the result and writes nothing`, async () => {
        let stale = false;
        const harness = createRecordingHarness({
          fetchWeather: async () => {
            stale = true; // the attempt becomes stale while the forecast is in flight
            return WEATHER_READING;
          }
        });

        await assert.rejects(
          () => call(harness.service, { persist: "after-forecast", isStale: () => stale }),
          (error) => error instanceof Error && typeof error.message === "string" && error.message !== "",
          "a stale attempt rejects with a real Error that carries a message"
        );
        assert.deepEqual(harness.log, []);
        assert.equal(await harness.realLocationStore.getLocation(), null);
        assert.equal(await harness.realCacheStore.getCache(), null);
      });

      it(`${name}: isStale() is first consulted after the forecast and the air quality have resolved`, async () => {
        const order = [];
        const harness = createRecordingHarness({
          fetchWeather: async () => {
            order.push("weather");
            return WEATHER_READING;
          },
          fetchAirQuality: async () => {
            order.push("air");
            return AIR_READING;
          }
        });

        const result = await call(harness.service, {
          persist: "after-forecast",
          isStale: () => {
            order.push("isStale");
            return false;
          }
        });

        assert.equal(result.status, "ready");
        assert.ok(order.includes("isStale"), "isStale is consulted");
        assert.ok(order.indexOf("isStale") > Math.max(order.indexOf("weather"), order.indexOf("air")), `order was ${order.join(",")}`);
        assert.deepEqual(harness.log, ["setLocation", "setCache"]);
      });

      it(`${name}: persist: after-forecast without isStale does not throw and behaves as never stale`, async () => {
        const harness = createRecordingHarness();

        const result = await call(harness.service, { persist: "after-forecast" });

        assert.equal(result.status, "ready");
        assert.deepEqual(harness.log, ["setLocation", "setCache"]);
      });

      it(`${name}: isStale without the persist option is ignored: the default path persists first even for a stale attempt`, async () => {
        const harness = createRecordingHarness();

        const result = await call(harness.service, { isStale: () => true });

        assert.equal(result.status, "ready");
        assert.deepEqual(harness.log, ["setLocation", "setCache"]);
        assert.equal((await harness.realLocationStore.getLocation()).name, "Berlin");
      });

      it(`${name}: a setCache failure after a good forecast keeps the location and still returns the result`, async () => {
        const harness = createRecordingHarness({ failSetCache: true });

        const result = await call(harness.service, { persist: "after-forecast", isStale: () => false });

        assert.deepEqual(harness.log, ["setLocation", "setCache"]);
        assert.equal(result.status, "ready");
        assert.equal(result.location.name, "Berlin");
        assert.equal(result.data.temperature, 24);
        assert.equal((await harness.realLocationStore.getLocation()).name, "Berlin", "the location is not rolled back");
      });

      it(`${name}: without the option the old persist-then-fetch path and return values are unchanged`, async () => {
        const failing = createRecordingHarness({
          fetchWeather: async () => {
            throw new Error("network down");
          }
        });

        const failed = await call(failing.service, undefined);

        assert.equal(failed.status, "error");
        assert.equal(failed.error, "Couldn't load weather. Try again in a moment.");
        assert.deepEqual(failing.log, ["setLocation"], "location persisted first, no cache write");
        assert.equal((await failing.realLocationStore.getLocation()).name, "Berlin");

        const ok = createRecordingHarness();
        const ready = await call(ok.service, {});
        assert.equal(ready.status, "ready");
        assert.deepEqual(ok.log, ["setLocation", "setCache"]);
      });
    }
  });
});

describe("createWeatherService run 48: foreign cache guard and storage error", () => {
  const BERLIN = { name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.41 };

  function guardHarness({ onFetch, locationReads } = {}) {
    const locationStore = createWeatherLocationStore(createMemoryStorageArea());
    const cacheArea = createMemoryStorageArea();
    const realCache = createWeatherCacheStore(cacheArea);
    const writes = [];
    const cacheStore = {
      getCache: () => realCache.getCache(),
      setCache: async (value) => {
        writes.push(value.locationName);
        return realCache.setCache(value);
      }
    };
    let reads = 0;
    const countingLocationStore = {
      ...locationStore,
      getLocation: async () => {
        reads += 1;
        if (locationReads) return locationReads(reads, locationStore);
        return locationStore.getLocation();
      }
    };
    const service = createWeatherService({
      locationStore: countingLocationStore,
      cacheStore,
      fetchWeather: async () => {
        if (onFetch) await onFetch(locationStore);
        return WEATHER_READING;
      },
      fetchAirQuality: async () => AIR_READING,
      geocodeCity: async () => TBILISI,
      now: () => 1_000_000
    });
    return { locationStore, cacheStore: realCache, service, writes };
  }

  it("initialize writes the cache once when the stored city did not change during the fetch", async () => {
    const { service, locationStore, writes } = guardHarness();
    await locationStore.setLocation(TBILISI);
    const result = await service.initialize();
    assert.equal(result.status, "ready");
    assert.deepEqual(writes, [TBILISI.name]);
  });

  it("initialize does not write the cache when the city changed during the fetch, and returns the fetched city's forecast", async () => {
    const { service, locationStore, cacheStore, writes } = guardHarness({
      onFetch: (store) => store.setLocation(BERLIN)
    });
    await locationStore.setLocation(TBILISI);
    const result = await service.initialize();
    assert.deepEqual(writes, []);
    assert.equal(await cacheStore.getCache(), null);
    assert.equal(result.status, "ready");
    assert.equal(result.location.name, TBILISI.name);
    assert.equal(result.data.locationName, TBILISI.name);
    assert.equal(result.data.temperature, WEATHER_READING.temperature);
  });

  it("initialize does not write the cache when the city was removed during the fetch", async () => {
    const { service, locationStore, writes } = guardHarness({
      onFetch: (store) => store.clearLocation()
    });
    await locationStore.setLocation(TBILISI);
    const result = await service.initialize();
    assert.deepEqual(writes, []);
    assert.equal(result.status, "ready");
    assert.equal(result.location.name, TBILISI.name);
  });

  it("initialize treats a failing re-read of the city as unchanged and writes once", async () => {
    const { service, locationStore, writes } = guardHarness({
      locationReads: (n, store) => {
        if (n === 1) return store.getLocation();
        throw new Error("storage unavailable");
      }
    });
    await locationStore.setLocation(TBILISI);
    const result = await service.initialize();
    assert.equal(result.status, "ready");
    assert.deepEqual(writes, [TBILISI.name]);
  });

  it("initialize re-reads the stored city once more on the fetch path and not on a fresh cache", async () => {
    let reads = 0;
    const locationStore = createWeatherLocationStore(createMemoryStorageArea());
    await locationStore.setLocation(TBILISI);
    const service = createWeatherService({
      locationStore: { ...locationStore, getLocation: async () => (reads += 1, locationStore.getLocation()) },
      cacheStore: createWeatherCacheStore(createMemoryStorageArea()),
      fetchWeather: async () => WEATHER_READING,
      fetchAirQuality: async () => AIR_READING,
      geocodeCity: async () => TBILISI,
      now: () => 1_000_000
    });
    await service.initialize();
    assert.equal(reads, 2);
    reads = 0;
    await service.initialize(); // now a fresh cache: no fetch, no guard read
    assert.equal(reads, 1);
  });

  it("a failing setCache inside initialize still gives the error result as before", async () => {
    const locationStore = createWeatherLocationStore(createMemoryStorageArea());
    await locationStore.setLocation(TBILISI);
    const service = createWeatherService({
      locationStore,
      cacheStore: {
        getCache: async () => null,
        setCache: async () => {
          throw new Error("quota");
        }
      },
      fetchWeather: async () => WEATHER_READING,
      fetchAirQuality: async () => AIR_READING,
      geocodeCity: async () => TBILISI,
      now: () => 1_000_000
    });
    const result = await service.initialize();
    assert.equal(result.status, "error");
    assert.equal(result.error, "Couldn't load weather. Try again in a moment.");
  });

  for (const [label, rejection] of [
    ["a storage failure", new Error("QUOTA_BYTES_PER_ITEM quota exceeded")],
    ["the store's Invalid weather location error", new Error("Invalid weather location")]
  ]) {
    it(`persistAfterForecast turns ${label} of setLocation into a storage WeatherApiError and writes no cache`, async () => {
      const writes = [];
      const rejecting = createWeatherService({
        locationStore: { getLocation: async () => null, setLocation: async () => { throw rejection; } },
        cacheStore: { getCache: async () => null, setCache: async () => { writes.push("x"); } },
        fetchWeather: async () => WEATHER_READING,
        fetchAirQuality: async () => AIR_READING,
        geocodeCity: async () => TBILISI,
        now: () => 1_000_000
      });
      await assert.rejects(
        () => rejecting.selectLocation(BERLIN, { persist: "after-forecast" }),
        (error) => error instanceof WeatherApiError && error.details.kind === "storage"
      );
      assert.deepEqual(writes, []);
    });

    it(`persistAndFetch turns ${label} of setLocation into a storage WeatherApiError`, async () => {
      const rejecting = createWeatherService({
        locationStore: { getLocation: async () => null, setLocation: async () => { throw rejection; } },
        cacheStore: { getCache: async () => null, setCache: async () => { throw new Error("not expected"); } },
        fetchWeather: async () => WEATHER_READING,
        fetchAirQuality: async () => AIR_READING,
        geocodeCity: async () => TBILISI,
        now: () => 1_000_000
      });
      await assert.rejects(
        () => rejecting.selectLocation(BERLIN),
        (error) => error instanceof WeatherApiError && error.details.kind === "storage"
      );
      await assert.rejects(
        () => rejecting.setCity("Berlin"),
        (error) => error instanceof WeatherApiError && error.details.kind === "storage"
      );
    });
  }

  it("a forecast failure in persistAfterForecast keeps its own error, not the storage text", async () => {
    const service = createWeatherService({
      locationStore: { getLocation: async () => null, setLocation: async () => { throw new Error("must not be reached"); } },
      cacheStore: { getCache: async () => null, setCache: async () => {} },
      fetchWeather: async () => {
        throw new WeatherApiError("x", { kind: "network" });
      },
      fetchAirQuality: async () => AIR_READING,
      geocodeCity: async () => TBILISI,
      now: () => 1_000_000
    });
    await assert.rejects(
      () => service.selectLocation(BERLIN, { persist: "after-forecast" }),
      (error) => error instanceof WeatherApiError && error.details.kind === "network"
    );
  });
});

describe("isCacheFresh through initialize(): a cache from the future is not fresh (run 53, decision 4)", () => {
  const NOW = 5_000_000;
  const MIN = 60 * 1000;
  const cacheAt = (fetchedAt) => ({ ...WEATHER_READING, temperature: 11, ...AIR_READING, locationName: TBILISI.name, fetchedAt });

  async function open({ fetchedAt, fail = false }) {
    let weatherCalls = 0;
    let airCalls = 0;
    const harness = createHarness({
      now: () => NOW,
      fetchWeather: async () => {
        weatherCalls += 1;
        if (fail) throw new WeatherApiError("offline", { kind: "network" });
        return WEATHER_READING;
      },
      fetchAirQuality: async () => {
        airCalls += 1;
        return AIR_READING;
      }
    });
    await harness.locationStore.setLocation(TBILISI);
    await harness.cacheStore.setCache(cacheAt(fetchedAt));
    const result = await harness.service.initialize();
    return { harness, result, weatherCalls, airCalls };
  }

  for (const [name, delta] of [["now + 1 ms", 1], ["now + 10 min", 10 * MIN], ["now + 2 h", 120 * MIN], ["now - 30 min", -30 * MIN], ["now - 2 h", -120 * MIN]]) {
    it(`fetchedAt = ${name} is fetched again: one forecast and one air-quality request, cache rewritten with fetchedAt = now, ready`, async () => {
      const { harness, result, weatherCalls, airCalls } = await open({ fetchedAt: NOW + delta });
      assert.equal(result.status, "ready");
      assert.equal(result.data.temperature, 24, "the fresh value, not the cached 11");
      assert.equal(weatherCalls, 1);
      assert.equal(airCalls, 1);
      assert.equal((await harness.cacheStore.getCache()).fetchedAt, NOW);
    });

    it(`fetchedAt = ${name} with a failing fetch is stale with that cache`, async () => {
      const { result } = await open({ fetchedAt: NOW + delta, fail: true });
      assert.equal(result.status, "stale");
      assert.equal(result.data.temperature, 11);
      assert.equal(result.data.fetchedAt, NOW + delta);
    });
  }

  for (const [name, delta] of [["now", 0], ["now - 29 min 59 s", -(29 * MIN + 59 * 1000)]]) {
    it(`fetchedAt = ${name} is fresh: ready with the cache and no request`, async () => {
      const { result, weatherCalls, airCalls } = await open({ fetchedAt: NOW + delta });
      assert.equal(result.status, "ready");
      assert.equal(result.data.temperature, 11);
      assert.equal(weatherCalls + airCalls, 0);
    });
  }

  it("probe (row Р55 owns it, printed and not asserted beyond the result on RUN53_BASE): the city changes during the fetch, then the fetch fails", async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const harness = createHarness({
      now: () => NOW,
      fetchWeather: async () => {
        await gate;
        throw new WeatherApiError("offline", { kind: "network" });
      }
    });
    await harness.locationStore.setLocation(TBILISI);
    await harness.cacheStore.setCache(cacheAt(NOW - 2 * 60 * MIN));
    const pending = harness.service.initialize();
    await harness.locationStore.setLocation({ ...TBILISI, name: "Elsewhere" });
    release();
    const result = await pending;
    console.log(`# probe city-change-then-fail: ${result.status}, data ${result.data ? result.data.locationName : "none"}`);
    assert.ok(["stale", "error"].includes(result.status));
  });
});
