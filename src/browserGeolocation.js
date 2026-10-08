export class BrowserLocationError extends Error {
  constructor(message, { code }) {
    super(message);
    this.name = "BrowserLocationError";
    this.code = code;
  }
}

function mapGeolocationErrorCode(error) {
  switch (error?.code) {
    case 1:
      return "denied";
    case 2:
      return "unavailable";
    case 3:
      return "timeout";
    default:
      return "unavailable";
  }
}

export function getBrowserPosition({
  timeoutMs = 15000,
  geolocation = globalThis.navigator?.geolocation
} = {}) {
  return new Promise((resolve, reject) => {
    if (!geolocation || typeof geolocation.getCurrentPosition !== "function") {
      reject(new BrowserLocationError("Geolocation is not supported", { code: "unsupported" }));
      return;
    }

    let settled = false;
    let timeoutId;

    const settle = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      fn(value);
    };

    timeoutId = setTimeout(() => {
      settle(reject, new BrowserLocationError("Geolocation timed out", { code: "timeout" }));
    }, timeoutMs);

    const onSuccess = (position) => {
      settle(resolve, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      });
    };

    const onError = (error) => {
      const code = mapGeolocationErrorCode(error);
      settle(
        reject,
        new BrowserLocationError(error?.message ?? "Geolocation failed", { code })
      );
    };

    try {
      geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: false,
        maximumAge: 300000,
        timeout: 12000
      });
    } catch {
      settle(reject, new BrowserLocationError("Geolocation failed", { code: "unavailable" }));
    }
  });
}
