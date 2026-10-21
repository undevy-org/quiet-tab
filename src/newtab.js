import {
  extractImageBackgroundColor,
  fallbackColorForDomain,
  hexToRgbChannels,
  normalizeAccentLightness
} from "./favoriteColor.js";
import {
  DEFAULT_FAVICON_SENTINEL_PAGE,
  DEFAULT_FAVICON_TIMEOUT_MS,
  createDefaultFaviconChecker
} from "./defaultFavicon.js";
import { FAVICON_SIZE, getFaviconUrl, getFavoriteIconModel, getFavoriteLetter } from "./favoriteIcon.js";
import { createIconNode } from "./icons.js";
import {
  canPlace, cellFromPoint, clampDropCell, displayLayout, effectiveColumns, gridMetrics, maxDropRow, viewportRows
} from "./desktopLayout.js";
import { holdReleasable, pageHoldHeight } from "./desktopLayout.js";
import {
  closeDialog,
  createDesktopUiState,
  endDrag,
  enterEditMode,
  escapeLayer,
  exitEditMode,
  closeMenu,
  deskRefreshBlocker,
  deskRefreshDecision,
  openDialog,
  openMenu,
  startDrag,
  updateDrag
} from "./desktopUiState.js";
import { isSameValue } from "./storeUtils.js";
import { createWidgetsService } from "./widgetsService.js";
import {
  WIDGETS_META_KEY,
  createWidgetsStore,
  ensureWidgetsLayout,
  inspectWidgetsMeta
} from "./widgetsStore.js";
import { placeTooltip } from "./widgetsLayout.js";
import { MAX_FAVORITE_WIDGETS, NEWER_WIDGETS_MESSAGE, weatherMetricKey } from "./widgetsShared.js";
import { getBrowserPosition, BrowserLocationError } from "./browserGeolocation.js";
import { locationErrorMessage, roundCoordinate } from "./cityLocation.js";
import { reverseGeocodeCoordinates, searchCities, WeatherApiError, weatherErrorMessage } from "./weatherApi.js";
import { createWeatherService } from "./weatherService.js";
import { onboardingWizardPossible, shouldShowOnboardingWizard } from "./cityPrompt.js";
import {
  ONBOARDING_FINISH_ERRORS,
  checkedStarterInputs,
  defaultStarterChecks,
  onboardingFinishErrorForAddFailure,
  progressPillCount,
  step2GuardActive
} from "./onboardingWizard.js";
import { ONBOARDING_STARTER_LINKS } from "./onboardingStarters.js";
import { createOnboardingStore, readOnboardingLocalFlags } from "./onboardingStore.js";
import { createWeatherCacheStore, createWeatherLocationStore, createWeatherPromptStore } from "./weatherStore.js";
import { describeWeatherMetric } from "./weatherTiles.js";
import {
  cityModalMode,
  citySuggestions,
  closeCityModal as closeCityModalState,
  createInitialWeatherUiState,
  finishWeatherRetry,
  hideSuggestions,
  isCityModalOpen,
  isSuggestionsOpen,
  openCityModal as openCityModalState,
  resetWeatherRetry,
  showSuggestions,
  startWeatherRetry,
  weatherRefreshDue,
  weatherRetryOutcome,
  weatherRetryPhase
} from "./weatherUiState.js";
const favoritesRoot = document.querySelector("#favorites");
const desktopStatus = document.querySelector("#desktop-status");

const ENSURE_FAILED_MESSAGE =
  "Couldn't add the weather and settings tiles — Chrome Sync may be full or unavailable. Free up sync space, then reload this tab to try again.";

const desktopLive = document.querySelector("#desktop-live");
const DESKTOP_STATUS_MS = 8000;
let desktopStatusTimer = 0;
let layoutFailureChipShown = false; // the chip with the Reload button is up: Escape dismisses it (the `status` layer)
let desktopStatusPersistent = false; // the shown message is a `persist` one (the ensure failure): a retry failure must not displace it

// Page-level status line (role="alert"), text only. It clears after 8 s or at the next action. `persist` skips the
// 8 s clear (the ensure failure: a Settings/Add tile may be missing, so its explanation stays until the next action).
// `tone: "info"` is the neutral look (a reset notice); every other call is the danger look, set on each call so it never sticks.
function showDesktopStatus(text, { persist = false, tone = "error" } = {}) {
  if (!desktopStatus) return;
  if (text === "" && !desktopStatus.hidden) keepHoldAcrossChipRelease();
  clearTimeout(desktopStatusTimer);
  layoutFailureChipShown = false;
  desktopStatus.classList.toggle("desktop-status--info", tone === "info");
  desktopStatus.textContent = text;
  desktopStatus.hidden = text === ""; // the only place the chip is hidden: keepHoldAcrossChipRelease depends on the call above
  desktopStatusPersistent = persist && text !== "";
  if (text !== "" && !persist) desktopStatusTimer = setTimeout(() => showDesktopStatus(""), DESKTOP_STATUS_MS);
}

// docs/layers-low-window.md decision 12: --status-reserve (px) on :root is the distance from the window bottom to the chip's
// top while the chip exists (border box height + --status-chip-offset-bottom), 0 when it is hidden. The chip is
// position: fixed, so it takes no room by itself; the CSS uses the property for .desktop padding-bottom and the root
// scroll-padding-bottom only, never for any layout input (columns, viewportRows) and nothing is written to storage.
if (desktopStatus && typeof ResizeObserver === "function") {
  const writeStatusReserve = (height) => {
    const offset = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--status-chip-offset-bottom")) || 0;
    document.documentElement.style.setProperty("--status-reserve", desktopStatus.hidden || height <= 0 ? "0px" : `${height + offset}px`);
  };
  new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1];
    writeStatusReserve(entry.borderBoxSize?.[0]?.blockSize ?? desktopStatus.offsetHeight);
  }).observe(desktopStatus);
}

// Polite live region for outcomes that have no visible change at the focused element.
// The region is cleared at once and the text is set on the next frame (timer fallback for a hidden tab), so an identical
// string is a fresh mutation and is read again. A later call replaces the pending text; announce("") only clears.
const ANNOUNCE_FALLBACK_MS = 50;
let announcePending = null; // { frame, timer } of the text waiting for its frame
function announce(text) {
  if (!desktopLive) return;
  const cancelPending = () => {
    if (!announcePending) return;
    cancelAnimationFrame(announcePending.frame);
    clearTimeout(announcePending.timer);
    announcePending = null;
  };
  cancelPending();
  desktopLive.textContent = "";
  if (text === "") return;
  const pending = { frame: 0, timer: 0 };
  const setText = () => {
    if (announcePending !== pending) return;
    cancelPending();
    desktopLive.textContent = text;
  };
  pending.frame = requestAnimationFrame(setText);
  pending.timer = setTimeout(setText, ANNOUNCE_FALLBACK_MS);
  announcePending = pending;
}

function createNode(tagName, className, textContent) {
  const node = document.createElement(tagName);

  if (className) {
    node.className = className;
  }

  if (textContent !== undefined) {
    node.textContent = textContent;
  }

  return node;
}

// One shared tooltip for every trigger, appended to body so no scrolling container clips it.
const tooltipLayer = createNode("div", "tooltip");
tooltipLayer.id = "tooltip";
tooltipLayer.setAttribute("role", "tooltip");
tooltipLayer.hidden = true;
document.body.appendChild(tooltipLayer);

let tooltipTrigger = null;
let suppressTooltipOnFocus = false;
let ignoreScrollUntil = 0;

function hideTooltip() {
  tooltipLayer.hidden = true;
  tooltipTrigger = null;
}

function hideTooltipIfVisible() {
  if (tooltipLayer.hidden) return false;
  hideTooltip();
  return true;
}

function showTooltipFor(trigger) {
  if (desktopUi.editMode || dragSession) return; // tooltips are for normal mode only
  // the text is the trigger's data-tooltip-label (a tile with no text node: the 1×1 city hint) or the [data-tooltip-text] child of a weather tile
  const text = trigger.dataset.tooltipLabel ?? trigger.querySelector("[data-tooltip-text]")?.textContent;
  if (!text) return;
  tooltipTrigger = trigger;
  tooltipLayer.textContent = text;
  tooltipLayer.style.visibility = "hidden";
  tooltipLayer.hidden = false;
  const t = trigger.getBoundingClientRect();
  const w = tooltipLayer.getBoundingClientRect();
  const { left, top } = placeTooltip({
    trigger: { top: t.top, bottom: t.bottom, left: t.left, width: t.width },
    tooltip: { width: w.width, height: w.height },
    viewport: { width: window.innerWidth, height: window.innerHeight }
  });
  tooltipLayer.style.left = `${left}px`;
  tooltipLayer.style.top = `${top}px`;
  tooltipLayer.style.visibility = "";
}

const tooltipTriggerOf = (event) =>
  event.target instanceof Element ? event.target.closest("[data-tooltip-trigger]") : null;

favoritesRoot?.addEventListener("pointerover", (event) => {
  const trigger = tooltipTriggerOf(event);
  if (trigger && trigger !== tooltipTrigger) showTooltipFor(trigger);
});
favoritesRoot?.addEventListener("pointerout", (event) => {
  const trigger = tooltipTriggerOf(event);
  if (trigger && trigger === tooltipTrigger && !trigger.contains(event.relatedTarget)) hideTooltip();
});
favoritesRoot?.addEventListener("focusin", (event) => {
  if (suppressTooltipOnFocus) return;
  const trigger = tooltipTriggerOf(event);
  if (!trigger || !trigger.matches(":focus-visible")) return;
  ignoreScrollUntil = performance.now() + 250; // the browser may scroll the tile into view
  requestAnimationFrame(() => {
    if (document.activeElement === trigger) showTooltipFor(trigger);
  });
});
favoritesRoot?.addEventListener("focusout", (event) => {
  if (tooltipTriggerOf(event) === tooltipTrigger) hideTooltip();
});
favoritesRoot?.addEventListener(
  "scroll",
  () => {
    if (performance.now() >= ignoreScrollUntil) hideTooltip();
  },
  true
);
favoritesRoot?.addEventListener("wheel", hideTooltip, { passive: true });
favoritesRoot?.addEventListener("touchmove", hideTooltip, { passive: true });
window.addEventListener("resize", hideTooltip);

function createStatus(text, { error = false, live = "polite", full = false } = {}) {
  const status = createNode(
    "p",
    `${error ? "status status--error" : "status"}${full ? " status--full" : ""}`,
    text
  );

  status.setAttribute("role", error ? "alert" : "status");
  status.setAttribute("aria-live", live);
  return status;
}


const chromeApi = globalThis.chrome;
const localStorageArea = chromeApi?.storage?.local;
const syncStorageArea = chromeApi?.storage?.sync;
const faviconBaseUrl =
  typeof chromeApi?.runtime?.getURL === "function"
    ? chromeApi.runtime.getURL("/_favicon/")
    : "";

function hasStorageArea(area) {
  return area && typeof area.get === "function" && typeof area.set === "function";
}

const widgetsStore = hasStorageArea(syncStorageArea)
  ? createWidgetsStore(syncStorageArea)
  : null;

const widgetsService = widgetsStore
  ? createWidgetsService({
      store: widgetsStore,
      defaultBackgroundColor: fallbackColorForDomain
    })
  : null;

const weatherLocationStore = hasStorageArea(syncStorageArea)
  ? createWeatherLocationStore(syncStorageArea)
  : null;
const weatherCacheStore = hasStorageArea(localStorageArea)
  ? createWeatherCacheStore(localStorageArea)
  : null;
const weatherPromptStore = hasStorageArea(localStorageArea) ? createWeatherPromptStore(localStorageArea) : null;
const onboardingStore = hasStorageArea(localStorageArea) ? createOnboardingStore(localStorageArea) : null;
const weatherService =
  weatherLocationStore && weatherCacheStore
    ? createWeatherService({
        locationStore: weatherLocationStore,
        cacheStore: weatherCacheStore
      })
    : null;

let widgetsState = null;
// Edit mode / menu / dialog / drag (pure state, desktopUiState.js). Normal mode only until the later tasks wire it.
let desktopUi = createDesktopUiState();
let favoritesError = "";
let favoritesBusy = false;
let favoritesGeneration = 0;
// The grid re-read on a return of the tab (docs/tab-return-refresh.md decision 5): a return that came while a layer was up (kept for the first
// moment after the last layer), a re-read in flight and one queued behind it, and the one animation frame that starts the pending one.
let deskRefreshPending = false;
let deskRefreshRunning = false;
let deskRefreshQueued = false;
let deskRefreshFrame = 0;
// Selectors to try, in order, once the next non-busy render has finished, so keyboard focus
// never falls back to <body> after a re-render replaced the control that had it.
let pendingFocus = null;
let weatherResult = null;
let weatherLocation = null;
let weatherLocationError = "";
let weatherLocationKnown = false;
let weatherChanging = false;
let weatherGeneration = 0;
let weatherRetryToken = 0; // a retry result applies only while this and weatherGeneration are the values it started with
let weatherRetryTimer = 0; // the end of the cooldown (updates the existing retry nodes in place)
let widgetsEnsureFailed = false;
let widgetsNewer = false;
let activeCityForm = null; // { cancelPending, renderSuggestions, refresh, place, focusField, caretToEnd, dispose, choose, chosen, recentlyChosen } of the mounted city form
let weatherUi = createInitialWeatherUiState();
let weatherBusy = false;
let weatherFormGeneration = 0;
// The city modal (present in the DOM only while open) and what it needs across renders.
let cityModalRoot = null;
let cityModalOpener = null; // selector of the control that opened it, looked up again at close time
let cityModalHintMetricId = null; // data-metric-id of the hint tile that opened it (the hint is gone once the first city is set)
let cityAttempt = null; // { stale } of the newest changeCity attempt
let cityModalError = "";
let locationStatusNode = null;
let locating = false;
let locationAbortController = null;
let locationStatusFrame = 0;
let locationReverseTimer = 0;
const LOCATION_LINK_LABEL = "use your location";
const LOCATION_BUSY_LABEL = "Finding your location\u2026";
const LOCATION_REVERSE_TIMEOUT_MS = 8000;
let cityModalOpenedAt = 0;
let cityModalHadFocus = false; // D14: focus was inside the modal at some point since it opened
const CITY_MODAL_BACKDROP_GUARD_MS = 300;
// The second click of a double click on a button of the wizard or the city modal arrives after the node is gone (or the step has
// switched) and lands on the tile or row under it (docs/onboarding-wizard-polish.md decision 1). A pointer click (detail > 0) in this window after the close is swallowed;
// keyboard activation (detail 0) is not guarded.
const POST_CLOSE_CLICK_GUARD_MS = 300;
let postCloseGuardUntil = 0;

function armPostCloseClickGuard() {
  postCloseGuardUntil = performance.now() + POST_CLOSE_CLICK_GUARD_MS;
}

// A modal that opens again means the person is acting on purpose: its own buttons must not be swallowed by the guard of the previous close.
function clearPostCloseClickGuard() {
  postCloseGuardUntil = 0;
}

