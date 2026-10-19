const US_AQI_TONES = [
  { max: 50, tone: "green" },
  { max: 100, tone: "yellow" },
  { max: 150, tone: "orange" },
  { max: 200, tone: "red" },
  { max: 300, tone: "purple" },
  { max: Infinity, tone: "maroon" }
];

export function temperatureTone({ todayAt15, yesterdayAt15 }) {
  if (todayAt15 <= 25) {
    return "green";
  }

  if (todayAt15 >= 30) {
    return "orange";
  }

  if (todayAt15 < yesterdayAt15) {
    return "green";
  }

  if (todayAt15 === yesterdayAt15) {
    return "yellow";
  }

  return "orange";
}

export function uvTone(value) {
  if (value <= 2) {
    return "green";
  }

  if (value < 6) {
    return "orange";
  }

  return "red";
}

export function usAqiTone(value) {
  return (US_AQI_TONES.find((band) => value <= band.max) ?? US_AQI_TONES.at(-1)).tone;
}

export function rainTone(value) {
  return value <= 0 ? "neutral" : `rain-${Math.ceil(value / 20)}`;
}

export function formatTemperature(value) {
  return String(value);
}

export function formatPrecipitation(maxProbability, startHour) {
  return [`${maxProbability}%`, startHour];
}

export function formatPm25(value) {
  return value.toFixed(1);
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Relative age of a cached reading for a stale tile's description (docs/weather-reliability.md decision 3). Pure: `now`
// is passed in, never read here. Floor division; a negative age (the clock moved back) reads as "just now"; a time
// that is not a finite number gives null so the caller omits the sentence.
export function formatUpdatedAge(fetchedAt, now) {
  if (!Number.isFinite(fetchedAt) || !Number.isFinite(now)) {
    return null;
  }

  const age = now - fetchedAt;

  if (age < MINUTE_MS) {
    return "Updated just now";
  }

  if (age < HOUR_MS) {
    return `Updated ${Math.floor(age / MINUTE_MS)} min ago`;
  }

  if (age < DAY_MS) {
    return `Updated ${Math.floor(age / HOUR_MS)} h ago`;
  }

  return `Updated ${Math.floor(age / DAY_MS)} d ago`;
}
