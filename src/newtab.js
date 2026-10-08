import {
  extractImageBackgroundColor,
  fallbackColorForDomain,
  hexToRgbChannels,
  normalizeAccentLightness
} from "./favoriteColor.js";
import { getFavoriteIconModel, getFavoriteLetter } from "./favoriteIcon.js";
import { createIconNode } from "./icons.js";
import {
  canPlace, cellFromPoint, clampDropCell, displayLayout, effectiveColumns, gridMetrics, maxDropRow, viewportRows
} from "./desktopLayout.js";
import {
  closeDialog,
  createDesktopUiState,
  endDrag,
  enterEditMode,
  escapeLayer,
  exitEditMode,
  closeMenu,
  openDialog,
  openMenu,
  startDrag,
  updateDrag
} from "./desktopUiState.js";
import { createWidgetsService } from "./widgetsService.js";
import {
  WIDGETS_META_KEY,
  createWidgetsStore,
  ensureWidgetsLayout,
  inspectWidgetsMeta,
  migrateToWidgets,
  migrateWidgetsToV2,
  migrateWidgetsToV3
} from "./widgetsStore.js";
import { placeTooltip } from "./widgetsLayout.js";
import { MAX_FAVORITE_WIDGETS, NEWER_WIDGETS_MESSAGE, weatherMetricKey } from "./widgetsShared.js";
import { searchCities, WeatherApiError, weatherErrorMessage } from "./weatherApi.js";
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
  weatherRetryOutcome,
  weatherRetryPhase
} from "./weatherUiState.js";
const favoritesRoot = document.querySelector("#favorites");
const desktopStatus = document.querySelector("#desktop-status");

const ENSURE_FAILED_MESSAGE =
  "Couldn't add the weather and settings tiles - Chrome Sync may be full or unavailable. Free up sync space, then reload this tab to try again.";

const desktopLive = document.querySelector("#desktop-live");
const DESKTOP_STATUS_MS = 8000;
let desktopStatusTimer = 0;
let desktopStatusPersistent = false; // the shown message is a `persist` one (the ensure failure): a retry failure must not displace it

// Page-level status line (role="alert"), text only. It clears after 8 s or at the next action. `persist` skips the
// 8 s clear (the ensure failure: a Settings/Add tile may be missing, so its explanation stays until the next action).
function showDesktopStatus(text, { persist = false } = {}) {
  if (!desktopStatus) return;
  clearTimeout(desktopStatusTimer);
  desktopStatus.textContent = text;
  desktopStatus.hidden = text === "";
  desktopStatusPersistent = persist && text !== "";
  if (text !== "" && !persist) desktopStatusTimer = setTimeout(() => showDesktopStatus(""), DESKTOP_STATUS_MS);
}

// Polite live region for outcomes that have no visible change at the focused element.
function announce(text) {
  if (desktopLive) desktopLive.textContent = text;
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
  const text = trigger.querySelector("[data-tooltip-text]")?.textContent;
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
// Set when the legacy → widgets migration fails. The favorites UI is then locked (no
// gear, no mutations): an editable empty grid would let the user create widgets meta,
// after which the still-present legacy data would be treated as stale and deleted.
let widgetsMigrationFailed = false;
// Edit mode / menu / dialog / drag (pure state, desktopUiState.js). Normal mode only until the later tasks wire it.
let desktopUi = createDesktopUiState();
let favoritesError = "";
let favoritesBusy = false;
let favoritesGeneration = 0;
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
let cityModalError = "";
let cityModalOpenedAt = 0;
let cityModalHadFocus = false; // D14: focus was inside the modal at some point since it opened
const CITY_MODAL_BACKDROP_GUARD_MS = 300;
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
  return span;
}