document.addEventListener(
  "click",
  (event) => {
    if (event.detail > 0 && performance.now() < postCloseGuardUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  },
  true
);
// The press of a double click moves the focus before its click is swallowed (backlog 99): inside the window the default of
// mousedown is cancelled, so the focus stays where the code put it. A keyboard activation has no mousedown. The cancel applies to
// a press on ANY target in the window, also a deliberate press on another control: accepted (docs/city-modal-focus-copy.md,
// Accepted exceptions), the click of such a press is swallowed anyway.
document.addEventListener(
  "mousedown",
  (event) => {
    if (performance.now() < postCloseGuardUntil) event.preventDefault();
  },
  true
);
const CITY_REQUEST_TIMEOUT_MS = 15000;

function effectiveWeatherResult() {
  // Changing an existing city shows loading; the first city keeps the hint tile until the request finishes.
  if (weatherChanging && currentLocation()) return null;
  if (weatherResult) return weatherResult;
  if (weatherLocationError) return { status: "error", location: null, data: null, error: weatherLocationError };
  if (weatherLocationKnown && !weatherLocation) return { status: "no-location", location: null, data: null, error: null };
  return null;
}
const currentLocation = () => weatherResult?.location ?? weatherLocation;

function createFavoriteLetterNode(item, source) {
  const span = createNode("span", "favorite-letter", getFavoriteLetter(item));
  span.dataset.iconSource = source;
  span.setAttribute("aria-hidden", "true"); // the tile's aria-label already names the link (docs/favicon-letter-pending.md)
  return span;
}

// One checker per page load, created on first use (docs/favicon-globe-fallback.md); null without the favicon endpoint.
let defaultFaviconChecker;
function getDefaultFaviconChecker() {
  if (defaultFaviconChecker !== undefined) return defaultFaviconChecker;
  defaultFaviconChecker = faviconBaseUrl
    ? createDefaultFaviconChecker({
        sentinelUrl: getFaviconUrl({ baseUrl: faviconBaseUrl, pageUrl: DEFAULT_FAVICON_SENTINEL_PAGE, size: FAVICON_SIZE }),
        loadImage: loadBrowserImage,
        createCanvas: createBrowserCanvas,
        timeoutMs: DEFAULT_FAVICON_TIMEOUT_MS
      })
    : null;
  return defaultFaviconChecker;
}

// Shared by the grid tile and the onboarding row so the rules cannot drift. Call it BEFORE `image.src` is set and
// before the node is inserted. A known "default" verdict returns the letter node to use instead of the image; a
// known "real" verdict or a failed checker returns null and leaves the image as it is; an unknown URL shows the
// neutral chip (`data-icon-check="pending"`, set now, before insertion; no globe pixel) until its first `load` has been classified.
function attachDefaultFaviconCheck(image, url, makeLetter) {
  const checker = getDefaultFaviconChecker();
  if (!checker || checker.failed) return null;
  const verdict = checker.verdictFor(url);
  if (verdict === "default") return makeLetter();
  if (verdict === "real") return null;
  image.dataset.iconCheck = "pending";
  image.addEventListener(
    "load",
    async () => {
      const result = await checker.check(url, image);
      if (!image.isConnected) return;
      if (result === "default") image.replaceWith(makeLetter());
      else image.dataset.iconCheck = "done";
    },
    { once: true }
  );
  return null;
}

function createFavoriteIconNode(model, item) {
  if (model.type === "image") {
    const image = createNode("img", "favorite-icon");
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.dataset.iconSource = item.iconMode === "custom" ? "custom" : "favicon";
    image.addEventListener("error", () => {
      image.replaceWith(createFavoriteLetterNode(item, "letter"));
    });
    if (item.iconMode !== "custom") {
      const letter = attachDefaultFaviconCheck(image, model.src, () => createFavoriteLetterNode(item, "letter"));
      if (letter) return letter;
    }
    image.src = model.src;
    return image;
  }

  return createFavoriteLetterNode(item, "letter");
}

// Spec § Tile content by size: 1-wide shows the icon only (the label is the accessible name), 2×1 adds a one-line
// label, 2×2 a 40 px icon, a two-line label and the host name. Text only via text nodes.
function createFavoriteTile(item, cell) {
  const button = createNode("button", "favorite-tile");
  const iconModel = getFavoriteIconModel(item, { faviconBaseUrl });
  const editing = desktopUi.editMode;

  button.type = "button";
  button.dataset.favoriteAction = editing ? "edit" : "open";
  button.dataset.favoriteId = item.id;
  button.dataset.widgetId = item.id;
  button.title = item.label;
  button.setAttribute("aria-label", editing ? `Edit ${item.label}` : `Open ${item.label}`);
  button.style.setProperty(
    "--favorite-accent-rgb",
    hexToRgbChannels(normalizeAccentLightness(item.backgroundColor))
  );
  button.appendChild(createFavoriteIconNode(iconModel, item));
  // 2-wide tiles and 1×2 tiles show the label; 2-high tiles (2×2, 1×2) also show the host (docs/tile-size-1x2.md decision 3).
  if (cell.w === 2 || cell.h === 2) {
    const text = createNode("span", "favorite-tile__text");
    text.appendChild(createNode("span", "favorite-tile__label", item.label));
    if (cell.h === 2) text.appendChild(createNode("span", "favorite-tile__host", item.domain));
    button.appendChild(text);
  }

  button.disabled = favoritesBusy;
  button.setAttribute("aria-disabled", String(favoritesBusy));
  return button;
}

function createSegmentedControl(name, options, selectedValue) {
  const group = createNode("div", "segmented");
  group.setAttribute("role", "radiogroup");

  for (const [value, text, glyph, accessibleName] of options) {
    const option = createNode("label", "segmented__option");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.checked = value === selectedValue;
    if (accessibleName) input.setAttribute("aria-label", accessibleName); // starts with the visible text (WCAG 2.5.3)
    option.appendChild(input);
    if (glyph) {
      const mark = createNode("i", `segmented__glyph segmented__glyph--${glyph}`);
      mark.setAttribute("aria-hidden", "true");
      option.appendChild(mark);
    }
    option.appendChild(createNode("span", null, text));
    group.appendChild(option);
  }

  return group;
}

let formRowIdSeq = 0;

function createFormRow(labelText, control) {
  const row = createNode("div", "favorite-form__row");
  const labelSpan = createNode("span", "favorite-form__row-label", labelText);
  labelSpan.id = `favorite-form-row-label-${formRowIdSeq++}`;
  row.append(labelSpan, control);

  if (control.tagName === "BUTTON") {
    // A button's visible text belongs to its name (WCAG 2.5.3): the row label plus every part of the control that carries an id.
    control.dataset.rowLabelId = labelSpan.id;
    const parts = [labelSpan.id, ...[...control.querySelectorAll("[id]")].map((part) => part.id)];
    control.setAttribute("aria-labelledby", parts.join(" "));
    return row;
  }

  const labelTarget =
    control.tagName === "INPUT" || control.getAttribute("role") === "radiogroup"
      ? control
      : control.querySelector('input, [role="radiogroup"]');
  labelTarget?.setAttribute("aria-labelledby", labelSpan.id);

  return row;
}

function createIconButton(className, text, iconName) {
  const button = createNode("button", className);
  button.append(createIconNode(iconName), document.createTextNode(text));
  return button;
}

function createFavoriteForm(item) {
  const isEdit = item !== null;
  const form = createNode("form", "favorite-form");
  form.dataset.favoriteForm = isEdit ? "edit" : "add";
  form.noValidate = true; // the service validates and its message lands in the dialog's alert slot
  if (isEdit) {
    form.dataset.favoriteId = item.id;
  }

  const url = createNode("input", "favorite-input");
  url.name = "url";
  url.type = "text";
  url.inputMode = "url";
  url.value = isEdit ? item.url : "";
  url.placeholder = "https://example.com";
  url.required = true;
  url.autocomplete = "url";

  const label = createNode("input", "favorite-input");
  label.name = "label";
  label.type = "text";
  label.value = isEdit ? item.label : "";
  label.placeholder = isEdit ? item.domain : "Optional";

  const iconMode = createSegmentedControl(
    "iconMode",
    [
      ["favicon", "From site"],
      ["letter", "Letter"],
      ["custom", "Custom"]
    ],
    isEdit ? item.iconMode : "favicon"
  );

  const customIconUrl = createNode("input", "favorite-input");
  customIconUrl.name = "customIconUrl";
  customIconUrl.type = "text";
  customIconUrl.inputMode = "url";
  customIconUrl.value = isEdit ? item.customIconUrl ?? "" : "";
  customIconUrl.placeholder = "https://example.com/icon.png";
  const customIconRow = createFormRow("Custom icon", customIconUrl);
  customIconRow.classList.add("favorite-form__row--custom-icon");

  const backgroundColorSource = createSegmentedControl(
    "backgroundColorSource",
    [
      ["auto", "Auto"],
      ["manual", "Manual"]
    ],
    isEdit ? item.backgroundColorSource : "auto"
  );

  const color = createNode("input", "favorite-color-input");
  color.name = "backgroundColor";
  color.type = "color";
  color.setAttribute("aria-label", "Background color"); // the row label "Color" names the Auto/Manual radiogroup
  color.value = isEdit ? item.backgroundColor : "#24292f";

  const colorControls = createNode("div", "favorite-form__color-controls");
  colorControls.append(backgroundColorSource, color);
  const colorRow = createFormRow("Color", colorControls);

  const footer = createNode("div", "favorite-form__footer");
  const rows = [createFormRow("Link", url), createFormRow("Name", label), createFormRow("Icon", iconMode), customIconRow, colorRow];
  rows.push(
    createFormRow("Size", createSizeControl(isEdit ? displayedSize(item) : { w: 1, h: 1 }))
  );

  const cancel = createIconButton("button", "Cancel", "x");
  cancel.type = "button";
  cancel.dataset.favoriteAction = "cancel";
  cancel.disabled = favoritesBusy;

  const save = createIconButton(
    "button button--primary",
    isEdit ? "Save" : "Add",
    "check"
  );
  save.type = "submit";
  save.disabled = favoritesBusy;

  footer.append(cancel, save);

  form.append(...rows, createDialogErrorSlot(), footer); // both branches carry the dialog's role=alert slot above the buttons

  return form;
}

// The dialog's write/validation message slot (spec § Write failures: inside the open modal, above its buttons).
let dialogErrorSlotSeq = 0;
function createDialogErrorSlot() {
  const error = createNode("div", "desktop-dialog__error", "");
  error.id = `desktop-dialog-error-${dialogErrorSlotSeq++}`; // stable per dialog: a field's aria-describedby points here
  error.setAttribute("role", "alert");
  error.dataset.dialogError = "";
  error.hidden = true;
  return error;
}

// Each option: value, visible label, shape glyph (docs/tile-size-followups.md decision 1), accessible name (decision 2).
const SIZE_OPTIONS = [
  ["1x1", "1×1", "size-1x1", "1×1, 1 wide, 1 high"],
  ["1x2", "1×2", "size-1x2", "1×2, 1 wide, 2 high"],
  ["2x1", "2×1", "size-2x1", "2×1, 2 wide, 1 high"],
  ["2x2", "2×2", "size-2x2", "2×2, 2 wide, 2 high"]
];

// Size radiogroup (name "size", values 1x1|1x2|2x1|2x2) shared by the link and weather edit dialogs.
function createSizeControl({ w, h }) {
  return createSegmentedControl("size", SIZE_OPTIONS, `${w}x${h}`);
}

// The size the tile is shown at: its cell in the displayed layout (an item whose stored grid is missing or malformed
// is shown unplaced at its fallback size), else 1×1.
function displayedSize(item) {
  const cell = widgetsState ? displayLayout(widgetsState.items, currentColumns()).get(item.id) : null;
  return cell ? { w: cell.w, h: cell.h } : { w: 1, h: 1 };
}

function readSize(value) {
  const match = /^([12])x([12])$/.exec(String(value ?? ""));
  return match ? { w: Number(match[1]), h: Number(match[2]) } : null;
}

function readFavoriteFormPayload(data) {
  const backgroundColorSource =
    data.get("backgroundColorSource") === "manual" ? "manual" : "auto";
  const payload = {
    url: data.get("url"),
    label: data.get("label"),
    iconMode: data.get("iconMode"),
    customIconUrl: data.get("customIconUrl"),
    backgroundColorSource
  };

  if (backgroundColorSource === "manual") {
    payload.backgroundColor = data.get("backgroundColor");
  }

  return payload;
}

function loadBrowserImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = src;
  });
}

function createBrowserCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function resolveAutoBackgroundColor(item) {
  const fallback = fallbackColorForDomain(item.domain);
  const iconModel = getFavoriteIconModel(item, { faviconBaseUrl });

  if (!iconModel.sampleable) {
    return fallback;
  }

  let image;
  try {
    image = await loadBrowserImage(iconModel.src);
  } catch {
    return fallback;
  }

  // The same decision as the tile: Chrome's default globe gives the domain colour, not a colour sampled from it.
  const verdict = await getDefaultFaviconChecker()?.classifyImage(iconModel.src, image);
  if (verdict === "default") return fallback;

  return (
    (await extractImageBackgroundColor(iconModel.src, {
      loadImage: () => image,
      createCanvas: createBrowserCanvas
    })) ?? fallback
  );
}

// After an add or an edit with the Auto color: samples the favicon (CORS-safe sources only) and stores its color.
async function refreshAutoAccent(id) {
  if (!widgetsService || !id) {
    return;
  }

  const item = widgetsState?.items.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  try {
    const autoColor = await resolveAutoBackgroundColor(item);

    // Re-read the item after the async resolve: the user may have switched it to
    // manual (or deleted it) while the favicon was being fetched/analyzed. A late
    // auto write must never clobber a manual color the user just chose.
    const current = widgetsState?.items.find((entry) => entry.id === id);
    if (!current || current.backgroundColorSource !== "auto") {
      return;
    }

    if (autoColor === current.backgroundColor) {
      return;
    }

    const nextState = await widgetsService.updateFavorite(
      id,
      { backgroundColor: autoColor, backgroundColorSource: "auto" },
      { columns: currentColumns() }
    );

    widgetsState = nextState;
    renderFavorites();
  } catch {
    // Auto-accent is best-effort; a canvas/CORS failure keeps the fallback accent
    // and must never disturb the displayed icon.
  }
}

const METRIC_LABELS = { temperature: "Temperature", precipitation: "Precipitation", airQuality: "Air quality", uv: "UV index" };
// Hide-confirm copy per metric: the lower-case name inside the title (UV stays an acronym) and the polite announcement after the write.
const HIDE_COPY = {
  temperature: { title: "Hide temperature?", done: "Temperature hidden" },
  precipitation: { title: "Hide precipitation?", done: "Precipitation hidden" },
  airQuality: { title: "Hide air quality?", done: "Air quality hidden" },
  uv: { title: "Hide UV index?", done: "UV index hidden" }
};
const METRIC_GLYPHS = { temperature: "thermometer", precipitation: "droplet", airQuality: "wind", uv: "sun" };

const POPOVER_MAX_HEIGHT = 240;
const POPOVER_MIN_FREE = 96;
const POPOVER_GAP = 6;
const VIEWPORT_MARGIN = 16;

// The stored city as the user reads it: `name, country`, or just `name` when the country is empty (admin1 is not stored).
function cityDisplayLabel(location) {
  return [location.name, location.country].filter((part) => part).join(", ");
}

function createCityLocationDescription(variant) {
  const onboarding = variant === "onboarding";
  const paragraph = createNode(
    "p",
    onboarding ? "onboarding-wizard__step-description" : "city-modal__description",
    ""
  );
  const link = document.createElement("button");
  link.type = "button";
  link.className = "city-location-link";
  link.dataset.weatherAction = "use-location";
  link.textContent = "use your location";
  const status = createNode("span", "sr-only", "");
  status.dataset.cityLocationStatus = "";
  status.setAttribute("role", "status");
  locationStatusNode = status;
  // The words around the link are nodes of their own: while the position is looked up they are hidden (they leave the
  // accessibility tree) and the link alone is the line (syncLocationLink).
  const beforeText = createNode("span", null, onboarding ? "Enter a city, " : "Search for a city or ");
  const afterText = createNode("span", null, onboarding ? ", or skip for now." : ".");
  beforeText.dataset.cityLocationWords = afterText.dataset.cityLocationWords = "";
  paragraph.append(beforeText, link, afterText, status);
  return paragraph;
}

function createCityForm(mode, location) {
  weatherFormGeneration += 1;
  const formGeneration = weatherFormGeneration;
  weatherUi = hideSuggestions(weatherUi);

  const form = createNode("form", "weather-form");
  form.dataset.weatherForm = "city";
  form.noValidate = true;

  const field = createNode("div", "weather-form__field");

  const input = createNode("input", "favorite-input");
  input.name = "city";
  input.type = "text";
  input.id = "weather-city-input";
  input.placeholder = "Search for a city";
  input.setAttribute("aria-label", "City");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("aria-controls", "weather-city-suggestions");
  input.setAttribute("aria-expanded", "false"); // kept equal to isSuggestionsOpen by renderSuggestionsList
  const storedCity = (mode === "change" || mode === "onboarding") && location ? location : null;
  input.value = storedCity ? cityDisplayLabel(storedCity) : "";
  input.autocomplete = "off";
  input.disabled = weatherBusy;

  const clear = createNode("button", "icon-button weather-form__clear");
  clear.type = "button";
  clear.dataset.cityModalClear = "";
  clear.setAttribute("aria-label", "Clear city");
  clear.appendChild(createIconNode("x"));
  clear.hidden = true;

  const suggestionsList = createNode("div", "weather-form__suggestions");
  suggestionsList.id = "weather-city-suggestions";
  suggestionsList.setAttribute("role", "listbox");
  suggestionsList.setAttribute("aria-label", "City suggestions");
  // tabindex -1 on the listbox itself: a scrollable container whose options are all tabindex -1 is otherwise a Tab stop in Chromium.
  suggestionsList.setAttribute("tabindex", "-1");
  field.append(input, clear, suggestionsList);

  const errorNode = createNode("p", "status status--error status--full", cityModalError);
  errorNode.dataset.cityModalError = "";
  errorNode.setAttribute("role", "alert");
  errorNode.hidden = cityModalError === "";

  const actions = createNode("div", "city-modal__actions");
  let submitButton = null;
  if (mode === "onboarding") {
    const skip = createIconButton("button", "Skip", "x");
    skip.type = "button";
    skip.dataset.onboardingAction = "skip";
    skip.disabled = weatherBusy;
    submitButton = createIconButton("button button--primary", "Continue", "arrowRight");
    submitButton.type = "submit";
    actions.append(skip, submitButton);
  } else {
    const dismiss = createIconButton("button", "Cancel", "x");
    dismiss.type = "button";
    dismiss.dataset.cityModalAction = "cancel";
    dismiss.disabled = weatherBusy;
    submitButton = createIconButton("button button--primary", "Save", "check");
    submitButton.type = "submit";
    actions.append(dismiss, submitButton);
  }

  // No reserved room: the slot is empty (height 0) until an error shows; the dialog may grow then.
  const feedback = createNode("div", "city-modal__feedback");
  feedback.append(errorNode);

  form.append(field, feedback, actions);

  // Save needs text; Clear needs text and no running request.
  function refresh() {
    const empty = input.value.trim() === "";
    if (submitButton) submitButton.disabled = weatherBusy || empty;
    clear.hidden = weatherBusy || input.value === "";
    clear.disabled = weatherBusy;
  }

  // Overlay popover while there is room below the input; otherwise docked in the dialog's flow with a scrolling dialog.
  // The free space is measured as if the popover were an overlay: the docked class and the scroll cap are dropped for the
  // measurement (layout is flushed, nothing is painted in between), so the result depends neither on the current mode nor on the
  // dialog's scroll position and the mode cannot flip back and forth. It is measured from the INPUT's bottom edge, not from
  // the field wrapper, because the wrapper contains the list while it is docked. A dialog that does not fit the viewport on
  // its own (a very low window, large zoom) scrolls in every mode, also before the first suggestion appears.
  function placePopover() {
    const dialog = field.closest(".city-modal__dialog");
    if (!dialog) return;
    const scrollTop = dialog.scrollTop;
    suggestionsList.classList.remove("weather-form__suggestions--docked");
    dialog.classList.remove("city-modal__dialog--scroll");
    const free = window.innerHeight - input.getBoundingClientRect().bottom - POPOVER_GAP - VIEWPORT_MARGIN;
    const tooTall = dialog.getBoundingClientRect().height > window.innerHeight - 2 * VIEWPORT_MARGIN;
    const docked = free < POPOVER_MIN_FREE;
    suggestionsList.classList.toggle("weather-form__suggestions--docked", docked);
    dialog.classList.toggle("city-modal__dialog--scroll", docked || tooTall);
    suggestionsList.style.maxHeight = docked ? "" : `${Math.min(POPOVER_MAX_HEIGHT, free)}px`;
    dialog.scrollTop = scrollTop;
  }

  function renderSuggestionsList() {
    suggestionsList.replaceChildren();

    if (!isSuggestionsOpen(weatherUi)) {
      input.setAttribute("aria-expanded", "false");
      placePopover();
      return;
    }
    input.setAttribute("aria-expanded", "true");

    for (const suggestion of citySuggestions(weatherUi)) {
      const labelParts = [suggestion.name, suggestion.admin1, suggestion.country].filter((part) => part);
      const label = labelParts.join(", ");
      const button = createNode("button", "weather-form__suggestion", label);
      button.type = "button";
      button.setAttribute("role", "option");
      button.setAttribute("tabindex", "-1"); // arrow-only: Tab never walks the options
      button.dataset.weatherAction = "select-city";
      button.dataset.cityName = suggestion.name;
      button.dataset.cityCountry = suggestion.country;
      button.dataset.cityLatitude = String(suggestion.latitude);
      button.dataset.cityLongitude = String(suggestion.longitude);
      suggestionsList.appendChild(button);
    }
    placePopover();
  }

  renderSuggestionsList();
  const onResize = placePopover;
  window.addEventListener("resize", onResize);

  suggestionsList.addEventListener("mousedown", (event) => {
    event.preventDefault(); // the field keeps focus, so the item never gets focusin
    // A press on an item cancels the pending request: a late response must never replace the list under the pressed item
    // (the click would be lost or land on another item). The click then chooses the item; later typing gets suggestions again.
    if (event.target instanceof Element && event.target.closest(".weather-form__suggestion")) cancelPendingSuggestionRequest();
  });

  let debounceTimer = null;
  let abortController = null;

  function cancelPendingSuggestionRequest() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  input.addEventListener("input", () => {
    const query = input.value.trim();

    cancelPendingSuggestionRequest();
    refresh();

    if (query.length < 2) {
      weatherUi = hideSuggestions(weatherUi);
      renderSuggestionsList();
      return;
    }

    debounceTimer = setTimeout(() => {
      abortController = new AbortController();
      const { signal } = abortController;

      void (async () => {
        let results = null;

        try {
          results = await searchCities(query, {
            fetchImpl: (url) => globalThis.fetch(url, { signal })
          });
        } catch {
          results = null;
        }

        if (signal.aborted || formGeneration !== weatherFormGeneration || weatherBusy || suggestionsList.contains(document.activeElement)) {
          return;
        }

        weatherUi =
          results && results.length > 0
            ? showSuggestions(weatherUi, results)
            : hideSuggestions(weatherUi);
        renderSuggestionsList();
      })();
    }, 250);
  });

  // The stored city counts as chosen while its label is untouched: Save without editing re-selects it (no geocoding).
  let chosenCity = storedCity
    ? { name: storedCity.name, country: storedCity.country, latitude: storedCity.latitude, longitude: storedCity.longitude, label: input.value }
    : null;
  let chosenAt = -Infinity; // performance.now() of the last choose()
  let pressing = false; // a pointer press that began inside the dialog and has not been released yet

  function closeList() {
    cancelPendingSuggestionRequest();
    weatherUi = hideSuggestions(weatherUi);
    renderSuggestionsList();
  }

  function closeListIfFocusLeft() {
    if (formGeneration !== weatherFormGeneration || !document.hasFocus()) return;
    if (field.contains(document.activeElement)) return;
    closeList();
  }

  // A pointer press inside the dialog (Save, Not now/Cancel, the dialog body) must not close the list before the click is
  // delivered: in docked mode the buttons would move between press and release and the click would be lost. The list closes
  // after the release instead (setTimeout 0 runs after the click event).
  const onPointerDown = (event) => {
    if (event.button !== 0) return; // a right click opens a context menu and may never deliver a pointerup
    pressing = event.target instanceof Element && Boolean(event.target.closest(".city-modal__dialog"));
  };
  const onWindowBlur = () => {
    pressing = false; // a press interrupted by leaving the window never gets its pointerup
  };
  const onPointerUp = () => {
    if (!pressing) return;
    pressing = false;
    setTimeout(closeListIfFocusLeft, 0);
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("blur", onWindowBlur);

  // Window focus loss does nothing. Moving focus to something outside the field wrapper cancels the debounce and the request
  // in flight at once (list open or not) and closes the list, unless a pointer press inside the dialog is still going on.
  field.addEventListener("focusout", (event) => {
    if (event.relatedTarget instanceof Node && field.contains(event.relatedTarget)) return;
    if (!document.hasFocus()) return;
    cancelPendingSuggestionRequest();
    if (pressing) return;
    setTimeout(closeListIfFocusLeft, 0);
  });

  // Focus entering the list (ArrowDown, Tab, a click on an item) cancels the pending request too: a response must never
  // replace the list under a focused item.
  suggestionsList.addEventListener("focusin", cancelPendingSuggestionRequest);

  // The error describes the last attempt; once the name changes it no longer describes the field. Only the slot is emptied,
  // the same node keeps role="alert", so the next failure is a fresh empty -> text change.
  function clearCityError() {
    cityModalError = "";
    errorNode.textContent = "";
    errorNode.hidden = true;
    placePopover();
  }

  input.addEventListener("input", () => {
    chosenCity = null; // editing drops the remembered choice
    clearCityError();
    if (locationStatusNode) locationStatusNode.textContent = "";
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing && !weatherBusy && input.value.trim() === "") {
      event.preventDefault(); // a disabled Save blocks the implicit submit, so the field reports the empty case itself
      cityModalError = "Enter a city name";
      syncCityModal();
      return;
    }
    if (event.key === "ArrowDown" && isSuggestionsOpen(weatherUi) && !weatherBusy) {
      event.preventDefault();
      cancelPendingSuggestionRequest();
      suggestionsList.querySelector("button")?.focus();
    }
  });

  suggestionsList.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...suggestionsList.querySelectorAll("button")];
    const at = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") items[at + 1]?.focus();
    else if (at <= 0) input.focus();
    else items[at - 1]?.focus();
  });

  clear.addEventListener("click", () => {
    input.value = "";
    chosenCity = null;
    clearCityError();
    closeList();
    refresh();
    input.focus();
  });

  refresh();
  activeCityForm = {
    cancelPending: cancelPendingSuggestionRequest,
    renderSuggestions: renderSuggestionsList,
    refresh,
    place: placePopover,
    focusField: () => input.focus(),
    caretToEnd: () => input.setSelectionRange(input.value.length, input.value.length),
    dispose: () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("blur", onWindowBlur);
    },
    choose(city) {
      closeList(); // cancels the debounce and the in-flight request; late responses are ignored (signal aborted)
      input.value = city.label;
      chosenCity = { name: city.name, country: city.country, latitude: city.latitude, longitude: city.longitude, label: city.label };
      chosenAt = performance.now();
      refresh();
      input.focus();
    },
    chosen: () => (chosenCity && chosenCity.label === input.value ? chosenCity : null),
    recentlyChosen: () => performance.now() - chosenAt < 350
  };
  return form;
}

