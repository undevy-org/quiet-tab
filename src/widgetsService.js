import { withWidgetsMutationLock } from "./widgetsStore.js";
import {
  canPlace,
  defaultSize,
  displayLayout,
  isValidGrid,
  placeNew,
  placeResized,
  sizeOf,
  toStored
} from "./desktopLayout.js";
import { MAX_FAVORITE_WIDGETS } from "./widgetsShared.js";
import { isFreshDesk, islandPlacements } from "./onboardingLayout.js";
import {
  BACKGROUND_COLOR_SOURCES,
  HEX_COLOR_VALIDATION_PATTERN,
  ICON_MODES,
  LINK_LABEL_MAX_LENGTH,
  LINK_URL_MAX_LENGTH,
  trimString
} from "./favoritesShared.js";

const URL_SCHEME_PATTERN = /^([a-z][a-z\d+.-]*):(.*)$/i;

// The text after `scheme:` when the value has a scheme (`localhost:3000` has none: its "scheme" is a host and a port), else null.
function schemeRest(value) {
  const match = value.match(URL_SCHEME_PATTERN);

  if (!match) {
    return null;
  }

  const [, , rest] = match;
  if (rest.startsWith("//")) {
    return rest;
  }

  return isHostPortWithoutScheme(rest) ? null : rest;
}

function hasUrlScheme(value) {
  return schemeRest(value) !== null;
}