function createFavoriteIconNode(model, item) {
  if (model.type === "image") {
    const image = createNode("img", "favorite-icon");
    image.src = model.src;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.dataset.iconSource = item.iconMode === "custom" ? "custom" : "favicon";
    image.addEventListener("error", () => {
      image.replaceWith(createFavoriteLetterNode(item, "letter"));
    });
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
  if (cell.w === 2) {
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

  for (const [value, text, glyph] of options) {
    const option = createNode("label", "segmented__option");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.checked = value === selectedValue;
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
  if (isEdit) rows.push(createFormRow("Size", createSizeControl(displayedSize(item)))); // the add dialog adds 1×1 (spec § Placement rules)

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
function createDialogErrorSlot() {
  const error = createNode("div", "desktop-dialog__error", "");
  error.setAttribute("role", "alert");
  error.dataset.dialogError = "";
  error.hidden = true;
  return error;
}

const SIZE_OPTIONS = [
  ["1x1", "1×1"],
  ["2x1", "2×1"],
  ["2x2", "2×2"]
];

// Size radiogroup (name "size", values 1x1|2x1|2x2) shared by the link and weather edit dialogs.
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

  return (
    (await extractImageBackgroundColor(iconModel.src, {
      loadImage: loadBrowserImage,
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
      placePopover();
      return;
    }

    for (const suggestion of citySuggestions(weatherUi)) {
      const labelParts = [suggestion.name, suggestion.admin1, suggestion.country].filter((part) => part);
      const label = labelParts.join(", ");
      const button = createNode("button", "weather-form__suggestion", label);
      button.type = "button";
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
  dialog.appendChild(title);

  dialog.appendChild(createCityForm(mode, location));
  root.append(backdrop, dialog);
  return root;
}

// Disables the controls while a city request runs and mirrors the error slot; never rebuilds the form.
function cityFormHostRoot() {
  return cityModalRoot ?? onboardingWizardRoot;
}

function syncCityModal() {
  const host = cityFormHostRoot();
  if (!host) return;
  for (const control of host.querySelectorAll("input, button")) {
    if (control.dataset.weatherAction !== "select-city") control.disabled = weatherBusy;
  }
  activeCityForm?.refresh();
  if (!onboardingWizardRoot) {
    host.querySelector('[role="dialog"]')?.setAttribute("aria-busy", String(weatherBusy));
  }
  if (weatherBusy && onboardingWizardRoot && onboardingStep === 1) {
    const title = onboardingWizardRoot.querySelector("#onboarding-step1-title");
    const active = document.activeElement;
    const focusLeftWizard =
      !active ||
      active === document.body ||
      !onboardingWizardRoot.contains(active) ||
      (active instanceof HTMLElement && active.matches("input, button") && active.disabled);
    if (title instanceof HTMLElement && focusLeftWizard) {
      title.tabIndex = -1;
      title.focus();
    }
  }
  const errorNode = host.querySelector("[data-city-modal-error]");
  if (errorNode) {
    errorNode.textContent = cityModalError;
    errorNode.hidden = cityModalError === "";
  }
  activeCityForm?.place();
}

// One listener per event on the modal root (backdrop, dismiss button, suggestions, submit).
function attachCityModalListeners(root) {
  root.addEventListener("focusin", () => {
    cityModalHadFocus = true;
  });

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || weatherBusy) return;
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
    const cityName = String(new FormData(form).get("city") ?? "").trim();
    if (!cityName) {
      cityModalError = "Enter a city name";
      syncCityModal();
      form.querySelector(CITY_INPUT_SELECTOR)?.focus();
      return;
    }
    const picked = activeCityForm?.chosen();
    if (picked) {
      changeCity(() => weatherService.selectLocation({ name: picked.name, country: picked.country, latitude: picked.latitude, longitude: picked.longitude }));
      return;
    }
    changeCity(() => weatherService.setCity(cityName));
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
  activeCityForm?.cancelPending();
  activeCityForm?.dispose?.();
  activeCityForm = null;
  weatherFormGeneration += 1; // late suggestion responses are ignored
  cityModalRoot.remove();
  cityModalRoot = null;
  revealDesk(); // before focus is restored: Settings must be visible when applyPendingFocus runs
  weatherUi = closeCityModalState(weatherUi);
  cityModalError = "";
  cityModalHadFocus = false;
  if (desktopDialogRoot) {
    // Stacked over the weather dialog: the grid stays inert under the dialog, the dialog becomes interactive again.
    desktopDialogRoot.inert = false;
    syncWeatherDialogCity();
  } else if (favoritesRoot) favoritesRoot.inert = false;
  if (mode === "change") {
    pendingFocus = [cityModalOpener, SETTINGS_TILE_SELECTOR].filter(Boolean);
    applyPendingFocus();
  }
  cityModalOpener = null;
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
    gridLocked: widgetsNewer || widgetsMigrationFailed
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
  onboardingWizardRoot.querySelectorAll('[data-onboarding-step="2"] input[type="checkbox"]').forEach((box) => {
    if (box instanceof HTMLInputElement) box.disabled = finishBusy;
  });
  if (dialog) dialog.setAttribute("aria-busy", String(weatherBusy || finishBusy));
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
  onboardingFinishError = "";
  syncOnboardingWizardUi();
  const firstBox = onboardingWizardRoot?.querySelector('[data-onboarding-step="2"] input[type="checkbox"]');
  firstBox?.focus();
}

function goToOnboardingStep1({ focusTitle = false } = {}) {
  onboardingStep = 1;
  onboardingFinishError = "";
  syncOnboardingWizardUi();
  if (focusTitle) {
    const title = onboardingWizardRoot?.querySelector("#onboarding-step1-title");
    if (title instanceof HTMLElement) {
      title.tabIndex = -1;
      title.focus();
    }
  }
}

function createOnboardingStarterPreview(row) {
  const preview = createNode("div", "onboarding-wizard__preview");
  const tile = createNode("div", "onboarding-wizard__preview-tile");
  const letter = getFavoriteLetter({ label: row.label, domain: row.domain });
  if (faviconBaseUrl) {
    const icon = createNode("img", "onboarding-wizard__preview-icon");
    icon.src = `${faviconBaseUrl}?pageUrl=${encodeURIComponent(row.url)}&size=32`;
    icon.alt = "";
    icon.addEventListener("error", () => {
      icon.replaceWith(createNode("span", "onboarding-wizard__preview-icon onboarding-wizard__preview-icon--letter", letter));
    });
    tile.appendChild(icon);
  } else {
    tile.appendChild(createNode("span", "onboarding-wizard__preview-icon onboarding-wizard__preview-icon--letter", letter));
  }
  tile.appendChild(createNode("span", "favorite-tile__label", row.label));
  preview.appendChild(tile);
  return preview;
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
    const label = createNode("label", "onboarding-wizard__row");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = onboardingStarterChecks[i] === true;
    box.dataset.onboardingStarterIndex = String(i);
    box.setAttribute("aria-label", `Add ${row.label} to your grid`);
    label.append(box, createNode("span", "onboarding-wizard__row-label", row.label), createOnboardingStarterPreview(row));
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
  progress.setAttribute("aria-hidden", "true");
  progress.append(createNode("span", "onboarding-wizard__pill onboarding-wizard__pill--active"), createNode("span", "onboarding-wizard__pill"));
  const step1 = createNode("div", "onboarding-wizard__step");
  step1.dataset.onboardingStep = "1";
  const title1 = createNode("h2", "onboarding-wizard__step-title", "Where should we show weather?");
  title1.id = "onboarding-step1-title";
  title1.dataset.onboardingStepTitle = "";
  title1.tabIndex = -1;
  const description1 = createNode("p", "onboarding-wizard__step-description", "Enter a city, or skip for now.");
  step1.append(title1, description1, createCityForm("onboarding", weatherLocationError ? null : currentLocation()));
  const step2 = buildOnboardingStep2();
  dialog.append(progress, step1, step2);
  root.append(backdrop, dialog);
  return root;
}

function attachOnboardingWizardListeners(root) {
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
  activeCityForm?.cancelPending();
  activeCityForm?.dispose?.();
  activeCityForm = null;
  weatherFormGeneration += 1;
  onboardingWizardRoot.remove();
  onboardingWizardRoot = null;
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
    applyPendingFocus();
  }
}

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
    if (!onboardingStartersCommitted && inputs.length > 0 && widgetsService) {
      const addedIds = await widgetsService.addFavorites(inputs, { columns: currentColumns() });
      widgetsState = await widgetsService.getState();
      onboardingStartersCommitted = true;
      for (const id of addedIds) {
        const item = widgetsState.items.find((row) => row.id === id);
        if (item?.backgroundColorSource === "auto") void refreshAutoAccent(id);
      }
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
          return;
        }
        onboardingFlagWriteFailedOnce = true;
        onboardingFinishError = ONBOARDING_FINISH_ERRORS.flag;
        finishFavoritesAction(generation, () => {});
        syncOnboardingWizardUi();
        renderFavorites();
        return;
      }
    }
    hideOnboardingWizard({ completed: true });
    finishFavoritesAction(generation, () => {});
    renderFavorites();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onboardingFinishError = onboardingFinishErrorForAddFailure(message);
    finishFavoritesAction(generation, () => {});
    syncOnboardingWizardUi();
    renderFavorites();
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

// R6: a 2-wide tile uses the `wide` model; a 2-high tile gets larger type (CSS keys off data-h="2") and the city name.
function createWeatherMetricTile(item, cell, view) {
  const size = cell.w === 2 ? "wide" : "square";
  const model = describeWeatherMetric({ metricKey: weatherMetricKey(item.id), result: view, size, retry: weatherRetryPhase(weatherUi, Date.now()) });
  if (!model) return null;

  // Edit mode: the tile becomes a button named "Edit <metric name>"; a tap opens the weather edit dialog.
  // An error or stale tile in normal mode is one native button "Retry <metric name>" (one shared attempt, see retryWeather).
  const editing = desktopUi.editMode;
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
    retryGlyph.appendChild(createIconNode("refresh", { size: cell.h === 2 ? 14 : 12 }));
    tile.appendChild(retryGlyph);
  }
  return tile;
}

// Spec § Weather / city: the hint takes the first enabled metric's cell and size; the map-pin glyph at 1-wide (the plus belongs to Add), text when wider.
function createCityHintTile(cell, item) {
  const button = createNode("button", "city-hint-tile");
  button.type = "button";
  if (!desktopUi.editMode) button.dataset.favoriteAction = "set-city"; // edit mode: it behaves as its metric (weather dialog)
  button.dataset.widgetId = "weather:hint";
  button.dataset.metricId = item.id;
  button.setAttribute("aria-label", "Set a city");
  if (cell.w === 2) button.textContent = "Set a city";
  else button.appendChild(createIconNode("mapPin"));
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

const ADD_TILE_SELECTOR = '[data-widget-id="chrome:add"]';
const DIALOG_BACKDROP_GUARD_MS = 300;
let desktopDialogRoot = null;
let desktopDialogOpener = null; // { id, badge } of the tile or − badge that opened the dialog, looked up again at close
let desktopDialogOpenedAt = 0;

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
        const payload = readFavoriteFormPayload(new FormData(form));
        const previousIds = new Set((widgetsState?.items ?? []).map((entry) => entry.id));
        void runDesktopMutation(
          (columns) => widgetsService.addFavorite(payload, { columns }),
          { dialogRoot: root }
        ).then((ok) => {
          if (ok) {
            announce("Link added");
            closeDesktopDialog();
            // The new link is the id the stored result has and the state before did not (set difference).
            const added = widgetsState?.items.find((entry) => entry.type === "favorite" && !previousIds.has(entry.id));
            if (added) void refreshAutoAccent(added.id);
          }
        });
      });
      root.append(title, form);
      break;
    }
    case "edit-link": {
      const item = itemById(dialog.id);
      if (item?.type !== "favorite") throw new Error("Favorite not found");
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
            closeDesktopDialog();
            if (payload.backgroundColorSource === "auto") void refreshAutoAccent(item.id);
          }
        });
      });
      root.append(title, form);
      break;
    }
    case "confirm-delete": {
      const item = itemById(dialog.id);
      if (item?.type !== "favorite") throw new Error("Favorite not found");
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
      const cityHint = createNode("span", "city-field__hint");
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
          if (ok) closeDesktopDialog();
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
  root.querySelector("[data-weather-dialog-city]").textContent = label || "No city set";
  field.querySelector(".city-field__hint").textContent = location ? "Change" : "Set a city";
  if (label) field.title = label; // the full label whenever a city is stored; the accessible name comes from aria-labelledby
  else field.removeAttribute("title");
  field.disabled = !weatherService;
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
  root.querySelector("input:not(:disabled), button:not(:disabled)")?.focus(); // the first enabled control (a disabled city-field is skipped)
  return true;
}