function buildCityModal(mode, location) {
  const root = createNode("div", "city-modal");
  root.id = "city-modal";
  const backdrop = createNode("div", "city-modal__backdrop");
  backdrop.dataset.cityModalBackdrop = "";
  const dialog = createNode("div", "city-modal__dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "city-modal-title");

  const title = createNode("h2", "city-modal__title", location ? "Change city" : "Set a city");
  title.id = "city-modal-title";
  title.tabIndex = -1; // takes the focus while a request runs (rescueFocusToTitle)
  dialog.appendChild(title);
  dialog.appendChild(createCityLocationDescription(mode));

  dialog.appendChild(createCityForm(mode, location));
  root.append(backdrop, dialog);
  return root;
}

// Disables the controls while a city request runs and mirrors the error slot; never rebuilds the form.
function cityFormHostRoot() {
  return cityModalRoot ?? onboardingWizardRoot;
}

function cancelLocationStatusFrame() {
  if (locationStatusFrame) {
    cancelAnimationFrame(locationStatusFrame);
    locationStatusFrame = 0;
  }
}

function clearLocationStatus() {
  cancelLocationStatusFrame();
  if (locationStatusNode) locationStatusNode.textContent = "";
}

function abortLocationLookup() {
  clearTimeout(locationReverseTimer);
  locationReverseTimer = 0;
  locationAbortController?.abort();
  locationAbortController = null;
}

function teardownLocationLookup() {
  abortLocationLookup();
  if (!locating) return;
  locating = false;
  weatherBusy = false;
  clearLocationStatus();
  releaseDescriptionHeight(); // by the node itself: the form may already be gone, then syncLocationLink below has no host
  const host = cityFormHostRoot();
  if (host) syncLocationLink(host); // brings the words back (its own release is then a no-op)
}

function focusLocationLink() {
  const link = cityFormHostRoot()?.querySelector('[data-weather-action="use-location"]');
  if (link instanceof HTMLElement) link.focus();
}

// The paragraph whose height is pinned while locating; released through the node itself, wherever the form went.
let pinnedDescription = null;
function releaseDescriptionHeight() {
  if (pinnedDescription) pinnedDescription.style.minHeight = "";
  pinnedDescription = null;
}

function syncLocationLink(host) {
  const link = host.querySelector('[data-weather-action="use-location"]');
  if (!(link instanceof HTMLButtonElement)) return;
  // While locating, the whole description line is the status: only the link (inactive, keeps focus) is shown. The line keeps
  // the height it had just before the switch so the field below does not jump; the height is released on every exit.
  const paragraph = link.parentElement;
  if (locating) {
    if (paragraph && !pinnedDescription && paragraph.offsetHeight > 0) {
      pinnedDescription = paragraph;
      paragraph.style.minHeight = `${paragraph.offsetHeight}px`;
    }
    link.textContent = LOCATION_BUSY_LABEL;
    link.setAttribute("aria-disabled", "true");
  } else {
    link.textContent = LOCATION_LINK_LABEL;
    link.removeAttribute("aria-disabled");
    releaseDescriptionHeight();
  }
  for (const words of paragraph?.querySelectorAll("[data-city-location-words]") ?? []) words.hidden = locating;
}

function syncCityModalUi() {
  if (onboardingWizardRoot) syncOnboardingWizardUi();
  else syncCityModal();
}

async function useMyLocation(variant) {
  if (weatherBusy || locating || !weatherService) return;
  const attemptGeneration = weatherFormGeneration;

  weatherBusy = true;
  locating = true;
  cityModalError = "";
  clearLocationStatus();
  activeCityForm?.cancelPending();
  weatherUi = hideSuggestions(weatherUi);
  activeCityForm?.renderSuggestions();

  syncCityModalUi();

  cancelLocationStatusFrame();
  locationStatusFrame = requestAnimationFrame(() => {
    locationStatusFrame = 0;
    if (!locating || attemptGeneration !== weatherFormGeneration || !locationStatusNode) return;
    locationStatusNode.textContent = LOCATION_BUSY_LABEL;
  });

  const stillValid = () => locating && attemptGeneration === weatherFormGeneration;

  const finishAttempt = () => {
    locating = false;
    weatherBusy = false;
    abortLocationLookup();
    clearLocationStatus();
    syncCityModalUi();
  };

  try {
    let position;
    try {
      position = await getBrowserPosition();
    } catch (error) {
      if (!stillValid()) return;
      const code = error instanceof BrowserLocationError ? error.code : "unavailable";
      cityModalError = locationErrorMessage(variant, { source: "position", code });
      finishAttempt();
      focusLocationLink();
      return;
    }
    if (!stillValid()) return;

    const latitude = roundCoordinate(position.latitude);
    const longitude = roundCoordinate(position.longitude);

    let city;
    try {
      locationAbortController = new AbortController();
      const { signal } = locationAbortController;
      locationReverseTimer = setTimeout(
        () => locationAbortController?.abort(),
        LOCATION_REVERSE_TIMEOUT_MS
      );
      city = await reverseGeocodeCoordinates(latitude, longitude, { signal });
    } catch (error) {
      if (!stillValid()) return;
      const kind = error instanceof WeatherApiError ? error.details?.kind : "unknown";
      cityModalError = locationErrorMessage(variant, { source: "reverse", kind });
      finishAttempt();
      focusLocationLink();
      return;
    }
    if (!stillValid()) return;

    finishAttempt();
    if (attemptGeneration !== weatherFormGeneration) return;

    try {
      const label = cityDisplayLabel({ name: city.name, country: city.country });
      activeCityForm?.choose({
        name: city.name,
        country: city.country,
        latitude: city.latitude,
        longitude: city.longitude,
        label
      });
      activeCityForm?.caretToEnd();
      if (locationStatusNode) locationStatusNode.textContent = `Location found: ${label}`;
    } catch {
      if (attemptGeneration !== weatherFormGeneration) return;
      cityModalError = locationErrorMessage(variant, { source: "position", code: "unavailable" });
      syncCityModalUi();
      focusLocationLink();
    }
  } finally {
    clearTimeout(locationReverseTimer);
    locationReverseTimer = 0;
    if (attemptGeneration === weatherFormGeneration && locating) {
      locating = false;
      weatherBusy = false;
      abortLocationLookup();
      clearLocationStatus();
      syncCityModalUi();
    }
  }
}

// While a city request runs the controls are disabled: when the focus is on body, outside `root` or on a disabled control,
// the (tabindex -1) title takes it, so the focus never drops to body.
function rescueFocusToTitle(root, titleSelector) {
  const title = root.querySelector(titleSelector);
  const active = document.activeElement;
  const focusLost =
    !active ||
    active === document.body ||
    !root.contains(active) ||
    (active instanceof HTMLElement && active.matches("input, button") && active.disabled);
  if (title instanceof HTMLElement && focusLost) title.focus();
}

function syncCityModal() {
  const host = cityFormHostRoot();
  if (!host) return;
  for (const control of host.querySelectorAll("input, button")) {
    if (control.dataset.weatherAction === "select-city") continue;
    const isLocateLink = control.dataset.weatherAction === "use-location";
    control.disabled = weatherBusy && !(locating && isLocateLink);
  }
  syncLocationLink(host);
  activeCityForm?.refresh();
  if (!onboardingWizardRoot) {
    host.querySelector('[role="dialog"]')?.setAttribute("aria-busy", String(weatherBusy && !locating));
  }
  if (weatherBusy && !locating && onboardingWizardRoot && onboardingStep === 1) {
    rescueFocusToTitle(onboardingWizardRoot, "#onboarding-step1-title");
  }
  if (weatherBusy && !locating && cityModalRoot && !onboardingWizardRoot) {
    rescueFocusToTitle(cityModalRoot, "#city-modal-title"); // change mode: the disabled controls must not leave the focus on body
  }
  const errorNode = host.querySelector("[data-city-modal-error]");
  if (errorNode) {
    errorNode.textContent = cityModalError;
    errorNode.hidden = cityModalError === "";
  }
  activeCityForm?.place();
}

// While a city request runs a press on the backdrop or on empty dialog space would move the focus to body (the controls are
// disabled): its default is cancelled, so the focus stays where the busy rescue put it (the title).
function keepFocusWhileBusy(event) {
  // A press on the background while the position is looked up is cancelled too: the link (aria-disabled, never `disabled`)
  // keeps the focus and is itself excluded below, so pressing it still works as a plain focus.
  // The same busy states that set aria-busy on the dialog (and so the pointer-events rule in surfaces.css).
  if (!weatherBusy && !(favoritesBusy && onboardingStep === 2 && onboardingWizardRoot)) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("input:not(:disabled), button:not(:disabled)")) return;
  event.preventDefault();
}

// One listener per event on the modal root (backdrop, dismiss button, suggestions, submit).
function attachCityModalListeners(root) {
  root.addEventListener("mousedown", keepFocusWhileBusy);
  root.addEventListener("focusin", () => {
    cityModalHadFocus = true;
  });

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const locateLink = target.closest('[data-weather-action="use-location"]');
    if (locateLink instanceof HTMLElement) {
      if (locateLink.getAttribute("aria-disabled") === "true" || weatherBusy && !locating) return;
      void useMyLocation("change");
      return;
    }
    if (weatherBusy) return;
    // The second click of a double click on an item lands on what was under the popover: the backdrop or a covered button
    // (for Save the submit is cancelled too). A keyboard activation (detail 0) is never such a click: Enter on Save saves.
    if (
      event.detail > 0 &&
      activeCityForm?.recentlyChosen() &&
      (target.matches("[data-city-modal-backdrop]") || target.closest('[data-city-modal-action], button[type="submit"]'))
    ) {
      event.preventDefault();
      return;
    }
    // A drag from the field that ends over the backdrop targets the modal root, not the backdrop: ignored.
    if (target.matches("[data-city-modal-backdrop]")) {
      if (performance.now() - cityModalOpenedAt >= CITY_MODAL_BACKDROP_GUARD_MS) hideCityModal();
      return;
    }
    if (target.closest("[data-city-modal-action]")) {
      hideCityModal();
      return;
    }
    const suggestion = target.closest('[data-weather-action="select-city"]');
    if (suggestion instanceof HTMLElement) {
      activeCityForm?.choose({
        name: suggestion.dataset.cityName,
        country: suggestion.dataset.cityCountry ?? "",
        latitude: Number(suggestion.dataset.cityLatitude),
        longitude: Number(suggestion.dataset.cityLongitude),
        label: suggestion.textContent
      });
      return;
    }
  });

  root.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.weatherForm !== "city") return;
    event.preventDefault();
    if (weatherBusy || !weatherService) return;
    if (locationStatusNode) locationStatusNode.textContent = "";
    const cityName = String(new FormData(form).get("city") ?? "").trim();
    if (!cityName) {
      cityModalError = "Enter a city name";
      syncCityModal();
      form.querySelector(CITY_INPUT_SELECTOR)?.focus();
      return;
    }
    if (isUnchangedCitySave(activeCityForm?.chosen() ?? null, cityName)) {
      hideCityModal(); // exactly Cancel: nothing is written or requested
      return;
    }
    const picked = activeCityForm?.chosen();
    if (picked) {
      changeCity((isStale) => weatherService.selectLocation({
        name: picked.name, country: picked.country, latitude: picked.latitude, longitude: picked.longitude
      }, { persist: "after-forecast", isStale }));
      return;
    }
    changeCity((isStale) => weatherService.setCity(cityName, { persist: "after-forecast", isStale }));
  });
}

let cityModalShownThisLoad = false; // the automatic prompt never reopens a modal that was already shown this page load
let onboardingWizardShownThisLoad = false;
let onboardingWizardRoot = null;
let onboardingWizardHadFocus = false;
let onboardingWizardOpenedAt = 0;
let onboardingStep = 1;
let onboardingStep2EnteredAt = 0;
/** @type {boolean[]} */
let onboardingStarterChecks = defaultStarterChecks();
let onboardingFinishError = "";
// True only after a successful addFavorites call with at least one link (a retry after a flag-write failure must not add the links again);
// a zero-link Finish never sets it, its call is an idempotent layout no-op the second time.
let onboardingStartersCommitted = false;
let onboardingFlagWriteFailedOnce = false;

function showCityModal(mode, openerSelector) {
  // One modal at a time; the only stacking is the change-mode city modal over the weather edit dialog (spec § Weather
  // edit modal). The first-run modal never opens over a desktop dialog.
  const overWeatherDialog = mode === "change" && desktopDialogRoot !== null && desktopUi.dialog?.kind === "edit-weather";
  if (
    cityModalRoot ||
    onboardingWizardRoot ||
    (desktopDialogRoot && !overWeatherDialog) ||
    isCityModalOpen(weatherUi) ||
    !weatherService ||
    !document.body
  )
    return false;
  cityModalError = "";
  clearPostCloseClickGuard();
  let root = null;
  try {
    root = buildCityModal(mode, weatherLocationError ? null : currentLocation());
    attachCityModalListeners(root); // before any focus() so the focusin below is seen
    document.body.appendChild(root);
  } catch (error) {
    // Nothing half-open: a failed build must not leave the UI state "open" and block every later open.
    root?.remove();
    activeCityForm?.dispose?.(); // the form's document and window listeners must not outlive it
    activeCityForm = null;
    throw error;
  }
  cityModalRoot = root;
  activeCityForm?.place();
  cityModalShownThisLoad = true;
  weatherUi = openCityModalState(weatherUi, mode);
  cityModalOpener = openerSelector;
  cityModalHintMetricId =
    openerSelector === HINT_TILE_SELECTOR ? (favoritesRoot?.querySelector(HINT_TILE_SELECTOR)?.dataset.metricId ?? null) : null;
  cityModalHadFocus = false;
  cityModalOpenedAt = performance.now();
  hideTooltip();
  closeAddMenu();
  if (favoritesRoot) favoritesRoot.inert = true;
  if (overWeatherDialog) {
    desktopDialogRoot.inert = true; // the dialog under the city modal is not interactive until the city modal closes
    cityModalRoot.classList.add("city-modal--stacked");
  }
  if (mode === "change") cityModalRoot.querySelector(CITY_INPUT_SELECTOR)?.focus(); // first-run never steals focus
  if (mode === "change") activeCityForm?.caretToEnd(); // the prefilled text is not selected
  return true;
}

function hideCityModal() {
  if (!cityModalRoot) return;
  const mode = cityModalMode(weatherUi);
  const runningAttempt = cityAttempt;
  if (runningAttempt) {
    // A request still running when the modal is torn down (a code teardown; the UI cannot close a busy modal) must not persist,
    // and must not leave the busy state behind: its finally block no longer owns it.
    runningAttempt.stale = true;
    cityAttempt = null;
    weatherBusy = false;
    weatherChanging = false;
  }
  teardownLocationLookup();
  activeCityForm?.cancelPending();
  activeCityForm?.dispose?.();
  activeCityForm = null;
  weatherFormGeneration += 1; // late suggestion responses are ignored
  cityModalRoot.remove();
  cityModalRoot = null;
  armPostCloseClickGuard();
  revealDesk(); // before focus is restored: Settings must be visible when applyPendingFocus runs
  weatherUi = closeCityModalState(weatherUi);
  cityModalError = "";
  cityModalHadFocus = false;
  if (desktopDialogRoot) {
    // Stacked over the weather dialog: the grid stays inert under the dialog, the dialog becomes interactive again.
    desktopDialogRoot.inert = false;
    syncWeatherDialogCity();
  } else if (favoritesRoot) favoritesRoot.inert = false;
  if (runningAttempt) renderFavorites(); // the tiles leave their loading state
  if (mode === "change") {
    pendingFocus = [cityModalOpener, SETTINGS_TILE_SELECTOR].filter(Boolean);
    applyPendingFocus();
  }
  cityModalOpener = null;
  cityModalHintMetricId = null;
  scheduleDeferredDeskRefresh();
}

// Success of a change-mode city request: the caller, not hideCityModal, picks the focus target and speaks.
// From the hint tile the hint is gone by now: focus goes to the tile of the hint's metric (Settings when it has none).
function finishCityChange() {
  if (!cityModalRoot) return;
  if (cityModalHintMetricId && cityModalOpener === HINT_TILE_SELECTOR) {
    cityModalOpener = `[data-widget-id="${CSS.escape(cityModalHintMetricId)}"]`;
  }
  hideCityModal();
  const location = currentLocation();
  if (location) announce(`City set to ${cityDisplayLabel(location)}`);
}

// Save without a change is Cancel: a chosen city with the stored coordinates, or (no choice) the stored label as text.
// Spec decision 2: this is not a repeat request; Retry on an error tile is the only way to re-request the forecast.
// Coordinates are compared as they are stored (a suggestion is stored unrounded, "use your location" is rounded by
// roundCoordinate before it becomes the choice, so both sides share one rounding).
function isUnchangedCitySave(picked, cityName) {
  const stored = weatherLocationError ? null : currentLocation();
  if (!stored) return false;
  if (picked) return picked.latitude === stored.latitude && picked.longitude === stored.longitude;
  return cityName === cityDisplayLabel(stored);
}

// Reveal (docs/first-run-empty-desk.md, decision 4): the veil goes away, and unless motion is reduced the whole desk fades in
// once (CSS `desk-reveal`, 200 ms). The animation lives on the persistent #favorites, so a re-render during the fade neither
// restarts nor cancels it. Only the desk's own animationend ends it (child animations bubble); a timer is the fallback.
const REVEAL_FALLBACK_MS = 400;
let revealTimer = 0;

function endReveal() {
  clearTimeout(revealTimer);
  if (favoritesRoot) delete favoritesRoot.dataset.reveal;
}

function revealDesk() {
  if (!favoritesRoot || favoritesRoot.dataset.veiled !== "true") return; // nothing was veiled (change mode): no fade
  delete favoritesRoot.dataset.veiled;
  if (prefersReducedMotion()) return;
  favoritesRoot.dataset.reveal = "true";
  clearTimeout(revealTimer);
  revealTimer = setTimeout(endReveal, REVEAL_FALLBACK_MS);
}

if (favoritesRoot) {
  favoritesRoot.addEventListener("animationend", (event) => {
    if (event.target === favoritesRoot && event.animationName === "desk-reveal") endReveal();
  });
}

// Live-state inputs for onboardingWizardPossible / shouldShowOnboardingWizard (dismissal flag read separately, capped).
function promptLiveState() {
  const items = widgetsState?.items ?? [];
  return {
    locationRead: weatherLocationKnown && !weatherLocationError,
    hasLocation: Boolean(weatherLocation),
    anyMetricEnabled: items.some((item) => item.type === "weather-metric" && item.enabled === true),
    weatherAvailable: Boolean(weatherService && weatherPromptStore && onboardingStore),
    gridLocked: widgetsNewer
  };
}

// The one decision point of the page load, taken before the first grid render (docs/onboarding-wizard.md decision 1).
function maybeShowOnboardingWizard({ flagRead, dismissed, completeRead, complete }) {
  if (onboardingWizardRoot || cityModalRoot || desktopDialogRoot || onboardingWizardShownThisLoad) return;
  const show = shouldShowOnboardingWizard({
    ...promptLiveState(),
    flagRead,
    dismissed,
    completeRead,
    complete,
    wizardShownThisLoad: onboardingWizardShownThisLoad
  });
  if (show) showOnboardingWizard();
}

// Locked rows leave the tab order: the list itself becomes the keyboard stop that scrolls them (named, or axe flags it).
function setStartersLocked(list, locked) {
  if (locked) {
    list.dataset.startersLocked = "true";
    list.setAttribute("tabindex", "0");
    list.setAttribute("aria-label", "Starter links");
  } else {
    delete list.dataset.startersLocked;
    list.removeAttribute("tabindex");
    list.removeAttribute("aria-label");
  }
}

