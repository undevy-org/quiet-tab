import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { describe, it } from "node:test";
import vm from "node:vm";

const NEWTAB_SOURCE = new URL("../src/newtab.js", import.meta.url);

async function source() {
  return readFile(NEWTAB_SOURCE, "utf8");
}

async function appStyles() {
  const base = new URL("../src/", import.meta.url);
  const [surfaces, controls, app] = await Promise.all([
    readFile(new URL("surfaces.css", base), "utf8"),
    readFile(new URL("controls.css", base), "utf8"),
    readFile(new URL("newtab.css", base), "utf8")
  ]);
  return surfaces + controls + app;
}

// Source without comments (strings are skipped, so `//` inside a URL string survives); pins on code, not on prose.
function stripComments(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
    } else if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

// Text of a top-level function: from `function name(` to the closing brace in column 0.
function topLevelFunction(code, name) {
  const start = code.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.notEqual(start, -1, `function ${name} exists`);
  const end = code.indexOf("\n}\n", start);
  assert.notEqual(end, -1, `function ${name} is closed`);
  return code.slice(start, end + 2);
}

async function allSrc() {
  const dir = new URL("../src/", import.meta.url);
  const names = (await readdir(dir)).filter((n) => /\.(js|css|html)$/.test(n));
  return Promise.all(names.map(async (name) => ({ name, text: await readFile(new URL(name, dir), "utf8") })));
}