// `restoreFocusTo`: a widget id, an { id, badge } target, a list of those (first present wins), or null for none.
// A weather dialog falls back to its metric's tile (the hint that opened it is gone once a city is set).
function closeDesktopDialog({ restoreFocusTo = desktopDialogOpener } = {}) {
  const fallback = desktopUi.dialog?.id ?? null;
  document.querySelectorAll(".desktop-dialog, .desktop-backdrop").forEach((node) => node.remove());
  desktopDialogRoot = null;
  if (favoritesRoot) favoritesRoot.inert = false;
  desktopUi = closeDialog(desktopUi);
  desktopDialogOpener = null;
  if (restoreFocusTo) focusWidgetTarget([restoreFocusTo, fallback].flat());
}

// Focuses the first present, enabled target: a widget id string (its tile) or { id, badge } (the tile or its − badge).
function focusWidgetTarget(targets) {
  for (const target of [targets].flat()) {
    if (!target) continue;
    const { id, badge } = typeof target === "string" ? { id: target, badge: false } : target;
    const selector = badge ? `[data-remove-for="${CSS.escape(id)}"]` : `.desktop-grid > [data-widget-id="${CSS.escape(id)}"]`;
    const node = favoritesRoot?.querySelector(selector);
    if (!(node instanceof HTMLElement) || node.matches(":disabled")) continue;
    suppressTooltipOnFocus = true;
    try {
      node.focus();
    } finally {
      suppressTooltipOnFocus = false;
    }
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
  closeDesktopDialog({ restoreFocusTo: ok ? next : opener });
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
  closeDesktopDialog({ restoreFocusTo: ok ? next : opener });
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
  if (tile?.hasAttribute("aria-haspopup")) tile.setAttribute("aria-expanded", String(addMenuRoot !== null));
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

function showDialogError(root, message) {
  const slot = root.querySelector("[data-dialog-error]");
  if (!slot) return;
  slot.textContent = message;
  slot.hidden = false;
  const field = root.querySelector(invalidFieldFor(message)) ?? root.querySelector('button[type="submit"]');
  if (field instanceof HTMLElement && !field.matches(":disabled")) field.focus();
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
  }
  const generation = startFavoritesAction({ render: renderPending });
  try {
    const next = await action(currentColumns());
    finishFavoritesAction(generation, () => {
      widgetsState = next;
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (onFailure) {
      setFavoritesBusy(false);
      if (generation === favoritesGeneration) onFailure(message);
      return false;
    }
    finishFavoritesAction(generation, () => {});
    if (dialogRoot?.isConnected) showDialogError(dialogRoot, message);
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
// (`viewportRows` of the same two inputs) and the page's column count. Read once, right before `ensureWidgetsLayout`; never again.
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
  node.dataset.tileSize = cell.w === 2 ? "wide" : "square";
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
    node?.focus();
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
  if (widgetsMigrationFailed) {
    favoritesRoot.replaceChildren(createStatus(favoritesError, { error: true, live: "assertive", full: true }));
    return;
  }
  if (!widgetsState) {
    // Unavailable APIs or a failed read: say so instead of an empty, silently broken page.
    favoritesRoot.replaceChildren(...(favoritesError ? [createStatus(favoritesError, { error: true, live: "assertive", full: true })] : []));
    return;
  }

  const focusTarget = focusedWidgetId();
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
    if (item.type === "favorite") tile = createFavoriteTile(item, cell);
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
  restoreFocus(focusTarget);
  if (pendingDrop) {
    const tile = grid.querySelector(`:scope > [data-widget-id="${CSS.escape(pendingDrop.domId)}"]`);
    if (tile) settleTileAt(tile, pendingDrop.id, pendingDrop.cell);
  }
  if (dragSession) reattachDrag();
}

// A resize only re-renders (when the column count or the cell size changed); it never writes.
let resizeFrame = 0;
window.addEventListener("resize", () => {
  cancelDrag(); // Review focus 1: a viewport change cancels an active drag (tile returns, nothing written)
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (!widgetsState || widgetsNewer || widgetsMigrationFailed || renderedColumns === 0) return; // nothing is rendered yet: the first render (after the first-run decision) lays the grid out
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
  const drag = desktopUi.drag;
  desktopUi = endDrag(desktopUi);
  const target = drag?.target;
  if (drag?.valid && target && (target.x !== s.cell.x || target.y !== s.cell.y)) {
    await commitDrop(s, target);
    return;
  }
  if (drag?.valid) {
    renderFavorites(); // dropped on its own cell: nothing to write
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
  if (ok) focusDragTile(s.domId);
  else if (!dropReturnTimer && s.tile.isConnected && s.tile.classList.contains("is-settled")) returnDraggedTile(s);
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
  renderFavorites();
}

function tabTrapFocusables(trapRoot) {
  const controls = [...trapRoot.querySelectorAll("input, button")].filter((el) => {
    if (el.disabled || el.hidden) return false;
    for (let node = el; node !== trapRoot; node = node.parentElement) {
      if (!node) return false;
      if (node.inert || node.hidden) return false;
    }
    return true;
  });
  if (
    controls.length === 0 &&
    trapRoot === onboardingWizardRoot &&
    weatherBusy &&
    onboardingStep === 1
  ) {
    const title = trapRoot.querySelector("#onboarding-step1-title");
    if (title instanceof HTMLElement) {
      title.tabIndex = -1;
      return [title];
    }
  }
  return controls;
}

function applyPendingFocus() {
  if (!pendingFocus || favoritesBusy) {
    return;
  }

  const selectors = pendingFocus;
  pendingFocus = null;

  for (const selector of selectors) {
    const target = document.querySelector(selector); // an opener may live in a desktop dialog, outside the grid
    if (target instanceof HTMLElement && !target.matches(":disabled")) {
      target.focus();
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
      favoritesError = "Chrome APIs for favorites are unavailable.";
      renderFavorites();
      return;
    }

    // R7 bootstrap order: legacy → widgets v1, v1 → v2, v2 → v3, then ensure, then the first read. No read or mutation runs
    // before the v3 migration has succeeded; any failure locks the grid and leaves the stored data untouched.
    try {
      const rawMeta = hasStorageArea(syncStorageArea)
        ? await syncStorageArea.get(WIDGETS_META_KEY)
        : {};
      if (inspectWidgetsMeta(rawMeta) === "newer") {
        widgetsNewer = true;
        renderFavorites();
        return;
      }

      // The legacy chain reads the old local blob too; the v1 → v2 step needs only the sync area.
      if (hasStorageArea(localStorageArea) && hasStorageArea(syncStorageArea)) {
        const migration = await migrateToWidgets(localStorageArea, syncStorageArea);
        if (migration?.newer) {
          widgetsNewer = true;
          renderFavorites();
          return;
        }
      }
      if (hasStorageArea(syncStorageArea)) {
        // A meta that turned newer meanwhile (another device) locks like the check above; an invalid meta is left
        // as it is (no message decided yet, backlog L1-02).
        const v2 = await migrateWidgetsToV2(syncStorageArea);
        if (v2?.meta === "newer") {
          widgetsNewer = true;
          renderFavorites();
          return;
        }
        // v2 -> v3 (docs/centered-grid.md): one set() call shifts a v2 layout to the center line; a `v2` meta that is still
        // there afterwards (the write failed) throws into the catch below and locks like a failed v1 -> v2 step.
        const v3 = await migrateWidgetsToV3(syncStorageArea);
        if (v3?.meta === "newer") {
          widgetsNewer = true;
          renderFavorites();
          return;
        }
      }
    } catch (error) {
      widgetsMigrationFailed = true;
      favoritesError =
        "Couldn't move your favorites to the new layout — Chrome Sync storage may be full or unavailable. Free up some sync space, then reload this tab to try again. Your favorites are kept.";
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
      if (widgetsState && !widgetsNewer && !widgetsMigrationFailed) setEditMode(!desktopUi.editMode);
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
      cityModal: Boolean(cityModalRoot)
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
    result = await weatherService.initialize();
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
  renderFavorites();
}

// Retry from an error or stale tile (normal mode): ONE attempt for every tile, through the unchanged service
// (`initialize()` re-reads the city, serves a cache another tab refreshed, or fetches). Presses are ignored while it runs
// and for 3 s after it failed (weatherUiState). The same 15 s guard as a city change; the late answer of a timed-out
// attempt is dropped by the token. A thrown or timed-out attempt never replaces the tiles' result.
async function retryWeather() {
  if (!weatherService) return;
  const shown = effectiveWeatherResult();
  if (shown?.status !== "error" && shown?.status !== "stale") return;
  const started = startWeatherRetry(weatherUi, Date.now());
  if (started === weatherUi) return;
  weatherUi = started;
  clearTimeout(weatherRetryTimer);
  const token = ++weatherRetryToken;
  weatherGeneration += 1; // supersedes a boot load that is still in flight (a failed city read leaves one running)
  const generation = weatherGeneration;
  renderFavorites();

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
    if (!desktopStatusPersistent) showDesktopStatus(""); // a failure text of an earlier attempt would now contradict the hint tile
    renderFavorites();
    const active = document.activeElement;
    if (!active || active === document.body) favoritesRoot?.querySelector(HINT_TILE_SELECTOR)?.focus();
    return;
  }

  const failed = typeof outcome === "object";
  weatherUi = finishWeatherRetry(weatherUi, Date.now(), !failed);
  // The service's own answer replaces the result, except that a failed read never downgrades a tile that still has data.
  const downgrade = failed && result?.status === "error" && weatherResult?.status === "stale";
  if (result && !downgrade) {
    weatherResult = result;
    if (result.location) {
      weatherLocation = result.location;
      weatherLocationError = "";
    }
  }
  if (!failed) weatherLocationError = "";
  renderFavorites();

  if (failed) {
    if (desktopStatusPersistent) {
      announce(outcome.failed); // the ensure message keeps the status line; the failure is spoken once
    } else {
      showDesktopStatus(""); // clear first so an identical text is announced again
      showDesktopStatus(outcome.failed);
    }
    clearTimeout(weatherRetryTimer);
    weatherRetryTimer = setTimeout(endWeatherRetryCooldown, Math.max(0, weatherUi.retry.availableAt - Date.now()) + 10);
  } else {
    if (!desktopStatusPersistent) showDesktopStatus(""); // an earlier failure text would now contradict the tiles
    if (desktopLive) desktopLive.textContent = ""; // cleared first so a repeated "Weather updated" is announced
    announce("Weather updated");
  }
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
      const result = await withTimeout(run());
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
      cityModalError = weatherErrorMessage(error);
    } finally {
      weatherBusy = false;
      weatherChanging = false;
      renderFavorites();
      if (ok) {
        if (onSuccess) onSuccess();
        else hideCityModal();
      } else {
        if (onboardingWizardRoot) syncOnboardingWizardUi();
        else syncCityModal();
        (cityModalRoot ?? onboardingWizardRoot)?.querySelector(CITY_INPUT_SELECTOR)?.focus();
      }
    }
  })();
}
