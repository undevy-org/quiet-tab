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

// The accessible name of a link tile (docs/tile-text-options.md decision 3): the action and the label. When the host is the only text the
// tile draws (the name is off, the link is on, the tile has a text box), the host follows the label, so that the visible text is part of the
// name (WCAG 2.5.3 Label in Name; the label is not drawn then, and the host is what a person can say to a voice control). Every other tile,
// a 1×1 tile and a tile with no text included, is named as before.
export function favoriteTileName(item, size, editing) {
  const action = editing ? "Edit" : "Open";
  const lines = favoriteTileText(item, size);
  return !lines.name && lines.host ? `${action} ${item.label}, ${item.domain}` : `${action} ${item.label}`;
}