function syncOnboardingWizardUi() {
  if (!onboardingWizardRoot) return;
  const dialog = onboardingWizardRoot.querySelector('[role="dialog"]');
  const pills = onboardingWizardRoot.querySelectorAll(".onboarding-wizard__pill");
  const activeCount = progressPillCount(onboardingStep);
  pills.forEach((pill, index) => {
    pill.classList.toggle("onboarding-wizard__pill--active", index < activeCount);
  });
  onboardingWizardRoot.dataset.onboardingStep = String(onboardingStep);
  const step1 = onboardingWizardRoot.querySelector('[data-onboarding-step="1"]');
  const step2 = onboardingWizardRoot.querySelector('[data-onboarding-step="2"]');
  if (step1 && step2) {
    const onStep1 = onboardingStep === 1;
    step1.hidden = !onStep1;
    step2.hidden = onStep1;
    step1.inert = !onStep1;
    step2.inert = onStep1;
    dialog?.setAttribute("aria-labelledby", onStep1 ? "onboarding-step1-title" : "onboarding-step2-title");
  }
  const finishError = onboardingWizardRoot.querySelector("[data-onboarding-finish-error]");
  if (finishError) {
    finishError.textContent = onboardingFinishError;
    finishError.hidden = onboardingFinishError === "";
  }
  syncCityModal();
  const finishBusy = favoritesBusy && onboardingStep === 2;
  const finishBtn = onboardingWizardRoot.querySelector('[data-onboarding-action="finish"]');
  if (finishBtn instanceof HTMLButtonElement) finishBtn.disabled = finishBusy;
  const backBtn = onboardingWizardRoot.querySelector('[data-onboarding-action="back"]');
  if (backBtn instanceof HTMLButtonElement) backBtn.disabled = finishBusy;
  // Once the links are written (a later Finish only writes the flag) the rows are locked: a new check would be lost silently.
  onboardingWizardRoot.querySelectorAll('[data-onboarding-step="2"] input[type="checkbox"]').forEach((box) => {
    if (box instanceof HTMLInputElement) box.disabled = finishBusy || onboardingStartersCommitted;
  });
  const list = onboardingWizardRoot.querySelector(".onboarding-wizard__starters");
  if (list instanceof HTMLElement) {
    // Only a committed write locks the list. While Finish is busy but nothing is committed yet, the rows are merely disabled for
    // the moment and the list keeps no tab stop (decided: a stop that would vanish after the write is worse than none).
    setStartersLocked(list, onboardingStartersCommitted);
  }
  onboardingWizardRoot.querySelector(".onboarding-wizard__progress")?.setAttribute("aria-label", `Step ${progressPillCount(onboardingStep)} of 2`);
  if (dialog) dialog.setAttribute("aria-busy", String((weatherBusy && !locating) || finishBusy));
}

function onboardingBackdropAllowed() {
  return performance.now() - onboardingWizardOpenedAt >= CITY_MODAL_BACKDROP_GUARD_MS;
}

function onboardingStep2ActionsAllowed() {
  return onboardingStep !== 2 || !step2GuardActive(onboardingStep2EnteredAt);
}

function goToOnboardingStep2() {
  onboardingStep = 2;
  onboardingStep2EnteredAt = performance.now();
  armPostCloseClickGuard(); // the second click of a double click on Skip/Continue lands on the row under the button
  if (!onboardingStartersCommitted) onboardingFinishError = ""; // locked rows keep their explanation
  syncOnboardingWizardUi();
  // a disabled row cannot take focus: with every row locked the focus goes to Finish
  const firstBox = onboardingWizardRoot?.querySelector('[data-onboarding-step="2"] input[type="checkbox"]:not(:disabled)');
  (firstBox ?? onboardingWizardRoot?.querySelector('[data-onboarding-action="finish"]'))?.focus();
}

function goToOnboardingStep1({ focusTitle = false } = {}) {
  onboardingStep = 1;
  armPostCloseClickGuard(); // the second click of a double click on Back lands on Skip, which sits at the same place
  if (!onboardingStartersCommitted) onboardingFinishError = "";
  syncOnboardingWizardUi();
  if (focusTitle) {
    const title = onboardingWizardRoot?.querySelector("#onboarding-step1-title");
    if (title instanceof HTMLElement) {
      title.tabIndex = -1;
      title.focus();
    }
  }
}

function createOnboardingStarterIcon(row) {
  const letter = getFavoriteLetter({ label: row.label, domain: row.domain });
  const fallback = () => {
    const span = createNode("span", "onboarding-wizard__starter-icon onboarding-wizard__starter-icon--letter", letter);
    span.setAttribute("aria-hidden", "true"); // the row's visible label and the checkbox name carry the link
    return span;
  };
  if (!faviconBaseUrl) return fallback();
  const icon = createNode("img", "onboarding-wizard__starter-icon");
  const url = getFaviconUrl({ baseUrl: faviconBaseUrl, pageUrl: row.url, size: FAVICON_SIZE });
  icon.alt = "";
  icon.addEventListener("error", () => icon.replaceWith(fallback()));
  const known = attachDefaultFaviconCheck(icon, url, fallback);
  if (known) return known;
  icon.src = url;
  return icon;
}

function buildOnboardingStep2() {
  const panel = createNode("div", "onboarding-wizard__step");
  panel.dataset.onboardingStep = "2";
  const title = createNode("h2", "onboarding-wizard__step-title", "Add starter links");
  title.id = "onboarding-step2-title";
  title.dataset.onboardingStepTitle = "";
  const description = createNode("p", "onboarding-wizard__step-description", "Keep the ones you want on your grid.");
  const list = createNode("ul", "onboarding-wizard__starters");
  for (let i = 0; i < ONBOARDING_STARTER_LINKS.length; i += 1) {
    const row = ONBOARDING_STARTER_LINKS[i];
    const item = createNode("li");
    const label = createNode("label", "onboarding-wizard__starter");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = onboardingStarterChecks[i] === true;
    box.dataset.onboardingStarterIndex = String(i);
    box.setAttribute("aria-label", `Add ${row.label} to your grid`);
    const surface = createNode("span", "onboarding-wizard__starter-surface");
    const check = createNode("span", "onboarding-wizard__starter-check");
    check.setAttribute("aria-hidden", "true");
    surface.append(createOnboardingStarterIcon(row), createNode("span", "onboarding-wizard__starter-label", row.label), check);
    label.append(box, surface);
    item.appendChild(label);
    list.appendChild(item);
  }
  const finishError = createNode("p", "status status--error status--full", onboardingFinishError);
  finishError.dataset.onboardingFinishError = "";
  finishError.setAttribute("role", "alert");
  finishError.hidden = onboardingFinishError === "";
  const actions = createNode("div", "city-modal__actions");
  const back = createIconButton("button", "Back", "arrowLeft");
  back.type = "button";
  back.dataset.onboardingAction = "back";
  const finish = createIconButton("button button--primary", "Finish", "check");
  finish.type = "button";
  finish.dataset.onboardingAction = "finish";
  actions.append(back, finish);
  panel.append(title, description, list, finishError, actions);
  return panel;
}

function buildOnboardingWizard() {
  const root = createNode("div", "onboarding-wizard city-modal");
  root.id = "onboarding-wizard";
  const backdrop = createNode("div", "city-modal__backdrop");
  backdrop.dataset.onboardingBackdrop = "";
  const dialog = createNode("div", "city-modal__dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "onboarding-step1-title");
  const progress = createNode("div", "onboarding-wizard__progress");
  progress.setAttribute("role", "img"); // the pills are decoration; the step is named for assistive technology only
  progress.setAttribute("aria-label", "Step 1 of 2");
  progress.append(createNode("span", "onboarding-wizard__pill onboarding-wizard__pill--active"), createNode("span", "onboarding-wizard__pill"));
  const step1 = createNode("div", "onboarding-wizard__step");
  step1.dataset.onboardingStep = "1";
  const title1 = createNode("h2", "onboarding-wizard__step-title", "Where should we show weather?");
  title1.id = "onboarding-step1-title";
  title1.dataset.onboardingStepTitle = "";
  title1.tabIndex = -1;
  const description1 = createCityLocationDescription("onboarding");
  step1.append(title1, description1, createCityForm("onboarding", weatherLocationError ? null : currentLocation()));
  const step2 = buildOnboardingStep2();
  dialog.append(progress, step1, step2);
  root.append(backdrop, dialog);
  return root;
}

function attachOnboardingWizardListeners(root) {
  root.addEventListener("mousedown", keepFocusWhileBusy);
  root.addEventListener("focusin", () => {
    onboardingWizardHadFocus = true;
  });
  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
    const index = Number(target.dataset.onboardingStarterIndex);
    if (!Number.isInteger(index)) return;
    onboardingStarterChecks[index] = target.checked;
    if (onboardingFinishError) {
      onboardingFinishError = "";
      syncOnboardingWizardUi();
    }
  });
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (
      event.detail > 0 &&
      activeCityForm?.recentlyChosen() &&
      (target.matches("[data-onboarding-backdrop]") || target.closest('[data-onboarding-action], button[type="submit"]'))
    ) {
      event.preventDefault();
      return;
    }
    if (target.closest('[data-onboarding-action="finish"]')) {
      if (!onboardingStep2ActionsAllowed() || favoritesBusy) return;
      void finishOnboardingWizard();
      return;
    }
    if (target.closest('[data-onboarding-action="back"]')) {
      if (!onboardingStep2ActionsAllowed() || favoritesBusy) return;
      goToOnboardingStep1({ focusTitle: true });
      return;
    }
    if (target.closest('[data-onboarding-action="skip"]')) {
      if (onboardingStep !== 1 || weatherBusy) return;
      goToOnboardingStep2();
      return;
    }
    if (target.matches("[data-onboarding-backdrop]")) {
      if (!onboardingBackdropAllowed() || weatherBusy || favoritesBusy) return;
      if (!onboardingStep2ActionsAllowed()) return;
      if (onboardingStep === 1) goToOnboardingStep2();
      else void finishOnboardingWizard();
      return;
    }
    const locateLink = target.closest('[data-weather-action="use-location"]');
    if (locateLink instanceof HTMLElement) {
      if (locateLink.getAttribute("aria-disabled") === "true" || weatherBusy && !locating) return;
      void useMyLocation("onboarding");
      return;
    }
    if (weatherBusy) return;
    const suggestion = target.closest('[data-weather-action="select-city"]');
    if (suggestion instanceof HTMLElement) {
      activeCityForm?.choose({
        name: suggestion.dataset.cityName,
        country: suggestion.dataset.cityCountry ?? "",
        latitude: Number(suggestion.dataset.cityLatitude),
        longitude: Number(suggestion.dataset.cityLongitude),
        label: suggestion.textContent
      });
    }
  });
  root.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.weatherForm !== "city" || onboardingStep !== 1) return;
    event.preventDefault();
    if (weatherBusy || !weatherService) return;
    if (locationStatusNode) locationStatusNode.textContent = "";
    const cityName = String(new FormData(form).get("city") ?? "").trim();
    if (!cityName) {
      cityModalError = "Enter a city name";
      syncCityModal();
      form.querySelector(CITY_INPUT_SELECTOR)?.focus();
      return;
    }
    const picked = activeCityForm?.chosen();
    if (picked) {
      changeCity(
        () =>
          weatherService.selectLocation({
            name: picked.name,
            country: picked.country,
            latitude: picked.latitude,
            longitude: picked.longitude
          }),
        { onSuccess: goToOnboardingStep2 }
      );
      return;
    }
    changeCity(() => weatherService.setCity(cityName), { onSuccess: goToOnboardingStep2 });
  });
}

function hideOnboardingWizard({ completed = false } = {}) {
  if (!onboardingWizardRoot) return;
  const focusWasInside = onboardingWizardHadFocus || onboardingWizardRoot.contains(document.activeElement);
  teardownLocationLookup();
  activeCityForm?.cancelPending();
  activeCityForm?.dispose?.();
  activeCityForm = null;
  weatherFormGeneration += 1;
  onboardingWizardRoot.remove();
  onboardingWizardRoot = null;
  armPostCloseClickGuard();
  onboardingStep = 1;
  onboardingStep2EnteredAt = 0;
  onboardingStarterChecks = defaultStarterChecks();
  onboardingFinishError = "";
  onboardingWizardHadFocus = false;
  revealDesk();
  weatherUi = closeCityModalState(weatherUi);
  cityModalError = "";
  if (favoritesRoot) favoritesRoot.inert = false;
  if (focusWasInside || completed) {
    pendingFocus = [SETTINGS_TILE_SELECTOR];
    // Finish closes the wizard while favoritesBusy, so this call returns at once and renderFavorites() applies the focus later: the
    // flag rides on the pending value, a later assignment of pendingFocus drops it (docs/onboarding-wizard-polish.md decision 2).
    pendingFocus.preventScroll = true;
    applyPendingFocus();
  }
  scheduleDeferredDeskRefresh();
}

// The heal of a cleared storage that Finish performed (kept until the wizard closes: the first Finish may stop on the completion flag).
let onboardingHealOutcome = null;
function showWizardHealOutcome() {
  const outcome = onboardingHealOutcome;
  onboardingHealOutcome = null;
  if (!outcome) return;
  if (outcome.failed) {
    leaveEditModeAfterFailedHeal();
    showLayoutRestoreFailure();
  } else {
    showDesktopStatus(LAYOUT_RESET_MESSAGE, { tone: "info" });
  }
}

// After a failed Finish the buttons come back enabled: put the focus back on Finish (it was lost when the pressed button was disabled for
// the request; the alert text announces the failure) unless the person already moved it inside the wizard (backlog 77).
function restoreWizardFocusAfterFinishError() {
  const finish = onboardingWizardRoot?.querySelector('[data-onboarding-action="finish"]');
  if (!(finish instanceof HTMLButtonElement) || finish.disabled) return;
  const active = document.activeElement;
  if (active && active !== document.body && onboardingWizardRoot.contains(active)) return;
  finish.focus();
}

// The one Finish widgets call, also for zero links: on a fresh desk that fits it lays the system tiles and the new links out as the
// island (docs/post-onboarding-grid.md). columns, rows and freshness are read now, not at load. Returns the added ids or null.
async function layOutFinishIsland(inputs) {
  let addedIds;
  try {
    addedIds = await widgetsService.addFavorites(inputs, {
      columns: currentColumns(),
      island: { rows: viewportRows(document.documentElement.clientHeight, viewportWidth()) }
    });
  } catch (error) {
    // k = 0: the layout is cosmetic and nothing was selected, so Finish goes on (decision 9); k >= 1 keeps the inline error
    if (inputs.length >= 1) throw error;
    return null;
  }
  if (inputs.length === 0) {
    // k = 0: no heal (a wiped storage must stay unwritten, dg-71 AS-STC-03). Take the re-read only if it still has Settings
    // (the island was written); a cleared storage keeps today's in-memory state. A failing read is swallowed like the call.
    try {
      const state = await widgetsService.getState();
      if (state.items.some((item) => item.id === SETTINGS_TILE_ID)) widgetsState = state;
    } catch {
      // keep the previous state
    }
    return null;
  }
  // the links are written: a failing re-read or heal must not make a retry add them again (decision 9)
  onboardingStartersCommitted = true;
  let outcome;
  try {
    widgetsState = await widgetsService.getState();
    // the storage may have been cleared in another tab while the wizard was open: heal it like Add link does (the starters stay)
    outcome = await healClearedDesk(widgetsState);
    widgetsState = outcome.state;
  } catch {
    // the links are saved but this tab cannot read them back: Finish goes on and the persistent "Reload this tab" message says so,
    // instead of the add error (a retry would not add anything: committed) and a stale desk without it (backlog 76)
    outcome = { state: widgetsState, healed: false, failed: true };
  }
  if (outcome.healed || outcome.failed) onboardingHealOutcome = outcome;
  for (const id of addedIds) {
    const item = widgetsState.items.find((row) => row.id === id);
    if (item?.backgroundColorSource === "auto") void refreshAutoAccent(id);
  }
  return addedIds;
}

// Finish on step 2: one widgets call (also for zero links) that lays the island out on a fresh desk (docs/post-onboarding-grid.md), then the
// completion flag. Zero links: a failed call is swallowed and nothing is healed or marked committed; with links the failure shows inline.
async function finishOnboardingWizard() {
  if (!onboardingWizardRoot || onboardingStep !== 2 || favoritesBusy) return;
  onboardingFinishError = "";
  const checks = onboardingWizardRoot.querySelectorAll('[data-onboarding-step="2"] input[type="checkbox"]');
  for (let i = 0; i < checks.length; i += 1) {
    const box = checks[i];
    if (box instanceof HTMLInputElement) onboardingStarterChecks[i] = box.checked;
  }
  const inputs = checkedStarterInputs(onboardingStarterChecks);
  const generation = startFavoritesAction({ render: false });
  syncOnboardingWizardUi();
  try {
    if (!onboardingStartersCommitted && widgetsService) {
      await layOutFinishIsland(inputs);
    }
    if (onboardingStore) {
      try {
        await onboardingStore.markComplete();
        onboardingFlagWriteFailedOnce = false;
      } catch {
        if (onboardingFlagWriteFailedOnce) {
          hideOnboardingWizard({ completed: true });
          finishFavoritesAction(generation, () => {});
          renderFavorites();
          showWizardHealOutcome();
          return;
        }
        onboardingFlagWriteFailedOnce = true;
        onboardingFinishError = ONBOARDING_FINISH_ERRORS.flag;
        finishFavoritesAction(generation, () => {});
        syncOnboardingWizardUi();
        renderFavorites();
        restoreWizardFocusAfterFinishError();
        return;
      }
    }
    hideOnboardingWizard({ completed: true });
    finishFavoritesAction(generation, () => {});
    renderFavorites();
    showWizardHealOutcome();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onboardingFinishError = onboardingFinishErrorForAddFailure(message);
    finishFavoritesAction(generation, () => {});
    syncOnboardingWizardUi();
    renderFavorites();
    restoreWizardFocusAfterFinishError();
  }
}

function showOnboardingWizard() {
  if (onboardingWizardRoot || cityModalRoot || desktopDialogRoot || !document.body) return false;
  onboardingWizardShownThisLoad = true;
  onboardingStep = 1;
  onboardingStep2EnteredAt = 0;
  onboardingStarterChecks = defaultStarterChecks();
  onboardingFinishError = "";
  onboardingStartersCommitted = false;
  onboardingFlagWriteFailedOnce = false;
  cityModalError = "";
  clearPostCloseClickGuard();
  let root = null;
  try {
    root = buildOnboardingWizard();
    attachOnboardingWizardListeners(root);
    document.body.appendChild(root);
  } catch (error) {
    root?.remove();
    activeCityForm?.dispose?.();
    activeCityForm = null;
    throw error;
  }
  onboardingWizardRoot = root;
  if (favoritesRoot) favoritesRoot.dataset.veiled = "true";
  activeCityForm?.place();
  weatherUi = openCityModalState(weatherUi, "onboarding");
  onboardingWizardHadFocus = false;
  onboardingWizardOpenedAt = performance.now();
  hideTooltip();
  closeAddMenu();
  if (favoritesRoot) favoritesRoot.inert = true;
  syncOnboardingWizardUi();
  return true;
}

// R6: a 2-wide tile uses the `wide` model, a 1×2 tile the `tall` model (docs/tile-size-1x2.md decision 6); a 2-high
// tile gets the city name. Type sizes come from CSS keyed on data-w/data-h.
function createWeatherMetricTile(item, cell, view) {
  const size = cell.w === 2 ? "wide" : cell.h === 2 ? "tall" : "square";
  const editing = desktopUi.editMode;
  // The age sentence of a stale description is for normal mode (tooltip and description); edit mode stays as it was, so no `now` there
  // (docs/weather-reliability.md AS-WRL-04).
  const model = describeWeatherMetric({ metricKey: weatherMetricKey(item.id), result: view, size, retry: weatherRetryPhase(weatherUi, Date.now()), now: editing ? undefined : Date.now() });
  if (!model) return null;

  // Edit mode: the tile becomes a button named "Edit <metric name>"; a tap opens the weather edit dialog.
  // An error or stale tile in normal mode is one native button "Retry <metric name>" (one shared attempt, see retryWeather).
  const retryable = !editing && model.retry !== null;
  const tile = createNode(editing || retryable ? "button" : "div", "weather-tile");
  tile.dataset.widgetId = item.id;
  if (editing) {
    tile.type = "button";
    tile.setAttribute("aria-label", `Edit ${METRIC_LABELS[weatherMetricKey(item.id)]}`);
  } else if (retryable) {
    tile.type = "button";
    tile.classList.add("weather-tile--retry");
    tile.dataset.favoriteAction = "retry-weather";
    tile.dataset.retry = model.retry;
    tile.setAttribute("aria-label", `Retry ${model.label}`);
    if (model.retry !== "ready") tile.setAttribute("aria-disabled", "true"); // not `disabled`: focus must stay on the tile
  } else {
    tile.tabIndex = 0;
    tile.setAttribute("role", "group");
    tile.setAttribute("aria-label", model.label);
  }
  if (model.tone) tile.dataset.weatherTone = model.tone;
  if (model.stale) tile.dataset.stale = "true";
  if (model.busy) tile.setAttribute("aria-busy", "true");

  // Spec § Tile content by size: every size leads with the metric glyph (decorative; the name is the aria-label).
  const glyph = createNode("span", "weather-tile__glyph");
  glyph.setAttribute("aria-hidden", "true");
  glyph.appendChild(createIconNode(METRIC_GLYPHS[weatherMetricKey(item.id)], { size: 16 }));
  tile.appendChild(glyph);

  const values = createNode("div", "weather-tile__values");
  values.appendChild(createNode("span", "weather-tile__primary", model.primary));
  if (model.secondary) values.appendChild(createNode("span", "weather-tile__secondary", model.secondary));
  tile.appendChild(values);
  const cityName = view?.location?.name;
  if (cell.h === 2 && cityName) tile.appendChild(createNode("span", "weather-tile__city", cityName));
  const description = createNode("span", "sr-only", model.description);
  description.id = `weather-desc-${weatherMetricKey(item.id)}`;
  description.dataset.tooltipText = "";
  tile.setAttribute("aria-describedby", description.id);
  tile.dataset.tooltipTrigger = "";
  tile.appendChild(description);
  if (retryable) {
    // A direct child of the tile (never of .weather-tile__values, which clips): the corner glyph that says "press to try again".
    const retryGlyph = createNode("span", "weather-tile__retry");
    retryGlyph.setAttribute("aria-hidden", "true");
    retryGlyph.appendChild(createIconNode("refresh", { size: cell.w === 2 && cell.h === 2 ? 14 : 12 }));
    tile.appendChild(retryGlyph);
  }
  return tile;
}

