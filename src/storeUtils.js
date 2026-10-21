export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hasOwnFields(value, fields) {
  return fields.every((field) => Object.hasOwn(value, field));
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function isParseableTimestamp(value) {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

export function cloneValue(value) {
  return structuredClone(value);
}

// Whether two values are the same once they have been through storage, which is JSON: key order does not matter, arrays are compared in
// order, a property that is undefined is absent, -0 is 0, NaN and Infinity are null, a Date is its string, a Map or a Set is an empty object.
// A value that cannot be written as JSON (a cycle, a BigInt) is never the same as anything. Used to tell a re-read state from the one a tab
// shows (docs/tab-return-refresh.md decision 7); never throws.
export function isSameValue(a, b) {
  return sameJson(toJson(a), toJson(b));
}

// The value as JSON.parse(JSON.stringify(value)) gives it; undefined stays undefined; a value JSON cannot hold becomes a unique unequal marker.
const UNWRITABLE = Symbol("unwritable");
function toJson(value) {
  if (value === undefined) return undefined;
  try {
    const text = JSON.stringify(value);
    return text === undefined ? undefined : JSON.parse(text);
  } catch {
    return UNWRITABLE;
  }
}

function sameJson(a, b) {
  if (a === UNWRITABLE || b === UNWRITABLE) return false;
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((item, i) => sameJson(item, b[i]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
}

