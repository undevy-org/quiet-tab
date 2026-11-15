export const ICON_MODES = new Set(["favicon", "letter", "custom"]);
export const BACKGROUND_COLOR_SOURCES = new Set(["auto", "manual"]);
export const LINK_URL_MAX_LENGTH = 2000;
export const LINK_LABEL_MAX_LENGTH = 100;
export const HEX_COLOR_VALIDATION_PATTERN = /^#[0-9a-f]{6}$/i;

export function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

// What a link tile draws as text (docs/tile-text-options.md decision 2). `showName` and `showLink` are stored only when false, so
// anything but `false` means "shown" (a missing key, `true`, or a value that is not a boolean). 1x1 has no text box. A 2-wide tile of
// one row has room for one line: the host takes the place of the name, never both. `item` may be undefined.
export function favoriteTileText(item, { w, h }) {
  if (w === 1 && h === 1) {
    return { name: false, host: false };
  }
  const wantName = item?.showName !== false;
  const wantLink = item?.showLink !== false;
  if (h === 1) {
    return { name: wantName, host: !wantName && wantLink };
  }
  return { name: wantName, host: wantLink };
}