// Spec § Weather / city: the hint takes the first enabled metric's cell and size; the map-pin glyph at 1×1 (the plus
// belongs to Add), text when 2-wide, pin above text at 1×2 (docs/tile-size-1x2.md decision 4).
function createCityHintTile(cell, item) {
  const button = createNode("button", "city-hint-tile");
  button.type = "button";
  if (!desktopUi.editMode) button.dataset.favoriteAction = "set-city"; // edit mode: it behaves as its metric (weather dialog)
  button.dataset.widgetId = "weather:hint";
  button.dataset.metricId = item.id;
  button.setAttribute("aria-label", "Set a city");
  if (cell.w === 2) button.textContent = "Set a city";
  else if (cell.h === 2) button.append(createIconNode("mapPin", { size: 18 }), createNode("span", "city-hint-tile__text", "Set a city"));
  else button.appendChild(createIconNode("mapPin"));
  // The 1×1 tile shows only the pin, so the shared tooltip says what it is (docs/typography-copy.md decision 6). The label is a data attribute, not a
  // child node: the tile has no text. Kept after the chain above, which stays one statement; the 2×1, 2×2 and 1×2 hints show their words and get no trigger.
  if (cell.w === 1 && cell.h === 1) {
    button.dataset.tooltipTrigger = "";
    button.dataset.tooltipLabel = "Set a city";
  }
  return button;
}

function createChromeTile(item, cell) {
  const settings = item.role === "settings";
  const button = createNode("button", "chrome-tile");
  button.type = "button";
  button.dataset.widgetId = item.id;
  button.dataset.chromeRole = item.role;
  button.setAttribute("aria-label", settings ? "Settings" : "Add link");
  if (settings) button.setAttribute("aria-pressed", String(desktopUi.editMode));
  else if (desktopUi.editMode && hiddenMetrics().length > 0) {
    button.setAttribute("aria-haspopup", "menu"); // spec § Add menu: it opens the Add menu instead of the dialog
    button.setAttribute("aria-expanded", String(addMenuRoot !== null));
    if (addMenuRoot !== null) button.setAttribute("aria-controls", "add-menu");
  }
  button.appendChild(createIconNode(settings ? "settings" : "plus", { size: 20 }));
  return button;
}

function createRemoveBadge(item) {
  const hidden = item.type === "weather-metric";
  const label = hidden ? METRIC_LABELS[weatherMetricKey(item.id)] : item.label;
  const badge = createNode("button", "tile-remove");
  badge.type = "button";
  badge.dataset.removeFor = item.id;
  badge.setAttribute("aria-label", hidden ? `Hide ${label}` : `Remove ${label}`);
  badge.appendChild(createIconNode("minus", { size: 12 }));
  return badge;
}

// ---- A new link's tile that is off screen is scrolled to and ringed for 2 s (docs/link-dialog-validation.md decision 4) ----
const ADDED_HIGHLIGHT_MS = 2000;
const ADDED_EDGE_MARGIN_PX = 6; // the tiles' scroll-margin: a tile closer to an edge than this has its ring cut
let justAdded = null; // { id, startedAt }: lives across re-renders so the fade continues instead of restarting
let justAddedTimer = 0;

function clearJustAdded() {
  clearTimeout(justAddedTimer);
  justAddedTimer = 0;
  justAdded = null;
  for (const tile of favoritesRoot?.querySelectorAll("[data-just-added]") ?? []) {
    tile.removeAttribute("data-just-added");
    tile.style.removeProperty("--added-delay");
  }
}

// Called by every render for each favorite tile: only the highlighted id, and only while its 2 s have not passed.
function applyJustAdded(tile, id) {
  if (!justAdded || justAdded.id !== id) return;
  const elapsed = performance.now() - justAdded.startedAt;
  if (elapsed >= ADDED_HIGHLIGHT_MS) {
    clearJustAdded();
    return;
  }
  tile.dataset.justAdded = "true";
  tile.style.setProperty("--added-delay", `${-Math.round(elapsed)}ms`);
  tile.addEventListener("animationend", (event) => {
    if (event.target === tile && event.animationName === "tile-added") clearJustAdded();
  });
}

// Safely inside: ADDED_EDGE_MARGIN_PX from the top and from the bottom edge, which is the window height minus the chip reserve while a
// chip is shown (docs/layers-low-window.md decision 7).
function isSafelyInsideWindow(node) {
  const rect = node.getBoundingClientRect();
  const statusReserve = Number.parseFloat(document.documentElement.style.getPropertyValue("--status-reserve")) || 0;
  return rect.top >= ADDED_EDGE_MARGIN_PX && rect.bottom <= document.documentElement.clientHeight - statusReserve - ADDED_EDGE_MARGIN_PX;
}

// After the dialog is closed and the desk rendered: nothing when the tile is safely inside the window.
function revealAddedTile(id) {
  const tile = favoritesRoot?.querySelector(`.desktop-grid > [data-widget-id="${CSS.escape(id)}"]`);
  if (!(tile instanceof HTMLElement)) return;
  if (isSafelyInsideWindow(tile)) return;
  clearJustAdded();
  justAdded = { id, startedAt: performance.now() };
  justAddedTimer = setTimeout(clearJustAdded, ADDED_HIGHLIGHT_MS);
  applyJustAdded(tile, id);
  tile.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

const DIALOG_SCROLL_MARGIN_PX = 5; // the scroll-margin of a dialog control (surfaces.css)
const ADD_TILE_SELECTOR = '[data-widget-id="chrome:add"]';
const DIALOG_BACKDROP_GUARD_MS = 300;
let desktopDialogRoot = null;
let desktopDialogOpener = null; // { id, badge } of the tile or − badge that opened the dialog, looked up again at close
let desktopDialogOpenedAt = 0;
let desktopDialogScrollObserver = null; // keeps data-scrolls on the open dialog equal to "it scrolls" (docs/layers-low-window.md decision 13)

const itemById = (id) => widgetsState?.items.find((item) => item.id === id) ?? null;
const metricName = (id) => METRIC_LABELS[weatherMetricKey(id)];
const WEATHER_DIALOG_CITY_SELECTOR = '[data-dialog="edit-weather"] [data-weather-action="open-city-modal"]';

function createDialogFooter(...buttons) {
  const footer = createNode("div", "favorite-form__footer");
  footer.append(...buttons);
  return footer;
}

function createDialogCancel() {
  const cancel = createIconButton("button", "Cancel", "x");
  cancel.type = "button";
  cancel.dataset.favoriteAction = "cancel"; // openDesktopDialog wires every Cancel the same way
  return cancel;
}

// One branch per dialog kind (desktopUiState DIALOG_KINDS). Strings only through text nodes.
function buildDialogContent(root, dialog) {
  const title = createNode("h2", "desktop-dialog__title");
  title.id = "desktop-dialog-title";

  switch (dialog.kind) {
    case "add-link": {
      title.textContent = "Add link";
      const form = createFavoriteForm(null);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const payload = { ...readFavoriteFormPayload(data), ...readSize(data.get("size")) };
        const previousIds = new Set((widgetsState?.items ?? []).map((entry) => entry.id));
        void runDesktopMutation(
          (columns) => widgetsService.addFavorite(payload, { columns }),
          { dialogRoot: root }
        ).then((ok) => {
          if (ok) {
            if (widgetsState?.items.some((entry) => entry.id === SETTINGS_TILE_ID)) announce("Link added"); // not after a failed heal: the alert speaks
            closeDesktopDialog();
            // The new link is the LAST favorite the stored result has and the state before did not (set difference; a new item is
            // always appended, so a link another tab added in between is an earlier one).
            const added = widgetsState?.items.findLast((entry) => entry.type === "favorite" && !previousIds.has(entry.id));
            if (added) {
              void refreshAutoAccent(added.id);
              if (widgetsState?.items.some((entry) => entry.id === SETTINGS_TILE_ID)) revealAddedTile(added.id); // not after a failed heal
            }
          }
        });
      });
      root.append(title, form);
      break;
    }
    case "edit-link": {
      const item = itemById(dialog.id);
      if (item?.type !== "favorite") throw new Error("Link not found");
      title.textContent = "Edit link";
      const form = createFavoriteForm(item);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const payload = { ...readFavoriteFormPayload(data), ...readSize(data.get("size")) };
        void runDesktopMutation(
          (columns) => widgetsService.updateFavorite(item.id, payload, { columns }),
          { dialogRoot: root }
        ).then((ok) => {
          if (ok) {
            announce("Link saved");
            closeDesktopDialog({ reveal: true });
            if (payload.backgroundColorSource === "auto") void refreshAutoAccent(item.id);
          }
        });
      });
      root.append(title, form);
      break;
    }
    case "confirm-delete": {
      const item = itemById(dialog.id);
      if (item?.type !== "favorite") throw new Error("Link not found");
      title.textContent = "Delete link?";
      const body = createNode("p", "desktop-dialog__body", "This removes the link from your grid.");
      body.id = "desktop-dialog-body";
      root.setAttribute("aria-describedby", body.id);
      const remove = createIconButton("button button--danger", "Delete", "trash2");
      remove.type = "button";
      remove.dataset.dialogAction = "delete";
      remove.addEventListener("click", () => void confirmDeleteFavorite(item.id));
      root.append(title, body, createDialogErrorSlot(), createDialogFooter(createDialogCancel(), remove));
      break;
    }
    case "confirm-hide-weather": {
      const item = itemById(dialog.id);
      if (item?.type !== "weather-metric" || item.enabled !== true) throw new Error("Weather tile not found");
      title.textContent = HIDE_COPY[weatherMetricKey(item.id)].title;
      const body = createNode("p", "desktop-dialog__body", "This hides the tile from your grid. You can add it again from Add.");
      body.id = "desktop-dialog-body";
      root.setAttribute("aria-describedby", body.id);
      const hide = createIconButton("button button--primary", "Hide", "eyeOff");
      hide.type = "button";
      hide.dataset.dialogAction = "hide";
      hide.addEventListener("click", () => void hideWeatherMetric(item.id));
      root.append(title, body, createDialogErrorSlot(), createDialogFooter(createDialogCancel(), hide));
      break;
    }
    case "edit-weather": {
      const item = itemById(dialog.id);
      if (item?.type !== "weather-metric" || item.enabled !== true) throw new Error("Weather tile not found");
      title.textContent = metricName(item.id);
      // City row: the city change commits on its own in the city modal, stacked on top of this dialog.
      const cityField = createNode("button", "city-field");
      cityField.type = "button";
      cityField.dataset.weatherAction = "open-city-modal";
      const cityValue = createNode("span", null);
      cityValue.dataset.weatherDialogCity = "";
      cityValue.id = `city-field-value-${formRowIdSeq}`;
      const cityHint = createNode("span", "city-field__hint", "Change");
      cityHint.id = `city-field-hint-${formRowIdSeq}`;
      cityField.append(cityValue, cityHint);
      cityField.addEventListener("click", () => {
        if (!weatherBusy && !favoritesBusy) showCityModal("change", WEATHER_DIALOG_CITY_SELECTOR);
      });

      const form = createNode("form", "favorite-form");
      form.dataset.weatherSizeForm = "";
      form.noValidate = true;
      // A lenient read may have dropped a malformed grid: the size shown is the displayed cell's (spec § Reading grid).
      const size = displayedSize(item);
      const initial = `${size.w}x${size.h}`;
      const save = createIconButton("button button--primary", "Save", "check");
      save.type = "submit";
      save.disabled = true; // enabled only when the size changed
      form.addEventListener("change", () => {
        save.disabled = new FormData(form).get("size") === initial;
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const size = readSize(new FormData(form).get("size"));
        if (!size || save.disabled) return;
        void runDesktopMutation(
          (columns) => widgetsService.updateWeatherMetric(item.id, size, { columns }),
          { dialogRoot: root }
        ).then((ok) => {
          if (ok) closeDesktopDialog({ reveal: true });
        });
      });
      form.append(createFormRow("City", cityField), createFormRow("Size", createSizeControl(size)), createDialogErrorSlot(), createDialogFooter(createDialogCancel(), save));
      root.append(title, form);
      syncWeatherDialogCity(root);
      break;
    }
    default:
      throw new Error(`Unknown dialog: ${dialog.kind}`);
  }
}

// The weather dialog's city row follows the stored city (it changes under the dialog through the stacked city modal).
function syncWeatherDialogCity(root = desktopDialogRoot) {
  if (root?.dataset.dialog !== "edit-weather") return;
  const location = weatherLocationError ? null : currentLocation();
  const field = root.querySelector('[data-weather-action="open-city-modal"]');
  const label = location ? cityDisplayLabel(location) : "";
  const value = root.querySelector("[data-weather-dialog-city]");
  const hint = field.querySelector(".city-field__hint");
  value.textContent = label || "Set a city"; // no city: one muted line, no separate hint
  value.toggleAttribute("data-empty", !label);
  hint.hidden = !label;
  // The name is the row label plus the visible parts (single spaces, no commas); a hidden hint is left out.
  field.setAttribute("aria-labelledby", [field.dataset.rowLabelId, value.id, label ? hint.id : null].filter(Boolean).join(" "));
  if (label) field.title = label; // the full label whenever a city is stored; the accessible name comes from aria-labelledby
  else field.removeAttribute("title");
  field.disabled = !weatherService;
}

// Decision 13: `data-scrolls="true"` on the dialog while its content is taller than its box, which draws the footer's divider. A
// ResizeObserver on the dialog and its form covers every change of height without a list: open, window resize and zoom, the error
// slot, the Icon mode switch, a font load. The attribute changes no size (the divider replaces 1px of padding), so it cannot loop; the same
// holds under a shown error: the slot's margin-bottom 5px and the footer's padding-top minus 6px (5px + the divider's 1px) net to zero.
function syncDialogScrolls(root) {
  root.dataset.scrolls = root.scrollHeight > root.clientHeight ? "true" : "false";
}

function watchDialogScrolls(root) {
  desktopDialogScrollObserver?.disconnect();
  const sync = () => syncDialogScrolls(root);
  sync();
  if (typeof ResizeObserver !== "function") return;
  desktopDialogScrollObserver = new ResizeObserver(sync);
  desktopDialogScrollObserver.observe(root);
  const form = root.querySelector("form");
  if (form) desktopDialogScrollObserver.observe(form);
}

// `opener`: { id, badge } of the control to refocus at close (a tile or its − badge), looked up again at close time.
function openDesktopDialog(dialog, { opener = focusedWidgetId() } = {}) {
  if (!favoritesRoot || desktopDialogRoot || cityModalRoot) return false;
  closeAddMenu();
  showDesktopStatus("");
  desktopDialogOpener = opener ?? null;
  desktopUi = openDialog(desktopUi, dialog);
  const root = createNode("div", "desktop-dialog");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "desktop-dialog-title");
  root.dataset.dialog = dialog.kind;
  try {
    buildDialogContent(root, dialog);
  } catch (error) {
    desktopUi = closeDialog(desktopUi);
    desktopDialogOpener = null;
    throw error;
  }
  const backdrop = createNode("div", "desktop-backdrop");
  backdrop.addEventListener("click", () => {
    if (Date.now() - desktopDialogOpenedAt < DIALOG_BACKDROP_GUARD_MS || favoritesBusy) return;
    closeDesktopDialog();
  });
  root.querySelector('[data-favorite-action="cancel"]')?.addEventListener("click", () => {
    if (!favoritesBusy) closeDesktopDialog();
  });
  desktopDialogRoot = root;
  desktopDialogOpenedAt = Date.now();
  hideTooltip();
  favoritesRoot.inert = true;
  document.body.append(backdrop, root);
  watchDialogScrolls(root);
  root.querySelector("input:not(:disabled), button:not(:disabled)")?.focus(); // the first enabled control (a disabled city-field is skipped)
  return true;
}

// `restoreFocusTo`: a widget id, an { id, badge } target, a list of those (first present wins), or null for none.
// A weather dialog falls back to its metric's tile (the hint that opened it is gone once a city is set).
// docs/layers-low-window.md decision 7: a close never scrolls the page by itself. `reveal: false` (Cancel, Escape, backdrop, a failed
// write, the close after Add link) focuses the target with preventScroll; `reveal: true` (after a successful write that can move or
// remove the target: Save, Delete, Hide, a gone-link recovery) also brings the target in by the nearest edge when it is not safely inside.
function closeDesktopDialog({ restoreFocusTo = desktopDialogOpener, reveal = false } = {}) {
  const fallback = desktopUi.dialog?.id ?? null;
  desktopDialogScrollObserver?.disconnect();
  desktopDialogScrollObserver = null;
  document.querySelectorAll(".desktop-dialog, .desktop-backdrop").forEach((node) => node.remove());
  desktopDialogRoot = null;
  if (favoritesRoot) favoritesRoot.inert = false;
  desktopUi = closeDialog(desktopUi);
  desktopDialogOpener = null;
  if (restoreFocusTo) focusWidgetTarget([restoreFocusTo, fallback].flat(), { preventScroll: true, reveal });
  scheduleDeferredDeskRefresh();
}

// Focuses the first present, enabled target: a widget id string (its tile) or { id, badge } (the tile or its − badge).
// Without options the plain focus() scrolls the target in, as before; `preventScroll` focuses without it, and `reveal` then scrolls by
// the nearest edge (instant) only when the target is not at least ADDED_EDGE_MARGIN_PX inside the window and above the chip reserve.
function focusWidgetTarget(targets, { preventScroll = false, reveal = false } = {}) {
  for (const target of [targets].flat()) {
    if (!target) continue;
    const { id, badge } = typeof target === "string" ? { id: target, badge: false } : target;
    const selector = badge ? `[data-remove-for="${CSS.escape(id)}"]` : `.desktop-grid > [data-widget-id="${CSS.escape(id)}"]`;
    const node = favoritesRoot?.querySelector(selector);
    if (!(node instanceof HTMLElement) || node.matches(":disabled")) continue;
    suppressTooltipOnFocus = true;
    try {
      if (preventScroll) node.focus({ preventScroll: true });
      else node.focus();
    } finally {
      suppressTooltipOnFocus = false;
    }
    if (reveal && !isSafelyInsideWindow(node)) node.scrollIntoView({ block: "nearest", behavior: "auto" });
    return true;
  }
  return false;
}

// Spec § DOM order and focus: after a delete or hide, focus goes to the next tile in DOM order, else the previous,
// else Settings — read from the displayed (y, x) order before the action.
function neighborTargets(domId) {
  const ids = [...(favoritesRoot?.querySelectorAll(".desktop-grid > [data-widget-id]") ?? [])].map((tile) => tile.dataset.widgetId);
  const index = ids.indexOf(domId);
  return [...(index === -1 ? [] : [ids[index + 1], ids[index - 1]]), SETTINGS_TILE_ID].filter((id) => id && id !== domId);
}

// Delete confirm (spec § Write failures: a failure is reported in the page-level status line; the favorite stays).
async function confirmDeleteFavorite(id) {
  if (favoritesBusy) return;
  const next = neighborTargets(id);
  const opener = desktopDialogOpener;
  const ok = await runDesktopMutation((columns) => widgetsService.deleteFavorite(id, { columns }));
  if (!desktopDialogRoot) return; // closed meanwhile
  closeDesktopDialog({ restoreFocusTo: ok ? next : opener, reveal: ok });
  if (ok) announce("Link deleted");
}

// Hide confirm (spec § Hide confirm contract): the − on a weather tile (or on the hint, which stands for its metric) opens the
// dialog; Hide runs this. The neighbour is read when Hide is pressed, from the opener's − badge (for the hint it is the hint tile).
async function hideWeatherMetric(metricId) {
  if (favoritesBusy) return;
  const badge = favoritesRoot?.querySelector(`[data-remove-for="${CSS.escape(metricId)}"]`);
  const next = neighborTargets(badge?.previousElementSibling?.dataset.widgetId ?? metricId);
  const opener = desktopDialogOpener;
  const ok = await runDesktopMutation((columns) => widgetsService.updateWeatherMetric(metricId, { enabled: false }, { columns }));
  if (!desktopDialogRoot) return; // closed meanwhile
  closeDesktopDialog({ restoreFocusTo: ok ? next : opener, reveal: ok });
  if (ok) announce(HIDE_COPY[weatherMetricKey(metricId)].done);
}

// Add menu → a hidden metric: restored at the first free block for its size, then focused (or the hint standing for it).
async function restoreWeatherMetric(metricId) {
  const ok = await runDesktopMutation((columns) => widgetsService.updateWeatherMetric(metricId, { enabled: true }, { columns }));
  const hint = favoritesRoot?.querySelector('[data-widget-id="weather:hint"]');
  focusWidgetTarget(ok ? [metricId, hint?.dataset.metricId === metricId ? "weather:hint" : null, "chrome:add"] : "chrome:add");
}