describe("newtab favorites source", () => {
  it("styles the drop highlight: invalid = --danger dashed outline with >= 3:1 against --bg in both themes", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    const tokens = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    assert.match(css, /\.drop-highlight\[data-valid="false"\] \{\s*outline: 2px dashed var\(--danger\);/);
    assert.match(css, /\.drop-highlight\[data-valid="true"\] \{\s*outline: 2px solid var\(--primary\);/);
    assert.match(css, /:is\(\.is-dragging, \.is-returning\) \{[^}]*pointer-events: none;[^}]*animation: none;/);
    const lum = (hex) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const light = tokens.slice(0, tokens.indexOf("@media (prefers-color-scheme: dark)"));
    const dark = tokens.slice(tokens.indexOf("@media (prefers-color-scheme: dark)"));
    for (const block of [light, dark]) {
      const bg = block.match(/--color-bg: (#[0-9a-f]{6});/)[1];
      const danger = block.match(/--color-danger: (#[0-9a-f]{6});/)[1];
      assert.ok(ratio(danger, bg) >= 3, `${danger} on ${bg}: ${ratio(danger, bg).toFixed(2)}`);
    }
  });

  it("wires the pointer drag controller (Task 9): threshold, cancels, Escape layer, one-shot click suppression", async () => {
    const code = await source();
    assert.match(
      code,
      /import \{\s*canPlace, cellFromPoint, clampDropCell, displayLayout, effectiveColumns, gridMetrics, maxDropRow, viewportRows\s*\} from "\.\/desktopLayout\.js";/
    );
    assert.match(code, /const DRAG_THRESHOLD_PX = 6;/);
    assert.match(code, /const AUTOSCROLL_EDGE_PX = 48;/);
    assert.match(code, /const AUTOSCROLL_STEP_PX = 12;/);
    assert.match(code, /function beginPointerDrag\(event, tile\)/);
    assert.match(code, /function cancelDrag\(\)/);
    assert.match(code, /event\.button !== 0 \|\| !event\.isPrimary/);
    assert.match(code, /< DRAG_THRESHOLD_PX\) return; \/\/ still a tap/);
    // Drop: moveWidget with the metric id behind the hint tile, through the atomic mutation runner; focus re-queried.
    assert.match(code, /tile\.dataset\.metricId \?\? tile\.dataset\.widgetId/);
    assert.match(code, /runDesktopMutation\(\s*\(columns\) => widgetsService\.moveWidget\(s\.id, \{ x: target\.x, y: target\.y \}, \{ columns, viewportRows: s\.viewportRows \}\),/);
    assert.match(code, /focusDragTile\(s\.domId\)/);
    assert.match(code, /canPlace\(s\.layout, s\.id, \{ \.\.\.target, w: s\.cell\.w, h: s\.cell\.h \}, s\.columns, s\.viewportRows\)/);
    // Cancels: Escape layer, pointercancel, window blur, leaving the window, resize, leaving edit mode.
    assert.match(code, /if \(layer === "drag"\) \{\s*event\.preventDefault\(\);\s*cancelDrag\(\);/);
    assert.match(code, /addEventListener\("pointercancel", \(event\) => \{\s*if \(dragSession && event\.pointerId === dragSession\.pointerId\) cancelDrag\(\);/);
    assert.match(code, /window\.addEventListener\("blur", \(\) => \{\s*backgroundPressed = false;\s*cancelDrag\(\);/);
    assert.match(code, /event\.relatedTarget === null && outsideViewport\(event\)\) cancelDrag\(\)/);
    assert.match(code, /window\.addEventListener\("resize", \(\) => \{\s*cancelDrag\(\);/);
    assert.match(code, /function setEditMode\(on\) \{\s*if \(!on\) \{\s*cancelDrag\(\);\s*closeAddMenu\(\);/); // leaving edit mode also closes the Add menu
    // One-shot suppression of the click that trails a started drag.
    assert.match(code, /suppressDragClick = true;/);
    assert.match(code, /if \(!suppressDragClick \|\| event\.detail === 0\) return;\s*suppressDragClick = false;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
    // Autoscroll per animation frame.
    assert.match(code, /window\.scrollBy\(0, direction \* AUTOSCROLL_STEP_PX\)/);
    assert.match(code, /requestAnimationFrame\(autoscrollFrame\)/);
    // Drop highlight is a DOM node with a validity flag; still no innerHTML in newtab.js.
    assert.match(code, /createNode\("div", "drop-highlight"\)/);
    assert.match(code, /highlight\.dataset\.valid = String\(valid\)/);
    assert.doesNotMatch(code, /innerHTML/);
  });

  it("keeps a dropped tile on its target while the write runs; failure animates it back; flag never strands (fix round 1)", async () => {
    const code = await source();
    // No busy re-render for a drop (it would rebuild the old layout and snap the tile to its origin).
    assert.match(code, /renderPending: false,/);
    assert.match(code, /settleTileAt\(s\.tile, s\.id, cell\);/);
    assert.match(code, /if \(pendingDrop\) \{\s*const tile = grid\.querySelector/);
    // Failure (PlacementError or storage): message in #desktop-status, the tile animates back from where it is.
    assert.match(code, /onFailure: \(message\) => \{\s*pendingDrop = null;\s*showDesktopStatus\(message\);[^\n]*\n\s*returnDraggedTile\(s\);/);
    assert.match(code, /if \(onFailure\) \{\s*setFavoritesBusy\(false\);\s*if \(generation === favoritesGeneration\) onFailure\(message\);\s*return false;/);
    // Minor 3: a drop while another write is busy sends nothing and returns the tile (never left fixed/dragging).
    assert.match(code, /async function commitDrop\(s, target\) \{\s*if \(favoritesBusy\) \{\s*returnDraggedTile\(s\);/);
    // Click suppression cannot strand: reset on every new press (capture), on cancel and blur; keyboard clicks pass.
    assert.match(code, /"pointerdown",\s*\(\) => \{\s*suppressDragClick = false;\s*\},\s*true/);
    assert.match(code, /function cancelDrag\(\) \{\s*suppressDragClick = false;/);
    assert.match(code, /cancelDrag\(\);\s*suppressDragClick = false;\s*\}\);/);
    assert.match(code, /if \(!suppressDragClick \|\| event\.detail === 0\) return;/);
  });

  it("guards the background click (primary button only, reset on cancel) and falls back to Settings for a vanished badge", async () => {
    const code = await source();
    assert.match(code, /const isPrimaryPress = \(event\) => event\.button === 0 && event\.isPrimary;/);
    // The press that closed the Add menu never also exits edit mode (Task 10).
    assert.match(code, /backgroundPressed = desktopUi\.editMode && event !== addMenuDismissPress && isPrimaryPress\(event\) && isBackground\(event\.target\);/);
    assert.match(code, /favoritesRoot\.addEventListener\("pointercancel", \(\) => \{\s*backgroundPressed = false;/);
    assert.match(code, /\?\? \(target\.badge \? favoritesRoot\.querySelector\(SETTINGS_TILE_SELECTOR\) : null\)/);
  });

  it("drives the desktop UI from the pure desktopUiState module, not a mode string", async () => {
    const code = await source();
    assert.match(code, /import \{\s*closeDialog,\s*createDesktopUiState,\s*endDrag,\s*enterEditMode,\s*escapeLayer,\s*exitEditMode,\s*closeMenu,\s*deskRefreshBlocker,\s*deskRefreshDecision,\s*openDialog,\s*openMenu,\s*startDrag,\s*updateDrag\s*\} from "\.\/desktopUiState\.js";/); // run 50: the two re-read functions join the list
    assert.match(code, /let desktopUi = createDesktopUiState\(\);/);
    assert.doesNotMatch(code, /favoritesMode/);
    assert.doesNotMatch(code, /favoritesUiState\.js/);
  });
  it("wires edit mode: Settings aria-pressed, live-region announcements, background click, Escape through escapeLayer", async () => {
    const code = await source();
    assert.match(code, /aria-pressed/);
    assert.match(code, /desktop-live/);
    assert.match(code, /Editing layout\. Activate Settings to finish\./);
    assert.match(code, /Layout editing off/);
    assert.match(code, /function setEditMode\(on\)/);
    assert.match(code, /escapeLayer\(desktopUi, \{/);
    assert.match(code, /layer === "exitEdit"/);
    assert.match(code, /addEventListener\("pointerdown"/);
    assert.match(code, /addEventListener\("pointerup"/);
    assert.match(code, /!desktopUi\.drag/);
  });
  it("jiggles in edit mode and holds still with a dashed outline under prefers-reduced-motion", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /@keyframes tile-jiggle/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /outline: 2px dashed/);
  });
  it("never stacks the city modal on a desktop dialog, and Cancel respects favoritesBusy", async () => {
    const code = await source();
    // The only stacking: the change-mode city modal over the weather edit dialog; first-run never opens over a dialog.
    assert.match(code, /const overWeatherDialog = mode === "change" && desktopDialogRoot !== null && desktopUi\.dialog\?\.kind === "edit-weather";/);
    const showCity = code.slice(code.indexOf("function showCityModal("), code.indexOf("function hideCityModal("));
    assert.match(showCity, /onboardingWizardRoot/);
    assert.match(showCity, /desktopDialogRoot && !overWeatherDialog/);
    assert.match(code, /\[data-favorite-action="cancel"\]'\)\?\.addEventListener\("click", \(\) => \{\s+if \(!favoritesBusy\) closeDesktopDialog\(\);/);
  });
  it("renders everything into the one desktop root; the settings panel root is gone", async () => {
    const code = await source();
    assert.match(code, /querySelector\("#favorites"\)/);
    assert.doesNotMatch(code, /#favorites-panel/);
    assert.doesNotMatch(code, /favoritesPanelRoot/);
  });
  it("closes the panel on Escape and returns focus to the gear", async () => {
    const code = await source();
    assert.match(code, /addEventListener\("keydown"/);
    assert.match(code, /"Escape"/);
    assert.match(code, /\.focus\(\)/);
  });

  it("lets favorite URL and custom-icon fields reach service normalization without native URL validation", async () => {
    const code = await source();
    assert.match(code, /\burl\.type = "text";\s+url\.inputMode = "url";/);
    assert.match(code, /customIconUrl\.type = "text";\s+customIconUrl\.inputMode = "url";/);
  });

  it("blocks favorites actions while a request is in flight", async () => {
    const code = await source();
    assert.match(code, /let favoritesBusy = false;/);
    assert.match(code, /let favoritesGeneration = 0;/);
    assert.match(code, /function startFavoritesAction\(\{ render = true \} = \{\}\) \{\s*favoritesGeneration \+= 1;\s*setFavoritesBusy\(true\);\s*if \(render\) renderFavorites\(\);/);
    assert.match(code, /function finishFavoritesAction\(generation, applyResult\)/);
    assert.match(code, /\|\| favoritesBusy\)\s*\{\s*return;/);
  });

  it("tags every icon with its source for observability", async () => {
    const code = await source();
    assert.match(code, /data-icon-source|dataset\.iconSource/);
  });

  it("re-checks the item is still auto before a late auto-accent write", async () => {
    const code = await source();
    assert.match(code, /backgroundColorSource !== "auto"/);
  });

  it("only samples icon pixels for CORS-safe sources, never arbitrary custom icon URLs", async () => {
    const code = await source();
    assert.match(code, /if \(!iconModel\.sampleable\) \{\s*return fallback;/);
    assert.doesNotMatch(code, /iconModel\.type === "image" \? iconModel\.src : ""/);
  });

  it("consumes --favorite-accent-rgb via legacy rgba() so comma channels stay valid CSS", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /rgb\(var\(--favorite-accent-rgb\)\s*\//);
    assert.match(css, /rgba\(var\(--favorite-accent-rgb\),/);
  });

  it("uses a black/white accent instead of blue, with a theme-aware button contrast color", async () => {
    const tokens = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(tokens, /--color-primary: #111318;/);
    assert.match(tokens, /--color-on-primary: #ffffff;/);
    assert.match(tokens, /--primary: var\(--color-primary\);/);
    assert.match(tokens, /--primary-contrast: var\(--color-on-primary\);/);
    assert.doesNotMatch(tokens, /--color-primary: #1473e6/);
    assert.doesNotMatch(tokens, /--color-primary: #4d9aff/);
    const controls = await readFile(new URL("../src/controls.css", import.meta.url), "utf8");
    assert.match(controls, /\.button--primary\s*\{[^}]*color: var\(--primary-contrast\);/s);
  });

  it("sizes every tile from the cell box (no --tile-height), keeps the weather tile slots, and has no weather panel", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /\.weather-panel/);
    assert.doesNotMatch(css, /--weather-tile-height/);
    assert.doesNotMatch(css, /--weather-reserve/);
    assert.doesNotMatch(css, /--tile-height/);
    assert.match(css, /\.weather-tile__values\s*\{[^}]*max-width: 100%;[^}]*overflow: hidden;/s);
    assert.match(css, /\.weather-tile__secondary\s*\{[^}]*color: var\(--text\);/s);
    assert.match(css, /\.weather-tile\[data-h="2"\] \.weather-tile__primary\s*\{/);
    assert.match(css, /\.sr-only\s*\{/);
  });
  it("derives tile size from the displayed cell and reuses the shared icon module for the chrome tiles and the badge", async () => {
    const code = await source();
    assert.match(code, /from "\.\/icons\.js"/);
    assert.doesNotMatch(code, /dataset\.tileSize/); // docs/tile-size-1x2.md decision 8: data-w / data-h only
    assert.match(code, /createIconNode\(settings \? "settings" : "plus", \{ size: 20 \}\)/);
    assert.match(code, /createIconNode\("minus", \{ size: 12 \}\)/);
    assert.doesNotMatch(code, /tileSpan/);
    assert.doesNotMatch(code, /"⚙"/);
    assert.doesNotMatch(code, /"‹"/);
    assert.doesNotMatch(code, /"›"/);
    assert.doesNotMatch(code, /"✎"/);
  });
  it("merges add and edit into one favorite form component", async () => {
    const code = await source();
    assert.doesNotMatch(code, /function createAddForm/);
    assert.doesNotMatch(code, /function createEditForm/);
    assert.match(code, /function createFavoriteForm\(item\)/);
  });

  it("builds icon/color/size choices as native radiogroups instead of <select>", async () => {
    const code = await source();
    assert.doesNotMatch(code, /createNode\("select"/);
    assert.match(code, /function createSegmentedControl\(/);
    assert.match(code, /input\.type = "radio";/);
  });

  it("reads a single form payload shape shared by add and edit submits", async () => {
    const code = await source();
    assert.match(code, /function readFavoriteFormPayload\(data\)/);
    assert.doesNotMatch(code, /tileSize: data\.get/);
    assert.doesNotMatch(code, /createSegmentedControl\(\s*"tileSize"/);
  });

  it("has a desktop dialog shell: modal role, add-link branch, atomic mutation runner, live region", async () => {
    const code = await source();
    assert.match(code, /function openDesktopDialog\(dialog, \{ opener = focusedWidgetId\(\) \} = \{\}\)/);
    assert.match(code, /function closeDesktopDialog\(/);
    assert.match(code, /root\.setAttribute\("aria-modal", "true"\);/);
    assert.match(code, /case "add-link":/);
    assert.match(code, /async function runDesktopMutation\(action, \{ dialogRoot = null, renderPending = true, onFailure = null \} = \{\}\)/);
    assert.match(code, /widgetsService\.addFavorite\(payload, \{ columns \}\)/);
    assert.match(code, /function announce\(text\)/);
    assert.match(code, /querySelector\("#desktop-live"\)/);
    assert.match(code, /error\.setAttribute\("role", "alert"\);/);
  });

  it("clears the page status after 8 s or at the next action; the ensure failure is exempt from the timer only", async () => {
    const code = await source();
    assert.match(code, /DESKTOP_STATUS_MS = 8000/);
    assert.match(code, /if \(text !== "" && !persist\) desktopStatusTimer = setTimeout\(\(\) => showDesktopStatus\(""\), DESKTOP_STATUS_MS\);/);
    assert.match(code, /if \(favoritesBusy\) return false;\n  showDesktopStatus\(""\);/);
    // Final review: a missing Settings/Add tile must keep its explanation until the next action (no 8 s clear).
    assert.match(code, /if \(widgetsEnsureFailed\) showDesktopStatus\(ENSURE_FAILED_MESSAGE, \{ persist: true \}\);/);
  });

  it("gives the favorite form action buttons a leading icon instead of bare text", async () => {
    const code = await source();
    // AS-MO-02/03: Delete lives only in the confirm-delete dialog; the Edit link form builds no Delete button.
    const bodyOf = (name) => {
      const start = code.indexOf(`function ${name}(`);
      assert.ok(start > -1, name);
      return code.slice(start, code.indexOf("\n}\n", start));
    };
    assert.match(bodyOf("buildDialogContent"), /createIconButton\("button button--danger", "Delete", "trash2"\)/);
    assert.match(code, /createIconButton\("button", "Cancel", "x"\)/);
    assert.doesNotMatch(bodyOf("createFavoriteForm"), /Delete|trash2|button--danger|favoriteAction = "delete"/);
    assert.doesNotMatch(code, /\[data-favorite-action="delete"\]/);
    assert.doesNotMatch(code, /Delete inside the edit dialog/);
  });
  it("drops the dead min-width already overridden for every .favorite-input use site", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /min-width: min\(320px, 100%\);/);
  });

  it("drops the dead close-settings button — Escape and an outside click already close the panel", async () => {
    const code = await source();
    assert.doesNotMatch(code, /"close-settings"/);
    assert.doesNotMatch(code, /favorites-panel__footer/);

    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /\.favorites-panel__footer/);
  });

  it("links each form row's label to its control for assistive tech", async () => {
    const code = await source();
    assert.match(code, /labelSpan\.id = `favorite-form-row-label-\$\{formRowIdSeq\+\+\}`;/);
    assert.match(code, /setAttribute\("aria-labelledby", labelSpan\.id\)/);
  });

  it("the bootstrap has no migration step: early newer check, then ensureWidgetsLayout, then getState (AS-RM-05)", async () => {
    const code = await source();
    assert.match(code, /from "\.\/widgetsStore\.js"/);
    assert.match(code, /import \{\s*WIDGETS_META_KEY,\s*createWidgetsStore,\s*ensureWidgetsLayout,\s*inspectWidgetsMeta,\s*resetUnreadableWidgets\s*\} from "\.\/widgetsStore\.js";/);
    const boot = code.slice(code.indexOf("if (favoritesRoot) {\n  void (async () => {"), code.indexOf("})();", code.indexOf("if (favoritesRoot)")));
    const order = ['inspectWidgetsMeta(rawMeta) === "newer"', 'inspectWidgetsMeta(rawMeta) === "invalid"', "await ensureWidgetsLayout(syncStorageArea, { screen: firstScreen() });", 'ensured.meta === "invalid"', "widgetsState = await widgetsService.getState();"].map((n) => boot.indexOf(n));
    assert.ok(order.every((i) => i >= 0), order.join());
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(boot, /if \(inspectWidgetsMeta\(rawMeta\) === "newer"\) \{\s*widgetsNewer = true;\s*renderFavorites\(\);\s*return;\s*\}/);
    // run 51 (docs/unreadable-grid-reset.md decision 4): an invalid meta shows the screen, the same shape of exit, in two places
    assert.match(boot, /if \(inspectWidgetsMeta\(rawMeta\) === "invalid"\) \{\s*widgetsUnreadable = true;\s*renderFavorites\(\);\s*return;\s*\}/);
    // the second exit sits OUTSIDE the try whose catch sets widgetsEnsureFailed: a render that throws is not swallowed as an ensure failure
    assert.match(boot, /const ensured = await ensureWidgetsLayout\(syncStorageArea, \{ screen: firstScreen\(\) \}\);\s*ensuredInvalid = ensured\.meta === "invalid";\s*\} catch \{\s*widgetsEnsureFailed = true;\s*\}\s*\}\s*if \(ensuredInvalid\) \{\s*widgetsUnreadable = true;\s*renderFavorites\(\);\s*return;\s*\}/);
  });

  it("the early meta read sits in its own try whose catch sets no lock flag, and the boot goes on (AS-RM-05b)", async () => {
    const code = await source();
    const boot = code.slice(code.indexOf("if (favoritesRoot) {\n  void (async () => {"), code.indexOf("})();", code.indexOf("if (favoritesRoot)")));
    assert.match(
      boot,
      /let rawMeta = \{\};\s*try \{\s*if \(hasStorageArea\(syncStorageArea\)\) rawMeta = await syncStorageArea\.get\(WIDGETS_META_KEY\);\s*\} catch \{\s*rawMeta = \{\};\s*\}/
    );
    const early = boot.slice(boot.indexOf("let rawMeta = {};"), boot.indexOf('if (inspectWidgetsMeta(rawMeta) === "newer")'));
    assert.doesNotMatch(early, /widgetsNewer|favoritesError|renderFavorites|return/);
    // the only other read, getState, has its own catch that shows the storage error text
    assert.match(boot, /widgetsState = await widgetsService\.getState\(\);\s*\} catch \(error\) \{\s*favoritesError = error instanceof Error \? error\.message : String\(error\);/);
  });

  it("no legacy tileSize is left anywhere in src/: not the field, not TILE_SIZES, not isOptionalTileSize (run 51 decision 3, AS-UGR-20)", async () => {
    for (const { name, text } of await allSrc()) {
      assert.doesNotMatch(text, /tileSize|TILE_SIZES|isOptionalTileSize/, name);
    }
  });

  it("no migration symbol or deleted message string is left anywhere in src/ (AS-RM-05)", async () => {
    const files = (await readdir(new URL("../src/", import.meta.url))).filter((name) => /\.(js|css|html)$/.test(name));
    const banned = [
      /migrateToWidgets/, /migrateWidgetsToV2/, /migrateWidgetsToV3/, /widgetsMigrationFailed/, /centerShift/, /migrateV1ToV2/, /isValidGridV2/,
      /defaultColumnsForItems/, /V1_WIDGETS_MESSAGE/, /V1_MAX_COLUMNS/, /GRID_POSITIONS/, /Couldn't move your favorites/, /still being updated to the new layout/
    ];
    for (const name of files) {
      const text = await readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
      for (const pattern of banned) assert.doesNotMatch(text, pattern, `${name}: ${pattern}`);
    }
  });

  it("shows long page messages (newer-version, storage error) in full, without the status line clamp", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.status--full\s*\{[^}]*-webkit-line-clamp: unset;/s);
    assert.match(css, /\.status--full\s*\{[^}]*overflow: visible;/s);
    assert.match(css, /\.status--full\s*\{[^}]*white-space: normal;/s);
    assert.match(css, /\.status--full\s*\{[^}]*display: block;/s);
    const code = await source();
    assert.match(code, /createStatus\(favoritesError, \{ error: true, live: "assertive", full: true \}\)/);
    assert.match(code, /status--full/);
  });

  it("keeps keyboard focus across re-renders: the focused tile or badge is found again by widget id", async () => {
    const code = await source();
    assert.match(code, /let pendingFocus = null;/);
    assert.match(code, /function applyPendingFocus\(\)/);
    assert.doesNotMatch(code, /pendingGearFocus/);
    assert.match(code, /function focusedWidgetId\(\)/);
    assert.match(code, /closest\("\[data-widget-id\], \[data-remove-for\]"\)/);
    assert.match(code, /function restoreFocus\(target\)/);
    const render = code.slice(code.indexOf("function renderDesktop()"), code.indexOf("// A resize only re-renders"));
    assert.ok(render.indexOf("const focusTarget = focusedWidgetId();") < render.indexOf("favoritesRoot.replaceChildren(grid);"));
    assert.ok(render.indexOf("favoritesRoot.replaceChildren(grid);") < render.indexOf("restoreFocus(focusTarget);"));
  });

  it("no longer publishes a weather reserve: weather tiles are cells of the desktop grid", async () => {
    const code = await source();
    assert.doesNotMatch(code, /ResizeObserver\(publishWeatherReserve\)/);
    assert.doesNotMatch(code, /--weather-reserve/);
    assert.match(code, /createWeatherMetricTile\(item, cell, view\)/);
  });
  it("locks the grid with the newer-version message before anything else and runs the bootstrap in order (R7)", async () => {
    const code = await source();
    assert.match(code, /if \(widgetsNewer\) \{\s*favoritesRoot\.replaceChildren\(createStatus\(NEWER_WIDGETS_MESSAGE/);
    assert.ok(code.indexOf("if (widgetsNewer)") < code.indexOf("if (widgetsUnreadable)") && code.indexOf("if (widgetsUnreadable)") < code.indexOf("if (!widgetsState) {\n    // Unavailable APIs"));
    assert.match(code, /inspectWidgetsMeta\(rawMeta\) === "newer"/);
    assert.match(code, /await ensureWidgetsLayout\(syncStorageArea, \{ screen: firstScreen\(\) \}\)/);
    assert.match(code, /widgetsEnsureFailed = true;/);
    const boot = code.slice(code.indexOf("if (favoritesRoot) {\n  void (async () => {"), code.indexOf("})();", code.indexOf("if (favoritesRoot)")));
    const order = ['inspectWidgetsMeta(rawMeta) === "newer"', 'inspectWidgetsMeta(rawMeta) === "invalid"', "await ensureWidgetsLayout(syncStorageArea, { screen: firstScreen() });", 'ensured.meta === "invalid"', "widgetsState = await widgetsService.getState();"].map((n) => boot.indexOf(n));
    assert.ok(order.every((i) => i >= 0), order.join());
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });
  it("starts the bar at a known position before the first render", async () => {
    const html = await readFile(new URL("../src/newtab.html", import.meta.url), "utf8");
    assert.doesNotMatch(html, /id="favorites"[^>]*data-position/);
  });

  it("uses one shared tooltip layer appended to body and placed by placeTooltip", async () => {
    const code = await source();
    assert.match(code, /tooltipLayer\.id = "tooltip";/);
    assert.match(code, /tooltipLayer\.setAttribute\("role", "tooltip"\);/);
    assert.match(code, /document\.body\.appendChild\(tooltipLayer\);/);
    assert.match(code, /placeTooltip\(/);
    assert.doesNotMatch(code, /createTooltip/);
    assert.match(code, /suppressTooltipOnFocus = true;/);
    assert.match(code, /function renderDesktop\(\) \{[\s\S]*?hideTooltip\(\);/);
  });
  it("shows tooltips in normal mode only: guard in showTooltipFor, hidden on edit toggle and drag press", async () => {
    const code = await source();
    assert.match(code, /function showTooltipFor\(trigger\) \{\s*if \(desktopUi\.editMode \|\| dragSession\) return;/);
    assert.match(code, /function setEditMode\(on\) \{[\s\S]*?hideTooltip\(\);/);
    assert.match(code, /function beginPointerDrag\([\s\S]*?hideTooltip\(\);[\s\S]*?dragSession = \{/);
  });

  it("styles the tooltip as a fixed layer with no per-tile edge rules", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.tooltip \{\s*position: fixed;/);
    assert.doesNotMatch(css, /:first-child > \.tooltip/);
    assert.doesNotMatch(css, /:nth-child\(2\) > \.tooltip/);
    assert.doesNotMatch(css, /:last-child > \.tooltip/);
    assert.doesNotMatch(css, /\[data-tooltip-trigger\]:(hover|focus-visible) > \.tooltip/);
  });
});

describe("newtab city modal source", () => {
  const between = (code, from, to) => {
    const start = code.indexOf(from);
    const end = code.indexOf(to, start + from.length);
    assert.ok(start > -1 && end > start, `${from} .. ${to}`);
    return code.slice(start, end);
  };

  it("renders the modal as its own dialog root under body, present only while open", async () => {
    const code = await source();
    assert.match(code, /function showCityModal\(mode, openerSelector\)/);
    assert.match(code, /function hideCityModal\(\)/);
    assert.match(code, /function syncCityModal\(\)/);
    assert.match(code, /function attachCityModalListeners\(root\)/);
    assert.match(code, /root\.id = "city-modal";/);
    assert.match(code, /dialog\.setAttribute\("role", "dialog"\);/);
    assert.match(code, /dialog\.setAttribute\("aria-modal", "true"\);/);
    assert.match(code, /dialog\.setAttribute\("aria-labelledby", "city-modal-title"\);/);
    assert.match(code, /document\.body\.appendChild\(root\);/);
    assert.match(code, /cityModalRoot = root;/);
    assert.match(code, /cityModalRoot\.remove\(\);/);
  });

  it("makes the desktop inert while the modal is open and restores it on close", async () => {
    const code = await source();
    const show = between(code, "function showCityModal(", "function hideCityModal(");
    const hide = between(code, "function hideCityModal(", "function revealDesk(");
    assert.match(show, /favoritesRoot\.inert = true;/);
    assert.match(show, /hideTooltip\(\);/);
    assert.match(hide, /favoritesRoot\.inert = false;/);
    assert.match(hide, /cityModalHadFocus/);
    assert.doesNotMatch(code, /favoritesPanelRoot/);
  });
  it("focuses the field only in change mode and returns focus to the opener, looked up at close time", async () => {
    const code = await source();
    const show = between(code, "function showCityModal(", "function hideCityModal(");
    assert.match(show, /if \(mode === "change"\) cityModalRoot\.querySelector\(CITY_INPUT_SELECTOR\)\?\.focus\(\);/);
    assert.match(code, /pendingFocus = \[cityModalOpener, SETTINGS_TILE_SELECTOR\]\.filter\(Boolean\);/);
    assert.match(code, /const SETTINGS_TILE_SELECTOR = '\[data-widget-id="chrome:settings"\]';/);
    assert.match(code, /showCityModal\("change", HINT_TILE_SELECTOR\)/);
    assert.match(code, /const HINT_TILE_SELECTOR = '\[data-widget-id="weather:hint"\]';/);
    assert.doesNotMatch(code, /CHANGE_CITY_SELECTOR/);
  });
  it("orders the single Escape handler: tooltip, suggestions, modal", async () => {
    const code = await source();
    const handler = between(code, 'if (event.key !== "Escape")', 'if (event.key !== "Tab"');
    const order = [
      'tooltip: !tooltipLayer.hidden',
      "citySuggestions:",
      "onboardingWizard: Boolean(onboardingWizardRoot)",
      "cityModal: Boolean(cityModalRoot)",
      'layer === "tooltip"',
      'layer === "citySuggestions"',
      'layer === "onboardingWizard"',
      'layer === "cityModal"',
      'layer === "dialog"',
      'layer === "exitEdit"'
    ].map((n) => handler.indexOf(n));
    assert.ok(order.every((i) => i >= 0), order.join());
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(handler, /layer === "cityModal"\) \{[^}]*if \(!weatherBusy\) hideCityModal\(\);/);
  });
  it("traps Tab inside the modal; open list items are part of the cycle, hidden controls are not", async () => {
    const code = await source();
    const trap = between(code, 'if (event.key !== "Tab" || !trapRoot) return;', "});");
    assert.doesNotMatch(trap, /select-city/);
    assert.match(trap, /const controls = tabTrapFocusables\(trapRoot\)/);
    assert.match(code, /function tabTrapFocusables\(trapRoot\)[\s\S]*node\.inert \|\| node\.hidden/);
  });

  it("modal controls get a transparent 2px outline only while focused, plus the soft ring", async () => {
    const css = await appStyles();
    const ring = /box-shadow: 0 0 0 2px var\(--(?:soft-ring|focus-overlay-ring)\);/;
    assert.match(css, /\.city-modal :is\(button, input, \.weather-form__suggestion\):focus-visible \{\s*outline: 2px solid transparent;/);
    // Never an outline, ring or fill on resting controls: a resting `.city-modal :is(button, input…)` rule may only carry
    // non-visual declarations (scroll-margin keeps the ring whole when focus scrolls a list).
    const resting = [...css.matchAll(/(\.city-modal :is\(button, input[^)]*\))([^{]*)\{([^}]*)\}/g)].filter((m) => !m[2].includes(":focus-visible"));
    for (const [, selector, , body] of resting) assert.doesNotMatch(body, /outline|box-shadow|background/, selector);
    for (const selector of [".city-modal .favorite-input:focus-visible", ".city-modal .icon-button:focus-visible", ".city-modal .weather-form__suggestion:focus-visible"]) {
      const at = css.indexOf(selector);
      assert.ok(at > -1, selector);
      assert.match(css.slice(at, css.indexOf("}", at)), ring, selector);
    }
    assert.match(css, /\.city-modal \.button:focus-visible,\s*\.city-modal \.icon-button:focus-visible \{\s*background: var\(--soft-fill-strong\);\s*box-shadow: 0 0 0 2px var\(--(?:soft-ring|focus-overlay-ring)\);/);
    assert.doesNotMatch(css, /\.weather-form__suggestion:focus-visible \{\s*outline: 3px/);
  });

  it("the Tab trap covers the city modal or the desktop dialog, whichever is open", async () => {
    const code = await source();
    assert.match(code, /const trapRoot = onboardingWizardRoot \?\? cityModalRoot \?\? desktopDialogRoot;/);
  });

  it("keeps Tab on the page (preventDefault) when every modal control is disabled", async () => {
    const code = await source();
    const trap = between(code, 'if (event.key !== "Tab" || !trapRoot) return;', "});");
    assert.match(trap, /if \(controls\.length === 0\) \{\s*event\.preventDefault\(\);[^\n]*\s*return;\s*\}/);
  });

  it("the automatic wizard never reopens after it was already shown this page load", async () => {
    const code = await source();
    assert.match(code, /let onboardingWizardShownThisLoad = false;/);
    const auto = between(code, "function maybeShowOnboardingWizard(", "\n}\n");
    assert.match(auto, /if \(onboardingWizardRoot \|\| cityModalRoot \|\| desktopDialogRoot \|\| onboardingWizardShownThisLoad\) return;/);
    const show = between(code, "function showOnboardingWizard(", "\n}\n");
    assert.match(show, /onboardingWizardShownThisLoad = true;/);
    const cityShow = between(code, "function showCityModal(", "function hideCityModal(");
    assert.match(cityShow, /cityModalShownThisLoad = true;/);
  });

  it("ignores backdrop clicks right after opening and remembers focus inside the modal", async () => {
    const code = await source();
    const listeners = between(code, "function attachCityModalListeners(root)", "function showCityModal(");
    assert.match(code, /const CITY_MODAL_BACKDROP_GUARD_MS = 300;/);
    assert.match(listeners, /addEventListener\("focusin"/);
    assert.match(listeners, /cityModalHadFocus = true;/);
    assert.match(listeners, /performance\.now\(\) - cityModalOpenedAt >= CITY_MODAL_BACKDROP_GUARD_MS/);
    assert.match(listeners, /\[data-city-modal-backdrop\]/);
    assert.match(listeners, /addEventListener\("click"/);
    assert.doesNotMatch(listeners, /addEventListener\("pointerup"/);
    // run 44: the one mousedown the root has is the busy-focus keeper (keepFocusWhileBusy), nothing else
    for (const [, handler] of listeners.matchAll(/addEventListener\("mousedown",\s*([\w$]+)/g)) assert.equal(handler, "keepFocusWhileBusy");
  });

  it("runs a city change with a timeout, clearing suggestions first, and re-renders the grid", async () => {
    const code = await source();
    const start = code.indexOf("function changeCity(run, { onSuccess = null } = {})");
    assert.ok(start > -1);
    const change = code.slice(start, code.indexOf("\n}\n", start));
    assert.match(change, /activeCityForm\?\.cancelPending\(\);/);
    assert.match(change, /activeCityForm\?\.renderSuggestions\(\);/);
    assert.match(change, /await withTimeout\(run\(isStale\)\)/); // run 44: the attempt hands its stale flag to the service
    assert.match(change, /weatherLocationError = "";/);
    assert.match(change, /cityModalError = "";\s*if \(onboardingWizardRoot\) syncOnboardingWizardUi\(\);\s*else syncCityModal\(\);\s*renderFavorites\(\);/);
    assert.match(code, /const CITY_REQUEST_TIMEOUT_MS = 15000;/);
    assert.match(code, /new WeatherApiError\("Request timed out", \{ kind: "timeout" \}\)/);
    assert.doesNotMatch(code, /The request took too long/);
    const api = await readFile(new URL("../src/weatherApi.js", import.meta.url), "utf8");
    assert.match(api, /The request took too long\. Check your connection and try again\./);
  });
  it("shows only classified error text: no raw error message reaches the city modal, boot error or start result", async () => {
    const code = await source();
    assert.doesNotMatch(code, /cityModalError = error/);
    assert.match(code, /cityModalError = weatherErrorMessage\(error\);/);
    assert.match(code, /weatherLocationError = weatherErrorMessage\(error\);/);
    assert.doesNotMatch(code, /weatherLocationError = error/);
    const start = code.indexOf("async function startWeather()");
    const startBody = code.slice(start, code.indexOf("\n}\n", start));
    assert.match(startBody, /error: weatherErrorMessage\(error\)/);
    assert.doesNotMatch(startBody, /error\.message|String\(error\)/);
    const modal = between(code, "function createCityForm(mode, location)", "function buildCityModal(");
    assert.doesNotMatch(modal, /innerHTML/);
  });
  it("builds the modal with text-only buttons, a novalidate form and the approved strings, never innerHTML", async () => {
    const code = await source();
    const modal = between(code, "function createCityForm(mode, location)", "function buildCityModal(");
    assert.doesNotMatch(modal, /innerHTML/);
    assert.match(modal, /createIconButton\("button", "Cancel", "x"\)/);
    assert.match(modal, /createIconButton\("button button--primary", "Save", "check"\)/);
    assert.match(modal, /createIconButton\("button", "Skip", "x"\)/);
    assert.match(modal, /createIconButton\("button button--primary", "Continue", "arrowRight"\)/);
    assert.match(modal, /form\.noValidate = true;/);
    assert.doesNotMatch(modal, /input\.required/);
    // AS-MO-06: change mode is prefilled from the stored city, caret at the end, no selection; no "Current:" line.
    assert.match(modal, /setSelectionRange\(/);
    assert.doesNotMatch(modal, /\.select\(\)/);
    assert.doesNotMatch(modal, /city-modal__current|cityModalCurrent|Current: /);
    assert.match(modal, /errorNode\.setAttribute\("role", "alert"\);/);
    for (const text of ["Enter a city name", "Where should we show weather?", "Skip", "Continue", "Change city", "Set a city"]) {
      assert.ok(code.includes(text), text);
    }
    assert.ok(!code.includes("Current: "), "Current: removed");
  });

  it("styles the modal above the panel and tooltip, with a readable placeholder and a visible focus ring", async () => {
    const css = await appStyles();
    assert.match(css, /\.city-modal \{[^}]*position: fixed;[^}]*z-index: 100;/s);
    assert.match(css, /\.city-modal__backdrop \{[^}]*background: var\(--surface-backdrop\);/s);
    assert.match(css, /\.city-modal__dialog \{[^}]*width: min\(var\(--surface-modal-max-width\), calc\(100vw - 2 \* var\(--viewport-margin\)\)\);/s);
    assert.match(css, /\.city-modal__dialog--scroll \{[^}]*max-height: calc\(100vh - 2 \* var\(--viewport-margin\)\);[^}]*overflow-y: auto;/s);
    const controls = await readFile(new URL("../src/controls.css", import.meta.url), "utf8");
    assert.match(controls, /\.favorite-input::placeholder \{[^}]*color: var\(--muted\);[^}]*opacity: 1;/s);
    for (const name of ["surfaces.css", "newtab.css"]) {
      assert.doesNotMatch(await readFile(new URL(`../src/${name}`, import.meta.url), "utf8"), /::placeholder/, name);
    }
    assert.doesNotMatch(css, /\.city-modal[^{]*\{[^}]*transition/s);
  });
});

describe("newtab onboarding wizard boot source", () => {
  function bootstrap(code) {
    const start = code.indexOf("if (favoritesRoot) {\n  void (async () => {");
    assert.ok(start >= 0, "bootstrap start");
    return code.slice(start, code.indexOf("})();", start));
  }

  // docs/onboarding-wizard.md decision 1: ONE decision point, before the first render.
  const betweenIn = (code, from, to) => {
    const start = code.indexOf(from);
    assert.ok(start > -1, from);
    const end = code.indexOf(to, start + from.length);
    assert.ok(end > start, `${from} .. ${to}`);
    return code.slice(start, end);
  };
  const functionBody = (code, name) => betweenIn(code, `function ${name}(`, "\n}\n");

  it("takes the wizard decision once, in the bootstrap, BEFORE the first render: early check, capped local read, wizard, render, status, weather", async () => {
    const code = await source();
    assert.equal(code.match(/maybeShowOnboardingWizard\(flags\);/g)?.length, 1);
    assert.equal(code.match(/maybeShowOnboardingWizard\(/g)?.length, 2);
    const boot = bootstrap(code);
    const stateRead = boot.indexOf("widgetsState = await widgetsService.getState();");
    const location = boot.indexOf("weatherLocationKnown = true;");
    const early = boot.indexOf("onboardingWizardPossible(promptLiveState())");
    const flag = boot.indexOf("await readOnboardingLocalFlags(localStorageArea)");
    const call = boot.indexOf("maybeShowOnboardingWizard(flags);");
    const firstRender = boot.indexOf("\n    renderFavorites();\n", call);
    const status = boot.indexOf("if (widgetsEnsureFailed) showDesktopStatus(ENSURE_FAILED_MESSAGE, { persist: true });", firstRender);
    const startWeather = boot.indexOf("void startWeather();", firstRender);
    assert.ok(stateRead > 0 && location > stateRead, "state and city are read first");
    assert.ok(early > location, "the early check follows the city read");
    assert.ok(flag > early && call > flag, "early check, then the local read, then the decision");
    assert.ok(firstRender > call, "the first render comes after the decision");
    assert.ok(status > firstRender && startWeather > status, "render, then the ensure-failure status, then weather");
    assert.equal(boot.indexOf("readOnboardingLocalFlags", firstRender), -1, "no local boot read after the first render");
    assert.doesNotMatch(code, /\.isDismissed\(\)/);
    assert.match(
      boot.slice(0, firstRender),
      /try \{\s*if \(onboardingWizardPossible\(promptLiveState\(\)\) && localStorageArea\) \{\s*const flags = await readOnboardingLocalFlags\(localStorageArea\);\s*maybeShowOnboardingWizard\(flags\);\s*\}\s*\} catch \{/
    );
  });

  it("reads onboarding local flags through onboardingStore (capped, one get)", async () => {
    const code = await source();
    assert.match(code, /import \{ createOnboardingStore, readOnboardingLocalFlags \} from "\.\/onboardingStore\.js";/);
    const storeModule = await readFile(new URL("../src/onboardingStore.js", import.meta.url), "utf8");
    assert.match(storeModule, /export async function readOnboardingLocalFlags/);
    assert.match(storeModule, /Promise\.race\(/);
    assert.match(storeModule, /LOCAL_BOOT_KEYS/);
  });

  it("builds onboarding and prompt stores on local storage", async () => {
    const code = await source();
    assert.match(code, /import \{ onboardingWizardPossible, shouldShowOnboardingWizard \} from "\.\/cityPrompt\.js";/);
    assert.match(code, /const weatherPromptStore = hasStorageArea\(localStorageArea\) \? createWeatherPromptStore\(localStorageArea\) : null;/);
    assert.match(code, /const onboardingStore = hasStorageArea\(localStorageArea\) \? createOnboardingStore\(localStorageArea\) : null;/);
    assert.doesNotMatch(code, /onFirstRunDismissed/);
    assert.doesNotMatch(code, /weatherPromptStore\.dismiss/);
  });

  it("feeds the pure rules with live state and never replaces an open modal", async () => {
    const code = await source();
    const auto = functionBody(code, "maybeShowOnboardingWizard");
    assert.match(
      auto,
      /^function maybeShowOnboardingWizard\(\{ flagRead, dismissed, completeRead, complete \}\) \{\s*if \(onboardingWizardRoot \|\| cityModalRoot \|\| desktopDialogRoot \|\| onboardingWizardShownThisLoad\) return;/
    );
    assert.match(auto, /shouldShowOnboardingWizard\(\{/);
    const live = functionBody(code, "promptLiveState");
    for (const part of [
      "locationRead: weatherLocationKnown && !weatherLocationError",
      "hasLocation: Boolean(weatherLocation)",
      'item.type === "weather-metric" && item.enabled === true',
      "weatherAvailable: Boolean(weatherService && weatherPromptStore && onboardingStore)",
      "gridLocked: widgetsNewer"
    ]) {
      assert.ok(live.includes(part), part);
    }
  });

  it("the resize handler renders nothing until the first render has happened (no tile before the decision)", async () => {
    const code = await source();
    const start = code.indexOf('window.addEventListener("resize", () => {');
    assert.ok(start > -1);
    const handler = code.slice(start, code.indexOf("\n});\n", start));
    assert.match(handler, /if \(!widgetsState \|\| widgetsNewer \|\| renderedColumns === 0\) return;/);
  });

  it("veils the desk from showOnboardingWizard and clears it from hideOnboardingWizard or hideCityModal, before focus", async () => {
    const code = await source();
    assert.equal(code.match(/dataset\.veiled = "true"/g)?.length, 1, "one place sets the veil");
    const show = functionBody(code, "showOnboardingWizard");
    const insert = show.indexOf("onboardingWizardRoot = root;");
    const veil = show.indexOf('favoritesRoot.dataset.veiled = "true"');
    assert.ok(insert > 0 && veil > insert, "the veil is set after the wizard root is mounted");
    for (const later of ["activeCityForm?.place();", "hideTooltip();", "closeAddMenu();", "favoritesRoot.inert = true;"]) {
      assert.ok(show.indexOf(later) > veil, `${later} comes after the veil`);
    }
    assert.equal(code.match(/delete favoritesRoot\.dataset\.veiled/g)?.length, 1, "one place clears the veil");
    assert.equal(code.match(/\brevealDesk\(\)/g)?.length, 3, "revealDesk: definition plus hideCityModal and hideOnboardingWizard");
    const hide = functionBody(code, "hideCityModal");
    const reveal = hide.indexOf("revealDesk();");
    assert.ok(reveal > 0, "hideCityModal reveals the desk");
    assert.ok(reveal < hide.indexOf("applyPendingFocus();"), "the veil is cleared before focus is restored");
    assert.ok(reveal > hide.indexOf("cityModalRoot.remove();") && reveal < hide.indexOf("if (desktopDialogRoot) {"), "after the modal is removed, before the inert restore");
    assert.ok(hide.includes("} else if (favoritesRoot) favoritesRoot.inert = false;"), "the inert line keeps its exact form");
  });

  it("reveals with one CSS fade, none with reduced motion, ended only by the desk's own animationend, with a fallback timer", async () => {
    const code = await source();
    assert.match(code, /const REVEAL_FALLBACK_MS = 400;/);
    const reveal = functionBody(code, "revealDesk");
    const clear = reveal.indexOf("delete favoritesRoot.dataset.veiled;");
    const guard = reveal.indexOf("if (prefersReducedMotion()) return;");
    const set = reveal.indexOf('favoritesRoot.dataset.reveal = "true";');
    assert.ok(clear > 0 && guard > clear && set > guard, "clear the veil, then the reduced-motion guard, then data-reveal");
    assert.equal(code.match(/dataset\.reveal = "true"/g)?.length, 1, "data-reveal is set in one place");
    assert.match(reveal, /setTimeout\(endReveal, REVEAL_FALLBACK_MS\)/);
    assert.match(code, /favoritesRoot\.addEventListener\("animationend", \(event\) => \{\s*if \(event\.target === favoritesRoot && event\.animationName === "desk-reveal"\) endReveal\(\);/);
    assert.match(functionBody(code, "endReveal"), /delete favoritesRoot\.dataset\.reveal;/);
  });

  it("styles the veil (hidden, one screen high, no scroll) and the 200 ms ease-out reveal, off with reduced motion", async () => {
    const css = await appStyles();
    assert.match(css, /\.desktop\[data-veiled="true"\] \{\s*visibility: hidden;\s*height: 100vh;\s*overflow: hidden;\s*\}/);
    assert.match(css, /@keyframes desk-reveal \{\s*from \{ opacity: 0; \}\s*to \{ opacity: 1; \}\s*\}/);
    assert.match(css, /\.desktop\[data-reveal="true"\] \{\s*animation: desk-reveal 200ms ease-out;\s*\}/);
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.desktop\[data-reveal="true"\] \{\s*animation: none;\s*\}\s*\}/);
    assert.ok(reduced, "reduced motion: no reveal animation");
  });

  it("opens the onboarding wizard from one boot path (shell built in a later task)", async () => {
    const code = await source();
    assert.equal(code.match(/showOnboardingWizard\(/g)?.length, 2); // definition + maybeShowOnboardingWizard call
    assert.match(code, /if \(show\) showOnboardingWizard\(\);/);
    assert.doesNotMatch(code, /showCityModal\("first-run"/);
    const start = code.indexOf("function showCityModal(");
    const guard = code.indexOf('if (mode === "change")', start);
    assert.ok(start >= 0 && guard > start);
    assert.doesNotMatch(code.slice(start, guard), /\.focus\(/);
    const guardLine = code.slice(guard, code.indexOf("\n", guard));
    assert.match(guardLine, /\.focus\(\)/);
  });

  it("adds no storage change listener (tabs do not observe each other)", async () => {
    const code = await source();
    assert.doesNotMatch(code, /onChanged/);
  });

  it("onboarding backdrop respects step-2 guard and ignores a second click after choose like the city modal", async () => {
    const code = await source();
    const listeners = betweenIn(code, "function attachOnboardingWizardListeners(root)", "function hideOnboardingWizard(");
    assert.match(listeners, /if \(!onboardingStep2ActionsAllowed\(\)\) return;/);
    assert.doesNotMatch(listeners, /onboardingStep === 1 && !onboardingStep2ActionsAllowed/);
    assert.match(
      listeners,
      /event\.detail > 0[\s\S]*activeCityForm\?\.recentlyChosen\(\)[\s\S]*\[data-onboarding-backdrop\]/
    );
  });

  it("syncOnboardingWizardUi applies finish busy after syncCityModal so aria-busy and disabled stay set", async () => {
    const code = await source();
    const sync = functionBody(code, "syncOnboardingWizardUi");
    const citySync = sync.indexOf("syncCityModal();");
    const finishBusy = sync.indexOf("const finishBusy = favoritesBusy && onboardingStep === 2;");
    const ariaBusy = sync.indexOf('dialog.setAttribute("aria-busy", String((weatherBusy && !locating) || finishBusy));');
    assert.ok(citySync > 0 && finishBusy > citySync && ariaBusy > finishBusy, "city sync, then finish busy");
    const cityModalSync = functionBody(code, "syncCityModal");
    assert.match(cityModalSync, /weatherBusy && !locating/);
    assert.match(cityModalSync, /if \(!onboardingWizardRoot\) \{\s*host\.querySelector\('\[role="dialog"\]'\)\?\.setAttribute\("aria-busy"/);
  });

  it("keeps step-1 focus on the title while the city request runs", async () => {
    const code = await source();
    const sync = functionBody(code, "syncCityModal");
    assert.match(sync, /weatherBusy && !locating && onboardingWizardRoot && onboardingStep === 1/);
    assert.match(sync, /#onboarding-step1-title/);
    const trap = functionBody(code, "tabTrapFocusables");
    assert.match(trap, /controls\.length === 0[\s\S]*onboardingWizardRoot[\s\S]*#onboarding-step1-title/);
  });
});

describe("newtab desktop grid source (DOM contract, normal mode)", () => {
  const css = () => readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
  const html = () => readFile(new URL("../src/newtab.html", import.meta.url), "utf8");
  const fn = (code, name) => {
    const start = code.indexOf(`function ${name}(`);
    assert.ok(start > -1, name);
    return code.slice(start, code.indexOf("\n}\n", start));
  };

  it("pins the page shell: one desktop root, a polite live region and a hidden page-level alert line", async () => {
    const markup = await html();
    assert.match(markup, /<main class="desktop" id="favorites" aria-label="Grid" data-edit="false"><\/main>/);
    assert.doesNotMatch(markup, /aria-label="Widgets"/, "the landmark is named Grid (docs/typography-copy.md decision 4; the only place this is pinned)");
    assert.match(markup, /<div class="sr-only" id="desktop-live" role="status" aria-live="polite"><\/div>/);
    assert.match(markup, /<div class="desktop-status" id="desktop-status" role="alert" hidden><\/div>/);
    assert.doesNotMatch(markup, /favorites-panel|favorites-bar|data-position/);
  });

  it("pins the scroll-margin of the tiles (post-onboarding-grid L0-05)", async () => {
    const styles = await css();
    assert.match(styles, /(^|\n)\.desktop-grid > \[data-widget-id\]\s*\{[^}]*scroll-margin:\s*6px/, "a focused tile scrolls ring + offset + 1 px clear of the window edge");
  });

  it("pins the Finish island call (docs/post-onboarding-grid.md)", async () => {
    const code = await source();
    const finish = fn(code, "finishOnboardingWizard");
    const island = fn(code, "layOutFinishIsland");
    assert.match(finish, /await layOutFinishIsland\(inputs\);/, "Finish delegates to the island function");
    assert.doesNotMatch(finish, /inputs\.length > 0 && widgetsService/, "the call also runs for zero links");
    assert.ok(finish.indexOf("layOutFinishIsland(inputs)") < finish.indexOf("markComplete()"), "island call before the completion flag");
    assert.equal(island.split("addFavorites(").length, 2, "exactly one addFavorites call");
    assert.match(island, /island: \{ rows: viewportRows\(document\.documentElement\.clientHeight, viewportWidth\(\)\) \}/, "island option with the first-screen rows");
    assert.match(island, /columns: currentColumns\(\)/, "columns read at Finish");
    assert.match(island, /if \(inputs\.length >= 1\) throw error;/, "k >= 1 rethrows");
    assert.equal(island.split("healClearedDesk(").length, 2, "exactly one heal");
  });

  it("Finish island: committed flag right after the call for k >= 1, none and no heal for k = 0", async () => {
    const island = fn(await source(), "layOutFinishIsland");
    const k0Start = island.indexOf("if (inputs.length === 0) {");
    const committed = island.indexOf("onboardingStartersCommitted = true;");
    const heal = island.indexOf("healClearedDesk(");
    const reread = island.indexOf("widgetsService.getState()", committed);
    assert.ok(k0Start > -1 && committed > k0Start, "k = 0 branch comes first");
    const k0 = island.slice(k0Start, committed);
    assert.doesNotMatch(k0, /healClearedDesk|onboardingStartersCommitted = true/, "k = 0 never heals and never marks committed");
    assert.equal(island.split("onboardingStartersCommitted = true").length, 2, "the flag is set once");
    assert.ok(committed < reread && reread < heal, "flag, then re-read, then heal");
  });

  it("Finish island: a failing re-read after the write ends in the failed heal outcome, not in the add error (backlog 76)", async () => {
    const island = fn(await source(), "layOutFinishIsland");
    const committed = island.indexOf("onboardingStartersCommitted = true;");
    const tail = island.slice(committed);
    assert.match(tail, /try \{[\s\S]*widgetsService\.getState\(\)[\s\S]*healClearedDesk\([\s\S]*\} catch \{[\s\S]*outcome = \{ state: widgetsState, healed: false, failed: true \};/, "re-read and heal in a try, a catch gives the failed outcome");
    assert.doesNotMatch(island, /addedIds === null/, "no unreachable null check: addFavorites always returns an array");
    assert.match(tail, /if \(outcome\.healed \|\| outcome\.failed\) onboardingHealOutcome = outcome;/, "the failed outcome is kept for the closing exits");
  });

  it("a failed Finish puts the focus back on Finish (backlog 77)", async () => {
    const code = await source();
    const restore = fn(code, "restoreWizardFocusAfterFinishError");
    assert.match(restore, /\[data-onboarding-action="finish"\]/);
    assert.match(restore, /finish\.disabled/, "only when Finish is enabled again");
    assert.match(restore, /onboardingWizardRoot\.contains\(active\)/, "not when the focus is already inside the wizard");
    assert.match(restore, /finish\.focus\(\)/);
    const finish = fn(code, "finishOnboardingWizard");
    assert.equal(finish.split("restoreWizardFocusAfterFinishError();").length - 1, 2, "after the add error and after the completion-flag error");
  });

  it("pins the 56px label fit of link tiles (backlog 78)", async () => {
    const styles = await css();
    assert.match(styles, /:root\[data-cell="56"\] \.favorite-tile\[data-w="1"\]\[data-h="2"\] \{\s*padding-inline: 3px;/);
    assert.match(styles, /:root\[data-cell="56"\] \.favorite-tile\[data-w="1"\]\[data-h="2"\] \.favorite-tile__label \{\s*font-size: 10px;/);
    assert.match(styles, /:root\[data-cell="56"\] \.favorite-tile\[data-w="2"\]\[data-h="1"\] \.favorite-tile__label \{\s*font-size: 12px;/);
  });

  it("pins the DOM contract names: desktop-grid, chrome role, remove badge, per-tile cell variables", async () => {
    const code = await source();
    assert.match(code, /createNode\("div", "desktop-grid"\)/);
    assert.match(code, /grid\.style\.setProperty\("--grid-columns", String\(columns\)\);/);
    assert.match(code, /grid\.style\.setProperty\("--rows", /);
    assert.match(code, /button\.dataset\.chromeRole = item\.role;/);
    assert.match(code, /createNode\("button", "tile-remove"\)/);
    assert.match(code, /badge\.dataset\.removeFor = item\.id;/);
    for (const v of ["--x", "--y", "--w", "--h"]) assert.ok(fn(code, "placeTile").includes(`setProperty("${v}"`), v);
    assert.match(fn(code, "placeTile"), /node\.dataset\.w = String\(cell\.w\);\s*node\.dataset\.h = String\(cell\.h\);/);
    assert.match(code, /favoritesRoot\.dataset\.edit = String\(desktopUi\.editMode\);/);
  });

  it("names the chrome tiles Settings (with aria-pressed) and Add link, and the badges Remove / Hide", async () => {
    const chrome = fn(await source(), "createChromeTile");
    assert.match(chrome, /settings \? "Settings" : "Add link"/);
    assert.match(chrome, /if \(settings\) button\.setAttribute\("aria-pressed", String\(desktopUi\.editMode\)\);/);
    const badge = fn(await source(), "createRemoveBadge");
    assert.match(badge, /hidden \? `Hide \$\{label\}` : `Remove \$\{label\}`/);
  });

  it("names a link tile Open <label> in normal mode and Edit <label> in edit mode; text only via text nodes", async () => {
    const tile = fn(await source(), "createFavoriteTile");
    assert.match(tile, /editing \? `Edit \$\{item\.label\}` : `Open \$\{item\.label\}`/);
    assert.match(tile, /button\.dataset\.favoriteAction = editing \? "edit" : "open";/);
    assert.match(tile, /if \(cell\.w === 2 \|\| cell\.h === 2\) \{/); // 1×1 tiles carry no label text (the label is the accessible name); 2-wide and 1×2 tiles do
    assert.match(tile, /createNode\("span", "favorite-tile__label", item\.label\)/);
    assert.match(tile, /if \(cell\.h === 2\) text\.appendChild\(createNode\("span", "favorite-tile__host", item\.domain\)\);/);
  });

  it("renders from displayLayout of the current column count, skips cell-less (hidden) metrics and sorts the DOM by (y, x)", async () => {
    const render = fn(await source(), "renderDesktop");
    assert.match(render, /const layout = displayLayout\(items, columns\);/);
    assert.match(render, /const columns = currentColumns\(\);/);
    assert.match(render, /if \(!cell\) continue;/);
    assert.match(render, /entries\.sort\(\(a, b\) => a\.cell\.y - b\.cell\.y \|\| a\.cell\.x - b\.cell\.x\);/);
    assert.match(render, /if \(desktopUi\.editMode && item\.type !== "chrome"\)/);
    assert.doesNotMatch(render, /widgetsService\./, "a render never writes");
  });

  it("puts one hint tile in the first enabled metric's cell while there is no city; other metrics wait", async () => {
    const code = await source();
    const render = fn(code, "renderDesktop");
    assert.match(render, /view\?\.status === "no-location"\) \{\s*if \(!hintPlaced\) \{\s*tile = createCityHintTile\(cell, item\);/);
    const hint = fn(code, "createCityHintTile");
    assert.match(hint, /if \(cell\.w === 2\) button\.textContent = "Set a city";\s*else if \(cell\.h === 2\) button\.append\(createIconNode\("mapPin", \{ size: 18 \}\), createNode\("span", "city-hint-tile__text", "Set a city"\)\);\s*else button\.appendChild\(createIconNode\("mapPin"\)\);/);
    assert.match(hint, /button\.setAttribute\("aria-label", "Set a city"\);/);
    assert.doesNotMatch(hint, /createIconNode\("plus"\)/, "the plus glyph belongs to the Add tile");
  });

  it("draws the drop highlight always, exactly at the judged cell (AS-FU-03 invariant, AS-DL decision 3)", async () => {
    const draw = fn(await source(), "drawDropHighlight");
    assert.doesNotMatch(draw, /Math\.(min|max)\(target\./, "the clamp happens in the target, not in the drawing");
    assert.doesNotMatch(draw, /lowest|visible|\.remove\(\)|return;/, "no case without a highlight any more");
    assert.match(draw, /highlight\.style\.setProperty\("--x", String\(target\.x\)\);/);
    assert.match(draw, /highlight\.style\.setProperty\("--y", String\(target\.y\)\);/);
    assert.match(draw, /highlight\.dataset\.valid = String\(valid\);/);
  });

  it("the drag session knows the first screen: viewportRows, the highest row, a grid exactly as high as needed (AS-DL-04)", async () => {
    const begin = fn(await source(), "beginPointerDrag");
    assert.match(begin, /viewportRows\(document\.documentElement\.clientHeight, viewportWidth\(\)\)/);
    assert.match(begin, /maxDropRow\(layout, id, cell\.h, screenRows\)/);
    assert.match(begin, /viewportRows: screenRows,/);
    assert.match(begin, /rows: Math\.max\(occupiedRows, maxY \+ cell\.h\)/);
    assert.doesNotMatch(begin, /\+ 2\b/, "no spare rows beyond the allowed area");
  });

  it("uses the wide weather model for 2-wide tiles and adds the city line only at 2 high (R6)", async () => {
    const tile = fn(await source(), "createWeatherMetricTile");
    assert.match(tile, /const size = cell\.w === 2 \? "wide" : cell\.h === 2 \? "tall" : "square";/); // docs/tile-size-1x2.md decision 6
    assert.match(tile, /if \(cell\.h === 2 && cityName\) tile\.appendChild\(createNode\("span", "weather-tile__city", cityName\)\);/);
  });

  it("leads every weather tile with its decorative metric glyph from the vendored icons, sized by CSS per tile size", async () => {
    const code = await source();
    assert.match(code, /const METRIC_GLYPHS = \{ temperature: "thermometer", precipitation: "droplet", airQuality: "wind", uv: "sun" \};/);
    const tile = fn(code, "createWeatherMetricTile");
    assert.match(tile, /const glyph = createNode\("span", "weather-tile__glyph"\);\s*glyph\.setAttribute\("aria-hidden", "true"\);/);
    assert.match(tile, /glyph\.appendChild\(createIconNode\(METRIC_GLYPHS\[weatherMetricKey\(item\.id\)\]/);
    const styles = await css();
    assert.match(styles, /\.weather-tile__glyph svg \{\s*width: 14px;/);
    assert.match(styles, /\.weather-tile\[data-w="2"\]\[data-h="2"\] \.weather-tile__glyph svg \{\s*width: 24px;/);
  });

  it("forces no minimum page width, so a classic scrollbar at 320 px never scrolls sideways", async () => {
    const styles = await css();
    assert.doesNotMatch(styles, /min-width: 320px/);
  });

  it("sets the grid metrics from JS (R4), never from CSS media queries, and reserves the scrollbar gutter", async () => {
    const code = await source();
    const metrics = fn(code, "applyGridMetrics");
    assert.match(metrics, /const metrics = gridMetrics\(viewportWidth\(\)\);/);
    for (const v of ["--cell-size", "--grid-gap", "--grid-pad"]) assert.ok(metrics.includes(`style.setProperty("${v}"`), v);
    assert.match(code, /return document\.documentElement\.clientWidth;/);
    const styles = await css();
    // Run 46 (decision 12) added the chip reserve to the same rule.
    assert.match(styles, /html \{\s*scrollbar-gutter: stable;\s*(?:\/\*[\s\S]*?\*\/\s*)?scroll-padding-bottom: var\(--status-reserve, 0px\);\s*\}/);
    assert.doesNotMatch(styles, /--cell-size:\s*\d/, "no CSS sets a cell size");
    assert.doesNotMatch(styles, /--grid-gap:\s*\d/);
  });

  it("positions tiles absolutely from the cell variables inside a centered grid block", async () => {
    const styles = await css();
    assert.match(styles, /\.desktop \{[^}]*min-height: 100vh;[^}]*padding: var\(--grid-pad, 16px\);/s);
    assert.match(styles, /\.desktop-grid \{[^}]*position: relative;[^}]*margin: 0 auto;/s);
    assert.match(styles, /\.desktop-grid > \[data-widget-id\] \{[^}]*position: absolute;[^}]*left: calc\(var\(--x\) \* \(var\(--cell-size\) \+ var\(--grid-gap\)\)\);/s);
    assert.match(styles, /\.desktop-grid > \.tile-remove \{[^}]*width: var\(--tile-remove-size\);[^}]*height: var\(--tile-remove-size\);/s);
    assert.match(styles, /\.favorite-tile__label,\s*\.favorite-tile__host \{[^}]*text-overflow: ellipsis;/s);
    assert.doesNotMatch(styles, /grid-column: span 2/);
  });

  it("re-renders on resize only when the column count or the cell size changed, and a resize never writes", async () => {
    const code = await source();
    const start = code.indexOf('window.addEventListener("resize", () => {');
    assert.ok(start > -1);
    const handler = code.slice(start, code.indexOf("\n});\n", start));
    assert.match(handler, /requestAnimationFrame/);
    assert.match(handler, /currentColumns\(\) !== renderedColumns \|\| gridMetrics\(viewportWidth\(\)\)\.cell !== renderedCell/);
    assert.doesNotMatch(handler, /widgetsService|storage/);
  });

  it("in normal mode handles only link open and the hint; the background and chrome tiles do nothing yet", async () => {
    const click = fn(await source(), "handleFavoritesClick");
    assert.match(click, /if \(action === "set-city"\)/);
    assert.match(click, /\} else if \(action === "open"\) \{/);
    assert.match(click, /window\.location\.assign\(favorite\.url\);/);
    assert.doesNotMatch(click, /moveWidget|deleteFavorite|updateWeatherMetric/);
  });


  it("shows a failed ensure in the page-level status line (text only)", async () => {
    const code = await source();
    assert.match(code, /if \(widgetsEnsureFailed\) showDesktopStatus\(ENSURE_FAILED_MESSAGE, \{ persist: true \}\);/);
    assert.match(fn(code, "showDesktopStatus"), /desktopStatus\.textContent = text;/);
  });

  it("Task 10: edit, confirm-delete and weather dialogs, the Add menu and the hide/restore actions (copy, kinds, wiring)", async () => {
    const code = await source();
    const build = fn(code, "buildDialogContent");
    for (const kind of ["add-link", "edit-link", "confirm-delete", "confirm-hide-weather", "edit-weather", "confirm-reset-grid"]) assert.ok(build.includes(`case "${kind}":`), kind);
    assert.match(build, /title\.textContent = "Delete link\?";/);
    assert.match(build, /createNode\("p", "desktop-dialog__body", "This removes the link from your grid\."\)/);
    assert.match(build, /createIconButton\("button button--danger", "Delete", "trash2"\)/);
    assert.match(build, /widgetsService\.updateFavorite\(item\.id, payload, \{ columns \}\)/);
    assert.match(build, /widgetsService\.updateWeatherMetric\(item\.id, size, \{ columns \}\)/);
    assert.match(build, /save\.disabled = true; \/\/ enabled only when the size changed/);
    assert.match(build, /showCityModal\("change", WEATHER_DIALOG_CITY_SELECTOR\)/);
    assert.match(code, /const WEATHER_DIALOG_CITY_SELECTOR = '\[data-dialog="edit-weather"\] \[data-weather-action="open-city-modal"\]';/);
    // AS-MO-10 (updated by run 44, AS-CMF-11/22): the city-field is one button; with a city the hint is `Change`; with no city the value line
    // is `Set a city` (the "No city set" ban is one global pin in the run-44 block) and the separate hint is hidden and out of the accessible name; the old text-button copy is gone.
    const sync = fn(code, "syncWeatherDialogCity");
    assert.match(code, /createNode\("span", "city-field__hint", "Change"\)/, "the hint is Change from the start; the sync only shows or hides it");
    assert.match(sync, /"Set a city"/);
    assert.doesNotMatch(sync, /"Change city"/);
    assert.match(sync, /\.title = /);
    assert.doesNotMatch(code, /desktop-dialog__city|"text-button"/);
    assert.match(build, /"city-field"/);
    assert.match(code, /aria-labelledby/);
    // AS-MO-09 / AS-MO-16: weather − opens the hide confirm; titles, body, eyeOff Hide (primary), announcement.
    for (const text of ["Hide temperature?", "Hide precipitation?", "Hide air quality?", "Hide UV index?", "This hides the tile from your grid. You can add it again from Add.", "Temperature hidden", "Precipitation hidden", "Air quality hidden", "UV index hidden"]) {
      assert.ok(code.includes(text), text);
    }
    assert.match(build, /createIconButton\("button button--primary", "Hide", "eyeOff"\)/);
    assert.doesNotMatch(fn(code, "handleEditModeClick"), /hideWeatherMetric\(/);
    assert.match(fn(code, "handleEditModeClick"), /confirm-hide-weather/);
    // Size radiogroup: one shared control, values 1x1|1x2|2x1|2x2 (docs/tile-size-1x2.md decision 1).
    assert.match(
      code,
      /const SIZE_OPTIONS = \[\s*\["1x1", "1×1", "size-1x1", "1×1, 1 wide, 1 high"\],\s*\["1x2", "1×2", "size-1x2", "1×2, 1 wide, 2 high"\],\s*\["2x1", "2×1", "size-2x1", "2×1, 2 wide, 1 high"\],\s*\["2x2", "2×2", "size-2x2", "2×2, 2 wide, 2 high"\]\s*\];/
    ); // docs/tile-size-followups.md decisions 1-2: shape glyph and an accessible name that starts with the visible text
    assert.match(fn(code, "createSizeControl"), /createSegmentedControl\("size", SIZE_OPTIONS,/);
    assert.match(
      fn(code, "createFavoriteForm"),
      /rows\.push\(\s*createFormRow\("Size", createSizeControl\(isEdit \? displayedSize\(item\) : \{ w: 1, h: 1 \}\)\)\s*\);/
    );
    // Both favorite-form branches carry the role=alert slot (the edit dialog had none before Task 10).
    assert.match(fn(code, "createFavoriteForm"), /form\.append\(\.\.\.rows, createDialogErrorSlot\(\), footer\);/);
    assert.match(fn(code, "createDialogErrorSlot"), /error\.setAttribute\("role", "alert"\);\s*error\.dataset\.dialogError = "";/);
    // Add menu: role=menu named Add; the second level lists hidden metrics by name; one menu per activation.
    assert.match(code, /menu\.setAttribute\("role", "menu"\);\s*menu\.setAttribute\("aria-label", "Add"\);/);
    assert.match(fn(code, "fillAddMenu"), /\["add-link", "Add link", null\], \["add-weather", "Add weather tile…", null\]/);
    assert.match(fn(code, "fillAddMenu"), /hiddenMetrics\(\)\.map\(\(item\) => \["restore", metricName\(item\.id\), item\.id\]\)/);
    assert.match(fn(code, "fillAddMenu"), /entry\.setAttribute\("role", "menuitem"\);/);
    assert.match(fn(code, "activateAddTile"), /if \(!desktopUi\.editMode \|\| hiddenMetrics\(\)\.length === 0\) \{\s*openDesktopDialog\(\{ kind: "add-link" \}\);/);
    assert.match(fn(code, "activateAddTile"), /if \(addMenuRoot\) \{\s*focusMenuItem\(0\);\s*return;/, "a second activation keeps the one menu");
    assert.match(code, /\} else if \(layer === "menu"\) \{\s*closeAddMenu\(\{ focusAdd: true \}\);/);
    // Hide / restore / delete go through the atomic runner; the hint's badge carries its metric id, never weather:hint.
    assert.match(fn(code, "hideWeatherMetric"), /widgetsService\.updateWeatherMetric\(metricId, \{ enabled: false \}, \{ columns \}\)/);
    assert.match(fn(code, "restoreWeatherMetric"), /widgetsService\.updateWeatherMetric\(metricId, \{ enabled: true \}, \{ columns \}\)/);
    assert.match(fn(code, "confirmDeleteFavorite"), /const next = neighborTargets\(id\);[\s\S]*widgetsService\.deleteFavorite\(id, \{ columns \}\)/);
    assert.match(fn(code, "neighborTargets"), /\[ids\[index \+ 1\], ids\[index - 1\]\]\), SETTINGS_TILE_ID\]/);
    assert.match(fn(code, "handleEditModeClick"), /tile\.dataset\.metricId \?\? tile\.dataset\.widgetId/);
    assert.match(fn(code, "createCityHintTile"), /if \(!desktopUi\.editMode\) button\.dataset\.favoriteAction = "set-city";/);
    // closeDesktopDialog takes a widget id, an { id, badge } target or a list; the weather dialog falls back to its metric.
    assert.match(fn(code, "closeDesktopDialog"), /if \(restoreFocusTo\) focusWidgetTarget\(\[restoreFocusTo, fallback\]\.flat\(\), \{ preventScroll: true, reveal \}\);/);
    assert.match(fn(code, "focusWidgetTarget"), /typeof target === "string" \? \{ id: target, badge: false \} : target/);
  });

  it("Task 10: the city modal stacked over the weather dialog keeps the grid inert and restores only the dialog on close", async () => {
    const code = await source();
    const show = fn(code, "showCityModal");
    assert.match(show, /if \(overWeatherDialog\) \{\s*desktopDialogRoot\.inert = true;/);
    assert.match(show, /cityModalRoot\.classList\.add\("city-modal--stacked"\);/);
    const hide = fn(code, "hideCityModal");
    assert.match(hide, /if \(desktopDialogRoot\) \{[^}]*desktopDialogRoot\.inert = false;\s*syncWeatherDialogCity\(\);\s*\} else if \(favoritesRoot\) favoritesRoot\.inert = false;/);
    // The opener of a stacked city modal lives in the dialog, outside the grid: focus lookup is document-wide.
    assert.match(fn(code, "applyPendingFocus"), /const target = document\.querySelector\(selector\);/);
    const css = await appStyles();
    assert.match(css, /\.city-modal\.city-modal--stacked\s*\{[^}]*z-index: 102;/s);
    assert.match(css, /\.desktop-dialog \{[^}]*z-index: 101;/s);
  });

  it("Task 10: onboarding step 1 copy mentions skipping the city for now", async () => {
    const code = await source();
    // Run 44 (AS-CMF-13/14): the same resting sentences, but the words around the link are separate nodes (so the busy state can hide
    // them): append(<before node>, link, <after node>, status). Order of the arguments is pinned.
    const description = topLevelFunction(stripComments(code), "createCityLocationDescription");
    const wizard = description.match(/paragraph\.append\(\s*(\w+),\s*link,\s*(\w+),\s*status\s*\);/);
    assert.ok(wizard, "append(<node>, link, <node>, status) exists for the wizard step");
    const modal = [...description.matchAll(/paragraph\.append\(\s*(\w+),\s*link,\s*(\w+),\s*status\s*\);/g)];
    assert.ok(modal.length >= 1, "the append(<node>, link, <node>, status) shape exists");
    for (const text of ["Enter a city, ", ", or skip for now.", "Search for a city or ", "."]) {
      assert.ok(description.includes(JSON.stringify(text)), `${JSON.stringify(text)} is still built`);
      assert.doesNotMatch(
        description,
        new RegExp(`append\\([^;]*${JSON.stringify(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
        `${JSON.stringify(text)} is a node of its own, not a bare string argument`
      );
    }
    const indexOfText = (text) => description.indexOf(JSON.stringify(text));
    assert.ok(indexOfText("Enter a city, ") < indexOfText(", or skip for now."), "wizard: before-node precedes after-node");
    assert.ok(indexOfText("Search for a city or ") < description.lastIndexOf(JSON.stringify(".")), "modal: before-node precedes after-node");
    assert.match(code, /dataset\.weatherAction = "use-location"/);
    assert.match(code, /dataset\.cityLocationStatus/);
    assert.match(code, /function createCityLocationDescription/);
    assert.doesNotMatch(code, /later in Widgets/);
  });

  it("Task 10: the − badge has an explicit focus ring from the tile focus ring token (--focus-ring, fix wave 2)", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.desktop-grid > \.tile-remove:focus-visible \{\s*outline: 3px solid var\(--focus-ring\);/);
  });


  it("run 17 (AS-VC-01): the first screen is measured once, right before ensureWidgetsLayout, with the drag's own definition of the first screen", async () => {
    const code = await source();
    const def = code.slice(code.indexOf("function firstScreen() {"));
    const body = def.slice(0, def.indexOf("\n}\n"));
    assert.ok(body.includes("document.documentElement.clientHeight"), "reads the viewport height");
    assert.match(body, /rows: viewportRows\(document\.documentElement\.clientHeight, viewportWidth\(\)\)/);
    assert.match(body, /columns: currentColumns\(\)/);
    // the same call and the same two inputs as the drag (docs/widget-drag-limits.md)
    assert.match(code, /const screenRows = viewportRows\(document\.documentElement\.clientHeight, viewportWidth\(\)\);/);
    // one definition, the boot call and the heal of a cleared storage in recoverFromGoneLink (docs/stale-tab-empty-state.md decision 2):
    // nothing else re-reads the first screen (no resize hook, no re-render)
    assert.equal(code.split("firstScreen(").length - 1, 3);
    assert.equal(fn(code, "healClearedDesk").split("firstScreen(").length - 1, 1); // the one heal helper makes the call (run 30)
    assert.equal(fn(code, "recoverFromGoneLink").split("firstScreen(").length - 1, 0);
    const boot = code.slice(code.indexOf("if (favoritesRoot) {\n  void (async () => {"), code.indexOf("})();", code.indexOf("if (favoritesRoot)")));
    const call = boot.indexOf("await ensureWidgetsLayout(syncStorageArea, { screen: firstScreen() });");
    assert.ok(call > boot.indexOf('inspectWidgetsMeta(rawMeta) === "invalid"') && call < boot.indexOf("widgetsState = await widgetsService.getState();"));
    // evaluated before the first render of the desk: the only renders before the call are the two early locks (the newer and the invalid meta), each returns
    const beforeCall = boot.slice(boot.indexOf("let rawMeta = {};"), call);
    assert.equal((beforeCall.match(/renderFavorites\(\)/g) ?? []).length, 2, "only the two early locks render before the call (each returns)");
  });
  it("run 15: the page works in displayed cells", async () => {
    const code = await source();
    // the page works in displayed cells: it never converts between the displayed and the stored frame itself
    assert.doesNotMatch(code, /toStored|toDisplayed|originColumn/);
  });

  it("Task 11: edit dialogs select the displayed size, never reading a stored grid that a lenient read may have dropped", async () => {
    const code = await source();
    const build = fn(code, "buildDialogContent");
    assert.doesNotMatch(build, /item\.grid\.[wh]/);
    assert.match(build, /const size = displayedSize\(item\);\s*const initial = `\$\{size\.w\}x\$\{size\.h\}`;/);
    assert.match(build, /createFormRow\("Size", createSizeControl\(size\)\)/);
    assert.match(fn(code, "displayedSize"), /displayLayout\(widgetsState\.items, currentColumns\(\)\)\.get\(item\.id\)/);
    assert.match(fn(code, "displayedSize"), /cell \? \{ w: cell\.w, h: cell\.h \} : \{ w: 1, h: 1 \}/);
  });

  it("Task 11: the Add menu's second level is named Add weather tile; the Add tile announces its menu only when it can open one", async () => {
    const code = await source();
    assert.match(fn(code, "fillAddMenu"), /addMenuRoot\.setAttribute\("aria-label", kind === "add" \? "Add" : "Add weather tile"\);/);
    const chrome = fn(code, "createChromeTile");
    assert.match(chrome, /else if \(desktopUi\.editMode && hiddenMetrics\(\)\.length > 0\) \{\s*button\.setAttribute\("aria-haspopup", "menu"\);/);
    assert.match(chrome, /button\.setAttribute\("aria-expanded", String\(addMenuRoot !== null\)\);/);
    assert.match(fn(code, "closeAddMenu"), /syncAddTileExpanded\(\);/);
    assert.match(fn(code, "activateAddTile"), /syncAddTileExpanded\(\);\s*fillAddMenu\("add"\);/);
  });

  it("Task 11: add and edit (Auto color) sample the favicon accent after a successful write", async () => {
    const code = await source();
    const build = fn(code, "buildDialogContent");
    assert.match(build, /const added = widgetsState\?\.items\.findLast\(\(entry\) => entry\.type === "favorite" && !previousIds\.has\(entry\.id\)\);\s*if \(added\) \{\s*void refreshAutoAccent\(added\.id\);/);
    assert.match(build, /if \(payload\.backgroundColorSource === "auto"\) void refreshAutoAccent\(item\.id\);/);
  });

  it("Task 11: weather type follows the JS-set cell size, not a viewport query; status line and dialog error spacing", async () => {
    const code = await source();
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    const styles = await appStyles();
    assert.match(fn(code, "applyGridMetrics"), /document\.documentElement\.dataset\.cell = String\(metrics\.cell\);/);
    for (const [cell, primaryToken, secondaryToken] of [
      ["64", "--font-size-weather-primary-cell-64", "--font-size-weather-secondary-cell-64"],
      ["56", "--font-size-weather-primary-cell-56", "--font-size-weather-secondary-cell-56"]
    ]) {
      assert.match(
        css,
        new RegExp(
          `:where\\(:root\\[data-cell="${cell}"\\]\\) \\.weather-tile__primary \\{ font-size: var\\(${primaryToken}\\); \\}`
        )
      );
      assert.match(
        css,
        new RegExp(
          `:where\\(:root\\[data-cell="${cell}"\\]\\) \\.weather-tile__secondary \\{ font-size: var\\(${secondaryToken}\\); \\}`
        )
      );
    }
    for (const block of css.matchAll(/@media \(max-width: \d+px\) \{[\s\S]*?\n\}/g)) assert.doesNotMatch(block[0], /weather-tile/);
    assert.match(css, /\.desktop-status \{[^}]*width: max-content;[^}]*max-width: min\(560px, calc\(100vw - 32px\)\);/s);
    assert.match(styles, /\.desktop-dialog__error \{\s*margin: 8px 0 0;/);
    assert.doesNotMatch(css, /--metric-(on|off)/);
    assert.doesNotMatch(css, /z-index 40/);
  });

  it("a drag target in the margins, above the grid or below the allowed rows snaps to the nearest allowed cell; only an occupied cell is invalid (AS-DL-03, 05, 07)", async () => {
    const code = await source();
    const update = fn(code, "updateDragTarget");
    assert.doesNotMatch(update, /outside/);
    assert.match(update, /const target = clampDropCell\(cellFromPoint\(\{ x: s\.lastX, y: s\.lastY \}, box, s\.metrics, s\.grab\), s\.cell, s\.columns, s\.maxY\);/);
    assert.match(update, /const valid = canPlace\(s\.layout, s\.id, \{ \.\.\.target, w: s\.cell\.w, h: s\.cell\.h \}, s\.columns, s\.viewportRows\);/);
    assert.match(update, /drawDropHighlight\(grid, target, s, valid\);/);
  });

  it("fix wave 2: the link dialog's color input has its own accessible name; the narrow Edit link footer rules are gone (no Delete there); a hidden badge is not displayed", async () => {
    const code = await source();
    assert.match(fn(code, "createFavoriteForm"), /color\.type = "color";\s*color\.setAttribute\("aria-label", "Background color"\);/);
    const css = await appStyles();
    const gridCss = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /data-dialog="edit-link"\] \.favorite-form__footer/);
    assert.match(gridCss, /\.desktop-grid > \.tile-remove\[hidden\] \{ display: none; \}/);
  });

  it("never uses innerHTML in newtab.js and adds no chrome.storage.onChanged listener", async () => {
    const code = await source();
    assert.doesNotMatch(code, /innerHTML/);
    assert.doesNotMatch(code, /chrome\.storage\.onChanged|storage\.onChanged/);
  });

  it("pins the 1×2 link tile (docs/tile-size-1x2.md)", async () => {
    const code = await source();
    const styles = await css();
    assert.match(fn(code, "createFavoriteTile"), /if \(cell\.w === 2 \|\| cell\.h === 2\) \{/);
    assert.match(fn(code, "createFavoriteTile"), /if \(cell\.h === 2\) text\.appendChild\(createNode\("span", "favorite-tile__host", item\.domain\)\);/);
    assert.match(styles, /\.favorite-tile\[data-w="1"\]\[data-h="2"\] \.favorite-tile__label\s*\{[^}]*-webkit-line-clamp: 3;/s);
  });

  it("pins the 1×2 weather tile (docs/tile-size-1x2.md)", async () => {
    const code = await source();
    assert.match(fn(code, "createWeatherMetricTile"), /const size = cell\.w === 2 \? "wide" : cell\.h === 2 \? "tall" : "square";/);
    assert.match(fn(code, "createWeatherMetricTile"), /createIconNode\("refresh", \{ size: cell\.w === 2 && cell\.h === 2 \? 14 : 12 \}\)/);
    assert.match(await css(), /\.weather-tile\[data-w="1"\]\[data-h="2"\] \.weather-tile__city\s*\{[^}]*overflow-wrap: anywhere;/s);
  });

  it("pins the Size shape glyphs and accessible names (docs/tile-size-followups.md decisions 1-3)", async () => {
    const code = await source();
    const controls = await readFile(new URL("../src/controls.css", import.meta.url), "utf8");
    const surfaces = await readFile(new URL("../src/surfaces.css", import.meta.url), "utf8");
    const segmented = fn(code, "createSegmentedControl");
    assert.match(segmented, /for \(const \[value, text, glyph, accessibleName\] of options\)/);
    assert.match(segmented, /if \(accessibleName\) input\.setAttribute\("aria-label", accessibleName\);/);
    assert.match(controls, /\.segmented__glyph\s*\{[^}]*flex: none;[^}]*box-sizing: border-box;[^}]*border: 1\.5px solid currentColor;/s);
    assert.match(controls, /\.segmented__glyph--size-1x2 \{ width: 5px; height: 11px; \}/);
    assert.match(controls, /\.segmented__glyph--size-2x1 \{ width: 11px; height: 5px; \}/);
    assert.match(controls, /\.segmented__glyph--size-2x2 \{ width: 11px; height: 11px; \}/);
    // The segment rule lives in its own 451px block; the row wrapping stays in the row-stacking block (since run 49 its query is
    // `@media (max-width: 400px), (max-width: 25rem)`: 400 px at the default font size, 600 px at 150 %).
    const narrow = surfaces.slice(surfaces.indexOf("@media (max-width: 451px)"));
    assert.match(narrow, /\.desktop-dialog \.segmented__option \{\s*padding: 0 5px;\s*white-space: nowrap;\s*\}/);
    assert.match(narrow, /\.segmented__glyph--size-1x2 \{ width: 4px; height: 9px; \}/);
    const wrap = surfaces.slice(surfaces.indexOf("@media (max-width: 400px), (max-width: 25rem)"), surfaces.indexOf("@media (max-width: 451px)"));
    assert.match(wrap, /flex-wrap: wrap;/);
    assert.doesNotMatch(wrap, /segmented__option/);
  });

  it("pins the forced-colors rule for the selected dialog segment (docs/tile-size-followups.md decision 6)", async () => {
    const surfaces = await readFile(new URL("../src/surfaces.css", import.meta.url), "utf8");
    const rule = /@media \(forced-colors: active\) \{\s*\.desktop-dialog \.segmented__option:has\(input:checked\) \{\s*forced-color-adjust: none;[^\n]*\n\s*background: Highlight;\s*color: HighlightText;\s*\}\s*\}/;
    assert.match(surfaces, rule);
    assert.ok(surfaces.search(rule) > surfaces.indexOf(".desktop-dialog .segmented__option:has(input:checked) {"), "after the rule it overrides");
  });

  it("pins the link host color: 70 % muted, 30 % text (docs/stale-link-and-host-contrast.md decision 4)", async () => {
    const styles = await css();
    assert.match(styles, /\.favorite-tile__host \{[^}]*color: color-mix\(in srgb, var\(--muted\) 70%, var\(--text\)\);/s);
  });

  it("pins the stale-tab recovery (docs/stale-link-and-host-contrast.md decision 2)", async () => {
    const code = await source();
    const run = fn(code, "runDesktopMutation");
    assert.match(run, /error\?\.code === "link-gone"/);
    assert.ok(run.indexOf('"link-gone"') < run.indexOf("if (onFailure)"), "checked before onFailure and the dialog error");
    // backlog 69: each function carries its own comment (the mutation comment above runDesktopMutation, the recovery one above recoverFromGoneLink)
    assert.match(code, /\/\/ `onFailure\(message\)` then owns the failure UI instead of the immediate re-render\.\nasync function runDesktopMutation\(/);
    assert.match(code, /\/\/ first\); a failed heal ends in `showLayoutRestoreFailure`\.\nasync function recoverFromGoneLink\(/);
    const recover = fn(code, "recoverFromGoneLink");
    assert.match(recover, /pendingDrop = null;/);
    assert.match(recover, /neighborTargets\(error\.id\)/);
    assert.match(recover, /await widgetsService\.getState\(\)/);
    assert.match(recover, /finishFavoritesAction\(generation, \(\) => \{\s*if \(fresh\) widgetsState = fresh;/);
    assert.match(recover, /fresh = outcome\.state;/);
    assert.match(recover, /const outcome = await healClearedDesk\(fresh\);/);
    assert.match(recover, /if \(outcome\.healed\) neighbours = \[SETTINGS_TILE_ID\];/);
    assert.match(recover, /closeDesktopDialog\(\{ restoreFocusTo: neighbours, reveal: true \}\)/);
    assert.match(recover, /if \(outcome\.healed\) showDesktopStatus\(LAYOUT_RESET_MESSAGE, \{ tone: "info" \}\);\s*else showDesktopStatus\(error\.message\);/);
    assert.ok(recover.indexOf("healClearedDesk(") < recover.indexOf("finishFavoritesAction("), "healed before the one render");
    assert.doesNotMatch(recover, /announce\(/); // the alert status announces it once
    // the heal helper (docs/stale-tab-recovery-followups.md decision 1): only without Settings, guarded against null, always re-reads, never throws
    const heal = fn(code, "healClearedDesk");
    assert.match(heal, /if \(!state \|\| state\.items\.some\(\(item\) => item\.id === SETTINGS_TILE_ID\)\) return \{ state, healed: false, failed: false \};/);
    assert.match(heal, /await ensureWidgetsLayout\(syncStorageArea, \{ screen: firstScreen\(\) \}\);\s*result = await widgetsService\.getState\(\);/);
    assert.doesNotMatch(heal, /\.changed/); // the re-read does not depend on `changed` (another tab may have healed in between)
    assert.match(heal, /\} catch \{\s*\/\/ keep what we have/);
    // a failed heal (decision 5): dialog closed without focus, edit mode and layers left, live region emptied, then focus on #favorites and the persistent message
    const leave = fn(code, "leaveEditModeAfterFailedHeal");
    assert.match(leave, /closeDesktopDialog\(\{ restoreFocusTo: null \}\)/);
    assert.ok(leave.indexOf("closeDesktopDialog(") < leave.indexOf("exitEditMode(desktopUi)"));
    assert.match(leave, /cancelDrag\(\);\s*closeAddMenu\(\);\s*hideTooltip\(\);\s*announce\(""\);/);
    assert.doesNotMatch(leave, /setEditMode\(/);
    const failure = fn(code, "showLayoutRestoreFailure");
    assert.match(failure, /setAttribute\("tabindex", "-1"\)/);
    assert.match(failure, /focus\(\{ preventScroll: true \}\)/);
    assert.match(failure, /showDesktopStatus\(LAYOUT_RESTORE_FAILED_MESSAGE, \{ persist: true \}\)/);
    assert.ok(failure.indexOf("focus(") < failure.indexOf("showDesktopStatus("));
    // docs/stale-tab-closeout.md decision 1: the Reload button (a real button, textContent) after the text, the chip is dismissable
    assert.match(failure, /createNode\("button", "button desktop-status__reload", "Reload"\)/);
    assert.match(failure, /reload\.type = "button";/);
    assert.match(failure, /location\.reload\(\)/);
    assert.match(failure, /layoutFailureChipShown = true;/);
    assert.ok(failure.indexOf("showDesktopStatus(") < failure.indexOf("desktopStatus.append(reload)"), "the button after the text (showDesktopStatus resets the chip)");
    assert.match(recover, /if \(outcome\.failed\) leaveEditModeAfterFailedHeal\(\);/);
    assert.ok(recover.indexOf("leaveEditModeAfterFailedHeal(") < recover.indexOf("finishFavoritesAction("), "layers left before the render");
    assert.match(recover, /if \(outcome\.failed\) \{\s*showLayoutRestoreFailure\(\);\s*return;/);
    // the post-action check of runDesktopMutation (decision 3) and the strings (Copy)
    assert.match(run, /const outcome = await healClearedDesk\(next\);/);
    assert.match(run, /if \(outcome\.failed\) leaveEditModeAfterFailedHeal\(\);/);
    assert.match(run, /else if \(outcome\.healed\) showDesktopStatus\(LAYOUT_RESET_MESSAGE, \{ tone: "info" \}\);/);
    assert.ok(run.indexOf("healClearedDesk(next)") < run.indexOf("leaveEditModeAfterFailedHeal()") && run.indexOf("leaveEditModeAfterFailedHeal()") < run.indexOf("finishFavoritesAction(generation"), "healed and layers left before the render");
    assert.ok(run.indexOf("finishFavoritesAction(generation") < run.indexOf("showLayoutRestoreFailure()"), "the failure message after the render");
    assert.match(code, /const LAYOUT_RESET_MESSAGE = "Your layout was reset in another tab\.";/);
    assert.match(code, /const LAYOUT_RESTORE_FAILED_MESSAGE = "Couldn't restore your layout\. Reload this tab\.";/);
    // the Add link handler speaks "Link added" only when Settings is there (after a failed heal the alert speaks)
    assert.match(code, /if \(widgetsState\?\.items\.some\(\(entry\) => entry\.id === SETTINGS_TILE_ID\)\) announce\("Link added"\);/);
    const styles = await css();
    assert.match(styles, /\.desktop\[tabindex="-1"\]:focus \{\s*outline: none;\s*\}/);
  });

  it("pins the failure chip close-out (docs/stale-tab-closeout.md)", async () => {
    const code = await source();
    const styles = await css();
    // decision 2: the tone is set on every call, so it never sticks; only the reset message is neutral
    const show = fn(code, "showDesktopStatus");
    assert.match(show, /tone = "error"/);
    assert.match(show, /classList\.toggle\("desktop-status--info", tone === "info"\)/);
    assert.match(show, /layoutFailureChipShown = false;/); // any new message ends the chip state
    assert.match(styles, /\.desktop-status--info \{\s*border-color: var\(--border\);\s*color: var\(--text\);\s*\}/);
    assert.match(styles, /\.desktop-status__reload \{[^}]*display: flex;/s);
    assert.match(styles, /\.desktop-status__reload:focus-visible \{\s*background: var\(--soft-fill-strong\);\s*box-shadow: 0 0 0 2px var\(--focus-overlay-ring\);\s*outline-color: transparent;[^}]*\}/);
    // decision 1: Escape, the lowest layer, dismisses only the chip and returns focus from Reload to #favorites
    assert.match(code, /status: layoutFailureChipShown/);
    assert.match(code, /else if \(layer === "status"\) \{\s*dismissLayoutFailureChip\(\);/);
    const dismiss = fn(code, "dismissLayoutFailureChip");
    assert.match(dismiss, /desktopStatus\?\.contains\(document\.activeElement\)/);
    assert.ok(dismiss.indexOf("contains(") < dismiss.indexOf('showDesktopStatus("")'), "focus is read before the chip is emptied");
    assert.match(dismiss, /favoritesRoot\.focus\(\{ preventScroll: true \}\)/);
    // decision 3: the wizard heals after its starters are written and shows the kept outcome on both closing exits
    const finish = fn(code, "finishOnboardingWizard");
    const island = fn(code, "layOutFinishIsland");
    assert.match(island, /outcome = await healClearedDesk\(widgetsState\);/);
    assert.match(island, /onboardingHealOutcome = outcome;/);
    assert.equal(finish.split("showWizardHealOutcome();").length - 1, 2);
    const shown = fn(code, "showWizardHealOutcome");
    assert.match(shown, /leaveEditModeAfterFailedHeal\(\);\s*showLayoutRestoreFailure\(\);/);
    assert.match(shown, /showDesktopStatus\(LAYOUT_RESET_MESSAGE, \{ tone: "info" \}\)/);
    // decision 4: after a heal a city kept in memory is dropped only when the storage has none; a throwing read keeps it
    const drop = fn(code, "dropCityClearedElsewhere");
    assert.match(drop, /await weatherLocationStore\.getLocation\(\)/);
    assert.match(drop, /\} catch \{\s*return;\s*\}\s*if \(stored\) return;/);
    assert.match(drop, /weatherResult = \{ status: "no-location", location: null, data: null, error: null \};/);
    assert.match(drop, /weatherGeneration \+= 1;[\s\S]*weatherRetryToken \+= 1;/);
    assert.match(fn(code, "healClearedDesk"), /if \(healed\) await dropCityClearedElsewhere\(\);/);
  });

  it("pins the full text color on toned weather tiles (docs/tile-size-followups.md decision 4)", async () => {
    const styles = await css();
    assert.match(styles, /\.weather-tile\[data-weather-tone\] \.weather-tile__city,\s*\.weather-tile\[data-weather-tone\] \.weather-tile__glyph \{\s*color: var\(--text\);\s*\}/);
    assert.match(styles, /\.weather-tile__city \{[^}]*color: var\(--muted\);/s); // an untoned tile keeps the muted line
  });

  it("pins the 1×2 city hint (docs/tile-size-1x2.md decision 4)", async () => {
    const code = await source();
    assert.match(fn(code, "createCityHintTile"), /else if \(cell\.h === 2\) button\.append\(createIconNode\("mapPin", \{ size: 18 \}\), createNode\("span", "city-hint-tile__text", "Set a city"\)\);/);
  });
});

// AS-MO-11 and AS-MO-15 (docs/modal-overlay-design.md): unit-only CSS and token pins.
describe("modal overlay: tokens, rows, footers, segmented (AS-MO-11, AS-MO-15)", () => {
  const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
  const stripCss = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
  const ruleBody = (css, selector) => {
    const match = [...stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1].trim() === selector);
    assert.ok(match, `rule ${selector}`);
    return match[2];
  };

  it("tokens: --modal-actions-margin-top 16px, --form-row-padding-y 10px, --form-footer-padding-y gone from src/", async () => {
    const tokens = await read("design-tokens.css");
    assert.match(tokens, /--modal-actions-margin-top:\s*16px;/);
    assert.match(tokens, /--form-row-padding-y:\s*10px;/);
    for (const name of ["design-tokens.css", "controls.css", "surfaces.css", "newtab.css", "newtab.js"]) {
      assert.doesNotMatch(await read(name), /--form-footer-padding-y/, name);
    }
  });

  it("dialog rows have no border-top and use the row padding token", async () => {
    const controls = await read("controls.css");
    const row = ruleBody(controls, ".favorite-form__row");
    assert.doesNotMatch(row, /border/);
    assert.match(row, /padding: var\(--form-row-padding-y\) 0;/);
    assert.doesNotMatch(stripCss(controls), /\.favorite-form__row:first-child/);
  });

  it("modal action rows: margin from the token, no border-top, no padding, 50/50 buttons, no margin-right:auto on danger", async () => {
    const controls = await read("controls.css");
    const surfaces = await read("surfaces.css");
    const footer = ruleBody(controls, ".favorite-form__footer");
    assert.match(footer, /margin-top: var\(--modal-actions-margin-top\);/);
    assert.match(footer, /gap: var\(--form-footer-gap\);/);
    assert.doesNotMatch(footer, /border|padding/);
    assert.doesNotMatch(stripCss(controls), /\.favorite-form__footer \.button--danger/);
    const btn = ruleBody(controls, ".favorite-form__footer .button");
    assert.match(btn, /flex: 1;/);
    assert.match(btn, /min-height: var\(--control-height\);/);
    assert.match(btn, /justify-content: center;/);
    assert.match(btn, /gap: var\(--form-footer-gap\);/);
    const city = ruleBody(surfaces, ".city-modal__actions");
    assert.match(city, /margin-top: var\(--modal-actions-margin-top\);/);
    assert.doesNotMatch(stripCss(surfaces), /data-dialog="confirm-delete"\] \.favorite-form__footer/);
  });

  it("dialog body and error spacing: body margin 0, error margin 8px 0 0", async () => {
    const surfaces = await read("surfaces.css");
    assert.match(ruleBody(surfaces, ".desktop-dialog__body"), /margin: 0;/);
    assert.match(ruleBody(surfaces, ".desktop-dialog__error"), /margin: 8px 0 0;/);
  });

  it("removed rules: .city-modal__current, .desktop-dialog__city*, .text-button, .city-modal__dialog--compact", async () => {
    const css = stripCss(await appStyles());
    assert.doesNotMatch(css, /city-modal__current|desktop-dialog__city|\.text-button|city-modal__dialog--compact|--city-feedback-reserve/);
    assert.doesNotMatch(css, /\.city-modal__feedback \{[^}]*min-height/);
  });

  it("AS-MO-11: the global checked segmented rule stays primary; the soft fill is scoped to .desktop-dialog", async () => {
    const controls = await read("controls.css");
    const surfaces = await read("surfaces.css");
    const global = ruleBody(controls, ".segmented__option:has(input:checked)");
    assert.match(global, /background: var\(--primary\);/);
    assert.match(global, /color: var\(--primary-contrast\);/);
    assert.doesNotMatch(global, /soft-fill/);
    const scoped = ruleBody(surfaces, ".desktop-dialog .segmented__option:has(input:checked)");
    assert.match(scoped, /background: var\(--soft-fill-strong\);/);
    assert.match(scoped, /color: var\(--text\);/);
    assert.match(scoped, /font-weight: var\(--font-weight-control\);/);
    assert.match(scoped, /box-shadow: inset 0 0 0 1px var\(--border-control\);/);
    const soft = [...stripCss(controls + surfaces).matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /soft-fill-strong/.test(m[2]) && /:checked/.test(m[1]));
    assert.ok(soft.length > 0 && soft.every((m) => m[1].trim().startsWith(".desktop-dialog ")), "soft checked fill only under .desktop-dialog");
  });

  it("city-field: a 40px bordered control with 8px value-hint gap and a disabled look", async () => {
    const css = (await read("surfaces.css")) + (await read("controls.css"));
    const field = ruleBody(css, ".city-field");
    assert.match(field, /min-height: var\(--control-height\);/);
    assert.match(field, /border: 1px solid var\(--border-control\);/);
    assert.match(field, /gap: 8px;/);
    assert.match(stripCss(css), /\.city-field:disabled/);
  });
});

describe("use my location: reverse lookup timer", () => {
  // Runs the real `useMyLocation` body in a vm with stubbed collaborators and observes when the timer and the abort controller appear.
  it("starts the 8 s Nominatim abort timer only after the position resolves, so a slow permission prompt keeps the full budget (be771e1)", async () => {
    const code = await source();
    const start = code.indexOf("async function useMyLocation(");
    assert.ok(start > -1, "useMyLocation");
    const body = code.slice(start, code.indexOf("\nfunction syncCityModal(", start));
    const timeout = Number(code.match(/const LOCATION_REVERSE_TIMEOUT_MS = (\d+);/)?.[1]);
    assert.ok(timeout > 0, "LOCATION_REVERSE_TIMEOUT_MS");

    const events = [];
    let resolvePosition;
    let resolveReverse;
    const sandbox = {
      events,
      timeout,
      setTimeout: (_fn, ms) => (events.push(`timer:${ms}`), 1),
      clearTimeout: () => {},
      requestAnimationFrame: () => 1,
      AbortController: class {
        constructor() {
          events.push("controller");
          this.signal = {};
        }
        abort() {}
      },
      getBrowserPosition: () => new Promise((resolve) => { resolvePosition = resolve; }),
      reverseGeocodeCoordinates: () => (events.push("reverse"), new Promise((resolve) => { resolveReverse = resolve; })),
      roundCoordinate: (value) => value,
      cityDisplayLabel: ({ name }) => name,
      hideSuggestions: (ui) => ui,
      locationErrorMessage: () => "error",
      BrowserLocationError: class extends Error {},
      WeatherApiError: class extends Error {}
    };
    const prelude = `
      let weatherBusy = false, locating = false, weatherFormGeneration = 0, cityModalError = "", activeCityForm = null, weatherUi = {};
      let locationStatusNode = null, locationStatusFrame = 0, locationReverseTimer = 0, locationAbortController = null;
      const LOCATION_REVERSE_TIMEOUT_MS = timeout, LOCATION_BUSY_LABEL = "busy";
      const weatherService = {};
      const clearLocationStatus = () => {}, cancelLocationStatusFrame = () => {}, syncCityModalUi = () => {}, focusLocationLink = () => {};
      const abortLocationLookup = () => {};
    `;
    const vm = await import("node:vm");
    vm.createContext(sandbox);
    const useMyLocation = vm.runInContext(`${prelude}\n${body}\n;useMyLocation`, sandbox);

    const done = useMyLocation("wizard");
    await Promise.resolve();
    assert.deepEqual(events, [], "while the permission prompt is open: no timer, no controller, no reverse request");

    resolvePosition({ latitude: 41.7, longitude: 44.8 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ["controller", `timer:${timeout}`, "reverse"], "after the position: one controller, one full-budget timer, then the reverse request");

    resolveReverse({ name: "Tbilisi", country: "Georgia", latitude: 41.7, longitude: 44.8 });
    await done;
    assert.equal(events.filter((e) => e.startsWith("timer")).length, 1, "one reverse timer per attempt");
  });
});

describe("newtab onboarding step 2 starter row source (docs/onboarding-starter-rows.md)", () => {
  const stripCss = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
  const surfaces = () => readFile(new URL("../src/surfaces.css", import.meta.url), "utf8");
  const cssRules = (css) => [...stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] }));
  const step2 = async () => {
    const code = await source();
    const start = code.indexOf("function buildOnboardingStep2(");
    assert.ok(start > -1, "buildOnboardingStep2");
    return code.slice(start, code.indexOf("\n}\n", start));
  };
  // Every top-level block that starts with `header`, in source order (a stylesheet may hold several @media (forced-colors: active) blocks).
  const mediaBlocks = (css, header, file = "surfaces.css") => {
    const text = stripCss(css);
    const blocks = [];
    let from = 0;
    for (;;) {
      const start = text.indexOf(header, from);
      if (start === -1) break;
      let depth = 0;
      let end = -1;
      for (let i = text.indexOf("{", start); i < text.length; i += 1) {
        if (text[i] === "{") depth += 1;
        if (text[i] === "}" && --depth === 0) {
          end = i;
          break;
        }
      }
      assert.ok(end > -1, `${header} block is unbalanced in ${file}`);
      blocks.push(text.slice(start, end + 1));
      from = end + 1;
    }
    assert.ok(blocks.length > 0, `${header} block not found in ${file}`);
    return blocks;
  };
  const mediaBlock = (css, header, file) => mediaBlocks(css, header, file)[0];

  it("pin 1: the row is one label holding the real checkbox, an aria-hidden check and the index/name contract", async () => {
    const body = await step2();
    assert.match(body, /^\s*const label = createNode\("label", "onboarding-wizard__starter"\);/m);
    assert.match(body, /^\s*box\.dataset\.onboardingStarterIndex = String\(i\);/m);
    assert.match(body, /^\s*box\.setAttribute\("aria-label", `Add \$\{row\.label\} to your grid`\);/m);
    assert.match(body, /^\s*check\.setAttribute\("aria-hidden", "true"\);/m);
    assert.match(body, /^\s*label\.append\(box, surface\);/m);
    assert.match(body, /^\s*box\.type = "checkbox";/m);
    assert.match(body, /^\s*surface\.append\(createOnboardingStarterIcon\(row\), createNode\("span", "onboarding-wizard__starter-label", row\.label\), check\);/m);
  });

  it("pin 2: no trace of the old row and preview DOM in newtab.js", async () => {
    const code = await source();
    assert.doesNotMatch(code, /onboarding-wizard__row/);
    assert.doesNotMatch(code, /onboarding-wizard__preview/);
    assert.doesNotMatch(code, /createOnboardingStarterPreview/);
  });

  it("pin 3: the icon is decorative (alt empty) and an error swaps in the letter icon", async () => {
    const code = await source();
    const start = code.indexOf("function createOnboardingStarterIcon(");
    assert.ok(start > -1, "createOnboardingStarterIcon");
    const body = code.slice(start, code.indexOf("\n}\n", start));
    assert.match(body, /^\s*icon\.alt = "";/m);
    assert.match(body, /icon\.addEventListener\("error", \(\) => icon\.replaceWith\(fallback\(\)\)\);/);
    assert.match(body, /onboarding-wizard__starter-icon onboarding-wizard__starter-icon--letter/);
  });

  it("pin 4-enabled: the surface ignores the pointer, the real input covers the row, is transparent and stays focusable", async () => {
    const css = await surfaces();
    const all = cssRules(css);
    const surface = all.find((r) => r.selector === ".onboarding-wizard__starter-surface");
    assert.ok(surface, "surface rule");
    assert.match(surface.body, /pointer-events:\s*none;/);
    const row = all.find((r) => r.selector === ".onboarding-wizard__starter");
    assert.ok(row, "row rule");
    assert.match(row.body, /height:\s*var\(--cell-size\);/);
    const input = all.find((r) => r.selector === '.onboarding-wizard__starter input[type="checkbox"]');
    assert.ok(input, "input rule");
    assert.match(input.body, /opacity:\s*0;/);
    assert.match(input.body, /position:\s*absolute;/);
    assert.match(input.body, /inset:\s*0;/);
    assert.match(input.body, /cursor:\s*pointer;/);
    assert.doesNotMatch(input.body, /display:\s*none|visibility:\s*hidden/);
    for (const rule of all.filter((r) => /^\.onboarding-wizard__starter input/.test(r.selector))) {
      assert.doesNotMatch(rule.body, /display:\s*none|visibility:\s*hidden/, rule.selector);
    }
    const outline = all.find((r) => r.selector === '.onboarding-wizard__starter input[type="checkbox"]:focus-visible');
    assert.ok(outline, "input focus-visible rule");
    assert.match(outline.body, /outline:\s*none;/);
  });

  it("pin 4b: no selector of the old .onboarding-wizard__row / __preview family is left in surfaces.css", async () => {
    const selectors = cssRules(await surfaces()).flatMap((r) => r.selector.split(","));
    assert.deepEqual(selectors.filter((s) => /^\s*\.onboarding-wizard__(row|preview)/.test(s)), []);
    assert.doesNotMatch(stripCss(await surfaces()), /\.onboarding-wizard__(row|preview)/);
  });

  // Task 5 Step 6 mutation table <-> test names below (docs/starter-rows-polish.md plan):
  //   "SRP pin 1" = hover paints the surface only in (hover: hover), no transition   (old name: pin 5)
  //   "SRP pin 2" = letter chip takes --soft-fill-strong on hover                    (old name: pin 5b)
  //   "SRP pin 3" = unchecked row: no filter on the surface, favicon 0.4, letter 0.6 (old name: pin 6)
  //   "SRP pin 4" = busy rows: disabled tokens and cursor wait                       (old name: pin 7)
  //   "SRP pin 5" = forced colors: pills, Highlight, no filter                       (old name: pin 8)
  //   "SRP pin 6" = off label --muted and the inset focus ring                       (old name: pin 9)
  // Selectors of docs/starter-rows-polish.md; exact comparison, no substring matching.
  const SURFACE = ".onboarding-wizard__starter-surface";
  const INPUT = '.onboarding-wizard__starter input[type="checkbox"]';
  const OFF = `${INPUT}:not(:checked) + ${SURFACE}`;
  const FOCUS = `${INPUT}:focus-visible + ${SURFACE}`;
  const HOVER = `${INPUT}:not(:disabled):hover + ${SURFACE}`;
  const LETTER = ".onboarding-wizard__starter-icon--letter";
  const IMG_OFF = `${OFF} img.onboarding-wizard__starter-icon`;
  const LETTER_OFF = `${OFF} ${LETTER}`;
  // The pending chip rules of docs/favicon-letter-pending.md decision 1 (run 37): the pending favicon img is a chip with the letter's fill, pushed out of its box.
  const PEND = '[data-icon-check="pending"]';
  const ICON = "img.onboarding-wizard__starter-icon";
  const CHIP_BASE = `${ICON}${PEND}`; // rule (1)
  const CHIP_OFF = `${OFF} ${ICON}${PEND}`; // rule (2)
  const CHIP_HOVER = `${HOVER} ${ICON}${PEND}`; // rule (3), inside @media (hover: hover)
  // Splits a selector list on commas. Limitation: a comma inside `:not(a, b)` would be split wrongly (no such selector exists today).
  const selectorList = (css) => cssRules(css).flatMap((r) => r.selector.split(",").map((s) => ({ selector: s.trim(), body: r.body })));
  const starterRules = (css) => selectorList(css).filter((r) => r.selector.includes("onboarding-wizard__starter"));

  it("SRP pin 1: hover paints the surface of an enabled row, only inside @media (hover: hover), and no starter rule has a transition (AS-SRP-01, 06)", async () => {
    const css = await surfaces();
    const block = mediaBlock(css, "@media (hover: hover)");
    const inBlock = cssRules(block);
    const hover = inBlock.find((r) => r.selector === HOVER);
    assert.ok(hover, "hover rule inside the (hover: hover) block");
    assert.match(hover.body, /(?:^|[;\s])background:\s*var\(--soft-fill\);/);
    const outside = cssRules(stripCss(css).replace(block, ""));
    assert.deepEqual(outside.filter((r) => /:hover/.test(r.selector) && /onboarding-wizard__starter/.test(r.selector)).map((r) => r.selector), [], "no starter hover rule outside the media block");
    const starter = starterRules(css);
    assert.ok(starter.length >= 1, "starter rules found");
    assert.ok(starter.some((r) => r.selector === SURFACE), "surface rule");
    for (const rule of starter) assert.doesNotMatch(rule.body, /transition/, `${rule.selector} must not carry a transition`);
  });

  it("SRP pin 2: the letter chip takes --soft-fill-strong on hover, in the same (hover: hover) block", async () => {
    const chip = cssRules(mediaBlock(await surfaces(), "@media (hover: hover)")).find((r) => r.selector === `${HOVER} ${LETTER}`);
    assert.ok(chip, "chip hover rule inside the (hover: hover) block");
    assert.match(chip.body, /(?:^|[;\s])background:\s*var\(--soft-fill-strong\);/);
  });

  it("SRP pin 3: an off row keeps the dialog colour (no filter on any starter rule but the two icon rules), the icon alone is greyed: favicon 0.4, letter 0.6", async () => {
    const css = await surfaces();
    const starter = starterRules(css);
    assert.ok(starter.length >= 1, "starter rules found");
    for (const rule of starter.filter((r) => r.selector !== IMG_OFF && r.selector !== LETTER_OFF)) {
      assert.doesNotMatch(rule.body, /filter/, `${rule.selector} must not carry a filter`);
    }
    // The filter lives in ONE merged rule; `selectorList` already splits its comma list, so the set comes from `cssRules`.
    const withFilter = cssRules(css).filter((r) => /(?:^|[;\s])filter:\s*grayscale\(1\);/.test(r.body) && r.selector.includes("onboarding-wizard__starter"));
    assert.equal(withFilter.length, 1, "exactly one starter rule carries grayscale(1) (the merged rule)");
    assert.deepEqual(withFilter[0].selector.split(",").map((s) => s.trim()).sort(), [IMG_OFF, LETTER_OFF].sort(), "the merged rule is exactly the unchecked favicon img + the unchecked letter");
    // Every starter rule with an `opacity` declaration, by exact selector: the hidden native input, the unchecked favicon, the unchecked letter and the busy
    // surface. Any other rule (a base rule, a late override such as `... img.onboarding-wizard__starter-icon[src]`) would change the glyph/chip contrast
    // without touching the two pinned rules.
    assert.deepEqual(
      starter.filter((r) => /(?:^|[;\s])opacity\s*:/.test(r.body)).map((r) => r.selector).sort(),
      [INPUT, IMG_OFF, LETTER_OFF, CHIP_OFF, `${INPUT}:disabled + ${SURFACE}`].sort(),
      "the only starter rules with opacity (the unchecked pending chip, rule (2), is the letter's 0.6)"
    );
    const chipOff = starter.filter((r) => r.selector === CHIP_OFF);
    assert.equal(chipOff.length, 1, "exactly one rule for the unchecked pending chip");
    assert.match(chipOff[0].body, /(?:^|[;\s])opacity:\s*0\.6;/);
    const opacityOf = (selector) => starter.filter((r) => r.selector === selector && /(?:^|[;\s])opacity:/.test(r.body));
    const img = opacityOf(IMG_OFF);
    assert.equal(img.length, 1, "exactly one opacity rule for the unchecked favicon img");
    assert.match(img[0].body, /(?:^|[;\s])opacity:\s*0\.4;/);
    const letter = opacityOf(LETTER_OFF);
    assert.equal(letter.length, 1, "exactly one opacity rule for the unchecked letter");
    assert.match(letter[0].body, /(?:^|[;\s])opacity:\s*0\.6;/);
  });

  it("ICB pin 1: --icon-backdrop is transparent in the light :root and #eef1f5 in the dark media block", async () => {
    const tokens = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    const css = stripCss(tokens);
    const dark = mediaBlock(css, "@media (prefers-color-scheme: dark)", "design-tokens.css");
    const lightPart = css.replace(dark, "");
    const decl = (text) => [...text.matchAll(/--icon-backdrop:\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.deepEqual(decl(lightPart), ["transparent"], "light value");
    assert.deepEqual(decl(dark), ["#eef1f5"], "dark value");
  });

  it("FBC pin 1: the comment above the favicon backdrop rule names the hover surface and the forced-colors Canvas", async () => {
    const css = await surfaces(); // raw text: cssRules/stripCss drop comments
    const m = css.match(/\/\*((?:(?!\*\/)[\s\S])*)\*\/\s*img\.onboarding-wizard__starter-icon\s*\{/);
    assert.ok(m, "a comment directly above the img.onboarding-wizard__starter-icon rule");
    assert.match(m[1], /hover[\s\S]*surface/i, "the comment says the hover fill is painted on the row surface");
    assert.match(m[1], /forced-colors[\s\S]*Canvas/i, "the comment says forced colors turn the backdrop into Canvas");
  });

  // ---- run 36 (docs/favicon-outline.md AS-FBO-06): the quiet outline of the favicon in the dark theme ----------------------------------------------------
  const RING_IMG = "img.onboarding-wizard__starter-icon";
  // The layers of a box-shadow value, split on top-level commas (a comma inside rgb()/var() does not split).
  const shadowLayers = (value) => {
    const layers = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === "(") depth += 1;
      else if (value[i] === ")") depth -= 1;
      else if (value[i] === "," && depth === 0) {
        layers.push(value.slice(from, i).trim());
        from = i + 1;
      }
    }
    layers.push(value.slice(from).trim());
    return layers;
  };
  const shadowOf = (body) => body.match(/(?:^|[;\s])box-shadow:\s*([^;}]+)/)?.[1]?.trim() ?? null;
  // a ring layer is any layer that is not inset and not `none`
  const isRingLayer = (layer) => layer !== "none" && !/^inset\b/.test(layer);

  it("FBO pin 1: --icon-outline is transparent in the light :root and #3d4652 in the dark media block", async () => {
    const tokens = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    const css = stripCss(tokens);
    const dark = mediaBlock(css, "@media (prefers-color-scheme: dark)", "design-tokens.css");
    const lightPart = css.replace(dark, "");
    const decl = (text) => [...text.matchAll(/--icon-outline:\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.deepEqual(decl(lightPart), ["transparent"], "light value");
    assert.deepEqual(decl(dark), ["#3d4652"], "dark value");
  });

  it("FBO pin 2: of the rules for the favicon img exactly two set a box-shadow: the ring in the base rule, none in the unchecked rule", async () => {
    const withShadow = selectorList(await surfaces()).filter((r) => r.selector.includes(RING_IMG) && shadowOf(r.body) !== null);
    assert.deepEqual(withShadow.map((r) => r.selector).sort(), [RING_IMG, IMG_OFF, CHIP_BASE].sort(), "the rules that set a box-shadow on the favicon img (the pending chip drops the ring, rule (1))");
    assert.equal(shadowOf(withShadow.find((r) => r.selector === CHIP_BASE).body), "none", "the pending chip has no ring");
    assert.equal(shadowOf(withShadow.find((r) => r.selector === RING_IMG).body), "0 0 0 1px var(--icon-outline)", "the base rule draws the 1 px ring from the token");
    assert.equal(shadowOf(withShadow.find((r) => r.selector === IMG_OFF).body), "none", "an unchecked row has no ring");
  });

  it("FBO pin 3: no letter chip rule and no grid favicon rule has a ring layer (a shadow that is neither inset nor none)", async () => {
    const files = { "surfaces.css": await surfaces(), "newtab.css": await readFile(new URL("../src/newtab.css", import.meta.url), "utf8") };
    const offenders = [];
    for (const [file, css] of Object.entries(files)) {
      for (const r of selectorList(css)) {
        if (!(r.selector.includes("--letter") || r.selector.includes(".favorite-icon"))) continue;
        const value = shadowOf(r.body);
        if (value !== null && shadowLayers(value).some(isRingLayer)) offenders.push(`${file}: ${r.selector}`);
      }
    }
    assert.deepEqual(offenders, [], "the ring belongs to the starter favicon img only");
  });

  it("FBO pin 4: no rule for the favicon img inside (hover: hover) or forced-colors blocks sets a box-shadow (the browser drops it in forced colors)", async () => {
    const css = await surfaces();
    const blocks = [...mediaBlocks(css, "@media (hover: hover)"), ...mediaBlocks(css, "@media (forced-colors: active)")];
    const offenders = blocks.flatMap((b) => selectorList(b)).filter((r) => r.selector.includes(RING_IMG) && shadowOf(r.body) !== null).map((r) => r.selector);
    assert.deepEqual(offenders, [], "no box-shadow for the favicon img in these blocks");
  });

  it("ICB pin 2: only the listed starter/img rules set a background; the favicon img takes var(--icon-backdrop) in exactly one rule, none inside @media (hover: hover)", async () => {
    const css = await surfaces();
    const BG = /(?:^|[;\s])background(?:-color|-image)?\s*:/;
    const CHECK = ".onboarding-wizard__starter-check";
    const CHECKED = `${INPUT}:checked + ${SURFACE} ${CHECK}`;
    const allowed = [SURFACE, HOVER, `${HOVER} ${LETTER}`, LETTER, CHECK, CHECKED, `${CHECKED}::after`, "img.onboarding-wizard__starter-icon", CHIP_BASE, CHIP_HOVER];
    const withBg = selectorList(css).filter((r) => (r.selector.includes("onboarding-wizard__starter") || /\bimg\b/.test(r.selector)) && BG.test(r.body));
    assert.deepEqual(withBg.map((r) => r.selector).filter((s) => !allowed.includes(s)), [], "a background on a starter or img rule outside the allowed list");
    const icon = withBg.filter((r) => r.selector === "img.onboarding-wizard__starter-icon");
    assert.equal(icon.length, 1, "exactly one background rule for the favicon img");
    assert.match(icon[0].body, /(?:^|[;\s])background:\s*var\(--icon-backdrop\);/);
    const hoverRules = cssRules(mediaBlocks(css, "@media (hover: hover)").join("\n"));
    assert.deepEqual(hoverRules.filter((r) => /icon-backdrop/.test(r.body)).map((r) => r.selector), [], "no backdrop rule inside (hover: hover)");
    const hoverBg = hoverRules.flatMap((r) => r.selector.split(",").map((s) => s.trim()).filter((s) => BG.test(r.body)));
    assert.deepEqual(hoverBg.filter((s) => s !== HOVER && s !== `${HOVER} ${LETTER}` && s !== CHIP_HOVER), [], "a hover rule other than the surface, the letter chip and the pending chip sets a background");
  });

  it("ICB pin 3: no rule for the starter icon (except --letter) or an img sets a background inside any @media (forced-colors: active) block", async () => {
    const forced = mediaBlocks(await surfaces(), "@media (forced-colors: active)").flatMap((b) => cssRules(b));
    const offenders = forced.flatMap((r) => r.selector.split(",").map((s) => s.trim()).filter((s) => ((s.includes(".onboarding-wizard__starter-icon") && !s.includes("--letter")) || /\bimg\b/.test(s)) && /(?:^|[;\s])background(?:-color|-image)?:/.test(r.body)));
    assert.deepEqual(offenders, [], "forced colors replace the backdrop; nothing is added there");
    const adjust = forced.flatMap((r) => r.selector.split(",").map((s) => s.trim()).filter((s) => (s.includes(".onboarding-wizard__starter-icon") || /\bimg\b/.test(s)) && /(?:^|[;\s])forced-color-adjust\s*:/.test(r.body)));
    assert.deepEqual(adjust, [], "forced-color-adjust must stay at its default for the starter icon and img (it would keep the dark backdrop)");
  });

  it("SRP pin 4: busy rows are muted by the design-system disabled tokens and the real input shows cursor wait; the enabled input keeps cursor pointer", async () => {
    const all = cssRules(await surfaces());
    const input = all.find((r) => r.selector === `${INPUT}:disabled`);
    assert.ok(input, "disabled input rule");
    assert.match(input.body, /(?:^|[;\s])cursor:\s*wait;/);
    assert.doesNotMatch(input.body, /(?:^|[;\s])opacity:/, "the disabled input stays transparent from its base rule (no opacity here)");
    const surface = all.find((r) => r.selector === `${INPUT}:disabled + ${SURFACE}`);
    assert.ok(surface, "disabled surface rule");
    assert.match(surface.body, /(?:^|[;\s])opacity:\s*var\(--control-disabled-opacity\);/);
    const enabled = all.find((r) => r.selector === INPUT);
    assert.ok(enabled, "enabled input rule");
    assert.match(enabled.body, /(?:^|[;\s])cursor:\s*pointer;/);
  });

  it("SRP pin 5: forced colors give the progress pills a border and Highlight, keep the Highlight outline and have no filter rule", async () => {
    // Rules may live in any of the @media (forced-colors: active) blocks.
    const forced = mediaBlocks(await surfaces(), "@media (forced-colors: active)").flatMap((b) => cssRules(b));
    const pill = forced.find((r) => r.selector === ".onboarding-wizard__pill");
    assert.ok(pill, "forced pill rule");
    assert.match(pill.body, /border:\s*1px solid CanvasText;/);
    const active = forced.find((r) => r.selector === ".onboarding-wizard__pill--active");
    assert.ok(active, "forced active pill rule");
    assert.match(active.body, /background:\s*Highlight;/);
    const focus = forced.find((r) => r.selector === FOCUS);
    assert.ok(focus, "forced focus rule");
    assert.match(focus.body, /outline:\s*2px solid Highlight;/);
    assert.match(focus.body, /outline-offset:\s*-2px;/);
    assert.match(focus.body, /box-shadow:\s*none;/);
    const checked = forced.find((r) => r.selector === `${INPUT}:checked + ${SURFACE} .onboarding-wizard__starter-check`);
    assert.ok(checked, "forced-colors checked rule");
    assert.match(checked.body, /background:\s*Highlight;/);
    assert.deepEqual(forced.filter((r) => /filter/.test(r.body)).map((r) => r.selector), [], "no filter rule in the forced-colors blocks");
  });

  it("SRP pin 6: the off label stays --muted and the focus ring stays inset", async () => {
    const all = cssRules(await surfaces());
    const muted = all.find((r) => r.selector === `${OFF} .onboarding-wizard__starter-label`);
    assert.ok(muted, "unchecked label rule");
    assert.match(muted.body, /(?:^|[;\s])color:\s*var\(--muted\);/);
    const focus = all.find((r) => r.selector === FOCUS);
    assert.ok(focus, "focus rule");
    assert.match(focus.body, /box-shadow:\s*inset 0 0 0 2px var\(--focus-ring\);/);
  });

  // ---- run 37 (docs/favicon-letter-pending.md): the pending chip and the hidden letter ---------------------------------------------------------
  // Specificity as [ids, classes + attributes + pseudo-classes (a :not() argument counts), types + pseudo-elements].
  const specificity = (selector) => {
    let sel = selector.replace(/:not\(([^)]*)\)/g, " $1 ");
    const attrs = (sel.match(/\[[^\]]*\]/g) ?? []).length;
    sel = sel.replace(/\[[^\]]*\]/g, "");
    const ids = (sel.match(/#[\w-]+/g) ?? []).length;
    const classes = (sel.match(/\.[\w-]+/g) ?? []).length;
    const pseudoElements = (sel.match(/::[\w-]+/g) ?? []).length;
    const pseudoClasses = (sel.replace(/::[\w-]+/g, "").match(/:[\w-]+/g) ?? []).length;
    const types = (sel.replace(/[.#:][\w-]+/g, " ").match(/(?:^|[\s+>~])([a-z][\w-]*)/gi) ?? []).length;
    return [ids, classes + attrs + pseudoClasses, types + pseudoElements];
  };
  const outranks = (a, b) => {
    const x = specificity(a);
    const y = specificity(b);
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  };
  const pushOut = (body) => Number(body.match(/(?:^|[;\s])object-position:\s*(\d+)px\s+0(?:px)?;/)?.[1] ?? NaN);

  it("PLP pin 1: the specificity function reads the real selectors as expected", () => {
    assert.deepEqual(specificity(RING_IMG), [0, 1, 1]);
    assert.deepEqual(specificity(CHIP_BASE), [0, 2, 1]);
    assert.deepEqual(specificity(IMG_OFF), [0, 5, 2]);
    assert.deepEqual(specificity(CHIP_OFF), [0, 6, 2]);
    assert.deepEqual(specificity(CHIP_HOVER), [0, 7, 2]);
    assert.deepEqual(specificity('.favorite-icon[data-icon-check="pending"]'), [0, 2, 0]);
  });

  it("PLP pin 2: the wizard pending chip is exactly three rules with the letter's fill, no visibility, no motion, content pushed out; each outranks the rule it overrides", async () => {
    const css = await surfaces();
    const pending = selectorList(css).filter((r) => r.selector.includes("data-icon-check"));
    assert.deepEqual(pending.map((r) => r.selector).sort(), [CHIP_BASE, CHIP_OFF, CHIP_HOVER].sort(), "ALL pending rules of surfaces.css, by exact selector");
    const by = (selector) => pending.find((r) => r.selector === selector).body;
    const letterFill = cssRules(css).find((r) => r.selector === LETTER && /(?:^|[;\s])background:/.test(r.body)).body.match(/(?:^|[;\s])background:\s*([^;]+);/)[1].trim();
    assert.equal(by(CHIP_BASE).match(/(?:^|[;\s])background:\s*([^;]+);/)?.[1]?.trim(), letterFill, "the chip fill is the letter's fill");
    assert.equal(letterFill, "var(--soft-fill)");
    assert.match(by(CHIP_BASE), /(?:^|[;\s])box-shadow:\s*none;/);
    assert.match(by(CHIP_OFF), /(?:^|[;\s])opacity:\s*0\.6;/);
    assert.match(by(CHIP_HOVER), /(?:^|[;\s])background:\s*var\(--soft-fill-strong\);/);
    assert.ok(pushOut(by(CHIP_BASE)) >= 40, "rule (1) pushes the content out by at least the biggest box (40 px)");
    for (const rule of pending) {
      assert.doesNotMatch(rule.body, /visibility|transition|animation|filter/, `${rule.selector}: no visibility (the first-run veil must hide the chip), motion or filter`);
    }
    assert.ok(outranks(CHIP_BASE, RING_IMG), "(1) outranks the base img rule (background, ring)");
    assert.ok(outranks(CHIP_OFF, IMG_OFF), "(2) outranks the unchecked img rule (opacity 0.4)");
    assert.ok(outranks(CHIP_HOVER, CHIP_BASE), "(3) outranks (1) (hover fill)");
    const hoverRules = cssRules(mediaBlocks(css, "@media (hover: hover)").join("\n"));
    assert.ok(hoverRules.some((r) => r.selector === CHIP_HOVER), "(3) lives inside @media (hover: hover)");
    let outside = stripCss(css);
    for (const block of mediaBlocks(css, "@media (hover: hover)")) outside = outside.replace(block, "");
    assert.deepEqual(cssRules(outside).filter((r) => r.selector === CHIP_HOVER), [], "(3) is not outside the hover block");
    const pushed = selectorList(css).filter((r) => r.selector.includes("onboarding-wizard__starter") && /object-position/.test(r.body)).map((r) => r.selector);
    assert.deepEqual(pushed, [CHIP_BASE], "object-position appears on no other starter rule");
  });

  it("PLP pin 3: the grid pending chip is one rule, the letter's fill and radius, no visibility, no motion, content pushed out; the old hidden rule is gone", async () => {
    const css = stripCss(await readFile(new URL("../src/newtab.css", import.meta.url), "utf8"));
    const rules = cssRules(css);
    const pending = rules.filter((r) => r.selector.split(",").some((s) => s.includes("data-icon-check")));
    assert.deepEqual(pending.map((r) => r.selector), ['.favorite-icon[data-icon-check="pending"]'], "ALL data-icon-check rules of newtab.css");
    const chip = pending[0].body;
    const letter = rules.find((r) => r.selector === ".favorite-letter" && /border-radius/.test(r.body)).body;
    const decl = (body, prop) => body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`))?.[1]?.trim();
    assert.equal(decl(chip, "background"), decl(letter, "background"), "the chip fill is the letter's fill");
    assert.equal(decl(chip, "border-radius"), decl(letter, "border-radius"), "the chip radius is the letter's radius");
    assert.ok(pushOut(chip) >= 40, "content pushed out by at least the biggest box (40 px)");
    assert.doesNotMatch(chip, /visibility|transition|animation|opacity|filter/, "no visibility (veil), motion, opacity or filter");
    assert.ok(specificity(pending[0].selector)[1] > specificity(".favorite-icon")[1], "outranks the bare .favorite-icon rule");
    const veil = rules.find((r) => r.selector === '.desktop[data-veiled="true"]');
    assert.ok(veil && /visibility:\s*hidden/.test(veil.body), "the veil still hides the desk with visibility: hidden (the chip inherits it)");
  });

  it("PLP pin 4: both letter nodes are aria-hidden (the name is carried by the tile aria-label and the row label)", async () => {
    const code = await source();
    const grid = code.slice(code.indexOf("function createFavoriteLetterNode("), code.indexOf("\n}\n", code.indexOf("function createFavoriteLetterNode(")));
    assert.match(grid, /^\s*span\.setAttribute\("aria-hidden", "true"\);/m, "the grid letter");
    const row = code.slice(code.indexOf("function createOnboardingStarterIcon("), code.indexOf("\n}\n", code.indexOf("function createOnboardingStarterIcon(")));
    assert.match(row, /const fallback = \(\) => \{[^}]*\bspan\.setAttribute\("aria-hidden", "true"\);[^}]*return span;/, "the wizard fallback letter (block form, the attribute is set inside the fallback body)");
  });

  // ---- run 38 (docs/light-letter-fill.md): one themed fill for the grid letter and the pending chip ------------------------------------------------
  const BG = /(?:^|[;\s])background(?:-color|-image)?\s*:/;
  const newtabCss = () => readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
  const GRID_CHIP = '.favorite-icon[data-icon-check="pending"]';

  it("LLF pin 1: --letter-fill is rgb(0 0 0 / 6%) in the light :root and rgb(255 255 255 / 12%) in the dark media block, once each", async () => {
    const tokens = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    const css = stripCss(tokens);
    const dark = mediaBlock(css, "@media (prefers-color-scheme: dark)", "design-tokens.css");
    const lightPart = css.replace(dark, "");
    const decl = (text) => [...text.matchAll(/--letter-fill:\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.deepEqual(decl(lightPart), ["rgb(0 0 0 / 6%)"], "light value");
    assert.deepEqual(decl(dark), ["rgb(255 255 255 / 12%)"], "dark value");
  });

  it("LLF pin 2: the grid letter and the grid pending chip take their fill from var(--letter-fill) and no other .favorite-letter rule sets a background", async () => {
    const rules = cssRules(await newtabCss());
    const letter = rules.filter((r) => r.selector === ".favorite-letter" && BG.test(r.body));
    assert.equal(letter.length, 1, "exactly one .favorite-letter rule with a background");
    assert.match(letter[0].body, /(?:^|[;\s])background:\s*var\(--letter-fill\);/);
    const chip = rules.filter((r) => r.selector === GRID_CHIP && BG.test(r.body));
    assert.equal(chip.length, 1, "exactly one pending chip rule with a background");
    assert.match(chip[0].body, /(?:^|[;\s])background:\s*var\(--letter-fill\);/);
    const others = rules.filter((r) => r.selector.includes(".favorite-letter") && r.selector !== ".favorite-letter" && BG.test(r.body)).map((r) => r.selector);
    assert.deepEqual(others, [], "no other rule with .favorite-letter in its selector sets a background");
  });

  it("LLF pin 3: no rule of newtab.css keeps the old 12% white fill literal, in any spelling", async () => {
    const offenders = cssRules(await newtabCss())
      .filter((r) => /rgba?\(\s*255\s*[, ]\s*255\s*[, ]\s*255\s*(?:[,/]\s*(?:12%|0?\.12)\s*)\)/.test(r.body))
      .map((r) => r.selector);
    assert.deepEqual(offenders, [], "the grid letter fill lives only in --letter-fill");
  });

  it("LLF pin 4: the wizard letter and chip still take --soft-fill (this run does not touch them)", async () => {
    const rules = cssRules(await surfaces());
    const letter = rules.find((r) => r.selector === LETTER && BG.test(r.body));
    assert.ok(letter, "the wizard letter rule");
    assert.match(letter.body, /(?:^|[;\s])background:\s*var\(--soft-fill\);/);
    assert.ok(!/letter-fill/.test(stripCss(await surfaces())), "surfaces.css does not use --letter-fill");
  });
});

describe("default favicon fallback source pins (run 32, docs/favicon-globe-fallback.md)", () => {
  // Text of one top-level function: from its header to the next top-level declaration.
  function functionText(code, name) {
    const start = code.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
    assert.notEqual(start, -1, `function ${name} exists`);
    const rest = code.slice(start + 1);
    const next = rest.search(/^(?:async )?function |^const |^let |^\/\/ /m);
    return next === -1 ? code.slice(start) : code.slice(start, start + 1 + next);
  }

  const CHECK_HELPER = "attachDefaultFaviconCheck";

  // Text between the `{` at `open` and its matching `}` (strings and comments are not special-cased: the pinned code has no braces in them).
  function balancedBlock(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) return { start: open, end: i, text: text.slice(open, i + 1) };
      }
    }
    return null;
  }

  it("custom-untouched: every checker use in createFavoriteIconNode sits inside the if (item.iconMode !== \"custom\") block", async () => {
    const body = functionText(await source(), "createFavoriteIconNode");
    const header = body.match(/if\s*\(\s*item\.iconMode\s*!==\s*"custom"\s*\)\s*\{/);
    assert.ok(header, 'an if (item.iconMode !== "custom") { ... } block');
    const block = balancedBlock(body, header.index + header[0].length - 1);
    assert.ok(block, "the block is balanced");
    const uses = [...body.matchAll(new RegExp(`${CHECK_HELPER}\\(|getDefaultFaviconChecker\\(|defaultFaviconChecker`, "g"))].map((m) => m.index);
    assert.ok(uses.length >= 1, "the checker is consulted");
    for (const use of uses) {
      assert.ok(use > block.start && use < block.end, `the checker use at ${use} is inside the iconMode !== custom block [${block.start}, ${block.end}]`);
    }
    // A dataset.iconSource guard is not the custom condition: the same use must not be reachable only through it.
    assert.match(body.slice(block.start, block.end), new RegExp(`${CHECK_HELPER}\\(`), "the helper itself is called inside the block");
  });

  it("attribute-before-insert: the pending attribute is written before the load listener and before the node is returned", async () => {
    const code = await source();
    const helper = functionText(code, CHECK_HELPER);
    const pending = helper.search(/dataset\.iconCheck\s*=\s*"pending"|setAttribute\(\s*"data-icon-check",\s*"pending"\s*\)/);
    const load = helper.search(/addEventListener\(\s*"load"/);
    assert.notEqual(pending, -1, "pending is assigned");
    assert.notEqual(load, -1, "a load listener decides later");
    assert.ok(pending < load, "pending is set synchronously, before the load listener");
    // The onboarding row is pinned by "onboarding-uses-checker"; the grid tile is the one whose order matters here.
    const body = functionText(code, "createFavoriteIconNode");
    const call = body.search(new RegExp(`${CHECK_HELPER}\\(`));
    const ret = body.search(/return (?:image|icon);/);
    assert.notEqual(call, -1, `createFavoriteIconNode calls ${CHECK_HELPER}`);
    assert.notEqual(ret, -1, "createFavoriteIconNode returns the image node");
    assert.ok(call < ret, "the check is attached before the node is returned");
  });

  it("error-handler-kept: the error listener still swaps the image for the letter in the grid and in the onboarding rows", async () => {
    const code = await source();
    assert.match(
      functionText(code, "createFavoriteIconNode"),
      /addEventListener\("error",\s*\(\)\s*=>\s*\{\s*image\.replaceWith\(createFavoriteLetterNode\(item, "letter"\)\);/
    );
    assert.match(
      functionText(code, "createOnboardingStarterIcon"),
      /addEventListener\("error",\s*\(\)\s*=>\s*icon\.replaceWith\(fallback\(\)\)\)/
    );
  });

  it("connected-guard: after the last await the handler returns on a detached node before every effect (replaceWith / done)", async () => {
    const helper = functionText(await source(), CHECK_HELPER);
    const awaits = [...helper.matchAll(/\bawait\b/g)].map((m) => m.index);
    assert.ok(awaits.length >= 1, "the decision awaits the checker");
    const afterAwait = helper.slice(awaits[awaits.length - 1]);
    const guards = [...afterAwait.matchAll(/if\s*\(\s*!\w+\.isConnected\s*\)\s*return\b/g)].map((m) => m.index);
    const effects = [...afterAwait.matchAll(/\.replaceWith\(|dataset\.iconCheck\s*=\s*"done"/g)].map((m) => m.index);
    assert.ok(guards.length >= 1, "an isConnected early return after the last await");
    assert.ok(effects.length >= 1, "the handler replaces the image or sets done");
    if (guards.length >= effects.length) {
      // Variant A: one guard per effect, each before its effect.
      effects.forEach((effect, i) => assert.ok(guards[i] < effect, `guard ${i} precedes effect ${i}`));
    } else {
      // Variant B (accepted): ONE shared early return that comes before every effect, so no effect can run on a detached node.
      assert.equal(guards.length, 1, "either one guard per effect or exactly one shared guard");
      assert.ok(guards[0] < Math.min(...effects), "the shared guard precedes every effect");
    }
  });

  it("onboarding-url-helper: the onboarding row URL comes from getFaviconUrl with FAVICON_SIZE, not a hand-written size=32 string", async () => {
    const code = await source();
    const body = functionText(code, "createOnboardingStarterIcon");
    assert.doesNotMatch(body, /size=32/);
    assert.doesNotMatch(body, /encodeURIComponent\(row\.url\)/);
    assert.match(body, /getFaviconUrl\(\{\s*baseUrl:\s*faviconBaseUrl,\s*pageUrl:\s*row\.url,\s*size:\s*FAVICON_SIZE\s*\}\)/);
    const imported = code.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/favoriteIcon\.js";/);
    assert.ok(imported, "an import from ./favoriteIcon.js");
    const names = imported[1].split(",").map((n) => n.trim());
    assert.ok(names.includes("FAVICON_SIZE"), "FAVICON_SIZE is imported");
    assert.ok(names.includes("getFaviconUrl"), "getFaviconUrl is imported");
  });

  it("sentinel-url: getDefaultFaviconChecker builds the sentinel URL with getFaviconUrl, DEFAULT_FAVICON_SENTINEL_PAGE and FAVICON_SIZE", async () => {
    const body = functionText(await source(), "getDefaultFaviconChecker");
    assert.match(body, /getFaviconUrl\(\s*\{[^}]*\bpageUrl:\s*DEFAULT_FAVICON_SENTINEL_PAGE\b[^}]*\}\s*\)/);
    assert.match(body, /getFaviconUrl\(\s*\{[^}]*\bsize:\s*FAVICON_SIZE\b[^}]*\}\s*\)/);
  });

  it("lazy-kept: the grid tile image still loads lazily", async () => {
    const body = functionText(await source(), "createFavoriteIconNode");
    assert.match(body, /\.loading\s*=\s*"lazy"|setAttribute\(\s*"loading",\s*"lazy"\s*\)/);
  });

  it("onboarding-uses-checker: the onboarding row consults the checker through the shared helper", async () => {
    const code = await source();
    const body = functionText(code, "createOnboardingStarterIcon");
    assert.match(body, new RegExp(`${CHECK_HELPER}\\(\\s*icon,`));
    const helper = functionText(code, CHECK_HELPER);
    assert.match(helper, /\.verdictFor\(/);
    assert.match(helper, /\.check\(/);
    assert.match(code, /from "\.\/defaultFavicon\.js";/);
  });

  it("accent-uses-checker: the auto accent classifies the loaded image and samples that same image", async () => {
    const body = functionText(await source(), "resolveAutoBackgroundColor");
    assert.match(body, /await loadBrowserImage\(iconModel\.src\)/);
    assert.match(body, /\.classifyImage\(\s*iconModel\.src,\s*image\s*\)/);
    assert.match(body, /=== "default"\)?\s*\{?\s*return fallback;/);
    assert.match(body, /loadImage:\s*(?:async\s*)?\(\)\s*=>\s*image\b/);
    assert.doesNotMatch(body, /loadImage:\s*loadBrowserImage/);
  });
});

describe("onboarding wizard polish source pins (run 42, docs/onboarding-wizard-polish.md)", () => {
  function functionText(code, name) {
    const start = code.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
    assert.notEqual(start, -1, `function ${name} exists`);
    const rest = code.slice(start + 1);
    const next = rest.search(/^(?:async )?function |^const |^let |^\/\/ /m);
    return next === -1 ? code.slice(start) : code.slice(start, start + 1 + next);
  }

  it("AS-OWP-01: a document capture listener swallows pointer clicks for 300 ms after a close (decision 1)", async () => {
    const code = await source();
    assert.match(code, /const POST_CLOSE_CLICK_GUARD_MS = 300;/);
    assert.match(functionText(code, "armPostCloseClickGuard"), /postCloseGuardUntil = performance\.now\(\) \+ POST_CLOSE_CLICK_GUARD_MS;/);
    const listener = code.match(/document\.addEventListener\(\s*"click",\s*\(event\) => \{([\s\S]*?)\},\s*true\s*\);/);
    assert.ok(listener, "a capture-phase click listener on document");
    assert.match(listener[1], /event\.detail > 0 && performance\.now\(\) < postCloseGuardUntil/);
    assert.match(listener[1], /event\.preventDefault\(\);/);
    assert.match(listener[1], /event\.stopPropagation\(\);/);
  });

  it("AS-OWP-01/03: both close functions arm the guard once the node is removed", async () => {
    const code = await source();
    for (const [name, removal] of [["hideOnboardingWizard", "onboardingWizardRoot.remove();"], ["hideCityModal", "cityModalRoot.remove();"]]) {
      const body = functionText(code, name);
      assert.equal(body.split("armPostCloseClickGuard();").length, 2, `${name} arms the guard exactly once`);
      assert.ok(body.indexOf(removal) !== -1 && body.indexOf(removal) < body.indexOf("armPostCloseClickGuard();"), `${name}: armed after the node is removed`);
    }
  });

  it("AS-OWP-14: both wizard step transitions arm the guard too (a double click on Skip/Continue/Back)", async () => {
    const code = await source();
    for (const name of ["goToOnboardingStep2", "goToOnboardingStep1"]) {
      assert.equal(functionText(code, name).split("armPostCloseClickGuard();").length, 2, `${name} arms the guard once`);
    }
  });

  it("AS-OWP-01: opening the city modal or the wizard clears the guard of the previous close", async () => {
    const code = await source();
    assert.match(functionText(code, "clearPostCloseClickGuard"), /postCloseGuardUntil = 0;/);
    assert.match(functionText(code, "showCityModal"), /clearPostCloseClickGuard\(\);/);
    assert.match(functionText(code, "showOnboardingWizard"), /clearPostCloseClickGuard\(\);/);
  });

  it("AS-OWP-05: the preventScroll flag travels on the pendingFocus value and only the wizard close sets it", async () => {
    const code = await source();
    const hideWizard = functionText(code, "hideOnboardingWizard");
    assert.match(hideWizard, /pendingFocus = \[SETTINGS_TILE_SELECTOR\];\s*(?:\/\/[^\n]*\s*)*pendingFocus\.preventScroll = true;/);
    assert.doesNotMatch(functionText(code, "hideCityModal"), /preventScroll/);
    const apply = functionText(code, "applyPendingFocus");
    assert.match(apply, /const selectors = pendingFocus;\s*const preventScroll = selectors\.preventScroll === true;\s*pendingFocus = null;/);
    assert.match(apply, /target\.focus\(\{ preventScroll \}\);/);
    assert.equal(code.split("preventScroll = true").length, 2, "one place sets the flag");
    // a re-render that happens after the focus (the node is replaced) restores it without scrolling too
    assert.match(functionText(code, "restoreFocus"), /node\?\.focus\(\{ preventScroll: true \}\);/);
  });

  it("AS-OWP-07: the starter checkboxes are disabled while busy OR once the links are committed, and the list says so", async () => {
    const code = await source();
    const sync = functionText(code, "syncOnboardingWizardUi");
    assert.match(sync, /box\.disabled = finishBusy \|\| onboardingStartersCommitted;/);
    // run 44: the attribute handling moved into setStartersLocked (with the tabindex and the name)
    const setter = functionText(code, "setStartersLocked");
    assert.match(setter, /list\.dataset\.startersLocked = "true"/);
    assert.match(setter, /delete list\.dataset\.startersLocked/);
    const css = await appStyles();
    assert.match(
      css,
      /\.onboarding-wizard__starters\[data-starters-locked="true"\] input\[type="checkbox"\]:disabled \{\s*cursor: default;\s*\}/
    );
    assert.match(css, /\.onboarding-wizard__starter input\[type="checkbox"\]:disabled \{\s*cursor: wait;\s*\}/, "the busy rule is untouched");
  });

  it("AS-OWP-13: Back/Skip after the commit keeps the error and focuses an enabled row or Finish", async () => {
    const code = await source();
    const step2 = functionText(code, "goToOnboardingStep2");
    assert.match(step2, /if \(!onboardingStartersCommitted\) onboardingFinishError = "";/);
    assert.match(step2, /input\[type="checkbox"\]:not\(:disabled\)/);
    assert.match(step2, /\[data-onboarding-action="finish"\]/);
    assert.match(functionText(code, "goToOnboardingStep1"), /if \(!onboardingStartersCommitted\) onboardingFinishError = "";/);
  });

  it("AS-OWP-09: the progress is an image with a step label, not hidden", async () => {
    const code = await source();
    const build = functionText(code, "buildOnboardingWizard");
    assert.match(build, /progress\.setAttribute\("role", "img"\);/);
    assert.match(build, /progress\.setAttribute\("aria-label", "Step 1 of 2"\);/);
    assert.doesNotMatch(build, /progress\.setAttribute\("aria-hidden"/);
    assert.match(functionText(code, "syncOnboardingWizardUi"), /\.onboarding-wizard__progress"\)\?\.setAttribute\("aria-label", `Step \$\{progressPillCount\(onboardingStep\)\} of 2`\)/);
  });
});

describe("link dialog validation source pins (run 43, docs/link-dialog-validation.md)", () => {
  function functionText(code, name) {
    const start = code.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
    assert.notEqual(start, -1, `function ${name} exists`);
    const rest = code.slice(start + 1);
    const next = rest.search(/^(?:async )?function |^const |^let |^\/\/ /m);
    return next === -1 ? code.slice(start) : code.slice(start, start + 1 + next);
  }
  const stripCss = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
  const norm = (text) => text.replace(/\s+/g, " ").trim();
  const cssRules = (css) => [...stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: norm(m[1]), body: norm(m[2]), index: m.index }));
  // Text of an at-rule block (`header { ... }`) starting at the first `header` found at or after `from`.
  function atBlock(css, header, from = 0) {
    const start = css.indexOf(header, from);
    assert.notEqual(start, -1, `${header} exists`);
    let depth = 0;
    for (let i = css.indexOf("{", start); i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) return { start, end: i, text: css.slice(start, i + 1) };
      }
    }
    assert.fail(`${header} is not closed`);
  }
  const newtabCss = async () => stripCss(await readFile(new URL("../src/newtab.css", import.meta.url), "utf8"));
  const RING = "0 0 0 3px var(--focus-ring)";
  const RESTING_INSET = "inset 0 1px 0 rgb(255 255 255 / 10%)";
  const RESTING_DROP = "0 1px 4px rgba(var(--favorite-accent-rgb), 0.18)";

  it("the limits are constants in favoritesShared.js, imported and used by the service (decision 2)", async () => {
    const shared = await readFile(new URL("../src/favoritesShared.js", import.meta.url), "utf8");
    const service = await readFile(new URL("../src/widgetsService.js", import.meta.url), "utf8");
    assert.match(shared, /export const LINK_URL_MAX_LENGTH = 2000;/);
    assert.match(shared, /export const LINK_LABEL_MAX_LENGTH = 100;/);
    assert.match(service, /import \{[^}]*\bLINK_URL_MAX_LENGTH\b[^}]*\} from "\.\/favoritesShared\.js";/);
    assert.match(service, /import \{[^}]*\bLINK_LABEL_MAX_LENGTH\b[^}]*\} from "\.\/favoritesShared\.js";/);
    assert.match(service, /\.slice\(0, LINK_LABEL_MAX_LENGTH\)/, "the label fallback (the host) is cut to the name limit");
    assert.equal((service.match(/LINK_URL_MAX_LENGTH/g) ?? []).length >= 3, true, "used for the link, the normalized href and the icon link");
    for (const message of [
      "That link is too long (up to 2000 characters)",
      "That name is too long (up to 100 characters)",
      "That icon link is too long (up to 2000 characters)"
    ]) {
      assert.equal(service.includes(message), true, message);
    }
  });

  it("the error slot has a stable id, showDialogError takes the field and ties it with aria-invalid / aria-describedby (decision 3)", async () => {
    const code = await source();
    assert.match(functionText(code, "createDialogErrorSlot"), /error\.id = /);
    const show = functionText(code, "showDialogError");
    assert.match(show, /^function showDialogError\(root, message, field\b/);
    assert.match(show, /setAttribute\("aria-invalid", "true"\)/);
    assert.match(show, /setAttribute\("aria-describedby", /);
    assert.match(functionText(code, "invalidFieldFor"), /\/image url\/i/, "the message regexes stay as the fallback for errors without a field");
  });

  it("runDesktopMutation passes error.field and removes both attributes next to clearing the slot", async () => {
    const run = functionText(await source(), "runDesktopMutation");
    assert.match(run, /showDialogError\(dialogRoot, message, error\??\.field\)/);
    assert.match(run, /removeAttribute\("aria-invalid"\)/);
    assert.match(run, /removeAttribute\("aria-describedby"\)/);
    const clearAt = run.indexOf("slot.hidden = true");
    const removeAt = run.indexOf('removeAttribute("aria-invalid")');
    assert.equal(clearAt !== -1 && removeAt !== -1 && Math.abs(removeAt - clearAt) < 400, true, "cleared together with the slot when the next submit starts");
  });

  it("the Add tile carries aria-controls = the menu id while the menu is open and drops it when it closes", async () => {
    const code = await source();
    assert.match(code, /menu\.id = "add-menu";/);
    assert.match(functionText(code, "createChromeTile"), /setAttribute\("aria-controls", "add-menu"\)/);
    const sync = functionText(code, "syncAddTileExpanded");
    assert.match(sync, /setAttribute\("aria-controls", "add-menu"\)/);
    assert.match(sync, /removeAttribute\("aria-controls"\)/);
  });

  it("decision 4: ADDED_HIGHLIGHT_MS, the attribute, --added-delay, animationend filter, smooth scroll that falls back to auto", async () => {
    const code = await source();
    assert.match(code, /const ADDED_HIGHLIGHT_MS = 2000;/);
    assert.match(code, /dataset\.justAdded = "true"|setAttribute\("data-just-added", "true"\)/);
    assert.match(code, /style\.setProperty\("--added-delay", /);
    assert.match(code, /animationName === "tile-added"/, "the jiggle's animationend must not end the highlight");
    assert.match(code, /scrollIntoView\(\{ block: "center", behavior: prefersReducedMotion\(\) \? "auto" : "smooth" \}\)/);
    assert.match(code, /ADDED_HIGHLIGHT_MS/);
    assert.equal((code.match(/scrollIntoView\(/g) ?? []).length >= 1, true);
  });

  it("the new link is the LAST favorite of the set difference, not the first (two tabs adding at once)", async () => {
    const addCase = (await source()).match(/case "add-link": \{([\s\S]*?)case "edit-link":/);
    assert.ok(addCase, "the add-link case");
    assert.doesNotMatch(addCase[1], /\.find\(\(entry\) => entry\.type === "favorite" && !previousIds\.has\(entry\.id\)\)/);
    assert.match(addCase[1], /findLast\([^;]*!previousIds\.has|\.filter\([^;]*!previousIds\.has[^;]*\)\s*\.(?:at\(-1\)|pop\(\))/);
  });

  it("CSS: tile-added keyframes keep the ring until 60% and fade it to transparent, resting shadow layers first", async () => {
    const css = await newtabCss();
    const kf = atBlock(css, "@keyframes tile-added").text;
    assert.match(norm(kf), /60%/);
    assert.match(norm(kf), /100% \{[^}]*transparent/);
    assert.equal(norm(kf).includes(RING), true, "the ring layer");
    assert.equal(norm(kf).includes(RESTING_INSET), true, "the resting layers are listed first so the lists interpolate");
    assert.equal(norm(kf).includes(RESTING_DROP), true);
    assert.equal(norm(kf).indexOf(RESTING_INSET) < norm(kf).indexOf("0 0 0 3px"), true, "the ring layer comes last");
  });

  it("CSS: the ring (an extra box-shadow layer) exists only behind [data-just-added]", async () => {
    const css = await newtabCss();
    const rules = cssRules(css).filter((rule) => rule.body.includes("0 0 0 3px var(--focus-ring)"));
    const keyframeStep = /^(?:(?:\d+%|from|to)(?:, )?)+$/;
    const outside = rules.filter((rule) => !keyframeStep.test(rule.selector) && !rule.selector.includes("data-just-added"));
    assert.deepEqual(outside.map((rule) => rule.selector), [], "no other rule draws this ring");
    assert.equal(rules.some((rule) => rule.selector.includes("data-just-added")), true, "at least one rule draws it for [data-just-added]");
    const run = cssRules(css).find((rule) => rule.selector === ".desktop-grid > [data-just-added]");
    assert.ok(run, "the rule .desktop-grid > [data-just-added]");
    assert.match(run.body, /animation: tile-added 2000ms linear forwards;/);
    assert.match(run.body, /animation-delay: var\(--added-delay\);/);
  });

  it("CSS: edit mode runs BOTH animations with a per-animation delay list, placed after the jiggle rules and before the reduced-motion block (N-1)", async () => {
    const css = await newtabCss();
    const rules = cssRules(css);
    const EDIT = '.desktop[data-edit="true"] .desktop-grid > [data-just-added]';
    const jiggle = rules.find((rule) => rule.selector === '.desktop[data-edit="true"] .desktop-grid > [data-widget-id]:nth-child(2n)');
    const reduced = css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf("@keyframes tile-jiggle"));
    const edit = rules.find((rule) => rule.selector === EDIT);
    const editOdd = rules.find((rule) => rule.selector === `${EDIT}:nth-child(2n)`);
    assert.ok(edit, EDIT);
    assert.ok(editOdd, `${EDIT}:nth-child(2n)`);
    assert.match(edit.body, /animation: tile-jiggle 0\.28s ease-in-out infinite, tile-added 2000ms linear forwards;/);
    assert.match(edit.body, /animation-delay: 0s, var\(--added-delay\);/);
    assert.match(editOdd.body, /animation-delay: -0\.14s, var\(--added-delay\);/);
    assert.equal(jiggle.index < edit.index && edit.index < editOdd.index && editOdd.index < reduced, true, "order: jiggle rules, edit just-added rules, reduced-motion block");
  });

  it("CSS: the reduced-motion edit-mode block keeps animation: none for [data-just-added] (the dashed outline stays, N-1)", async () => {
    const css = await newtabCss();
    const block = atBlock(css, "@media (prefers-reduced-motion: reduce)", css.indexOf("@keyframes tile-jiggle")).text;
    const rule = cssRules(block.slice(block.indexOf("{") + 1)).find((r) => r.selector.includes('.desktop[data-edit="true"] .desktop-grid > [data-just-added]') && /animation: none;/.test(r.body));
    assert.ok(rule, "a rule with animation: none whose selector list covers the edit-mode [data-just-added]");
  });

  it("CSS: reduced motion shows a static ring on the tile with its resting layers, specificity not below :hover (N-2)", async () => {
    const css = await newtabCss();
    const hoverAt = css.indexOf(".favorite-tile:hover:not(:disabled)");
    assert.notEqual(hoverAt, -1);
    const reducedBlocks = [];
    for (let from = 0; ; ) {
      const at = css.indexOf("@media (prefers-reduced-motion: reduce)", from);
      if (at === -1) break;
      const block = atBlock(css, "@media (prefers-reduced-motion: reduce)", at);
      reducedBlocks.push(block);
      from = block.end;
    }
    const hit = reducedBlocks
      .map((block) => ({ block, rule: cssRules(block.text.slice(block.text.indexOf("{") + 1)).find((r) => r.selector === ".desktop-grid > .favorite-tile[data-just-added]") }))
      .find((entry) => entry.rule);
    assert.ok(hit, ".desktop-grid > .favorite-tile[data-just-added] inside a reduced-motion block");
    assert.match(hit.rule.body, /animation: none;/);
    assert.equal(hit.rule.body.includes(RING), true);
    assert.equal(hit.rule.body.includes(RESTING_INSET) && hit.rule.body.includes(RESTING_DROP), true, "the resting layers are re-listed");
    assert.equal(hit.block.start > hoverAt, true, "placed after the hover / focus-visible shadow rule");
  });

  it("CSS: forced colors replace the box-shadow ring with a solid 3px Highlight outline (not weaker than the dashed edit outline)", async () => {
    const css = await newtabCss();
    const forced = atBlock(css, "@media (forced-colors: active)").text;
    const rules = cssRules(forced.slice(forced.indexOf("{") + 1)).filter((r) => r.selector.includes("data-just-added"));
    assert.equal(rules.length > 0, true, "a forced-colors rule for [data-just-added]");
    assert.equal(rules.some((r) => /outline: 3px solid Highlight;/.test(r.body) && /outline-offset: 0;/.test(r.body)), true);
  });

  it("CSS: the forced-colors outline comes after the reduced-motion edit-mode block so it wins in edit mode (L0-06)", async () => {
    const css = await newtabCss();
    const forcedAt = css.indexOf("@media (forced-colors: active)");
    const reducedAt = css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf("@keyframes tile-jiggle"));
    const outlineAt = css.indexOf("outline: 3px solid Highlight");
    assert.notEqual(outlineAt, -1);
    assert.equal(outlineAt > reducedAt && forcedAt !== -1, true);
  });
});

// Run 44 (docs/city-modal-focus-copy.md): source pins written red-first (TDD); the behaviour itself is measured by E2E dg-84.
describe("city modal focus and copy source (run 44, docs/city-modal-focus-copy.md)", () => {
  const norm = (text) => text.replace(/\s+/g, " ").trim();
  const stripCss = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
  const cssRules = (css) => [...stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(",").map(norm), body: norm(m[2]) }));
  const ruleFor = (css, selector) => cssRules(css).find((r) => r.selectors.includes(selector));
  const strippedSource = async () => stripComments(await source());
  const surfaces = () => readFile(new URL("../src/surfaces.css", import.meta.url), "utf8");

  // Expands a 1-4 value px shorthand (or the -inline pair) to [top, right, bottom, left]; null when absent.
  function boxValues(body, property) {
    const shorthand = body.match(new RegExp(`(?:^|;| )${property}: ([^;]+)`));
    const inline = body.match(new RegExp(`${property}-inline: ([^;]+)`));
    const px = (v) => Number.parseFloat(v);
    if (shorthand) {
      const v = shorthand[1].trim().split(/\s+/).map(px);
      if (v.length === 1) return [v[0], v[0], v[0], v[0]];
      if (v.length === 2) return [v[0], v[1], v[0], v[1]];
      if (v.length === 3) return [v[0], v[1], v[2], v[1]];
      return v;
    }
    if (inline) {
      const v = inline[1].trim().split(/\s+/).map(px);
      return [0, v[0], 0, v[v.length - 1]];
    }
    return null;
  }

  // The announce function evaluated against stubbed rAF / timers / live region (behavioural pins, not text pins).
  async function createAnnounceHarness() {
    const code = await strippedSource();
    const body = topLevelFunction(code, "announce");
    const helpers = [...code.matchAll(/^(?:let|const|var) [^\n]*announce[^\n]*$/gim)].map((m) => m[0]).join("\n");
    const history = [];
    const region = {
      value: "previous",
      get textContent() {
        return this.value;
      },
      set textContent(next) {
        this.value = next;
        history.push(next);
      }
    };
    const frames = new Map();
    const timers = new Map();
    let ids = 0;
    const sandbox = {
      desktopLive: region,
      requestAnimationFrame: (cb) => (frames.set(++ids, cb), ids),
      cancelAnimationFrame: (id) => frames.delete(id),
      setTimeout: (cb, ms) => (timers.set(++ids, { cb, ms }), ids),
      clearTimeout: (id) => timers.delete(id)
    };
    vm.createContext(sandbox);
    const announce = vm.runInContext(`${helpers}\n${body}\n;announce`, sandbox);
    return {
      announce,
      region,
      history,
      timers,
      runFrames() {
        const pending = [...frames.entries()];
        frames.clear();
        pending.forEach(([, cb]) => cb(0));
      },
      runTimers() {
        const pending = [...timers.entries()];
        timers.clear();
        pending.forEach(([, { cb }]) => cb());
      }
    };
  }

  // ---- Decision 4 / AS-CMF-10: announce re-reads a repeated string ----
  it("AS-CMF-10: announce clears the region at once and sets the text on the next frame (an equal string mutates twice)", async () => {
    const h = await createAnnounceHarness();
    h.region.value = "Link deleted";
    h.announce("Link deleted");
    assert.equal(h.region.textContent, "", "cleared synchronously");
    assert.deepEqual(h.history, [""], "the only write before the frame is the clear");
    h.runFrames();
    assert.equal(h.region.textContent, "Link deleted", "the text arrives on the frame");
  });

  it("AS-CMF-10: if requestAnimationFrame never fires (hidden tab) a ~50 ms timer sets the text", async () => {
    const h = await createAnnounceHarness();
    h.announce("Weather updated");
    assert.equal(h.region.textContent, "");
    assert.ok(h.timers.size >= 1, "a fallback timer is scheduled");
    for (const { ms } of h.timers.values()) assert.ok(ms >= 30 && ms <= 100, `fallback delay is about 50 ms, got ${ms}`);
    h.runTimers();
    assert.equal(h.region.textContent, "Weather updated");
  });

  it("AS-CMF-10: a second announce before the frame replaces the first; the first text is never set", async () => {
    const h = await createAnnounceHarness();
    h.announce("first");
    h.announce("second");
    h.runFrames();
    h.runTimers();
    assert.equal(h.region.textContent, "second");
    assert.ok(!h.history.includes("first"), "the replaced text never reaches the region");
  });

  it('AS-CMF-10: announce("") clears at once and cancels a pending text', async () => {
    const h = await createAnnounceHarness();
    h.announce("pending");
    h.announce("");
    assert.equal(h.region.textContent, "");
    h.runFrames();
    h.runTimers();
    assert.equal(h.region.textContent, "");
    assert.ok(!h.history.includes("pending"));
  });

  it("AS-CMF-10: desktopLive is written only inside announce; the call site keeps announce(\"Weather updated\")", async () => {
    const code = await strippedSource();
    const body = topLevelFunction(code, "announce");
    assert.doesNotMatch(code.replace(body, ""), /desktopLive\.textContent\s*=(?!=)/, "no other assignment to the live region");
    assert.match(code, /announce\("Weather updated"\)/);
  });

  // ---- Decision 1 / 3: announcement phrase, the service option in change mode only ----
  it("AS-CMF-01/22: the success of a city change announces `City set to <Name, Country>` via announce", async () => {
    const code = await strippedSource();
    assert.match(code, /announce\(\s*[`"']City set to /);
    assert.match(code, /City set to \$\{[^}]*cityDisplayLabel\(/, "the label is cityDisplayLabel of the stored location");
  });

  it("AS-CMF-05/08/09: persist: after-forecast is passed exactly twice in change mode and never in the wizard", async () => {
    const code = await strippedSource();
    const modal = code.slice(code.indexOf("function attachCityModalListeners("), code.indexOf("function showCityModal("));
    assert.ok(modal.length > 100, "change-mode listeners found");
    assert.equal(modal.split('persist: "after-forecast"').length - 1, 2, "setCity and selectLocation");
    assert.equal(modal.split("isStale").length - 1 >= 4, true, "both calls hand their isStale (parameter and option)");
    const wizard = code.slice(code.indexOf("function attachOnboardingWizardListeners("), code.indexOf("function hideOnboardingWizard("));
    assert.ok(wizard.length > 100, "wizard listeners found");
    assert.doesNotMatch(wizard, /persist:|isStale/);
    assert.match(wizard, /changeCity\(\s*\(\) =>\s*weatherService\.selectLocation\(\{[^}]*\}\),\s*\{ onSuccess: goToOnboardingStep2 \}\s*\)/);
    assert.match(wizard, /changeCity\(\(\) => weatherService\.setCity\(cityName\), \{ onSuccess: goToOnboardingStep2 \}\)/);
  });

  it("AS-CMF-08: changeCity owns a stale flag: it hands isStale to the run and marks it stale on timeout and on a new attempt", async () => {
    const change = topLevelFunction(await strippedSource(), "changeCity");
    assert.match(change, /isStale/);
    assert.match(change, /await withTimeout\(run\(isStale\)\)/);
    assert.match(change, /[sS]tale\w*\s*=\s*true/, "a stale flag is set");
  });

  it("AS-CMF-08: the catch of a city attempt marks it stale (a timeout); the busy rescue puts focus on the title in both surfaces", async () => {
    const change = topLevelFunction(await strippedSource(), "changeCity");
    const caught = change.slice(change.indexOf("} catch (error) {"), change.indexOf("} finally {"));
    assert.match(caught, /attempt\.stale = true/, "a failed or timed-out attempt is stale");
    const sync = topLevelFunction(await strippedSource(), "syncCityModal");
    assert.match(sync, /rescueFocusToTitle\(cityModalRoot, "#city-modal-title"\)/);
    assert.match(sync, /rescueFocusToTitle\(onboardingWizardRoot, "#onboarding-step1-title"\)/);
  });

  it("AS-CMF-11: the `Set a city` line of the City field is muted (the placeholder token), not the text colour", async () => {
    const rule = ruleFor(await surfaces(), ".city-field > [data-weather-dialog-city][data-empty]");
    assert.ok(rule, "a rule for the empty value line");
    assert.match(rule.body, /color: var\(--muted\)/);
  });

  // ---- Decision 5 / AS-CMF-11, AS-CMF-22: the City field with no city ----
  it("AS-CMF-22: `No city set` is not a string literal anywhere in src/ (code, markup)", async () => {
    for (const { name, text } of await allSrc()) {
      const code = name.endsWith(".js") ? stripComments(text) : name.endsWith(".css") ? stripCss(text) : text;
      assert.doesNotMatch(code, /["'`][^"'`\n]*No city set[^"'`\n]*["'`]/, `${name} must not contain a "No city set" literal`);
      if (name.endsWith(".html")) assert.doesNotMatch(code, /No city set/, `${name} must not show the text`);
    }
  });

  it("AS-CMF-11: with no city the value line is `Set a city`, the hint is hidden by the city, the name is set with setAttribute", async () => {
    const sync = topLevelFunction(await strippedSource(), "syncWeatherDialogCity");
    assert.match(sync, /\.textContent\s*=[^;]*"Set a city"/, "the value line shows Set a city");
    assert.match(sync, /\[data-weather-dialog-city\]/, "on the dialog's value node");
    assert.match(sync, /\.hidden\s*=[^;]*(?:label|location)|toggleAttribute\("hidden",[^)]*(?:label|location)/, "the hint's hidden depends on the stored city");
    assert.match(sync, /setAttribute\("aria-labelledby",/, "the accessible name is rebuilt on every sync");
    assert.doesNotMatch(sync, /"Change"/, "the hint text is not rewritten by the sync");
  });

  // ---- Decision 6 / AS-CMF-13..15: the description becomes the status while locating ----
  it("AS-CMF-13/14: while locating the words around the link are hidden (they leave the accessibility tree), the link shows the busy label", async () => {
    const code = await strippedSource();
    const sync = topLevelFunction(code, "syncLocationLink");
    assert.match(sync, /\.hidden\s*=\s*locating|toggleAttribute\("hidden",\s*locating\)|setAttribute\("hidden"/);
    assert.match(sync, /\.textContent\s*=\s*LOCATION_BUSY_LABEL/);
    assert.match(code, /const LOCATION_BUSY_LABEL = "Finding your location\\u2026";/, "the status text is unchanged");
  });

  // ---- checkpoint minors L1-01 / L2-01 (run 44): busy-phase focus
  it("L2-01: the city modal title takes the dialog's focus ring (a token), not the system outline, while a request runs", async () => {
    const rule = ruleFor(await surfaces(), ".city-modal__title:focus-visible");
    assert.ok(rule, "a :focus-visible rule for the title");
    assert.match(rule.body, /box-shadow: 0 0 0 2px var\(--focus-[a-z-]*ring\)/);
    assert.match(rule.body, /outline: 2px solid transparent/);
  });

  it("L1-01: a press on a non-interactive spot of a busy city modal or wizard cannot move the focus to body", async () => {
    const code = await strippedSource();
    const handler = topLevelFunction(code, "keepFocusWhileBusy");
    assert.match(handler, /weatherBusy/);
    assert.match(handler, /favoritesBusy && onboardingStep === 2/, "the wizard's Finish busy (aria-busy too) counts");
    assert.match(handler, /input:not\(:disabled\), button:not\(:disabled\)/);
    assert.match(handler, /\bevent\.preventDefault\(\)/);
    for (const attach of ["attachCityModalListeners", "attachOnboardingWizardListeners"]) {
      assert.match(topLevelFunction(code, attach), /\.addEventListener\("mousedown",\s*keepFocusWhileBusy\)/, `${attach} wires it`);
    }
    // disabled controls swallow the press: pointer-events none lets it land on the container
    const css = await surfaces();
    assert.match(css, /\.city-modal__dialog\[aria-busy="true"\] :disabled[^{]*\{[^}]*pointer-events: none/);
  });

  // ---- Decision 7 / AS-CMF-17: focus ring of the location link ----
  it("AS-CMF-17: .city-location-link:focus-visible has horizontal padding, an equal negative margin and the control radius", async () => {
    const rule = ruleFor(await surfaces(), ".city-location-link:focus-visible");
    assert.ok(rule, "the focus-visible rule exists");
    const padding = boxValues(rule.body, "padding");
    const margin = boxValues(rule.body, "margin");
    assert.ok(padding && margin, `padding and margin in ${rule.body}`);
    assert.ok(padding[1] > 0 && padding[3] > 0, `horizontal padding > 0, got ${padding}`);
    assert.equal(margin[1], -padding[1], "right margin cancels the right padding");
    assert.equal(margin[3], -padding[3], "left margin cancels the left padding (the text does not move)");
    assert.match(rule.body, /border-radius: var\(--radius-control\)/);
    assert.match(rule.body, /box-shadow: 0 0 0 2px var\(--focus-[a-z-]*ring\)/, "the ring is kept");
  });

  // ---- Decision 8 / AS-CMF-18: a locked starter list is a keyboard scroll stop ----
  it("AS-CMF-18: tabindex and aria-label \"Starter links\" are set only while the list is locked", async () => {
    const code = await strippedSource();
    const sync = topLevelFunction(code, "syncOnboardingWizardUi");
    const from = sync.indexOf('const list = onboardingWizardRoot.querySelector(".onboarding-wizard__starters");');
    assert.notEqual(from, -1, "the list block exists");
    const block = sync.slice(from, sync.indexOf(".onboarding-wizard__progress"));
    assert.match(block, /setStartersLocked\(list, onboardingStartersCommitted\)/, "locked only by the committed write");
    const setter = topLevelFunction(code, "setStartersLocked");
    const [lockedSet, unlockedSet = ""] = setter.split(/\belse\b/);
    assert.match(lockedSet, /startersLocked = "true"/);
    assert.match(lockedSet, /setAttribute\("tabindex", "0"\)|\.tabIndex = 0/);
    assert.match(lockedSet, /"Starter links"/);
    assert.match(unlockedSet, /removeAttribute\("tabindex"\)/);
    assert.match(unlockedSet, /removeAttribute\("aria-label"\)/);
    assert.doesNotMatch(topLevelFunction(code, "buildOnboardingStep2"), /tabindex|tabIndex|Starter links/, "the unlocked list has no static tab stop or name");
  });

  it("AS-CMF-18: the locked list has a visible, unclipped focus ring (an outline outside the list box, so the opaque rows cannot cover it; run 46 decision 9) in a focus token", async () => {
    const rule = ruleFor(await surfaces(), '.onboarding-wizard__starters[data-starters-locked="true"]:focus-visible');
    assert.ok(rule, "a :focus-visible rule for the locked list");
    assert.match(rule.body, /outline: 2px solid var\(--focus-[a-z-]*ring\)/, "an outline is painted over the opaque rows (an inset shadow is hidden by them)");
    assert.match(rule.body, /outline-offset: 0;/, "outside the list box (run 46 decision 9 replaces the inset -2px outline the rows covered)");
    assert.doesNotMatch(rule.body, /inset/);
  });

  // ---- Decision 9 / AS-CMF-19: the second press does not move focus ----
  it("AS-CMF-19: a capture mousedown listener checks the guard window before preventing default", async () => {
    const code = await strippedSource();
    const call = code.search(/document\.addEventListener\(\s*"mousedown"/);
    assert.notEqual(call, -1, "a document mousedown listener");
    let depth = 0;
    let end = call;
    for (let i = code.indexOf("(", call); i < code.length; i += 1) {
      if (code[i] === "(") depth += 1;
      if (code[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    const listener = code.slice(call, end + 1);
    assert.match(listener, /(?:,\s*true\s*\)$|capture:\s*true)/, "capture phase");
    const windowCheck = listener.search(/performance\.now\(\)\s*<\s*postCloseGuardUntil|postCloseGuardUntil\s*>\s*performance\.now\(\)/);
    const prevent = listener.search(/\b\w+\.preventDefault\(\)/);
    assert.ok(windowCheck !== -1 && prevent !== -1, "both the window check and preventDefault exist");
    assert.ok(windowCheck < prevent, "the time check comes before preventDefault");
    assert.doesNotMatch(listener, /\.detail/, "mousedown is guarded by time alone (the first press has detail 1 too)");
  });
});

// Run 45 (docs/city-suggestion-list.md): source pins written red-first (TDD); the behaviour itself is measured by E2E dg-85.
describe("city suggestion list source pins (run 45, docs/city-suggestion-list.md)", () => {
  const norm = (text) => text.replace(/\s+/g, " ").trim();
  const stripCss = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
  const cssRules = (css) => [...stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(",").map(norm), body: norm(m[2]) }));
  const ruleFor = (css, selector) => cssRules(css).find((r) => r.selectors.includes(selector));
  const strippedSource = async () => stripComments(await source());
  const surfaces = () => readFile(new URL("../src/surfaces.css", import.meta.url), "utf8");
  const cityForm = async () => topLevelFunction(await strippedSource(), "createCityForm");
  // The nested renderSuggestionsList: from its declaration to its matching closing brace (brace counting, not an indent guess).
  const renderList = async () => {
    const form = await cityForm();
    const start = form.indexOf("function renderSuggestionsList()");
    assert.notEqual(start, -1, "renderSuggestionsList exists in createCityForm");
    const open = form.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < form.length; i += 1) {
      if (form[i] === "{") depth += 1;
      else if (form[i] === "}" && (depth -= 1) === 0) return form.slice(start, i + 1);
    }
    assert.fail("renderSuggestionsList is balanced");
  };

  it("AS-CSL-01: the city input is an ARIA 1.2 combobox with a listbox popup controlled by weather-city-suggestions", async () => {
    const form = await cityForm();
    assert.match(form, /input\.setAttribute\("role", "combobox"\)/);
    assert.match(form, /input\.setAttribute\("aria-autocomplete", "list"\)/);
    assert.match(form, /input\.setAttribute\("aria-haspopup", "listbox"\)/);
    assert.match(form, /input\.setAttribute\("aria-controls", "weather-city-suggestions"\)/);
    assert.match(form, /input\.setAttribute\("aria-label", "City"\)/, "the existing name stays");
  });

  it("AS-CSL-01: the suggestion list is a listbox named City suggestions with the id aria-controls points at, and tabindex -1", async () => {
    const form = await cityForm();
    assert.match(form, /suggestionsList\.id = "weather-city-suggestions"|suggestionsList\.setAttribute\("id", "weather-city-suggestions"\)/);
    assert.match(form, /suggestionsList\.setAttribute\("role", "listbox"\)/);
    assert.match(form, /suggestionsList\.setAttribute\("aria-label", "City suggestions"\)/);
    assert.match(form, /suggestionsList\.setAttribute\("tabindex", "-1"\)|suggestionsList\.tabIndex = -1/, "a scrollable listbox of tabindex=-1 options is a Tab stop in Chromium unless it is -1 itself (review I1)");
  });

  it("AS-CSL-02: every suggestion button is a role=option with tabindex -1 and keeps its select-city action", async () => {
    const render = await renderList();
    assert.match(render, /createNode\("button", "weather-form__suggestion", label\)/, "still a button");
    assert.match(render, /\bbutton\.setAttribute\("role", "option"\)/);
    assert.match(render, /\bbutton\.setAttribute\("tabindex", "-1"\)|\bbutton\.tabIndex = -1/);
    assert.match(render, /button\.dataset\.weatherAction = "select-city"/);
  });

  it("AS-CSL-02: renderSuggestionsList sets aria-expanded=false in the closed branch (before its return) and true on the open path", async () => {
    const render = await renderList();
    const guard = render.search(/if \(!isSuggestionsOpen\(weatherUi\)\) \{/);
    assert.notEqual(guard, -1, "the closed-state guard exists");
    const ret = render.indexOf("return;", guard);
    assert.notEqual(ret, -1, "the closed branch returns");
    const closedBranch = render.slice(guard, ret);
    assert.match(closedBranch, /input\.setAttribute\("aria-expanded", "false"\)/, "the closed branch writes false before returning");
    const openPath = render.slice(ret);
    assert.match(openPath, /input\.setAttribute\("aria-expanded", "true"\)/, "the open path writes true");
    assert.ok(openPath.search(/aria-expanded", "true"/) < openPath.search(/for \(const suggestion of/), "true is written before the options are built");
  });

  it("AS-CSL-04: tabTrapFocusables excludes role=option buttons from its candidates by selector", async () => {
    const code = await strippedSource();
    const trap = topLevelFunction(code, "tabTrapFocusables");
    assert.match(trap, /querySelectorAll\(['"]input, button:not\(\[role="option"\]\)['"]\)/, "options are not trap candidates");
  });

  it("AS-CSL-12: .city-location-link:focus-visible pads the text by 1px with an equal negative margin, so the ring reaches 3px", async () => {
    const rule = ruleFor(await surfaces(), ".city-location-link:focus-visible");
    assert.ok(rule, "the focus-visible rule exists");
    assert.match(rule.body, /padding: 0 1px;/);
    assert.match(rule.body, /margin: 0 -1px;/);
    assert.match(rule.body, /box-shadow: 0 0 0 2px var\(--focus-[a-z-]*ring\)/, "the 2px ring stays");
    assert.match(rule.body, /border-radius: var\(--radius-control\)/);
  });
});

describe("drag scrolling source pins (run 47, docs/drag-scroll-target.md)", () => {
  const LAYOUT_READ = /scrollHeight|clientHeight|offsetHeight|getBoundingClientRect|scrollY|pageYOffset|innerHeight/;

  // The one window `scroll` listener: its inline handler, or the named top-level function it points at.
  function scrollHandler(code) {
    const matches = [...code.matchAll(/window\.addEventListener\("scroll",/g)];
    assert.equal(matches.length, 1, "exactly one window scroll listener");
    const rest = code.slice(matches[0].index + matches[0][0].length);
    const end = rest.indexOf("{ passive: true })");
    assert.notEqual(end, -1, "the scroll listener is passive");
    const argument = rest.slice(0, end);
    const named = argument.match(/^\s*([A-Za-z_$][\w$]*)\s*,\s*$/);
    return { index: matches[0].index, text: named ? topLevelFunction(code, named[1]) : argument };
  }

  it("registers one passive window scroll listener at boot next to the other drag listeners, never per drag", async () => {
    const code = stripComments(await source());
    const { index } = scrollHandler(code);
    assert.match(code, /window\.addEventListener\("scroll",[\s\S]*?\{ passive: true \}\);/);
    assert.doesNotMatch(code, /removeEventListener\("scroll"/);
    const pointermove = code.indexOf('window.addEventListener("pointermove", onDragPointerMove)');
    assert.notEqual(pointermove, -1);
    assert.ok(Math.abs(index - pointermove) < 1500, "registered in the same wiring block as pointermove/pointerup/pointercancel/blur");
    for (const name of ["beginPointerDrag", "onDragPointerMove", "cancelDrag", "returnDraggedTile"]) {
      assert.doesNotMatch(topLevelFunction(code, name), /addEventListener\("scroll"/, `${name} does not attach a scroll listener`);
    }
  });

  it("the scroll handler updates the target only for a started drag and otherwise only the lazy release", async () => {
    const { text } = scrollHandler(stripComments(await source()));
    assert.match(text, /dragSession\?\.started/);
    assert.match(text, /updateDragTarget\(dragSession\)/);
    assert.match(text, /holdReleasable\(/);
    assert.doesNotMatch(text, /createNode|drop-highlight|data-dragging|dataset\.dragging|renderFavorites|renderDesktop/, "never creates, moves or redraws anything itself");
    assert.ok(text.indexOf("updateDragTarget(") < text.indexOf("holdReleasable("), "drag target first, release only in the no-drag branch");
  });

  it("the scroll handler reads no layout when there is no hold and no started drag", async () => {
    const { text } = scrollHandler(stripComments(await source()));
    const firstRead = text.search(LAYOUT_READ);
    assert.notEqual(firstRead, -1, "the release condition reads the layout");
    const before = text.slice(0, firstRead);
    assert.match(before, /hold/i, "a hold guard precedes the first layout read");
    assert.match(before, /return/, "the guard leaves early");
  });

  it("onDragPointerUp recomputes the target before it reads the drag state", async () => {
    const up = topLevelFunction(stripComments(await source()), "onDragPointerUp");
    const started = up.indexOf("if (!s.started) return");
    const update = up.indexOf("updateDragTarget(s)");
    const read = up.indexOf("desktopUi.drag");
    assert.ok(started !== -1 && update !== -1 && read !== -1);
    assert.ok(started < update && update < read, "tap exit, then updateDragTarget(s), then desktopUi.drag");
  });

  it("renderDesktop: scrollY first (before applyGridMetrics), hold cleared after replaceChildren, measured, set, scrollTo last", async () => {
    const render = topLevelFunction(stripComments(await source()), "renderDesktop");
    const earlyExitEnd = render.indexOf("const focusTarget");
    assert.notEqual(earlyExitEnd, -1);
    const exits = render.slice(0, earlyExitEnd);
    assert.doesNotMatch(exits, /drag-hold|pageHoldHeight|scrollTo|scrollY/, "the early exits (widgetsNewer, no widgetsState) do not touch the hold");
    const at = (re, from = 0) => {
      const i = render.slice(from).search(re);
      assert.notEqual(i, -1, `renderDesktop contains ${re}`);
      return from + i;
    };
    const readScroll = at(/(?:const|let) \w+ = (?:window\.)?(?:scrollY|pageYOffset)/);
    const metrics = at(/applyGridMetrics\(\)/);
    const replace = at(/favoritesRoot\.replaceChildren\(grid\)/);
    const clear = at(/(?:setProperty\("--drag-hold", "0px"\)|removeProperty\("--drag-hold"\))/, replace);
    const measure = at(/scrollHeight/, clear);
    const compute = at(/pageHoldHeight\(/, measure);
    const set = at(/setProperty\("--drag-hold"/, compute);
    const focus = at(/restoreFocus\(focusTarget\)/, replace);
    const settle = at(/settleTileAt\(tile, pendingDrop\.id/, replace);
    const reattach = at(/reattachDrag\(\)/, replace);
    const scrollTo = at(/scrollTo\(0, /, set);
    assert.ok(readScroll < metrics, "scrollY is read before applyGridMetrics");
    assert.doesNotMatch(render.slice(earlyExitEnd, readScroll), /applyGridMetrics|replaceChildren|scrollHeight|getBoundingClientRect|offsetHeight/, "no layout-forcing statement before the scrollY read");
    assert.ok(metrics < replace && replace < clear && clear < measure && measure < compute && compute < set, "render, clear, measure, compute, set");
    assert.ok(set < scrollTo && focus < scrollTo && settle < scrollTo && reattach < scrollTo, "scrollTo comes after restoreFocus, settleTileAt and reattachDrag");
    assert.equal(render.lastIndexOf("scrollTo("), scrollTo, "no scrollTo after the restoring one");
    assert.equal(render.indexOf("scrollTo("), scrollTo, "exactly one scrollTo in renderDesktop");
    assert.equal(render.slice(scrollTo).includes("pageHoldHeight("), false);
  });

  it("the hold is not released by a drag start or by opening a dialog", async () => {
    const code = stripComments(await source());
    for (const name of ["beginPointerDrag", "openDesktopDialog"]) {
      assert.doesNotMatch(topLevelFunction(code, name), /--drag-hold|pageHoldHeight|holdReleasable/, `${name} does not release or touch the hold`);
    }
  });

  it("the hold is a bottom-padding term of .desktop next to --status-reserve", async () => {
    const css = stripComments(await readFile(new URL("../src/newtab.css", import.meta.url), "utf8"));
    const rule = css.match(/\n\.desktop \{([^}]*)\}/);
    assert.ok(rule, ".desktop rule exists");
    assert.match(rule[1], /padding-bottom: calc\([^;]*var\(--status-reserve, 0px\)[^;]*var\(--drag-hold, 0px\)[^;]*\);/);
    assert.doesNotMatch(css, /min-height: calc\([^;]*--drag-hold/, "not a min-height (would absorb a later chip)");
  });

  it("AUTOSCROLL_STEP_PX is unchanged and the autoscroll frame keeps its own target update", async () => {
    const code = stripComments(await source());
    assert.match(code, /const AUTOSCROLL_STEP_PX = 12;/);
    assert.match(topLevelFunction(code, "autoscrollFrame"), /window\.scrollBy\(0, direction \* AUTOSCROLL_STEP_PX\)[\s\S]*updateDragTarget\(/);
  });

  it("a chip cleared while a drop settles hands its reserve to the hold in the same task (checkpoint L2-01)", async () => {
    const code = stripComments(await source());
    const status = topLevelFunction(code, "showDesktopStatus");
    assert.match(status, /text === "" && !desktopStatus\.hidden\) keepHoldAcrossChipRelease\(\)/);
    const keep = topLevelFunction(code, "keepHoldAcrossChipRelease");
    assert.match(keep, /if \(!dragSettling\) return;/);
    assert.match(keep, /dragHoldPx \+= reserve;[\s\S]*"--drag-hold"[\s\S]*"--status-reserve", "0px"/);
  });
});

// Run 49 (docs/typography-copy.md decisions 1, 3, 4, 6): source pins of the typography and copy changes. The existing pins on the
// 1×1 and 1×2 hint (one unbroken if / else if / else chain) stay as they are; the trigger is a separate statement after the chain.
describe("typography and copy source pins (run 49)", () => {
  const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

  it("body takes the dialog body size, var(--font-size-md), and html sets no size, so rem stays the browser's root size (decision 1)", async () => {
    const css = (await read("newtab.css")).replace(/\/\*[\s\S]*?\*\//g, ""); // a comment between the blocks must not hide or fake a rule
    // `}` before `body {`: the `html,\nbody { min-height }` block above it is not the rule
    assert.match(css, /\}\s*body \{[^}]*font-size:\s*var\(--font-size-md\);/);
    assert.doesNotMatch(css, /html[^{}]*\{[^}]*(?<![-\w])font-size/, "html keeps the browser's root size: rem stays 16 px at the default");
  });

  it("the row-stacking query is exactly `@media (max-width: 400px), (max-width: 25rem)`, once; the bare 400 px query is gone (S0-01, backlog 144 R3-03)", async () => {
    const css = await read("surfaces.css");
    assert.equal(css.split("@media (max-width: 400px), (max-width: 25rem) {").length - 1, 1, "the new query appears exactly once");
    assert.doesNotMatch(css, /@media \(max-width: 400px\) \{/, "the bare 400 px query is replaced, not kept beside it");
    const stack = css.slice(css.indexOf("@media (max-width: 400px), (max-width: 25rem) {"), css.indexOf("@media (max-width: 451px)"));
    assert.match(stack, /\.desktop-dialog \.favorite-form__row \{\s*flex-wrap: wrap;\s*row-gap: 6px;\s*\}/);
    assert.match(stack, /\.desktop-dialog \.favorite-form__row-label \{\s*width: 100%;\s*\}/);
    assert.doesNotMatch(stack, /segmented__option/, "the segment rule stays in the 451 px block");
  });

  it("the 1×1 hint sets data-tooltip-trigger and data-tooltip-label \"Set a city\" in a separate statement after the chain, only for 1×1 (decision 6)", async () => {
    const hint = stripComments(topLevelFunction(await source(), "createCityHintTile"));
    const chain = 'else button.appendChild(createIconNode("mapPin"));';
    const at = hint.indexOf(chain);
    assert.notEqual(at, -1, "the if / else if / else chain is still one unbroken statement");
    const before = hint.slice(0, at + chain.length);
    const after = hint.slice(at + chain.length);
    assert.doesNotMatch(before, /tooltip/i, "neither the 2×1, 2×2 nor the 1×2 branch gets a trigger, and nothing in the chain does");
    const trigger = /(?:dataset\.tooltipTrigger = ""|setAttribute\("data-tooltip-trigger", ""\))/;
    const label = /(?:dataset\.tooltipLabel = "Set a city"|setAttribute\("data-tooltip-label", "Set a city"\))/;
    // the guard may be written either way round; the block is the one statement after the chain
    const guarded = after.match(/if \(\s*(?:cell\.w === 1 && cell\.h === 1|cell\.h === 1 && cell\.w === 1)\s*\)\s*\{([^}]*)\}/);
    assert.ok(guarded, "a separate if (cell.w === 1 && cell.h === 1) block follows the chain");
    assert.match(guarded[1], trigger);
    assert.match(guarded[1], label);
    assert.match(after, /return button;\s*\}\s*$/, "the function still ends with the return");
  });

  it("the hint keeps its accessible name and gets no aria-describedby and no native title (decision 6)", async () => {
    const hint = stripComments(topLevelFunction(await source(), "createCityHintTile"));
    assert.match(hint, /button\.setAttribute\("aria-label", "Set a city"\);/);
    assert.doesNotMatch(hint, /aria-describedby|setAttribute\("title"|\.title\s*=/);
    assert.doesNotMatch(hint, /data-tooltip-text|tooltipText/, "no text node is added: dg-21 asserts the 1×1 tile has no text");
  });

  it("showTooltipFor reads trigger.dataset.tooltipLabel first and the [data-tooltip-text] child second (decision 6)", async () => {
    const show = topLevelFunction(await source(), "showTooltipFor");
    assert.match(show, /const text = trigger\.dataset\.tooltipLabel \?\? trigger\.querySelector\("\[data-tooltip-text\]"\)\?\.textContent;/);
    assert.match(show, /if \(desktopUi\.editMode \|\| dragSession\) return;/, "edit mode and drag still show no tooltip");
  });

  it("the texts of newtab.js follow decisions 4 and 5: the em dash, tiles, links and the grid", async () => {
    const code = await source();
    assert.match(code, /const ENSURE_FAILED_MESSAGE =\s*"Couldn't add the weather and settings tiles \u2014 Chrome Sync may be full or unavailable\. Free up sync space, then reload this tab to try again\.";/);
    assert.match(code, /favoritesError = "Chrome APIs for the grid are unavailable\.";/);
    assert.equal(code.split('throw new Error("Link not found")').length - 1, 2, "the two stale-link guards of the drop and the edit say Link not found");
    assert.doesNotMatch(code, /Favorite not found|favorites are unavailable|Chrome APIs for favorites/);
  });

  it("only the hint tile and showTooltipFor know the tooltip label: the weather tiles are unchanged (decision 6)", async () => {
    let code = stripComments(await source()); // a comment that names the label elsewhere is no use of it
    for (const name of ["createCityHintTile", "showTooltipFor"]) code = code.replace(topLevelFunction(code, name), "");
    assert.doesNotMatch(code, /tooltipLabel|data-tooltip-label/);
  });
});

describe("tab return listeners (run 50, docs/tab-return-refresh.md decision 1)", () => {
  it("exactly one visibilitychange and one online listener in src/, both in newtab.js, registered once", async () => {
    const files = await allSrc();
    const count = (re) => files.filter(({ name }) => name.endsWith(".js")).map(({ name, text }) => [name, (stripComments(text).match(re) ?? []).length]).filter(([, n]) => n > 0);
    assert.deepEqual(count(/addEventListener\("visibilitychange"/g), [["newtab.js", 1]]);
    assert.deepEqual(count(/addEventListener\("online"/g), [["newtab.js", 1]]);
    const code = stripComments(await source());
    assert.match(code, /document\.addEventListener\("visibilitychange", onTabVisibilityChange\);/);
    assert.match(code, /window\.addEventListener\("online", onBrowserOnline\);/);
  });

  it("no timers, no storage listener, no pageshow or focus trigger, and the visibility is read only from document.visibilityState", async () => {
    for (const { name, text } of await allSrc()) {
      if (!name.endsWith(".js")) continue;
      const code = stripComments(text);
      assert.doesNotMatch(code, /setInterval\(/, name);
      assert.doesNotMatch(code, /onChanged/, name);
      assert.doesNotMatch(code, /"pageshow"/, name);
      assert.doesNotMatch(code, /addEventListener\("focus"/, name);
      assert.doesNotMatch(code, /document\.hidden/, name);
    }
  });

  it("both handlers return at once unless document.visibilityState is visible; a return does not try offline, online ignores the pause", async () => {
    const code = stripComments(await source());
    const tab = topLevelFunction(code, "onTabVisibilityChange");
    const online = topLevelFunction(code, "onBrowserOnline");
    assert.match(tab, /if \(document\.visibilityState !== "visible"\) return;/);
    assert.match(online, /if \(document\.visibilityState !== "visible"\) return;/);
    assert.match(tab, /if \(navigator\.onLine !== false\) void retryWeather\(\{ automatic: true \}\);/);
    assert.match(online, /void retryWeather\(\{ automatic: true, ignorePause: true \}\);/);
    assert.doesNotMatch(online, /navigator\.onLine/);
  });
});

describe("grid re-read on return source pins (run 50, docs/tab-return-refresh.md decisions 5 to 7)", () => {
  const strippedFn = async (name) => topLevelFunction(stripComments(await source()), name);
  const REREAD = ["currentDeskDecision", "refreshDeskOnReturn", "applyReadDesk", "healReadDesk", "scheduleDeferredDeskRefresh"];

  // The block that opens at the `{` at index `open`, up to its matching `}` (the text of strings is skipped, so a brace in a string does not count).
  function blockAt(code, open) {
    assert.equal(code[open], "{", "the block opens at a brace");
    let depth = 0;
    for (let i = open; i < code.length; i += 1) {
      const c = code[i];
      if (c === '"' || c === "'" || c === "`") {
        i += 1;
        while (i < code.length && code[i] !== c) i += code[i] === "\\" ? 2 : 1;
      } else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) return code.slice(open, i + 1);
      }
    }
    return assert.fail("the block is balanced");
  }

  // The `finally` block of refreshDeskOnReturn: from its `{` to the matching `}`, not the rest of the function after it.
  const finallyBlock = (re) => {
    const at = re.indexOf("} finally {");
    assert.notEqual(at, -1, "the function has a finally");
    return blockAt(re, at + "} finally ".length);
  };

  it("the decision is one pure function called through one helper: skip, pending, again or apply", async () => {
    const code = stripComments(await source());
    const helper = topLevelFunction(code, "currentDeskDecision");
    assert.match(helper, /return deskRefreshDecision\(\{/);
    assert.match(helper, /hasState: Boolean\(widgetsService\) && widgetsState !== null,/);
    assert.match(helper, /locked: widgetsNewer,/);
    assert.match(helper, /drawn: renderedColumns > 0,/);
    assert.match(helper, /blocker: deskRefreshBlocker\(desktopUi, \{ cityModal: Boolean\(cityModalRoot\), onboardingWizard: Boolean\(onboardingWizardRoot\), busy: favoritesBusy, dragSettling \}\),/);
    assert.match(helper, /startedFrom,/);
    assert.match(helper, /current: widgetsState/);
    assert.match(code, /import \{ isSameValue \} from "\.\/storeUtils\.js";/);
  });

  it("refreshDeskOnReturn captures startedFrom before its first await, decides at entry and again after the reads", async () => {
    const re = await strippedFn("refreshDeskOnReturn");
    const captured = re.indexOf("const startedFrom = widgetsState;");
    assert.ok(captured > -1 && captured < re.indexOf("await "), "startedFrom is captured before the first await");
    const calls = [...re.matchAll(/currentDeskDecision\(startedFrom\)/g)].map((m) => m.index);
    assert.equal(calls.length, 2, "at entry and after the reads");
    assert.ok(calls[0] < re.indexOf("await "), "the first decision is before any await");
    assert.ok(calls[1] > re.indexOf("await widgetsService.getState()"), "the second decision is after the reads");
  });

  it("the raw meta is inspected before getState(); a newer or invalid meta stops the re-read with nothing written, drawn or said", async () => {
    const re = await strippedFn("refreshDeskOnReturn");
    const raw = re.indexOf("await syncStorageArea.get(WIDGETS_META_KEY)");
    const kind = re.indexOf("inspectWidgetsMeta(rawMeta)");
    const state = re.indexOf("widgetsService.getState()");
    assert.ok(raw > -1 && kind > raw && state > kind, "meta read, inspected, then getState()");
    assert.match(re, /if \(kind === "newer" \|\| kind === "invalid"\) return;/);
    assert.ok(re.indexOf('if (kind === "newer"') < state, "the stop comes before getState()");
  });

  it("a failed read ends silently: each read is in its own try, the catch returns and says nothing", async () => {
    const re = await strippedFn("refreshDeskOnReturn");
    assert.match(re, /try \{\s*rawMeta = await syncStorageArea\.get\(WIDGETS_META_KEY\);\s*\} catch \{\s*return;\s*\}/);
    assert.match(re, /try \{\s*fresh = await widgetsService\.getState\(\);\s*\} catch \{\s*return;\s*\}/);
    assert.doesNotMatch(re, /showDesktopStatus\(|announce\(|showLayoutRestoreFailure\(/);
  });

  it("the flags: pending is set only where the decision says pending and consumed by the start; running and queued are cleared in a finally", async () => {
    const re = await strippedFn("refreshDeskOnReturn");
    const sets = [...re.matchAll(/deskRefreshPending = true;/g)];
    assert.equal(sets.length, 2, "at entry and after the reads");
    for (const m of sets) assert.match(re.slice(Math.max(0, m.index - 60), m.index), /=== "pending"\) \{\s*$/, "only under a pending decision");
    assert.equal(re.split("deskRefreshPending = false;").length - 1, 1, "cleared once, where a re-read starts");
    assert.ok(re.indexOf("deskRefreshPending = false;") > re.indexOf("deskRefreshRunning = true;"), "the start consumes it");
    const fin = finallyBlock(re);
    assert.match(fin, /deskRefreshRunning = false;/);
    assert.match(fin, /deskRefreshQueued = false;/);
    assert.equal(re.split("deskRefreshRunning = false;").length - 1, 1, "running is cleared in the finally only");
    assert.equal(re.split("deskRefreshQueued = false;").length - 1, 1, "queued is cleared in the finally only");
  });

  it("only the call that set running clears it: the entry stops (skip, pending, a queued call) come before the try", async () => {
    const re = await strippedFn("refreshDeskOnReturn");
    const running = re.indexOf("deskRefreshRunning = true;");
    const tryAt = re.indexOf("try {", running);
    assert.ok(running > -1 && tryAt > running, "running is set, then the try opens");
    const before = re.slice(0, running);
    assert.match(before, /if \(entry === "skip"\) return;/);
    assert.match(before, /if \(deskRefreshRunning\) \{\s*deskRefreshQueued = true;\s*return;\s*\}/);
    assert.equal(before.includes("finally"), false);
    assert.equal(re.slice(running).split("finally").length - 1, 1, "one finally, the one of the call that started");
    assert.match(finallyBlock(re), /if \(queued\) void refreshDeskOnReturn\(\);/, "one queued re-read starts after it, through the entry");
  });

  it("an again result queues the re-read, a pending one sets the flag: the result of an older read is thrown away", async () => {
    const re = await strippedFn("refreshDeskOnReturn");
    assert.match(re, /if \(next === "again"\) \{\s*deskRefreshQueued = true;\s*return;\s*\}/);
    assert.match(re, /if \(next === "pending"\) \{\s*deskRefreshPending = true;\s*return;\s*\}/);
    assert.match(re, /if \(next !== "apply"\) return;/);
  });

  it("no await between the apply decision and the render of a healthy state; the heal runs only after it, once", async () => {
    const re = await strippedFn("refreshDeskOnReturn");
    const second = re.lastIndexOf("currentDeskDecision(startedFrom)");
    const healthy = re.indexOf("applyReadDesk(fresh)");
    const heal = re.indexOf("await healReadDesk(fresh)");
    assert.ok(second > -1 && healthy > second && heal > healthy, "decision, then the healthy apply, then the heal");
    assert.equal(re.slice(second, healthy).includes("await"), false, "no await between the apply decision and the apply of a healthy state");
    assert.equal(re.split("healReadDesk(").length - 1, 1, "one heal call");
    const apply = await strippedFn("applyReadDesk");
    assert.equal(apply.includes("await"), false);
    assert.match(apply, /if \(isSameValue\(fresh, widgetsState\)\) return;/);
    assert.ok(apply.indexOf("isSameValue(") < apply.indexOf("renderFavorites()"), "an equal state returns before any render");
    assert.match(apply, /widgetsState = fresh;\s*renderFavorites\(\);/);
  });

  it("the heal is the existing helper, under the busy lock, after the decision; focus goes to Settings; the messages are the existing two", async () => {
    const heal = await strippedFn("healReadDesk");
    assert.equal(heal.split("healClearedDesk(").length - 1, 1);
    const start = heal.indexOf("startFavoritesAction({ render: false })");
    const call = heal.indexOf("healClearedDesk(");
    const leave = heal.indexOf("leaveEditModeAfterFailedHeal()");
    const finish = heal.indexOf("finishFavoritesAction(generation");
    assert.ok(start > -1 && start < call && call < leave && leave < finish, "locked, healed, layers left, then the one render");
    assert.match(heal, /widgetsState = outcome\.state;/);
    assert.match(heal, /if \(outcome\.failed\) \{\s*showLayoutRestoreFailure\(\);\s*return;\s*\}/);
    assert.match(heal, /if \(focused\) focusWidgetTarget\(\[SETTINGS_TILE_ID\], \{ preventScroll: true \}\);/, "focus moves to Settings only if a tile had it");
    assert.match(heal, /showDesktopStatus\(LAYOUT_RESET_MESSAGE, \{ tone: "info" \}\)/);
    assert.ok(finish < heal.indexOf("focusWidgetTarget("), "focus after the render");
  });

  it("focus after an apply that removed the focused tile: the neighbour by the deleted-tile rule, read from the old DOM, without scrolling", async () => {
    const apply = await strippedFn("applyReadDesk");
    assert.match(apply, /const focused = focusedWidgetId\(\);/);
    assert.match(apply, /const neighbours = focused && !focused\.badge \? neighborTargets\(focused\.id\) : null;/);
    assert.ok(apply.indexOf("neighborTargets(") < apply.indexOf("renderFavorites()"), "read before the render");
    assert.match(apply, /if \(neighbours && \(!document\.activeElement \|\| document\.activeElement === document\.body\)\) focusWidgetTarget\(neighbours, \{ preventScroll: true \}\);/, "focus moves only if it was lost with the tile");
  });

  it("the re-read is silent and starts no timer: no announce, no status line, no setTimeout/setInterval (the heal may show its two messages)", async () => {
    for (const name of ["refreshDeskOnReturn", "applyReadDesk", "currentDeskDecision", "scheduleDeferredDeskRefresh"]) {
      assert.doesNotMatch(await strippedFn(name), /announce\(|showDesktopStatus\(|setTimeout\(|setInterval\(/, name);
    }
    assert.doesNotMatch(await strippedFn("healReadDesk"), /announce\(|setTimeout\(|setInterval\(/, "healReadDesk");
  });

  it("the re-read never calls firstScreen() itself, never writes by itself and listens to no storage change", async () => {
    for (const name of ["refreshDeskOnReturn", "applyReadDesk", "healReadDesk", "currentDeskDecision"]) {
      const text = await strippedFn(name);
      assert.doesNotMatch(text, /firstScreen\(/, name);
      assert.doesNotMatch(text, /ensureWidgetsLayout\(|updateFavorite\(|addFavorite\(|deleteFavorite\(|moveWidget\(|setState\(|storage\.sync\.set|syncStorageArea\.set/, name);
    }
  });

  it("scheduleDeferredDeskRefresh plans one frame at most, only for a standing flag; the frame looks at the flag and at the visibility", async () => {
    const sch = await strippedFn("scheduleDeferredDeskRefresh");
    assert.match(sch, /if \(!deskRefreshPending \|\| deskRefreshFrame\) return;/);
    assert.equal(sch.split("requestAnimationFrame(").length - 1, 1);
    assert.match(sch, /deskRefreshFrame = requestAnimationFrame\(\(\) => \{\s*deskRefreshFrame = 0;\s*if \(!deskRefreshPending \|\| document\.visibilityState !== "visible"\) return;\s*void refreshDeskOnReturn\(\);\s*\}\);/);
    assert.ok(sch.indexOf("if (!deskRefreshPending || deskRefreshFrame) return;") < sch.indexOf("requestAnimationFrame("), "returns at once when nothing is pending");
  });

  it("scheduleDeferredDeskRefresh is called from renderFavorites and from the three closes that render nothing", async () => {
    const code = stripComments(await source());
    for (const name of ["renderFavorites", "closeDesktopDialog", "hideCityModal", "hideOnboardingWizard"]) {
      assert.equal(topLevelFunction(code, name).split("scheduleDeferredDeskRefresh();").length - 1, 1, name);
    }
    assert.equal(code.split("scheduleDeferredDeskRefresh(").length - 1, 5, "the definition and those four calls, nowhere else");
  });

  it("the tab handler starts the weather attempt and the grid re-read; the hidden tab does neither", async () => {
    const tab = topLevelFunction(stripComments(await source()), "onTabVisibilityChange");
    assert.ok(tab.indexOf('document.visibilityState !== "visible"') < tab.indexOf("void refreshDeskOnReturn();"));
    assert.match(tab, /void refreshDeskOnReturn\(\);/);
    assert.equal(topLevelFunction(stripComments(await source()), "onBrowserOnline").includes("refreshDeskOnReturn"), false, "online refreshes the weather only");
  });

  it("the new functions exist and nothing else in src/ names them", async () => {
    const code = stripComments(await source());
    for (const name of REREAD) topLevelFunction(code, name);
    for (const { name, text } of await allSrc()) {
      if (name === "newtab.js" || !name.endsWith(".js")) continue;
      assert.doesNotMatch(stripComments(text), /refreshDeskOnReturn|scheduleDeferredDeskRefresh/, name);
    }
  });
});

// Run 51 (docs/unreadable-grid-reset.md decisions 4 to 6, 9; AS-UGR-22): the screen for an unreadable grid and the Reset grid dialog.
describe("run 51: the screen for an unreadable grid and the reset (AS-UGR-22)", () => {
  const code = async () => stripComments(await source());
  const widgetsStoreSource = () => readFile(new URL("../src/widgetsStore.js", import.meta.url), "utf8");

  it("renderDesktop checks widgetsNewer, then widgetsUnreadable, then !widgetsState, before applyGridMetrics and any scroll read; the screen is built with createStatus and createIconButton, no innerHTML", async () => {
    const render = topLevelFunction(await code(), "renderDesktop");
    const at = (needle) => {
      const i = render.indexOf(needle);
      assert.notEqual(i, -1, needle);
      return i;
    };
    assert.ok(at("if (widgetsNewer)") < at("if (widgetsUnreadable)") && at("if (widgetsUnreadable)") < at("if (!widgetsState)") && at("if (!widgetsState)") < at("applyGridMetrics()") && at("if (widgetsUnreadable)") < at("window.scrollY"));
    const branch = render.slice(at("if (widgetsUnreadable)"), at("if (!widgetsState)"));
    assert.match(branch, /createNode\("div", "grid-unreadable"\)/);
    assert.match(branch, /createIconButton\("button", "Reset grid", "refresh"\)/);
    assert.match(branch, /dataset\.gridAction = "reset"/);
    assert.match(branch, /createStatus\(UNREADABLE_GRID_MESSAGE, \{ error: true, live: "assertive", full: true \}\)/);
    assert.match(branch, /favoritesRoot\.replaceChildren\(block\);\s*return;/);
    assert.doesNotMatch(branch, /innerHTML/);
    assert.match(await code(), /const UNREADABLE_GRID_MESSAGE = "Your grid couldn't be read\.";/);
  });

  it("the dialog case builds the title, the body, the error slot and the footer with Cancel and a danger Reset grid; the click calls resetGrid", async () => {
    const build = topLevelFunction(await code(), "buildDialogContent");
    const body = build.slice(build.indexOf('case "confirm-reset-grid":'), build.indexOf("break;", build.indexOf('case "confirm-reset-grid":')));
    assert.match(body, /title\.textContent = "Reset grid\?";/);
    assert.match(body, /createNode\("p", "desktop-dialog__body", "Your links will be removed\."\)/);
    assert.match(body, /root\.setAttribute\("aria-describedby", body\.id\);/);
    assert.match(body, /createIconButton\("button button--danger", "Reset grid", "refresh"\)/);
    assert.match(body, /dataset\.dialogAction = "reset-grid";/);
    assert.match(body, /addEventListener\("click", \(\) => void resetGrid\(\)\)/);
    assert.match(body, /root\.append\(title, body, createDialogErrorSlot\(\), createDialogFooter\(createDialogCancel\(\), reset\)\);/);
  });

  it("the guards of decision 5: a pointer click in the first 300 ms and a click with detail > 1 do nothing on the two buttons, the mousedown is cancelled, every close arms the post-close guard", async () => {
    const src = await code();
    assert.match(src, /openDesktopDialog\(\{ kind: "confirm-reset-grid" \}, \{ opener: null \}\)/);
    const guard = topLevelFunction(src, "guardResetDialogPresses");
    assert.match(guard, /event\.detail > 0 && Date\.now\(\) - desktopDialogOpenedAt < DIALOG_BACKDROP_GUARD_MS/);
    assert.match(guard, /event\.detail > 1/);
    assert.match(guard, /addEventListener\("click", \(event\) => \{\s*if \(guarded\(event\)\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
    assert.match(guard, /addEventListener\("mousedown", \(event\) => \{\s*if \(guarded\(event\)\) event\.preventDefault\(\);/);
    assert.match(topLevelFunction(src, "openDesktopDialog"), /if \(dialog\.kind === "confirm-reset-grid"\) guardResetDialogPresses\(root\);/);
    const close = topLevelFunction(src, "closeDesktopDialog");
    assert.match(close, /const wasResetConfirm = desktopUi\.dialog\?\.kind === "confirm-reset-grid";/);
    assert.match(close, /if \(wasResetConfirm\) \{\s*armPostCloseClickGuard\(\);\s*favoritesRoot\?\.querySelector\('\[data-grid-action="reset"\]'\)\?\.focus\(\{ preventScroll: true \}\);/);
    // Cancel, Escape and the backdrop all end in closeDesktopDialog, and so does the catch of resetGrid
    assert.match(topLevelFunction(src, "resetGrid"), /catch \{\s*finishFavoritesAction\(generation, \(\) => \{\}\);\s*closeDesktopDialog\(\{ restoreFocusTo: null \}\);/);
  });

  it("resetGrid begins with the busy check, marks the dialog busy, reloads on both results and shows the failure text only in its catch", async () => {
    const src = await code();
    const reset = topLevelFunction(src, "resetGrid");
    assert.match(reset, /^async function resetGrid\(\) \{\s*if \(favoritesBusy\) return;/);
    assert.match(reset, /startFavoritesAction\(\{ render: false \}\);\s*desktopDialogRoot\?\.setAttribute\("aria-busy", "true"\);/);
    assert.match(reset, /await resetUnreadableWidgets\(syncStorageArea\);\s*location\.reload\(\);/);
    const tryPart = reset.slice(0, reset.indexOf("catch"));
    assert.doesNotMatch(tryPart, /RESET_FAILED_MESSAGE|showDesktopStatus/);
    assert.match(reset.slice(reset.indexOf("catch")), /finishFavoritesAction\(generation, \(\) => \{\}\);\s*closeDesktopDialog\(\{ restoreFocusTo: null \}\);\s*showDesktopStatus\(RESET_FAILED_MESSAGE\);/);
    assert.match(src, /const RESET_FAILED_MESSAGE = "Couldn't reset your grid\. Try again in a moment\.";/);
    assert.equal(src.split("RESET_FAILED_MESSAGE").length - 1, 2, "defined once, used once");
  });

  it("resetUnreadableWidgets is called once in newtab.js (from resetGrid), and its body reads the area once, with get(null), under the widgets lock", async () => {
    const src = await code();
    assert.equal(src.split("resetUnreadableWidgets(").length - 1, 1);
    assert.equal(topLevelFunction(src, "resetGrid").split("resetUnreadableWidgets(").length - 1, 1);
    const store = stripComments(await widgetsStoreSource());
    const fnBody = store.slice(store.indexOf("export function resetUnreadableWidgets"));
    const fnEnd = fnBody.slice(0, fnBody.indexOf("\n}\n") + 3);
    assert.equal(fnEnd.split(".get(").length - 1, 1, "one get in the function");
    assert.match(fnEnd, /storageArea\.get\(null\)/);
    assert.match(fnEnd, /withWidgetsMutationLock\(/);
  });

  it("the click on the screen's button opens the dialog only for an unreadable grid and not while busy", async () => {
    assert.match(await code(), /function handleFavoritesClick\(event\) \{\s*if \(!\(event\.target instanceof Element\)\) \{\s*return;\s*\}\s*if \(event\.target\.closest\('\[data-grid-action="reset"\]'\)\) \{\s*if \(widgetsUnreadable && !favoritesBusy\) openDesktopDialog\(/);
  });

  it("the CSS: the screen's block is centered, its button keeps its width, the soft focus ring replaces the plain one, and nothing is nowrap for the dialog", async () => {
    const styles = await appStyles();
    assert.match(styles, /\.grid-unreadable \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*align-items: center;[^}]*justify-content: center;[^}]*text-align: center;[^}]*\}/s);
    assert.match(styles, /\.grid-unreadable \.button \{\s*width: auto;\s*\}/);
    assert.match(styles, /\.grid-unreadable \.button:focus-visible \{\s*background: var\(--soft-fill-strong\);\s*box-shadow: 0 0 0 2px var\(--focus-overlay-ring\);\s*outline-color: transparent;[^}]*\}/);
    assert.doesNotMatch(styles, /confirm-reset-grid[^{]*\{[^}]*white-space:\s*nowrap/);
    assert.doesNotMatch(styles, /\.grid-unreadable[^{]*\{[^}]*white-space:\s*nowrap/);
  });

  it("resetUnreadableWidgets is called from nowhere but the handler of the confirm button (AS-UGR-18)", async () => {
    for (const { name, text } of await allSrc()) {
      if (name === "widgetsStore.js" || name === "newtab.js" || !name.endsWith(".js")) continue;
      assert.doesNotMatch(stripComments(text), /resetUnreadableWidgets/, name);
    }
  });
});
