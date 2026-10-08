import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { BrowserLocationError, getBrowserPosition } from "../src/browserGeolocation.js";

function position(lat, lon) {
  return { coords: { latitude: lat, longitude: lon } };
}

function geolocationError(code, message = "fail") {
  const error = new Error(message);
  error.code = code;
  return error;
}

describe("getBrowserPosition", () => {
  it("resolves with latitude and longitude from the geolocation API", async () => {
    const geolocation = {
      getCurrentPosition(success) {
        success(position(41.7151, 44.8271));
      }
    };

    const result = await getBrowserPosition({ geolocation, timeoutMs: 5000 });

    assert.deepEqual(result, { latitude: 41.7151, longitude: 44.8271 });
  });

  it("passes the fixed position options to getCurrentPosition", async () => {
    const calls = [];
    const geolocation = {
      getCurrentPosition(success, _error, options) {
        calls.push(options);
        success(position(0, 0));
      }
    };

    await getBrowserPosition({ geolocation });

    assert.deepEqual(calls, [
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 12000 }
    ]);
  });

  it("maps GeolocationPositionError codes 1, 2 and 3", async () => {
    for (const [code, expected] of [
      [1, "denied"],
      [2, "unavailable"],
      [3, "timeout"]
    ]) {
      const geolocation = {
        getCurrentPosition(_success, error) {
          error(geolocationError(code));
        }
      };

      await assert.rejects(
        () => getBrowserPosition({ geolocation }),
        (error) => error instanceof BrowserLocationError && error.code === expected
      );
    }
  });

  it("maps an unknown GeolocationPositionError code to unavailable", async () => {
    const geolocation = {
      getCurrentPosition(_success, error) {
        error(geolocationError(99));
      }
    };

    await assert.rejects(
      () => getBrowserPosition({ geolocation }),
      (error) => error instanceof BrowserLocationError && error.code === "unavailable"
    );
  });

  it("rejects unsupported when geolocation is missing", async () => {
    await assert.rejects(
      () => getBrowserPosition({ geolocation: undefined }),
      (error) => error instanceof BrowserLocationError && error.code === "unsupported"
    );
  });

  it("rejects unavailable when getCurrentPosition throws synchronously", async () => {
    const geolocation = {
      getCurrentPosition() {
        throw new Error("boom");
      }
    };

    await assert.rejects(
      () => getBrowserPosition({ geolocation }),
      (error) => error instanceof BrowserLocationError && error.code === "unavailable"
    );
  });

  it("rejects with timeout when the permission prompt never answers", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const geolocation = {
      getCurrentPosition() {}
    };

    const pending = getBrowserPosition({ geolocation, timeoutMs: 15000 });
    mock.timers.tick(15000);

    await assert.rejects(
      pending,
      (error) => error instanceof BrowserLocationError && error.code === "timeout"
    );
    mock.timers.reset();
  });

  it("ignores a late success after the deadline", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    let lateSuccess;
    const geolocation = {
      getCurrentPosition(success) {
        lateSuccess = success;
      }
    };

    const pending = getBrowserPosition({ geolocation, timeoutMs: 100 });
    mock.timers.tick(100);

    await assert.rejects(
      pending,
      (error) => error instanceof BrowserLocationError && error.code === "timeout"
    );

    lateSuccess(position(9, 9));
    mock.timers.reset();
  });
});