// Edit-mode taps (spec § Edit mode): − badges, link and weather tiles (the hint stands for its metric). Chrome tiles are
// handled by the caller (Settings exits, Add opens the add flow) and never open an edit dialog.
function handleEditModeClick(target) {
  if (favoritesBusy || !widgetsService || !widgetsState || desktopDialogRoot) return;
  const badge = target.closest(".tile-remove");
  if (badge instanceof HTMLElement) {
    const item = itemById(badge.dataset.removeFor);
    if (item?.type === "favorite") {
      openDesktopDialog({ kind: "confirm-delete", id: item.id }, { opener: { id: item.id, badge: true } });
    } else if (item?.type === "weather-metric" && item.enabled === true) {
      openDesktopDialog({ kind: "confirm-hide-weather", id: item.id }, { opener: { id: item.id, badge: true } });
    }
    return;
  }
  const tile = target.closest(".desktop-grid > [data-widget-id]");
  if (!(tile instanceof HTMLElement)) return;
  const item = itemById(tile.dataset.metricId ?? tile.dataset.widgetId);
  const opener = { id: tile.dataset.widgetId, badge: false };
  if (item?.type === "favorite") openDesktopDialog({ kind: "edit-link", id: item.id }, { opener });
  else if (item?.type === "weather-metric" && item.enabled === true) openDesktopDialog({ kind: "edit-weather", id: item.id }, { opener });
}

// ---- Add tile and Add menu (spec § Add menu (edit mode), AS-30) ----
let addMenuRoot = null;
let addMenuDismissPress = null; // the pointerdown that closed the menu: it never also exits edit mode

const hiddenMetrics = () => (widgetsState?.items ?? []).filter((item) => item.type === "weather-metric" && item.enabled !== true);

// Normal mode, or nothing hidden: the add-link dialog. Edit mode with >= 1 hidden metric: the Add menu. A second
// activation while the menu is open keeps the one menu (Review focus 3).
function activateAddTile() {
  if (favoritesBusy || !widgetsService || !widgetsState || desktopDialogRoot) return;
  if (!desktopUi.editMode || hiddenMetrics().length === 0) {
    openDesktopDialog({ kind: "add-link" });
    return;
  }
  if (addMenuRoot) {
    focusMenuItem(0);
    return;
  }
  const menu = createNode("div", "add-menu");
  menu.id = "add-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Add");
  menu.addEventListener("keydown", onAddMenuKeydown);
  menu.addEventListener("click", onAddMenuClick);
  addMenuRoot = menu;
  hideTooltip();
  document.body.appendChild(menu);
  syncAddTileExpanded();
  fillAddMenu("add");
}

function fillAddMenu(kind) {
  const entries =
    kind === "add"
      ? [["add-link", "Add link", null], ["add-weather", "Add weather tile…", null]]
      : hiddenMetrics().map((item) => ["restore", metricName(item.id), item.id]);
  if (entries.length === 0) {
    closeAddMenu({ focusAdd: true });
    return;
  }
  desktopUi = openMenu(desktopUi, kind);
  addMenuRoot.setAttribute("aria-label", kind === "add" ? "Add" : "Add weather tile"); // spec Copy: the sub-flow's title
  addMenuRoot.replaceChildren(
    ...entries.map(([action, text, metricId]) => {
      const entry = createNode("button", "add-menu__item", text);
      entry.type = "button";
      entry.tabIndex = -1;
      entry.setAttribute("role", "menuitem");
      entry.dataset.menuAction = action;
      if (metricId) entry.dataset.metricId = metricId;
      return entry;
    })
  );
  placeAddMenu();
  focusMenuItem(0);
}

const menuItems = () => (addMenuRoot ? [...addMenuRoot.querySelectorAll('[role="menuitem"]')] : []);

function focusMenuItem(index) {
  const items = menuItems();
  if (items.length > 0) items[((index % items.length) + items.length) % items.length].focus();
}

// Anchored to the Add tile: below it, or above when there is no room below; kept inside the viewport horizontally.
function placeAddMenu() {
  const anchor = favoritesRoot?.querySelector(ADD_TILE_SELECTOR);
  if (!addMenuRoot || !anchor) return;
  const a = anchor.getBoundingClientRect();
  const m = addMenuRoot.getBoundingClientRect();
  const margin = 8;
  const above = a.top - POPOVER_GAP - m.height;
  const below = a.bottom + POPOVER_GAP;
  const top = below + m.height > window.innerHeight - margin && above >= margin ? above : below;
  const left = Math.max(margin, Math.min(a.left, document.documentElement.clientWidth - m.width - margin));
  addMenuRoot.style.left = `${left + window.scrollX}px`;
  addMenuRoot.style.top = `${top + window.scrollY}px`;
}

// The Add tile announces its menu only while it can open one (edit mode with >= 1 hidden metric).
function syncAddTileExpanded() {
  const tile = favoritesRoot?.querySelector(ADD_TILE_SELECTOR);
  if (!tile?.hasAttribute("aria-haspopup")) return;
  tile.setAttribute("aria-expanded", String(addMenuRoot !== null));
  if (addMenuRoot !== null) tile.setAttribute("aria-controls", "add-menu");
  else tile.removeAttribute("aria-controls");
}

function closeAddMenu({ focusAdd = false } = {}) {
  if (!addMenuRoot) return;
  addMenuRoot.remove();
  addMenuRoot = null;
  desktopUi = closeMenu(desktopUi);
  syncAddTileExpanded();
  if (focusAdd) focusWidgetTarget("chrome:add");
}

function onAddMenuKeydown(event) {
  const index = menuItems().indexOf(document.activeElement);
  if (event.key === "ArrowDown") focusMenuItem(index + 1);
  else if (event.key === "ArrowUp") focusMenuItem(index - 1);
  else if (event.key === "Home") focusMenuItem(0);
  else if (event.key === "End") focusMenuItem(-1);
  else if (event.key === "Tab") closeAddMenu({ focusAdd: true });
  else return;
  event.preventDefault();
}

function onAddMenuClick(event) {
  const entry = event.target instanceof Element ? event.target.closest('[role="menuitem"]') : null;
  if (!(entry instanceof HTMLElement) || favoritesBusy) return;
  const action = entry.dataset.menuAction;
  if (action === "add-weather") {
    fillAddMenu("restore-weather");
    return;
  }
  closeAddMenu();
  if (action === "add-link") openDesktopDialog({ kind: "add-link" }, { opener: { id: "chrome:add", badge: false } });
  else if (action === "restore") void restoreWeatherMetric(entry.dataset.metricId);
}

// An outside press closes the menu and returns focus to Add (after the press's own focus change). A press on the Add
// tile itself is a second activation and keeps the menu.
document.addEventListener(
  "pointerdown",
  (event) => {
    if (!addMenuRoot || !(event.target instanceof Element)) return;
    if (addMenuRoot.contains(event.target) || event.target.closest(ADD_TILE_SELECTOR)) return;
    addMenuDismissPress = event;
    closeAddMenu();
    setTimeout(() => focusWidgetTarget("chrome:add"), 0);
  },
  true
);

// The first field a service message is about; anything else leaves focus on the submit button.
function invalidFieldFor(message) {
  if (/image url/i.test(message)) return 'input[name="customIconUrl"]';
  if (/url/i.test(message)) return 'input[name="url"]';
  if (/color/i.test(message)) return 'input[name="backgroundColor"]';
  return 'button[type="submit"]';
}

// `field` is the service error's `field` (docs/link-dialog-validation.md decision 3): that input gets aria-invalid and
// aria-describedby = the alert slot. An error without a field (a Sync failure, the links limit) only focuses the submit button.
function showDialogError(root, message, field) {
  const slot = root.querySelector("[data-dialog-error]");
  if (!slot) return;
  slot.textContent = message;
  slot.hidden = false;
  const named = typeof field === "string" && field !== "" ? (root.querySelector(`input[name="${CSS.escape(field)}"]:checked`) ?? root.querySelector(`input[name="${CSS.escape(field)}"]`)) : null;
  if (named instanceof HTMLInputElement && field === "customIconUrl") {
    // the Custom icon row is hidden unless the Custom icon mode is chosen: choose it so the field is visible and focusable
    const custom = root.querySelector('input[name="iconMode"][value="custom"]');
    if (custom instanceof HTMLInputElement) custom.checked = true;
  }
  if (named) {
    named.setAttribute("aria-invalid", "true");
    named.setAttribute("aria-describedby", slot.id);
  }
  const target = named ?? root.querySelector(invalidFieldFor(message)) ?? root.querySelector('button[type="submit"]');
  if (target instanceof HTMLElement && !target.matches(":disabled")) target.focus({ preventScroll: true });
  scrollDialogErrorIntoView(root, slot, target);
}

// docs/layers-low-window.md decision 6: after the focus (which did not scroll) the dialog scrolls instantly so the alert slot is above
// the sticky footer; when the focused field's top and the slot's bottom (5px margins) fit in the visible height together, both are
// in view, otherwise the slot wins and the field may be out of view. The dialog moves down only as far as the footer requires and
// up when the field (both fit) or the slot is above the top edge; what must be visible already is, nothing moves.
function scrollDialogErrorIntoView(root, slot, target) {
  syncDialogScrolls(root); // the error may have made the dialog scroll: its 5px room above the divider must be in the layout now
  const footer = root.querySelector(".favorite-form__footer");
  const portTop = root.getBoundingClientRect().top + root.clientTop;
  const portBottom = portTop + root.clientHeight;
  const footerTop = footer ? Math.min(footer.getBoundingClientRect().top, portBottom) : portBottom;
  const slotRect = slot.getBoundingClientRect();
  const fieldRect = target instanceof HTMLElement ? target.getBoundingClientRect() : null;
  const margin = DIALOG_SCROLL_MARGIN_PX;
  const slotDown = slotRect.bottom + margin - footerTop; // > 0: the slot is under the footer
  let delta;
  if (fieldRect && slotRect.bottom - fieldRect.top + 2 * margin <= footerTop - portTop) {
    const fieldLimit = Math.floor(fieldRect.top - margin - portTop); // the most the dialog may scroll down before the field leaves the top
    delta = Math.min(Math.max(0, Math.ceil(slotDown)), fieldLimit);
  } else if (slotDown > 0) {
    delta = Math.ceil(slotDown);
  } else {
    delta = Math.min(0, slotRect.top - margin - portTop);
  }
  if (delta !== 0) root.scrollTop = root.scrollTop + delta;
}

const LAYOUT_RESET_MESSAGE = "Your layout was reset in another tab.";
const LAYOUT_RESTORE_FAILED_MESSAGE = "Couldn't restore your layout. Reload this tab.";

// The storage was cleared in another tab when a state has no Settings tile (docs/stale-tab-empty-state.md,
// docs/stale-tab-recovery-followups.md decision 1): heal it like a fresh install with `ensureWidgetsLayout` for the first screen of NOW
// (the one exception to "first screen read once at boot") and read the state again, also when nothing was written (another tab
// may have healed in between). `state` is the re-read result, else the input; `healed`: the final state has Settings; `failed`:
// it has none (a failed write or read; a reload heals it). A null or a healthy input is returned untouched. Never throws.
async function healClearedDesk(state) {
  if (!state || state.items.some((item) => item.id === SETTINGS_TILE_ID)) return { state, healed: false, failed: false };
  let result = state;
  try {
    await ensureWidgetsLayout(syncStorageArea, { screen: firstScreen() });
    result = await widgetsService.getState();
  } catch {
    // keep what we have: the grid stays as it is until a reload
  }
  const healed = result.items.some((item) => item.id === SETTINGS_TILE_ID);
  if (healed) await dropCityClearedElsewhere();
  return { state: result, healed, failed: !healed };
}

// After a heal of a cleared storage a city kept in this tab's memory is stale when the storage has none: drop it like a reload would
// (the "city removed elsewhere" path of the retry: the hint tile takes the metric cells). A throw while reading keeps the city (as at
// boot); a location still stored (only the widget keys were lost) stays. Never throws.
async function dropCityClearedElsewhere() {
  if (!weatherLocationStore || !weatherLocation) return;
  let stored;
  try {
    stored = await weatherLocationStore.getLocation();
  } catch {
    return;
  }
  if (stored) return;
  weatherGeneration += 1;
  weatherRetryToken += 1;
  weatherUi = resetWeatherRetry(weatherUi);
  clearTimeout(weatherRetryTimer);
  weatherResult = { status: "no-location", location: null, data: null, error: null };
  weatherLocation = null;
  weatherLocationError = "";
}

// A failed heal leaves no Settings to leave edit mode with and nothing to act on: drop edit mode and every transient layer (not
// `setEditMode(false)`: it announces and clears the status), keep the live region quiet (the alert speaks once). Any open dialog is
// closed first, without restoring focus (`#favorites` is inert while one is open and the opener tile does not exist).
function leaveEditModeAfterFailedHeal() {
  if (desktopDialogRoot) closeDesktopDialog({ restoreFocusTo: null });
  desktopUi = exitEditMode(desktopUi);
  cancelDrag();
  closeAddMenu();
  hideTooltip();
  announce("");
}

// After the render of a failed heal: focus the desk container (never body) and say what to do, persistently.
function showLayoutRestoreFailure() {
  if (favoritesRoot) {
    favoritesRoot.setAttribute("tabindex", "-1");
    favoritesRoot.focus({ preventScroll: true });
  }
  showDesktopStatus(LAYOUT_RESTORE_FAILED_MESSAGE, { persist: true });
  if (!desktopStatus) return;
  const reload = createNode("button", "button desktop-status__reload", "Reload");
  reload.type = "button";
  reload.addEventListener("click", () => location.reload());
  desktopStatus.append(reload);
  layoutFailureChipShown = true;
}

// Escape on the failure chip: hide it; if focus was inside (on Reload) it returns to the desk container, never to body.
function dismissLayoutFailureChip() {
  const focusWasInside = Boolean(desktopStatus?.contains(document.activeElement));
  showDesktopStatus("");
  if (focusWasInside && favoritesRoot) {
    favoritesRoot.setAttribute("tabindex", "-1");
    favoritesRoot.focus({ preventScroll: true });
  }
}

// A stale tab touched a link that another tab deleted (docs/stale-link-and-host-contrast.md decision 2). All under the busy
// lock: forget a pending drop, note where focus should go (the DOM still has the tile), re-read storage, end the busy state with
// one render from the fresh state, close the dialog or restore focus, say so in the alert status. Never throws.
// The re-read writes nothing, except when it finds no Settings tile (`healClearedDesk`): the desk is healed, the message says the
// layout was reset and focus goes to Settings (the neighbour list was read from the old DOM and would find a just-created tile
// first); a failed heal ends in `showLayoutRestoreFailure`.
async function recoverFromGoneLink(generation, error) {
  pendingDrop = null;
  let neighbours = error.id ? neighborTargets(error.id) : [SETTINGS_TILE_ID];
  let fresh = null;
  try {
    fresh = await widgetsService.getState();
  } catch {
    // keep the old state: the message below is still shown
  }
  const outcome = await healClearedDesk(fresh);
  fresh = outcome.state;
  if (outcome.healed) neighbours = [SETTINGS_TILE_ID];
  if (outcome.failed) leaveEditModeAfterFailedHeal();
  finishFavoritesAction(generation, () => {
    if (fresh) widgetsState = fresh;
  });
  if (outcome.failed) {
    showLayoutRestoreFailure();
    return;
  }
  if (desktopDialogRoot) closeDesktopDialog({ restoreFocusTo: neighbours, reveal: true });
  else focusWidgetTarget(neighbours, { preventScroll: true, reveal: true });
  if (outcome.healed) showDesktopStatus(LAYOUT_RESET_MESSAGE, { tone: "info" });
  else showDesktopStatus(error.message);
}

// Every explicit mutation goes through here. On failure nothing is persisted and the UI returns to the stored state.
// `renderPending: false` skips the busy re-render (a drop keeps its tile on the target while the write runs);
// `onFailure(message)` then owns the failure UI instead of the immediate re-render.
async function runDesktopMutation(action, { dialogRoot = null, renderPending = true, onFailure = null } = {}) {
  if (favoritesBusy) return false;
  showDesktopStatus("");
  const slot = dialogRoot?.querySelector("[data-dialog-error]");
  if (slot) {
    slot.textContent = "";
    slot.hidden = true;
    for (const input of dialogRoot.querySelectorAll('[aria-invalid="true"]')) {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }
  const generation = startFavoritesAction({ render: renderPending });
  try {
    const next = await action(currentColumns());
    // a state without Settings means the write landed in a storage another tab had cleared (an Add link): heal it, the new link stays
    const outcome = await healClearedDesk(next);
    if (outcome.failed) leaveEditModeAfterFailedHeal();
    finishFavoritesAction(generation, () => {
      widgetsState = outcome.state;
    });
    if (outcome.failed) showLayoutRestoreFailure();
    else if (outcome.healed) showDesktopStatus(LAYOUT_RESET_MESSAGE, { tone: "info" });
    return true;
  } catch (error) {
    if (error?.code === "link-gone") {
      await recoverFromGoneLink(generation, error);
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (onFailure) {
      setFavoritesBusy(false);
      if (generation === favoritesGeneration) onFailure(message);
      return false;
    }
    finishFavoritesAction(generation, () => {});
    if (dialogRoot?.isConnected) showDialogError(dialogRoot, message, error?.field);
    else showDesktopStatus(message);
    return false;
  }
}

const SETTINGS_TILE_SELECTOR = '[data-widget-id="chrome:settings"]';
const SETTINGS_TILE_ID = "chrome:settings";

function viewportWidth() {
  return document.documentElement.clientWidth;
}

function currentColumns() {
  return effectiveColumns(viewportWidth());
}

// The first screen of this boot (docs/vertically-centered-defaults.md decision 2): the same rows the drag uses for its drop area
// (`viewportRows` of the same two inputs) and the page's column count. Read right before `ensureWidgetsLayout` at boot, and again by `healClearedDesk` when it heals a cleared storage; nowhere else.
function firstScreen() {
  return { rows: viewportRows(document.documentElement.clientHeight, viewportWidth()), columns: currentColumns() };
}

// R4: metrics come from JS so the column count and the cell size can never disagree at a breakpoint.
function applyGridMetrics() {
  const metrics = gridMetrics(viewportWidth());
  const style = document.documentElement.style;
  style.setProperty("--cell-size", `${metrics.cell}px`);
  style.setProperty("--grid-gap", `${metrics.gap}px`);
  style.setProperty("--grid-pad", `${metrics.pad}px`);
  document.documentElement.dataset.cell = String(metrics.cell); // CSS keys the weather type size off the same cell
  return metrics;
}

function placeTile(node, cell) {
  node.style.setProperty("--x", String(cell.x));
  node.style.setProperty("--y", String(cell.y));
  node.style.setProperty("--w", String(cell.w));
  node.style.setProperty("--h", String(cell.h));
  node.dataset.w = String(cell.w);
  node.dataset.h = String(cell.h);
}

function focusedWidgetId() {
  const active = document.activeElement instanceof Element ? document.activeElement : null;
  const owner = active && favoritesRoot.contains(active) ? active.closest("[data-widget-id], [data-remove-for]") : null;
  return owner ? { id: owner.dataset.widgetId ?? owner.dataset.removeFor, badge: "removeFor" in owner.dataset } : null;
}

// A focused − badge disappears when edit mode exits: focus then falls back to the Settings tile, never to <body>.
function restoreFocus(target) {
  if (!target || (document.activeElement && document.activeElement !== document.body)) return;
  const selector = target.badge ? `[data-remove-for="${CSS.escape(target.id)}"]` : `[data-widget-id="${CSS.escape(target.id)}"]`;
  suppressTooltipOnFocus = true;
  try {
    const node = favoritesRoot.querySelector(selector) ?? (target.badge ? favoritesRoot.querySelector(SETTINGS_TILE_SELECTOR) : null);
    // the node was focused before the re-render replaced it: putting the focus back must not scroll the page (docs/onboarding-wizard-polish.md
    // decision 2: a re-render right after Finish re-focused Settings and scrolled to it)
    node?.focus({ preventScroll: true });
  } finally {
    suppressTooltipOnFocus = false;
  }
}

let renderedColumns = 0;
let renderedCell = 0;

// The only render path: tiles absolutely positioned in the displayed layout (pure function of the stored grids and
// the current column count; never written by a render), in (y, x) DOM order.
function renderDesktop() {
  if (!favoritesRoot) return;
  hideTooltip();
  if (widgetsNewer) {
    favoritesRoot.replaceChildren(createStatus(NEWER_WIDGETS_MESSAGE, { error: true, live: "assertive", full: true }));
    return;
  }
  if (!widgetsState) {
    // Unavailable APIs or a failed read: say so instead of an empty, silently broken page.
    favoritesRoot.replaceChildren(...(favoritesError ? [createStatus(favoritesError, { error: true, live: "assertive", full: true })] : []));
    return;
  }

  const focusTarget = focusedWidgetId();
  // docs/drag-scroll-target.md decision 2a: scrollY is read FIRST (before anything that can force a layout, which would clamp it).
  const scrollY = window.scrollY;
  const metrics = applyGridMetrics();
  const columns = currentColumns();
  renderedColumns = columns;
  renderedCell = metrics.cell;
  const items = widgetsState.items;
  const layout = displayLayout(items, columns);
  const view = weatherService ? effectiveWeatherResult() : undefined;

  const entries = [];
  let hintPlaced = false;
  for (const item of items) {
    const cell = layout.get(item.id);
    if (!cell) continue; // hidden metric: no cell, no tile
    let tile = null;
    if (item.type === "favorite") {
      tile = createFavoriteTile(item, cell);
      applyJustAdded(tile, item.id);
    }
    else if (item.type === "chrome") tile = createChromeTile(item, cell);
    else if (weatherService && view?.status === "no-location") {
      if (!hintPlaced) {
        tile = createCityHintTile(cell, item); // the other metrics wait for a city; their cells stay reserved
        hintPlaced = true;
      }
    } else if (weatherService) tile = createWeatherMetricTile(item, cell, view);
    if (!tile) continue;
    placeTile(tile, cell);
    const nodes = [tile];
    if (desktopUi.editMode && item.type !== "chrome") {
      const badge = createRemoveBadge(item);
      placeTile(badge, { ...cell, w: 1, h: 1 });
      nodes.push(badge);
    }
    entries.push({ cell, nodes });
  }
  entries.sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x);

  const grid = createNode("div", "desktop-grid");
  grid.style.setProperty("--grid-columns", String(columns));
  grid.style.setProperty("--rows", String(Math.max(1, ...entries.map(({ cell }) => cell.y + cell.h))));
  grid.append(...entries.flatMap(({ nodes }) => nodes));
  favoritesRoot.dataset.edit = String(desktopUi.editMode);
  favoritesRoot.replaceChildren(grid);
  // The page keeps the height its scroll position needs after a drag ended (the grid shrank): a bottom-padding term on .desktop,
  // set here before focus or settling can lay out and clamp. Inside the settling the pure formula; outside it can only shrink.
  const holding = dragSettling || dragHoldPx > 0;
  if (holding) {
    favoritesRoot.style.setProperty("--drag-hold", "0px"); // .desktop survives the render: the property is reset explicitly
    const root = document.documentElement;
    const naturalHeight = root.scrollHeight;
    dragHoldPx = pageHoldHeight({
      scrollY, clientHeight: root.clientHeight, naturalHeight, previousHold: dragSettling ? undefined : dragHoldPx
    });
    favoritesRoot.style.setProperty("--drag-hold", `${dragHoldPx}px`);
  }
  restoreFocus(focusTarget);
  if (pendingDrop) {
    const tile = grid.querySelector(`:scope > [data-widget-id="${CSS.escape(pendingDrop.domId)}"]`);
    if (tile) settleTileAt(tile, pendingDrop.id, pendingDrop.cell);
  }
  if (dragSession) reattachDrag();
  if (holding && window.scrollY !== scrollY) window.scrollTo(0, scrollY); // the measurement clamped: put the page back, same task
}

// A resize only re-renders (when the column count or the cell size changed); it never writes.
let resizeFrame = 0;
window.addEventListener("resize", () => {
  cancelDrag(); // Review focus 1: a viewport change cancels an active drag (tile returns, nothing written)
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (!widgetsState || widgetsNewer || renderedColumns === 0) return; // nothing is rendered yet: the first render (after the first-run decision) lays the grid out
    if (currentColumns() !== renderedColumns || gridMetrics(viewportWidth()).cell !== renderedCell) renderFavorites();
    placeAddMenu(); // after the re-render: the Add tile may have moved
  });
});