function isHostPortWithoutScheme(rest) {
  return /^\d+(?:[/?#]|$)/.test(rest);
}

// A validation error that names the dialog field it is about (docs/link-dialog-validation.md decision 3).
function fieldError(message, field) {
  const error = new Error(message);
  error.field = field;
  return error;
}

const LINK_TOO_LONG = "That link is too long (up to 2000 characters)"; // = LINK_URL_MAX_LENGTH
const ICON_LINK_TOO_LONG = "That icon link is too long (up to 2000 characters)"; // = LINK_URL_MAX_LENGTH
const LABEL_TOO_LONG = "That name is too long (up to 100 characters)"; // = LINK_LABEL_MAX_LENGTH
const IPV6_HOST_PATTERN = /^\[[0-9a-f:.]+\]$/i;
const IPV4_HOST_PATTERN = /^\d+\.\d+\.\d+\.\d+$/;
const HOST_LABEL_PATTERN = /^[a-z0-9_-]+$/i;

// The host part of what the person typed, read by URL grammar before the parser normalizes anything (docs/typography-copy.md
// decision 7): drop an optional `scheme:` and the slashes or backslashes after it, cut at the first `/`, `\`, `?` or `#`, take what
// follows the last `@` (credentials and several `@` are not part of the host), drop a trailing `:port`. No percent-decoding, no digit
// folding and no leading-zero removal, so every spelling the parser would normalize differs from the parsed host.
function typedHost(typed) {
  const rest = (schemeRest(typed) ?? typed).replace(/^[\\/]+/, "");
  const end = rest.search(/[\\/?#]/);
  const authority = end === -1 ? rest : rest.slice(0, end);
  return authority.slice(authority.lastIndexOf("@") + 1).replace(/:\d*$/, "").toLowerCase();
}

// Can this parsed host name a site? An IPv6 literal in brackets: yes. Four decimal parts: only when the person typed exactly that
// address (`127.1`, `2130706433`, `0x7f.0.0.1` and `192.168.001.1` are the parser's work, far more often a typo than a wish).
// Anything else: one trailing dot is allowed (a rooted name), every other label is 1 or more characters from [a-z0-9_-], does not
// begin or end with `-` and holds a letter or a digit. No length rule: the 2000-character limit stays the only one.
function isRealHost(hostname, typed) {
  if (IPV6_HOST_PATTERN.test(hostname)) return true;
  if (IPV4_HOST_PATTERN.test(hostname)) return typedHost(typed) === hostname;
  const labels = (hostname.endsWith(".") ? hostname.slice(0, -1) : hostname).split(".");
  return labels.every((label) => HOST_LABEL_PATTERN.test(label) && !label.startsWith("-") && !label.endsWith("-") && /[a-z0-9]/i.test(label));
}

function withUrlProtocol(value) {
  return hasUrlScheme(value) ? value : `https://${value}`;
}

// Order: empty, typed length, whitespace and parse, normalized length, protocol, host.
export function normalizeFavoriteUrl(input) {
  const typed = trimString(input);

  if (typed === "") {
    throw fieldError("Enter a URL", "url");
  }
  if (typed.length > LINK_URL_MAX_LENGTH) {
    throw fieldError(LINK_TOO_LONG, "url");
  }
  if (/\s/.test(typed)) {
    throw fieldError("Enter a valid URL", "url");
  }

  let parsed;
  try {
    parsed = new URL(withUrlProtocol(typed));
  } catch {
    throw fieldError("Enter a valid URL", "url");
  }

  if (parsed.href.length > LINK_URL_MAX_LENGTH) {
    throw fieldError(LINK_TOO_LONG, "url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw fieldError("Only http and https URLs are supported", "url");
  }
  if (!isRealHost(parsed.hostname, typed)) {
    throw fieldError("Enter a valid URL", "url");
  }

  return {
    url: parsed.href,
    domain: parsed.hostname
  };
}

export function normalizeNullableImageUrl(input) {
  const value = trimString(input);

  if (value === "") {
    return null;
  }
  if (value.length > LINK_URL_MAX_LENGTH) {
    throw fieldError(ICON_LINK_TOO_LONG, "customIconUrl");
  }

  let parsed;
  try {
    parsed = new URL(withUrlProtocol(value));
  } catch {
    throw fieldError("Enter a valid image URL", "customIconUrl");
  }

  if (parsed.href.length > LINK_URL_MAX_LENGTH) {
    throw fieldError(ICON_LINK_TOO_LONG, "customIconUrl");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw fieldError("Only http and https image URLs are supported", "customIconUrl");
  }

  return parsed.href;
}

// The typed name is limited; the fallback (the host) is cut instead, so the stored label always fits the Name limit.
function normalizeLabel(label, domain) {
  const typed = trimString(label);
  if (typed.length > LINK_LABEL_MAX_LENGTH) {
    throw fieldError(LABEL_TOO_LONG, "label");
  }
  return typed || domain.slice(0, LINK_LABEL_MAX_LENGTH);
}

// Lenient key for the wizard's de-duplication: an old stored link is never re-validated (no-users policy, decision 1).
function dedupKey(url) {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

function normalizeIconMode(iconMode) {
  if (!ICON_MODES.has(iconMode)) {
    throw fieldError("Choose a supported icon mode", "iconMode");
  }

  return iconMode;
}

function normalizeBackgroundColorSource(backgroundColorSource) {
  if (!BACKGROUND_COLOR_SOURCES.has(backgroundColorSource)) {
    throw fieldError("Choose a supported background color source", "backgroundColorSource");
  }

  return backgroundColorSource;
}

function deriveBackgroundColorSource(input, fallbackSource) {
  const source =
    input.backgroundColorSource ??
    (trimString(input.backgroundColor) ? "manual" : fallbackSource);

  return normalizeBackgroundColorSource(source);
}

function normalizeBackgroundColor(backgroundColor, domain, defaultBackgroundColor) {
  const color =
    trimString(backgroundColor) || trimString(defaultBackgroundColor(domain));

  if (!HEX_COLOR_VALIDATION_PATTERN.test(color)) {
    throw fieldError("Use a hex color like #24292f", "backgroundColor");
  }

  return color.toLowerCase();
}

function inputObject(input) {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? input
    : {};
}

function createDefaultId() {
  return `fav-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeSpan(value, name) {
  if (value !== 1 && value !== 2) {
    throw new Error(`Choose a supported tile ${name}`);
  }
  return value;
}

// The caller passes the current column count (effectiveColumns of the viewport, no upper bound): every explicit mutation
// is computed against the DISPLAYED layout (spec § Writes) and persists the displayed grid of every widget.
function requireColumns(options) {
  const columns = options?.columns;
  if (!Number.isInteger(columns) || columns < 2) {
    throw new Error("The current column count is required");
  }
  return columns;
}

// `viewportRows` (the page's first-screen row count, optional) only widens the drop area: anything but an integer
// 0..MAX_VIEWPORT_ROWS counts as 0, the old rule.
const MAX_VIEWPORT_ROWS = 4096;
function sanitizeViewportRows(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_VIEWPORT_ROWS ? value : 0;
}

function placeholderGrid(item) {
  const size = item.type === "weather-metric" ? defaultSize(item.id) : sizeOf(item);
  return { x: 0, y: 0, w: size.w, h: size.h };
}

// Resolve every widget to a valid STORED grid (x counts from the center line, run 15): on-grid ones to their displayed
// cell minus the origin of `columns`, hidden metrics keep (or get) a placeholder, already in the stored frame, that is
// ignored while hidden. Layouts the engine returns are displayed cells; every grid written back goes through toStored.
function rebase(state, columns) {
  const layout = displayLayout(state.items, columns);
  return {
    ...state,
    items: state.items.map((item) => {
      const spot = layout.get(item.id);
      return { ...item, grid: spot ? toStored(spot, columns) : isValidGrid(item.grid) ? item.grid : placeholderGrid(item) };
    })
  };
}

export class PlacementError extends Error {
  constructor(message = "That spot is taken") {
    super(message);
    this.name = "PlacementError";
    this.code = "PLACEMENT_REJECTED";
  }
}

// A stale tab touched a link that another tab deleted (docs/stale-link-and-host-contrast.md): the UI refreshes and says so
// instead of showing a technical form error. Only an id that no item has is "gone"; an id of another kind of item is a bug.
export class LinkGoneError extends Error {
  constructor(id) {
    super("This link was deleted in another tab.");
    this.name = "LinkGoneError";
    this.code = "link-gone";
    this.id = id;
  }
}

// The error for an update/delete of a favorite that is not there: gone (nobody has the id) or a wrong kind of item.
function missingFavoriteError(items, id) {
  return items.some((item) => item.id === id) ? new Error("Link not found") : new LinkGoneError(id);
}

function withGrid(items, id, grid) {
  return items.map((item) => (item.id === id ? { ...item, grid } : item));
}

export function createWidgetsService({
  store,
  now = () => new Date().toISOString(),
  createId = createDefaultId,
  defaultBackgroundColor = () => "#24292f"
}) {
  async function mutate(options, build) {
    return withWidgetsMutationLock(async () => {
      await store.assertWritable();
      const columns = requireColumns(options);
      const base = rebase(await store.getState(), columns);
      const updatedAt = now();
      const items = build({ base, columns, updatedAt });
      // A builder that returns null decided there is nothing to write (docs/post-onboarding-grid.md decision 2, no-op rule).
      if (items === null) return store.getState();
      return store.setState({ ...base, items, updatedAt });
    });
  }

  return {
    getState() {
      return store.getState();
    },

    // input.w / input.h (1 or 2, default 1×1). The new link takes the free block nearest to the center line.
    // options.island = { rows } (first-screen rows at call time) applies the post-onboarding island on a fresh desk that fits;
    // see src/onboardingLayout.js. One mutate: placeNew per row in order; skip URLs already on the grid (normalized); one MAX_FAVORITE_WIDGETS check.
    async addFavorites(inputs, options) {
      const list = Array.isArray(inputs) ? inputs : [];
      const addedIds = [];
      const island = options?.island ?? null;
      await mutate(options, ({ base, columns, updatedAt }) => {
        // decided on the state BEFORE the adds (decision 3); only when the caller asks for the island
        const fresh = island != null && isFreshDesk(base.items);
        const existingUrls = new Set(
          base.items
            .filter((item) => item.type === "favorite")
            .map((item) => dedupKey(item.url))
        );
        const pending = [];
        for (const raw of list) {
          const payload = inputObject(raw);
          const normalizedUrl = normalizeFavoriteUrl(payload.url);
          if (existingUrls.has(normalizedUrl.url)) continue;
          existingUrls.add(normalizedUrl.url);
          pending.push({ payload, normalizedUrl });
        }
        const favoriteCount = base.items.filter((item) => item.type === "favorite").length;
        if (favoriteCount + pending.length > MAX_FAVORITE_WIDGETS) {
          throw new Error(`You can save up to ${MAX_FAVORITE_WIDGETS} links`);
        }
        let items = base.items;
        let layout = displayLayout(items, columns);
        for (const { payload, normalizedUrl } of pending) {
          const size = {
            w: normalizeSpan(payload.w ?? 2, "width"),
            h: normalizeSpan(payload.h ?? 1, "height")
          };
          const id = createId();
          const item = {
            id,
            type: "favorite",
            url: normalizedUrl.url,
            label: normalizeLabel(payload.label, normalizedUrl.domain),
            domain: normalizedUrl.domain,
            customIconUrl: normalizeNullableImageUrl(payload.customIconUrl),
            iconMode: normalizeIconMode(payload.iconMode ?? "favicon"),
            backgroundColor: normalizeBackgroundColor(
              payload.backgroundColor,
              normalizedUrl.domain,
              defaultBackgroundColor
            ),
            backgroundColorSource: deriveBackgroundColorSource(payload, "auto"),
            grid: toStored(placeNew(layout, size, columns), columns),
            createdAt: updatedAt,
            updatedAt
          };
          items = [...items, item];
          layout = displayLayout(items, columns);
          addedIds.push(id);
        }
        if (island == null) return items;
        const placements = fresh
          ? islandPlacements({ k: addedIds.length, linkIds: addedIds, rows: island.rows, columns })
          : null;
        if (placements === null) return addedIds.length === 0 ? null : items;
        return items.map((item) => (placements.has(item.id) ? { ...item, grid: placements.get(item.id) } : item));
      });
      return addedIds;
    },

    addFavorite(input, options) {
      const payload = inputObject(input);
      return mutate(options, ({ base, columns, updatedAt }) => {
        const favoriteCount = base.items.filter((item) => item.type === "favorite").length;
        if (favoriteCount >= MAX_FAVORITE_WIDGETS) {
          throw new Error(`You can save up to ${MAX_FAVORITE_WIDGETS} links`);
        }

        const normalizedUrl = normalizeFavoriteUrl(payload.url);
        const size = { w: normalizeSpan(payload.w ?? 1, "width"), h: normalizeSpan(payload.h ?? 1, "height") };
        const layout = displayLayout(base.items, columns);
        const item = {
          id: createId(),
          type: "favorite",
          url: normalizedUrl.url,
          label: normalizeLabel(payload.label, normalizedUrl.domain),
          domain: normalizedUrl.domain,
          customIconUrl: normalizeNullableImageUrl(payload.customIconUrl),
          iconMode: normalizeIconMode(payload.iconMode ?? "favicon"),
          backgroundColor: normalizeBackgroundColor(
            payload.backgroundColor,
            normalizedUrl.domain,
            defaultBackgroundColor
          ),
          backgroundColorSource: deriveBackgroundColorSource(payload, "auto"),
          grid: toStored(placeNew(layout, size, columns), columns),
          createdAt: updatedAt,
          updatedAt
        };
        return [...base.items, item];
      });
    },

    updateFavorite(id, input, options) {
      const payload = inputObject(input);
      return mutate(options, ({ base, columns, updatedAt }) => {
        const index = base.items.findIndex((item) => item.type === "favorite" && item.id === id);
        if (index === -1) {
          throw missingFavoriteError(base.items, id);
        }

        const nextItem = { ...base.items[index] };
        delete nextItem.tileSize; // writes never carry the legacy tileSize

        if (Object.hasOwn(payload, "url")) {
          const normalizedUrl = normalizeFavoriteUrl(payload.url);
          nextItem.url = normalizedUrl.url;
          nextItem.domain = normalizedUrl.domain;
        }
        if (Object.hasOwn(payload, "label")) {
          nextItem.label = normalizeLabel(payload.label, nextItem.domain);
        }
        if (Object.hasOwn(payload, "customIconUrl")) {
          nextItem.customIconUrl = normalizeNullableImageUrl(payload.customIconUrl);
        }
        if (Object.hasOwn(payload, "iconMode")) {
          nextItem.iconMode = normalizeIconMode(payload.iconMode);
        }
        if (Object.hasOwn(payload, "backgroundColor")) {
          nextItem.backgroundColor = normalizeBackgroundColor(
            payload.backgroundColor,
            nextItem.domain,
            defaultBackgroundColor
          );
        }
        if (Object.hasOwn(payload, "backgroundColorSource")) {
          nextItem.backgroundColorSource = normalizeBackgroundColorSource(payload.backgroundColorSource);
        } else if (Object.hasOwn(payload, "backgroundColor")) {
          nextItem.backgroundColorSource = deriveBackgroundColorSource(payload, "auto");
        }
        if (Object.hasOwn(payload, "w") || Object.hasOwn(payload, "h")) {
          const size = {
            w: normalizeSpan(payload.w ?? nextItem.grid.w, "width"),
            h: normalizeSpan(payload.h ?? nextItem.grid.h, "height")
          };
          nextItem.grid = toStored(placeResized(displayLayout(base.items, columns), id, size, columns), columns);
        }
        nextItem.updatedAt = updatedAt;
        return base.items.with(index, nextItem);
      });
    },

    deleteFavorite(id, options) {
      return mutate(options, ({ base }) => {
        if (!base.items.some((item) => item.type === "favorite" && item.id === id)) {
          throw missingFavoriteError(base.items, id);
        }
        return base.items.filter((item) => item.id !== id);
      });
    },

    // payload: { enabled?: boolean, w?: 1|2, h?: 1|2 }. Hiding keeps the placeholder grid; restoring takes the free
    // block nearest to the center for its size.
    updateWeatherMetric(id, input, options) {
      const payload = inputObject(input);
      return mutate(options, ({ base, columns }) => {
        const index = base.items.findIndex((item) => item.type === "weather-metric" && item.id === id);
        if (index === -1) {
          // Nobody has the id: gone elsewhere (the storage was cleared in another tab, docs/stale-tab-recovery-followups.md);
          // an id of another kind of item is a bug.
          throw base.items.some((item) => item.id === id) ? new Error("Weather tile not found") : new LinkGoneError(id);
        }

        const current = base.items[index];
        const next = { ...current };
        delete next.tileSize;
        let size = { w: current.grid.w, h: current.grid.h };
        if (Object.hasOwn(payload, "w") || Object.hasOwn(payload, "h")) {
          size = {
            w: normalizeSpan(payload.w ?? size.w, "width"),
            h: normalizeSpan(payload.h ?? size.h, "height")
          };
        }

        if (Object.hasOwn(payload, "enabled")) {
          if (typeof payload.enabled !== "boolean") {
            throw new Error("Choose whether the weather tile is shown");
          }
          next.enabled = payload.enabled;
        }

        const layout = displayLayout(base.items, columns);
        if (next.enabled && !current.enabled) {
          next.grid = toStored(placeNew(layout, size, columns), columns);
        } else if (next.enabled) {
          next.grid = toStored(placeResized(layout, id, size, columns), columns);
        } else {
          next.grid = { ...current.grid, ...size };
        }
        return base.items.with(index, next);
      });
    },

    // Drop at cell (x, y). Rejected with PlacementError when the block overlaps, overflows or lies below the allowed row
    // (`options.viewportRows` adds the rows of the first screen, see maxDropRow).
    moveWidget(id, target, options) {
      return mutate(options, ({ base, columns }) => {
        const layout = displayLayout(base.items, columns);
        const current = layout.get(id);
        if (!current) {
          // Gone (no item has the id) is the stale-tab case; an existing item that is off the grid (a hidden metric) keeps the old text.
          throw base.items.some((item) => item.id === id) ? new Error("Tile not found") : new LinkGoneError(id);
        }
        const next = { x: target?.x, y: target?.y, w: current.w, h: current.h };
        if (!isValidGrid(next) || !canPlace(layout, id, next, columns, sanitizeViewportRows(options?.viewportRows))) {
          throw new PlacementError();
        }
        return withGrid(base.items, id, toStored(next, columns));
      });
    }
  };
}
