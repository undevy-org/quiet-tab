const SURFACE_TAILS = {
  onboarding: "Enter a city or skip.",
  change: "Search for a city instead."
};

const POSITION_REASONS = {
  denied: "Couldn't get your location.",
  unsupported: "Couldn't get your location.",
  unavailable: "Finding your location took too long.",
  timeout: "Finding your location took too long."
};

const REVERSE_REASONS = {
  notFound: "Couldn't find a city for your location.",
  network: "Couldn't look up your city. Check your connection.",
  timeout: "Couldn't look up your city. Check your connection.",
  http: "The location service isn't responding.",
  unknown: "The location service isn't responding."
};

export function roundCoordinate(value) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function locationErrorMessage(variant, failure) {
  const tail = SURFACE_TAILS[variant] ?? SURFACE_TAILS.onboarding;
  let reason;

  if (failure?.source === "position") {
    reason = POSITION_REASONS[failure.code] ?? POSITION_REASONS.unavailable;
  } else if (failure?.source === "reverse") {
    reason = REVERSE_REASONS[failure.kind] ?? REVERSE_REASONS.http;
  } else {
    reason = REVERSE_REASONS.http;
  }

  return `${reason} ${tail}`;
}