// ---- Pointer drag (edit mode only). Spec § Drag details, § Placement rules, § DOM order and focus. ----
const DRAG_THRESHOLD_PX = 6;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 12;
const DROP_RETURN_MS = 180;
// { id (widget to move: the metric id for the hint tile), domId (rendered tile), tile, cell, layout, columns, metrics,
//   pointerId, startX, startY, lastX, lastY, baseLeft, baseTop, grab, started, frame, viewportRows, maxY, rows }
let dragSession = null;
let dropReturnTimer = 0;
// Page-height hold (docs/drag-scroll-target.md decision 2): extra px under the grid after a drag ended on a scrolled page, so the
// browser does not clamp scrollY and the dropped tile lands on its outline. `dragSettling` is armed at the end of a started drag
// and disarmed once the render that ends the drop has happened.
let dragHoldPx = 0;
let dragSettling = false;

// A chip that goes away while a drop settles (a write starts by clearing the status) would shorten the page by its reserve
// before the render measures the hold, and the browser would clamp the scroll position first. The hold takes over that room
// in the same task; the render then measures it again from scratch.
function keepHoldAcrossChipRelease() {
  if (!dragSettling) return;
  const root = document.documentElement;
  const reserve = Number.parseFloat(root.style.getPropertyValue("--status-reserve")) || 0;
  if (reserve <= 0) return;
  dragHoldPx += reserve;
  favoritesRoot?.style.setProperty("--drag-hold", `${dragHoldPx}px`);
  root.style.setProperty("--status-reserve", "0px");
}
// One-shot: the click that trails a started drag (same press) is swallowed, so Settings never toggles after a drag.
let suppressDragClick = false;

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const dragGridOf = () => favoritesRoot?.querySelector(".desktop-grid") ?? null;

function beginPointerDrag(event, tile) {
  if (!desktopUi.editMode || event.button !== 0 || !event.isPrimary || dragSession || dropReturnTimer) return;
  if (favoritesBusy || desktopDialogRoot || cityModalRoot || onboardingWizardRoot || !widgetsState) return;
  const grid = dragGridOf();
  if (!grid || tile.parentElement !== grid) return;
  hideTooltip();
  const id = tile.dataset.metricId ?? tile.dataset.widgetId; // the hint tile stands for the first enabled metric
  const columns = currentColumns();
  const layout = displayLayout(widgetsState.items, columns);
  const cell = layout.get(id);
  if (!cell) return; // hidden metrics have no tile and never reach moveWidget
  const metrics = gridMetrics(viewportWidth());
  const origin = grid.getBoundingClientRect();
  const step = metrics.cell + metrics.gap;
  const grabCell = cellFromPoint({ x: event.clientX, y: event.clientY }, origin, metrics);
  const clamp = (v, max) => Math.min(max, Math.max(0, v));
  // The whole first screen is the drop area: `maxY` is the highest top row of the dragged block (maxDropRow), and the
  // drag grid is exactly as high as that area needs (at least the grid at rest), so a drop inside the window never scrolls.
  const screenRows = viewportRows(document.documentElement.clientHeight, viewportWidth());
  const maxY = maxDropRow(layout, id, cell.h, screenRows);
  const occupiedRows = Math.max(0, ...[...layout.values()].map((g) => g.y + g.h));
  dragSession = {
    id, domId: tile.dataset.widgetId, tile, cell, layout, columns, metrics,
    pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY,
    baseLeft: origin.left + cell.x * step, baseTop: origin.top + cell.y * step,
    grab: { x: clamp(grabCell.x - cell.x, cell.w - 1), y: clamp(grabCell.y - cell.y, cell.h - 1) },
    started: false, frame: 0,
    viewportRows: screenRows, maxY,
    rows: Math.max(occupiedRows, maxY + cell.h)
  };
}

const outsideViewport = (event) =>
  event.clientX < 0 || event.clientY < 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;

function onDragPointerMove(event) {
  const s = dragSession;
  if (!s || event.pointerId !== s.pointerId) return;
  if (outsideViewport(event)) {
    cancelDrag(); // the pointer left the window
    return;
  }
  s.lastX = event.clientX;
  s.lastY = event.clientY;
  if (!s.started) {
    if (Math.hypot(event.clientX - s.startX, event.clientY - s.startY) < DRAG_THRESHOLD_PX) return; // still a tap
    s.started = true;
    suppressDragClick = true;
    closeAddMenu();
    hideTooltip();
    desktopUi = startDrag(desktopUi, { id: s.id, grab: s.grab, size: { w: s.cell.w, h: s.cell.h }, pointerId: s.pointerId });
  }
  applyDragVisuals(s);
  if (!s.frame && edgeDirection(s.lastY) !== 0) s.frame = requestAnimationFrame(autoscrollFrame);
}

// Every scroll of the page (wheel, keys, scrollbar, autoscroll): the grid moved under a still pointer, so the target is judged
// again; with no drag it only releases the page-height hold, and only where nothing can clamp (docs/drag-scroll-target.md 1, 2b).
function onWindowScroll() {
  if (dragSession?.started) {
    updateDragTarget(dragSession);
    return;
  }
  if (dragHoldPx === 0) return; // no hold, no drag: nothing to read
  const root = document.documentElement;
  const naturalHeight = root.scrollHeight - dragHoldPx;
  if (!holdReleasable({ scrollY: window.scrollY, clientHeight: root.clientHeight, naturalHeight })) return;
  dragHoldPx = 0;
  favoritesRoot?.style.setProperty("--drag-hold", "0px");
}

function edgeDirection(clientY) {
  if (clientY < AUTOSCROLL_EDGE_PX) return -1;
  if (clientY > window.innerHeight - AUTOSCROLL_EDGE_PX) return 1;
  return 0;
}

// While the pointer stays within 48 px of the top/bottom edge the page scrolls 12 px per frame; the target is
// recomputed from the last pointer position because the grid moved under it.
function autoscrollFrame() {
  const s = dragSession;
  if (!s) return;
  s.frame = 0;
  const direction = edgeDirection(s.lastY);
  if (direction === 0) return;
  const before = window.scrollY;
  window.scrollBy(0, direction * AUTOSCROLL_STEP_PX);
  if (window.scrollY !== before) updateDragTarget(s);
  s.frame = requestAnimationFrame(autoscrollFrame);
}

// The dragged tile is position:fixed under the pointer (it never adds scrollable overflow, so autoscroll ends at
// the page bottom); the grid is as high as the allowed drop area while dragging; the highlight is always inside it.
function applyDragVisuals(s) {
  const grid = dragGridOf();
  if (!grid) return;
  grid.dataset.dragging = "true";
  grid.style.setProperty("--rows", String(s.rows));
  s.tile.classList.add("is-dragging");
  s.tile.style.position = "fixed";
  s.tile.style.left = `${s.baseLeft + s.lastX - s.startX}px`;
  s.tile.style.top = `${s.baseTop + s.lastY - s.startY}px`;
  const badge = grid.querySelector(`[data-remove-for="${CSS.escape(s.id)}"]`);
  if (badge) badge.hidden = true;
  updateDragTarget(s);
}

function updateDragTarget(s) {
  const grid = dragGridOf();
  if (!grid) return;
  const box = grid.getBoundingClientRect();
  // The pointer anywhere in the window (margins, above the grid, below the allowed rows) targets the nearest allowed
  // cell; only an occupied cell is invalid. The clamp is part of the target, so the outline is drawn where it is judged.
  const target = clampDropCell(cellFromPoint({ x: s.lastX, y: s.lastY }, box, s.metrics, s.grab), s.cell, s.columns, s.maxY);
  const valid = canPlace(s.layout, s.id, { ...target, w: s.cell.w, h: s.cell.h }, s.columns, s.viewportRows);
  desktopUi = updateDrag(desktopUi, target, valid);
  drawDropHighlight(grid, target, s, valid);
}

// The outline is drawn at the judged cell, always (the target is already inside the grid), never moved to another one.
function drawDropHighlight(grid, target, s, valid) {
  let highlight = grid.querySelector(":scope > .drop-highlight");
  if (!highlight) {
    highlight = createNode("div", "drop-highlight");
    highlight.setAttribute("aria-hidden", "true");
    grid.prepend(highlight);
  }
  highlight.dataset.valid = String(valid);
  highlight.style.setProperty("--x", String(target.x));
  highlight.style.setProperty("--y", String(target.y));
  highlight.style.setProperty("--w", String(s.cell.w));
  highlight.style.setProperty("--h", String(s.cell.h));
}

function stopDragFrame(s) {
  if (s?.frame) cancelAnimationFrame(s.frame);
  if (s) s.frame = 0;
}

// A re-render while dragging (e.g. weather data arrived) replaced the tiles: pick up the new node and redraw.
function reattachDrag() {
  const s = dragSession;
  const tile = favoritesRoot?.querySelector(`.desktop-grid > [data-widget-id="${CSS.escape(s.domId)}"]`);
  if (!tile || !desktopUi.editMode) {
    stopDragFrame(s);
    dragSession = null;
    desktopUi = endDrag(desktopUi);
    return;
  }
  s.tile = tile;
  if (s.started) applyDragVisuals(s);
}

function focusDragTile(domId) {
  const tile = favoritesRoot?.querySelector(`.desktop-grid > [data-widget-id="${CSS.escape(domId)}"]`);
  if (!(tile instanceof HTMLElement)) return;
  suppressTooltipOnFocus = true;
  try {
    tile.focus();
  } finally {
    suppressTooltipOnFocus = false;
  }
}

async function onDragPointerUp(event) {
  const s = dragSession;
  if (!s || event.pointerId !== s.pointerId) return;
  dragSession = null;
  stopDragFrame(s);
  if (!s.started) return; // below the threshold it is a tap: the click handler runs as before
  updateDragTarget(s); // a release in the same frame as a scroll: judge the page as it is now, from the last pointer position
  dragSettling = true;
  const drag = desktopUi.drag;
  desktopUi = endDrag(desktopUi);
  const target = drag?.target;
  if (drag?.valid && target && (target.x !== s.cell.x || target.y !== s.cell.y)) {
    await commitDrop(s, target);
    return;
  }
  if (drag?.valid) {
    renderFavorites(); // dropped on its own cell: nothing to write
    dragSettling = false;
    focusDragTile(s.domId);
    return;
  }
  returnDraggedTile(s); // rejected drop: the tile animates back, nothing is written
}

// The tile stays where it was dropped while the write runs: no busy re-render (it would rebuild the old layout and
// snap the tile to its origin). Success settles it on the committed cell; any failure animates it back.
let pendingDrop = null; // { domId, id, cell } — re-applied by renderDesktop while the write is pending

async function commitDrop(s, target) {
  if (favoritesBusy) {
    returnDraggedTile(s); // another write is running: nothing is sent, the tile goes back
    return;
  }
  const cell = { x: target.x, y: target.y, w: s.cell.w, h: s.cell.h };
  pendingDrop = { domId: s.domId, id: s.id, cell };
  settleTileAt(s.tile, s.id, cell);
  try {
    const ok = await runDesktopMutation(
      (columns) => widgetsService.moveWidget(s.id, { x: target.x, y: target.y }, { columns, viewportRows: s.viewportRows }),
      {
        renderPending: false,
        onFailure: (message) => {
          pendingDrop = null;
          showDesktopStatus(message); // #desktop-status, role=alert; edit mode stays on
          returnDraggedTile(s);
        }
      }
    );
    pendingDrop = null;
    if (ok) {
      dragSettling = false;
      focusDragTile(s.domId);
    } else if (!dropReturnTimer) {
      if (s.tile.isConnected && s.tile.classList.contains("is-settled")) returnDraggedTile(s);
      else dragSettling = false; // recovered from a gone link (already rendered) or the return already finished
    }
  } finally {
    if (!dropReturnTimer) dragSettling = false; // never left armed by a throw; the animated return clears it in its finish
  }
}

// Puts the dropped tile (and its badge) on `cell` inside the grid, out of the fixed drag state.
function settleTileAt(tile, id, cell) {
  const grid = dragGridOf();
  grid?.querySelector(":scope > .drop-highlight")?.remove();
  tile.classList.remove("is-dragging");
  tile.classList.add("is-settled");
  tile.style.position = "";
  tile.style.left = "";
  tile.style.top = "";
  placeTile(tile, cell);
  const badge = grid?.querySelector(`[data-remove-for="${CSS.escape(id)}"]`);
  if (badge) {
    placeTile(badge, { ...cell, w: 1, h: 1 });
    badge.hidden = false;
  }
}

function returnDraggedTile(s) {
  dragGridOf()?.querySelector(":scope > .drop-highlight")?.remove();
  const finish = () => {
    dropReturnTimer = 0;
    renderFavorites();
    dragSettling = false;
    focusDragTile(s.domId);
  };
  const grid = dragGridOf();
  if (prefersReducedMotion() || !grid || !s.tile.isConnected) {
    finish();
    return;
  }
  // Start from where the tile is now (under the pointer, or settled on the drop cell) and slide to its origin.
  const from = s.tile.getBoundingClientRect();
  s.tile.classList.remove("is-settled");
  s.tile.classList.add("is-returning");
  s.tile.style.position = "fixed";
  s.tile.style.left = `${from.left}px`;
  s.tile.style.top = `${from.top}px`;
  void s.tile.offsetWidth; // commit the start position so the transition runs
  const origin = grid.getBoundingClientRect();
  const step = s.metrics.cell + s.metrics.gap;
  s.tile.style.left = `${origin.left + s.cell.x * step}px`;
  s.tile.style.top = `${origin.top + s.cell.y * step}px`;
  dropReturnTimer = setTimeout(finish, DROP_RETURN_MS);
}

// Escape, pointercancel, window blur, the pointer leaving the window, a viewport resize, leaving edit mode.
function cancelDrag() {
  suppressDragClick = false; // a cancelled press never leaves a click-swallowing flag behind
  const s = dragSession;
  if (!s) return;
  dragSession = null;
  stopDragFrame(s);
  if (!s.started) return; // a pending press had changed nothing on screen
  desktopUi = endDrag(desktopUi);
  dragSettling = true;
  renderFavorites();
  dragSettling = false;
}

function tabTrapFocusables(trapRoot) {
  const controls = [...trapRoot.querySelectorAll('input, button:not([role="option"])')].filter((el) => {
    if (el.disabled || el.hidden) return false;
    for (let node = el; node !== trapRoot; node = node.parentElement) {
      if (!node) return false;
      if (node.inert || node.hidden) return false;
    }
    return true;
  });
  if (controls.length === 0 && weatherBusy) {
    // Busy with every control disabled: the title (tabindex -1) is the one tab stop.
    const titleSelector =
      trapRoot === onboardingWizardRoot && onboardingStep === 1
        ? "#onboarding-step1-title"
        : trapRoot === cityModalRoot
          ? "#city-modal-title"
          : null;
    const title = titleSelector ? trapRoot.querySelector(titleSelector) : null;
    if (title instanceof HTMLElement) return [title];
  }
  return controls;
}

function applyPendingFocus() {
  if (!pendingFocus || favoritesBusy) {
    return;
  }

  const selectors = pendingFocus;
  const preventScroll = selectors.preventScroll === true;
  pendingFocus = null;

  for (const selector of selectors) {
    const target = document.querySelector(selector); // an opener may live in a desktop dialog, outside the grid
    if (target instanceof HTMLElement && !target.matches(":disabled")) {
      target.focus({ preventScroll });
      return;
    }
  }
}

function setEditMode(on) {
  if (!on) {
    cancelDrag();
    closeAddMenu();
  }
  hideTooltip();
  const before = desktopUi.editMode;
  desktopUi = on ? enterEditMode(desktopUi) : exitEditMode(desktopUi);
  if (desktopUi.editMode === before) return;
  showDesktopStatus("");
  announce(desktopUi.editMode ? "Editing layout. Activate Settings to finish." : "Layout editing off");
  renderFavorites();
}

function renderFavorites() {
  renderDesktop();
  applyPendingFocus();
  scheduleDeferredDeskRefresh();
}
function setFavoritesBusy(nextBusy) {
  favoritesBusy = nextBusy;
}

function startFavoritesAction({ render = true } = {}) {
  favoritesGeneration += 1;
  setFavoritesBusy(true);
  if (render) renderFavorites();
  return favoritesGeneration;
}

function finishFavoritesAction(generation, applyResult) {
  setFavoritesBusy(false);

  if (generation !== favoritesGeneration) {
    return;
  }

  applyResult();
  renderFavorites();
}

if (favoritesRoot) {
  void (async () => {
    if (!widgetsService) {
      favoritesError = "Chrome APIs for the grid are unavailable.";
      renderFavorites();
      return;
    }

    // Bootstrap order: early `newer` check, then ensure, then the first read. A `newer` meta (another device or a rollback)
    // is never written: the grid is locked read-only. A rejected early read is not fatal (rawMeta = {}): it fails again in
    // getState, whose catch shows the storage error, and ensureWidgetsLayout has its own catch.
    let rawMeta = {};
    try {
      if (hasStorageArea(syncStorageArea)) rawMeta = await syncStorageArea.get(WIDGETS_META_KEY);
    } catch {
      rawMeta = {};
    }
    if (inspectWidgetsMeta(rawMeta) === "newer") {
      widgetsNewer = true;
      renderFavorites();
      return;
    }

    if (hasStorageArea(syncStorageArea)) {
      try {
        await ensureWidgetsLayout(syncStorageArea, { screen: firstScreen() });
      } catch {
        widgetsEnsureFailed = true;
      }
    }

    try {
      widgetsState = await widgetsService.getState();
    } catch (error) {
      favoritesError = error instanceof Error ? error.message : String(error);
      renderFavorites();
      return;
    }

    if (weatherLocationStore) {
      try {
        weatherLocation = await weatherLocationStore.getLocation();
      } catch (error) {
        weatherLocationError = weatherErrorMessage(error);
      }
      weatherLocationKnown = true;
    }

    // One decision point, before the first render: no tile is painted before the wizard when it opens (docs/onboarding-wizard.md).
    // Local flags are read only when every other input already allows the wizard; an exception here means no wizard and no veil.
    try {
      if (onboardingWizardPossible(promptLiveState()) && localStorageArea) {
        const flags = await readOnboardingLocalFlags(localStorageArea);
        maybeShowOnboardingWizard(flags);
      }
    } catch {
      // the automatic wizard is best-effort; a failure must not surface as an unhandled rejection or block the render
    }

    renderFavorites();
    if (widgetsEnsureFailed) showDesktopStatus(ENSURE_FAILED_MESSAGE, { persist: true });
    void startWeather();
  })();

  // Normal mode: a link tile opens its URL, the hint tile opens the city modal. A click on the background does
  // nothing. The chrome tiles (Settings, Add) render but are wired by the edit-mode and add-link tasks.
  function handleFavoritesClick(event) {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (event.target.closest('[data-chrome-role="settings"]')) {
      if (widgetsState && !widgetsNewer) setEditMode(!desktopUi.editMode);
      return;
    }

    // Add: the add-link dialog, or in edit mode with a hidden metric the Add menu.
    if (event.target.closest(ADD_TILE_SELECTOR)) {
      activateAddTile();
      return;
    }

    if (desktopUi.editMode) {
      handleEditModeClick(event.target);
      return;
    }

    const target = event.target.closest("[data-favorite-action]");

    if (!(target instanceof HTMLElement) || favoritesBusy) {
      return;
    }

    const action = target.dataset.favoriteAction;

    if (action === "set-city") {
      if (!weatherBusy) showCityModal("change", HINT_TILE_SELECTOR);
    } else if (action === "retry-weather") {
      void retryWeather();
    } else if (action === "open") {
      const favorite = widgetsState?.items.find(
        (item) => item.id === target.dataset.favoriteId
      );

      if (favorite) {
        window.location.assign(favorite.url);
      }
    }
  }

  favoritesRoot.addEventListener("click", handleFavoritesClick);

  // Background = the grid element or the root itself (gaps between tiles are background). A click needs pointerdown
  // AND pointerup on the background, so releasing a drag over it never exits.
  // Only a primary-button press of the primary pointer counts (a right click on the background never exits).
  const isBackground = (target) => target === favoritesRoot || (target instanceof Element && target.classList.contains("desktop-grid"));
  const isPrimaryPress = (event) => event.button === 0 && event.isPrimary;
  let backgroundPressed = false;
  favoritesRoot.addEventListener("pointerdown", (event) => {
    backgroundPressed = desktopUi.editMode && event !== addMenuDismissPress && isPrimaryPress(event) && isBackground(event.target);
  });
  favoritesRoot.addEventListener("pointerup", (event) => {
    if (backgroundPressed && isPrimaryPress(event) && isBackground(event.target) && !desktopUi.drag) setEditMode(false);
    backgroundPressed = false;
  });
  favoritesRoot.addEventListener("pointercancel", () => {
    backgroundPressed = false;
  });

  // Drag: a press on a tile (never on a − badge, which is a sibling of its tile) may become a drag.
  favoritesRoot.addEventListener("pointerdown", (event) => {
    const tile = event.target instanceof Element ? event.target.closest("[data-widget-id]") : null;
    if (tile instanceof HTMLElement && !event.target.closest(".tile-remove")) beginPointerDrag(event, tile);
  });
  // Native image drag would steal the pointer (pointercancel) in edit mode.
  favoritesRoot.addEventListener("dragstart", (event) => {
    if (desktopUi.editMode) event.preventDefault();
  });
  window.addEventListener("pointermove", onDragPointerMove);
  window.addEventListener("scroll", onWindowScroll, { passive: true });
  window.addEventListener("pointerup", (event) => {
    void onDragPointerUp(event);
    // The trailing click of this press (if any) is dispatched before this timeout runs; clear the flag after it.
    if (suppressDragClick) setTimeout(() => { suppressDragClick = false; }, 0);
  });
  window.addEventListener("pointercancel", (event) => {
    if (dragSession && event.pointerId === dragSession.pointerId) cancelDrag();
    if (suppressDragClick) setTimeout(() => { suppressDragClick = false; }, 0);
  });
  // The pointer left the window (relatedTarget null and the point is outside the viewport).
  document.addEventListener("pointerout", (event) => {
    if (dragSession && event.relatedTarget === null && outsideViewport(event)) cancelDrag();
  });
  window.addEventListener("blur", () => {
    backgroundPressed = false;
    cancelDrag();
    suppressDragClick = false;
  });
  // A tab shown again and the network coming back refresh due weather (retryWeather, automatic); registered once, no timers.
  document.addEventListener("visibilitychange", onTabVisibilityChange);
  window.addEventListener("online", onBrowserOnline);
  // Every new press starts clean, so a flag stranded by a lost release can never swallow the next click.
  window.addEventListener(
    "pointerdown",
    () => {
      suppressDragClick = false;
    },
    true
  );
  window.addEventListener(
    "click",
    (event) => {
      // Only a pointer click (detail > 0) is the trailing click of a drag; keyboard activation is never swallowed.
      if (!suppressDragClick || event.detail === 0) return;
      suppressDragClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  // One Escape handler, topmost layer first: tooltip, city suggestions, city modal.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    // One layer per press, topmost first (desktopUiState.escapeLayer); the DOM-owned flags come from here.
    const layer = escapeLayer(desktopUi, {
      tooltip: !tooltipLayer.hidden,
      citySuggestions: isSuggestionsOpen(weatherUi) && Boolean(onboardingWizardRoot ?? cityModalRoot),
      onboardingWizard: Boolean(onboardingWizardRoot),
      cityModal: Boolean(cityModalRoot),
      status: layoutFailureChipShown
    });
    if (layer === "drag") {
      event.preventDefault();
      cancelDrag();
      return;
    }
    if (layer === "tooltip") {
      hideTooltipIfVisible();
    } else if (layer === "citySuggestions") {
      activeCityForm?.cancelPending();
      weatherUi = hideSuggestions(weatherUi);
      activeCityForm?.renderSuggestions();
      activeCityForm?.focusField();
    } else if (layer === "onboardingWizard") {
      if (event.repeat) return;
      if (weatherBusy || favoritesBusy) return;
      if (onboardingStep === 1) {
        goToOnboardingStep2();
        return;
      }
      if (!onboardingStep2ActionsAllowed()) return;
      void finishOnboardingWizard();
    } else if (layer === "cityModal") {
      // While a city request runs Escape does nothing at all (I1).
      if (!weatherBusy) hideCityModal();
    } else if (layer === "dialog") {
      if (!favoritesBusy) closeDesktopDialog();
    } else if (layer === "menu") {
      closeAddMenu({ focusAdd: true });
    } else if (layer === "exitEdit") {
      setEditMode(false);
    } else if (layer === "status") {
      dismissLayoutFailureChip();
    }
  });

  // Tab inside the open modal wraps; from body or outside it enters the modal (I3).
  document.addEventListener("keydown", (event) => {
    const trapRoot = onboardingWizardRoot ?? cityModalRoot ?? desktopDialogRoot;
    if (event.key !== "Tab" || !trapRoot) return;
    const controls = tabTrapFocusables(trapRoot);
    if (controls.length === 0) {
      event.preventDefault(); // busy: nothing to enter, focus stays on body and never leaves the page
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (!(active instanceof Element) || !trapRoot.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

const CITY_INPUT_SELECTOR = 'input[name="city"]';
const HINT_TILE_SELECTOR = '[data-widget-id="weather:hint"]';

async function startWeather() {
  if (!weatherService) {
    return;
  }

  const generation = weatherGeneration;
  let result;
  try {
    result = await withTimeout(weatherService.initialize());
  } catch (error) {
    result = {
      status: "error",
      location: null,
      data: null,
      error: weatherErrorMessage(error)
    };
  }

  // A city chosen while the first load was in flight already produced a newer result.
  if (generation !== weatherGeneration) {
    return;
  }

  weatherResult = result;
  if (result.location) {
    weatherLocation = result.location;
    weatherLocationError = "";
  }
  renderFavorites();
}

// One attempt for every tile, through the unchanged service (`initialize()` re-reads the city, serves a cache another tab refreshed,
// or fetches). Two ways in. Manual: a press on an error or stale tile (normal mode), `retryWeather()`. Automatic
// (docs/tab-return-refresh.md): the tab became visible again or the browser reported `online`; it starts only if the shown weather is
// due (`weatherRefreshDue`: an error, a stale result, or a ready one 30 minutes old or more) and `ignorePause` lets `online` start inside
// the 3 s pause. Both share the in-flight guard and the pause (weatherUiState), so they can never run in parallel. The same 15 s guard as
// a city change. A thrown or timed-out attempt never replaces the tiles' result. The call to the service is not cancellable: the answer of
// a timed-out attempt may still arrive and write the cache (docs/tab-return-refresh.md, Accepted exception 17), and the tiles do not change
// then; the token only drops the answer of an attempt that a newer attempt, a city change or a heal has superseded. The automatic attempt
// is silent: it never writes the status line, never announces, and a ready tile (which has no retry control, so no busy state) is not
// rendered at its start.
async function retryWeather({ automatic = false, ignorePause = false } = {}) {
  if (!weatherService) return;
  const shown = effectiveWeatherResult();
  const due = automatic ? weatherRefreshDue(shown, Date.now()) : shown?.status === "error" || shown?.status === "stale";
  if (!due) return;
  const started = startWeatherRetry(weatherUi, Date.now(), { ignorePause });
  if (started === weatherUi) return;
  // Automatic only; read before the first render (a render recreates the tile): where the focus is as the attempt starts decides whether
  // the `gone` outcome moves it to the hint tile.
  const focusWasOnWeatherTile = automatic && document.activeElement instanceof Element && document.activeElement.closest(".weather-tile") !== null;
  weatherUi = started;
  clearTimeout(weatherRetryTimer);
  const token = ++weatherRetryToken;
  weatherGeneration += 1; // supersedes a boot load that is still in flight (a failed city read leaves one running)
  const generation = weatherGeneration;
  const silentStart = automatic && shown?.status === "ready";
  if (!silentStart) renderFavorites();

  let result = null;
  let outcome;
  try {
    result = await withTimeout(weatherService.initialize());
    outcome = weatherRetryOutcome(result);
  } catch (error) {
    outcome = { failed: weatherErrorMessage(error) };
  }
  if (token !== weatherRetryToken || generation !== weatherGeneration) return;

  if (outcome === "gone") {
    // The city was removed elsewhere: the hint tile takes the metric cells; nothing is announced.
    weatherUi = resetWeatherRetry(weatherUi);
    weatherRetryToken += 1;
    weatherResult = result;
    weatherLocation = null;
    weatherLocationError = "";
    clearTimeout(weatherRetryTimer);
    if (!automatic && !desktopStatusPersistent) showDesktopStatus(""); // a failure text of an earlier attempt would now contradict the hint tile
    renderFavorites();
    const active = document.activeElement;
    if ((!automatic || focusWasOnWeatherTile) && (!active || active === document.body)) favoritesRoot?.querySelector(HINT_TILE_SELECTOR)?.focus();
    return;
  }

  const failed = typeof outcome === "object";
  weatherUi = finishWeatherRetry(weatherUi, Date.now(), !failed);
  // The service's own answer replaces the result, except that a failed read never downgrades a tile that still has data
  // (a stale one, or a ready one that an automatic attempt could not refresh).
  const downgrade = failed && result?.status === "error" && weatherResult?.data;
  const replaced = Boolean(result) && !downgrade;
  if (replaced) {
    weatherResult = result;
    if (result.location) {
      weatherLocation = result.location;
      weatherLocationError = "";
    }
  }
  if (!failed) weatherLocationError = "";
  if (!silentStart || replaced) renderFavorites(); // a ready tile that an attempt did not change is not redrawn

  if (failed) {
    if (!automatic) {
      if (desktopStatusPersistent) {
        announce(outcome.failed); // the ensure message keeps the status line; the failure is spoken once
      } else {
        showDesktopStatus(""); // clear first so an identical text is announced again
        showDesktopStatus(outcome.failed);
      }
    }
    clearTimeout(weatherRetryTimer);
    weatherRetryTimer = setTimeout(endWeatherRetryCooldown, Math.max(0, weatherUi.retry.availableAt - Date.now()) + 10);
  } else if (!automatic) {
    if (!desktopStatusPersistent) showDesktopStatus(""); // an earlier failure text would now contradict the tiles
    announce("Weather updated");
  }
}

// The two triggers of an automatic attempt (docs/tab-return-refresh.md decisions 1 and 4). Both return at once unless the tab is visible:
// a change to hidden does nothing, and a hidden tab starts no request. A return does not try while the browser says it is offline (the
// `online` event comes later); `online` ignores the 3 s pause after a failed attempt (the network has just come back). The visibility is
// read only from document.visibilityState; there are no timers.
function onTabVisibilityChange() {
  if (document.visibilityState !== "visible") return;
  if (navigator.onLine !== false) void retryWeather({ automatic: true });
  void refreshDeskOnReturn();
}

function onBrowserOnline() {
  if (document.visibilityState !== "visible") return;
  void retryWeather({ automatic: true, ignorePause: true });
}

// ---- the grid re-read on a return of the tab (docs/tab-return-refresh.md decisions 5 to 7) ------------------------------------------
// The one pure decision (desktopUiState.deskRefreshDecision) for the state this tab shows now: skip, pending, again or apply.
function currentDeskDecision(startedFrom) {
  return deskRefreshDecision({
    hasState: Boolean(widgetsService) && widgetsState !== null,
    locked: widgetsNewer,
    drawn: renderedColumns > 0,
    blocker: deskRefreshBlocker(desktopUi, { cityModal: Boolean(cityModalRoot), onboardingWizard: Boolean(onboardingWizardRoot), busy: favoritesBusy, dragSettling }),
    startedFrom,
    current: widgetsState
  });
}

// Reads the widgets state from storage again and shows it, unless a layer is up (then it waits, see scheduleDeferredDeskRefresh). One re-read
// at a time; a return that comes while one runs makes exactly one more after it. The reads take no lock and no timer; a failed read of any kind
// (a rejection, or a synchronous throw of a lost extension context) ends it silently; a `newer` or `invalid` meta is left alone; an equal state
// draws nothing; a state without Settings (another tab cleared the storage) is healed under the busy lock, which is the only write it makes.
async function refreshDeskOnReturn() {
  const startedFrom = widgetsState;
  const entry = currentDeskDecision(startedFrom);
  if (entry === "skip") return;
  if (entry === "pending") {
    deskRefreshPending = true;
    return;
  }
  if (deskRefreshRunning) {
    deskRefreshQueued = true;
    return;
  }
  deskRefreshRunning = true;
  deskRefreshPending = false; // the start consumes the pending flag; the decision after the reads may set it again
  try {
    let rawMeta;
    try {
      rawMeta = await syncStorageArea.get(WIDGETS_META_KEY);
    } catch {
      return;
    }
    const kind = inspectWidgetsMeta(rawMeta);
    if (kind === "newer" || kind === "invalid") return;
    let fresh;
    try {
      fresh = await widgetsService.getState();
    } catch {
      return;
    }
    // A layer that the user opened during a slow read wins, and a state that this tab changed meanwhile is newer than the read: either way the
    // result is thrown away (nothing was written, so nothing is lost).
    const next = currentDeskDecision(startedFrom);
    if (next === "pending") {
      deskRefreshPending = true;
      return;
    }
    if (next === "again") {
      deskRefreshQueued = true;
      return;
    }
    if (next !== "apply") return;
    if (fresh.items.some((item) => item.id === SETTINGS_TILE_ID)) applyReadDesk(fresh);
    else await healReadDesk(fresh);
  } finally {
    deskRefreshRunning = false;
    const queued = deskRefreshQueued;
    deskRefreshQueued = false;
    if (queued) void refreshDeskOnReturn();
  }
}

// A healthy state, synchronously (nothing may change between the decision and the render): equal means nothing happens, no DOM change at all;
// a different one is the one render of the stored grids for the window's size now. If focus was on a tile that the new state no longer has, it
// goes to its neighbour by the rule of a deleted tile, read from the old DOM before the render, without scrolling; focus anywhere else stays.
function applyReadDesk(fresh) {
  if (isSameValue(fresh, widgetsState)) return;
  const focused = focusedWidgetId();
  const neighbours = focused && !focused.badge ? neighborTargets(focused.id) : null;
  widgetsState = fresh;
  renderFavorites();
  if (neighbours && (!document.activeElement || document.activeElement === document.body)) focusWidgetTarget(neighbours, { preventScroll: true });
}

// A state without Settings: the heal of recoverFromGoneLink, under the busy lock, started only after the decision said apply. The messages are
// the two that exist (the neutral reset notice, the persistent failed-heal chip). A tile that had focus is gone with the cleared storage: focus
// goes to Settings, forced (a neighbour list read from the old DOM would find a just-created tile first).
async function healReadDesk(state) {
  const focused = focusedWidgetId();
  const generation = startFavoritesAction({ render: false });
  const outcome = await healClearedDesk(state);
  if (outcome.failed) leaveEditModeAfterFailedHeal();
  finishFavoritesAction(generation, () => {
    widgetsState = outcome.state;
  });
  if (outcome.failed) {
    showLayoutRestoreFailure();
    return;
  }
  if (focused) focusWidgetTarget([SETTINGS_TILE_ID], { preventScroll: true });
  if (outcome.healed) showDesktopStatus(LAYOUT_RESET_MESSAGE, { tone: "info" });
}

// A return that came while a layer was up is kept; the end of the last layer (a render, or a close that renders nothing) calls this, and one
// animation frame later, if the tab is visible, the pending re-read starts through the common entry (which looks at the layers again). A render
// or a close with nothing pending costs nothing; a hidden tab keeps the flag for the next return.
function scheduleDeferredDeskRefresh() {
  if (!deskRefreshPending || deskRefreshFrame) return;
  deskRefreshFrame = requestAnimationFrame(() => {
    deskRefreshFrame = 0;
    if (!deskRefreshPending || document.visibilityState !== "visible") return;
    void refreshDeskOnReturn();
  });
}

// The end of the pause is silent: the existing retry nodes are updated in place (no re-render, so the focused node
// is not recreated and a screen reader does not announce the control again). Edit buttons are never touched.
function endWeatherRetryCooldown() {
  if (weatherRetryPhase(weatherUi, Date.now()) === "retrying") return;
  for (const tile of favoritesRoot?.querySelectorAll('.weather-tile--retry[data-retry="cooldown"]') ?? []) {
    tile.dataset.retry = "ready";
    tile.removeAttribute("aria-disabled");
  }
}

// D15: a city request that has not finished after CITY_REQUEST_TIMEOUT_MS is treated as failed; a later result is ignored.
function withTimeout(promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new WeatherApiError("Request timed out", { kind: "timeout" })),
      CITY_REQUEST_TIMEOUT_MS
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function changeCity(run, { onSuccess = null } = {}) {
  if (cityAttempt) cityAttempt.stale = true; // a new attempt supersedes the previous one
  const attempt = { stale: false };
  cityAttempt = attempt;
  const isStale = () => attempt.stale;
  weatherBusy = true;
  weatherChanging = true;
  // Cancel the debounce and any in-flight suggestion request and empty the list: nothing rebuilds the form now.
  activeCityForm?.cancelPending();
  weatherUi = hideSuggestions(weatherUi);
  activeCityForm?.renderSuggestions();
  cityModalError = "";
  if (onboardingWizardRoot) syncOnboardingWizardUi();
  else syncCityModal();
  renderFavorites();
  void (async () => {
    let ok = false;
    try {
      const result = await withTimeout(run(isStale));
      // Only a successful change makes an earlier in-flight boot load stale; a failed one leaves it valid.
      weatherGeneration += 1;
      weatherResult = result;
      weatherLocation = weatherResult.location ?? weatherLocation;
      weatherLocationError = ""; // a successful selection clears an earlier read error
      weatherRetryToken += 1; // a late retry result belongs to the old city
      weatherUi = resetWeatherRetry(weatherUi);
      clearTimeout(weatherRetryTimer);
      ok = true;
    } catch (error) {
      attempt.stale = true; // a timeout: a result that arrives later is dropped by the service
      cityModalError = weatherErrorMessage(error);
    } finally {
      // Only the newest attempt owns the busy state and the UI. An attempt that was superseded or whose modal was torn
      // down (hideCityModal marks it stale and clears the busy state itself) leaves silently.
      if (cityAttempt !== attempt) return;
      cityAttempt = null;
      weatherBusy = false;
      weatherChanging = false;
      renderFavorites();
      if (ok) {
        if (onSuccess) onSuccess();
        else finishCityChange();
      } else {
        if (onboardingWizardRoot) syncOnboardingWizardUi();
        else syncCityModal();
        (cityModalRoot ?? onboardingWizardRoot)?.querySelector(CITY_INPUT_SELECTOR)?.focus();
      }
    }
  })();
}
