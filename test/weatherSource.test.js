import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function source() {
  return readFile(new URL("../src/newtab.js", import.meta.url), "utf8");
}

async function html() {
  return readFile(new URL("../src/newtab.html", import.meta.url), "utf8");
}

async function css() {
  const base = new URL("../src/", import.meta.url);
  const [surfaces, controls, app] = await Promise.all([
    readFile(new URL("surfaces.css", base), "utf8"),
    readFile(new URL("controls.css", base), "utf8"),
    readFile(new URL("newtab.css", base), "utf8")
  ]);
  return surfaces + controls + app;
}

describe("newtab weather source", () => {
  it("renders weather as grid tiles from weatherTiles.js instead of a separate root", async () => {
    const code = await source();
    assert.doesNotMatch(code, /querySelector\("#weather"\)/);
    assert.doesNotMatch(code, /weatherRoot/);
    assert.match(code, /from "\.\/weatherTiles\.js"/);
    assert.match(code, /describeWeatherMetric\(\{ metricKey: weatherMetricKey\(item\.id\)/);
  });

  it("wires weatherApi/weatherStore/weatherService/weatherUiState modules", async () => {
    const code = await source();
    assert.match(code, /from "\.\/weatherUiState\.js"/);
    assert.match(code, /from "\.\/weatherApi\.js"/);
    assert.match(code, /from "\.\/weatherService\.js"/);
    assert.match(code, /from "\.\/weatherStore\.js"/);
  });

  it("initializes weather independently of the favorites boot", async () => {
    const code = await source();
    // run 48: the boot load has the same 15 s guard as the retry and the city change
    assert.match(code, /result = await withTimeout\(weatherService\.initialize\(\)\);/);
    assert.match(code, /weatherResult = result;/);
    assert.match(code, /void startWeather\(\);/);
  });

  it("submits the modal's city form through setCity and keeps the modal open with the error on failure", async () => {
    const code = await source();
    assert.match(code, /form\.dataset\.weatherForm !== "city"/);
    // run 44: change mode persists after the forecast (the wizard call below keeps the default path)
    assert.match(code, /changeCity\(\(isStale\) => weatherService\.setCity\(cityName, \{ persist: "after-forecast", isStale \}\)\)/);
    assert.match(code, /changeCity\(\(\) => weatherService\.setCity\(cityName\), \{ onSuccess: goToOnboardingStep2 \}\)/);
    assert.match(code, /cityModalError = weatherErrorMessage\(error\);/);
    assert.doesNotMatch(code, /weatherFormError/);
  });

  it("closes the city modal from its own dismiss button, with no editing state", async () => {
    const code = await source();
    assert.match(code, /dataset\.cityModalAction = "cancel"/);
    assert.doesNotMatch(code, /"edit-city"/);
    assert.doesNotMatch(code, /"cancel-edit-city"/);
    assert.doesNotMatch(code, /startEditingCity|stopEditingCity|isEditingCity/);
  });
  it("blocks weather actions while a request is in flight", async () => {
    const code = await source();
    assert.match(code, /let weatherBusy = false;/);
    assert.match(code, /\|\| weatherBusy\) return;/);
    assert.match(code, /if \(weatherBusy \|\| !weatherService\) return;/);
    assert.match(code, /if \(!cityName\) \{\s*cityModalError = "Enter a city name";/);
  });

  it("has no weather panel markup, and labels the desktop root as the grid", async () => {
    const markup = await html();
    assert.doesNotMatch(markup, /id="weather"/);
    assert.doesNotMatch(markup, /weather-panel/);
    assert.match(markup, /<main class="desktop" id="favorites" aria-label="Grid"/);
    assert.doesNotMatch(markup, /favorites-panel/);
    assert.doesNotMatch(markup, /data-position/);
    assert.doesNotMatch(markup, /id="app"/);
  });
  it("describes temperature, rain, air, and UV tiles in toolbar order", async () => {
    const tiles = await readFile(new URL("../src/weatherTiles.js", import.meta.url), "utf8");

    assert.deepEqual(
      [...tiles.matchAll(/tone: (\w+)\(/g)].map((match) => match[1]),
      ["temperatureTone", "rainTone", "usAqiTone", "uvTone"]
    );
    assert.deepEqual(
      [...tiles.matchAll(/metricKey === "(\w+)"/g)].map((match) => match[1]),
      ["temperature", "precipitation", "airQuality"]
    );
    assert.match(
      tiles,
      /Currently \$\{formatTemperature\(data\.temperature\)\}°\. Today at 15:00 — \$\{formatTemperature\(data\.temperatureTodayAt15\)\}°, yesterday at 15:00 — \$\{formatTemperature\(data\.temperatureYesterdayAt15\)\}°\./
    );
    assert.match(tiles, /Chance of rain for the rest of the day — \$\{primary\}, expected from \$\{start\}\./);
    assert.match(tiles, /Chance of rain for the rest of the day — \$\{primary\}\./);
    // Default sizes moved from widgetsShared (tileSize names) to desktopLayout (grid w×h) with the desktop grid.
    const layout = await readFile(new URL("../src/desktopLayout.js", import.meta.url), "utf8");
    assert.deepEqual(
      [...layout.matchAll(/"weather:(\w+)": \{ w: (\d), h: (\d) \}/g)].map((match) => `${match[1]}:${match[2]}x${match[3]}`),
      ["temperature:1x1", "precipitation:2x1", "airQuality:2x1", "uv:1x1"]
    );
    assert.match(tiles, /US AQI \$\{data\.usAqi\} \(\$\{usAqiCategory\(data\.usAqi\)\}\), PM2\.5 \$\{formatPm25\(data\.pm2_5\)\} µg\/m³\./);
    assert.match(tiles, /Current UV index \$\{data\.uvIndex\} \(\$\{uvIndexLevel\(data\.uvIndex\)\}\)\. Today's peak/);
  });

  it("builds focusable weather tiles described by a screen-reader-only text", async () => {
    const code = await source();
    const start = code.indexOf("function createWeatherMetricTile(");
    const end = code.indexOf("function createCityHintTile(", start);
    const tile = code.slice(start, end);

    assert.ok(start > -1 && end > start);
    assert.match(tile, /tile\.tabIndex = 0;/);
    assert.match(tile, /tile\.setAttribute\("role", "group"\);/);
    assert.match(tile, /tile\.setAttribute\("aria-label", model\.label\);/);
    assert.match(tile, /createNode\("span", "sr-only", model\.description\)/);
    assert.match(tile, /description\.dataset\.tooltipText = "";/);
    assert.match(tile, /tile\.setAttribute\("aria-describedby", description\.id\);/);
    assert.match(tile, /tile\.dataset\.tooltipTrigger = "";/);
    assert.match(tile, /tile\.dataset\.widgetId = item\.id;/);
    assert.doesNotMatch(code, /function createTooltip\(/);
  });

  it("sizes weather tiles from their cell (no span or fixed tile height)", async () => {
    const styles = await css();
    assert.doesNotMatch(styles, /\.weather-tile\[data-tile-size="wide"\]\s*\{[^}]*grid-column/s);
    assert.doesNotMatch(styles, /\.weather-tile--wide/);
    assert.doesNotMatch(styles, /--weather-tile-height/);
  });
  it("leaves tooltip placement to the shared layer: no per-tile tooltip boxes or edge rules remain", async () => {
    const styles = await css();
    assert.doesNotMatch(styles, /\.weather-tile:first-child > \.tooltip/);
    assert.doesNotMatch(styles, /\.weather-tile:last-child > \.tooltip/);
    assert.doesNotMatch(styles, /\.weather-tile:nth-child\(2\) > \.tooltip/);
    assert.doesNotMatch(styles, /\.weather-status/);
  });

  it("marks stale tiles with data-stale and a dashed border instead of a floating status", async () => {
    const code = await source();
    const styles = await css();

    assert.match(code, /if \(model\.stale\) tile\.dataset\.stale = "true";/);
    assert.match(styles, /\.weather-tile\[data-stale="true"\]\s*\{[^}]*border-style: dashed;/s);
  });
  it("wires searchCities for live city suggestions with debounce, minimum length, and request cancellation", async () => {
    const code = await source();
    assert.match(code, /searchCities/);
    assert.match(code, /query\.length < 2/);
    assert.match(code, /new AbortController\(\)/);
    assert.match(code, /}, 250\);/);
  });

  it("resets suggestion state on every fresh mount of the city form and guards stale async responses", async () => {
    const code = await source();
    const formStart = code.indexOf("function createCityForm(mode, location) {");
    const formEnd = code.indexOf("function createWeatherMetricTile(");
    const form = code.slice(formStart, formEnd);

    assert.ok(formStart > -1 && formEnd > formStart);
    assert.match(form, /weatherFormGeneration \+= 1;/);
    assert.match(form, /const formGeneration = weatherFormGeneration;/);
    assert.match(form, /weatherUi = hideSuggestions\(weatherUi\);/);
    assert.match(form, /formGeneration !== weatherFormGeneration/);
  });

  it("selects a suggested city without a separate geocoding round-trip", async () => {
    const code = await source();
    assert.match(code, /"select-city"/);
    assert.match(code, /weatherService\.selectLocation\(\{/);
  });

  it("keeps the input focused when clicking a suggestion, so the click is not lost to a blur race", async () => {
    const code = await source();
    const formStart = code.indexOf("function createCityForm(mode, location) {");
    const formEnd = code.indexOf("function createWeatherMetricTile(");
    const form = code.slice(formStart, formEnd);

    assert.ok(formStart > -1 && formEnd > formStart);
    assert.match(
      form,
      /suggestionsList\.addEventListener\("mousedown", \(event\) => \{\s*event\.preventDefault\(\);[^\n]*\n/
    );
    // A press on an item also cancels the pending request, so a late response never replaces the list under the press.
    const press = form.slice(form.indexOf('suggestionsList.addEventListener("mousedown"'), form.indexOf("});", form.indexOf('suggestionsList.addEventListener("mousedown"')));
    assert.match(press, /closest\("\.weather-form__suggestion"\)\) cancelPendingSuggestionRequest\(\);/);
  });

  it("cancels a pending suggestion request when focus leaves the field wrapper or Escape is pressed (Escape is central)", async () => {
    const code = await source();
    const formStart = code.indexOf("function createCityForm(mode, location) {");
    const formEnd = code.indexOf("function createWeatherMetricTile(");
    const form = code.slice(formStart, formEnd);

    const helperStart = form.indexOf("function cancelPendingSuggestionRequest()");
    const helperBody = form.slice(helperStart, form.indexOf('input.addEventListener("input"'));
    assert.ok(helperStart > -1);
    assert.match(helperBody, /clearTimeout\(debounceTimer\)/);
    assert.match(helperBody, /abortController\.abort\(\)/);

    // The old 150 ms blur timer is gone: the field wrapper's focusout closes the list only when focus leaves the wrapper.
    assert.doesNotMatch(form, /input\.addEventListener\("blur"/);
    const focusoutStart = form.indexOf('field.addEventListener("focusout"');
    assert.ok(focusoutStart > -1);
    const focusout = form.slice(focusoutStart, form.indexOf("});", focusoutStart));
    assert.match(focusout, /field\.contains\(event\.relatedTarget\)\) return;/);
    assert.match(focusout, /if \(!document\.hasFocus\(\)\) return;/);
    assert.match(focusout, /cancelPendingSuggestionRequest\(\)/);
    assert.match(form, /suggestionsList\.addEventListener\("focusin", cancelPendingSuggestionRequest\)/);

    const keydownStart = form.indexOf('input.addEventListener("keydown"');
    assert.ok(keydownStart > -1);
    const keydownHandler = form.slice(keydownStart, form.indexOf('suggestionsList.addEventListener("keydown"'));
    assert.doesNotMatch(keydownHandler, /Escape/);

    const formObject = form.slice(form.indexOf("activeCityForm = {"));
    for (const key of ["cancelPending", "renderSuggestions", "refresh", "place", "focusField", "dispose", "choose", "chosen", "recentlyChosen"]) {
      assert.match(formObject, new RegExp(`\\b${key}\\b`), key);
    }
    assert.match(
      code,
      /layer === "citySuggestions"\) \{\s*activeCityForm\?\.cancelPending\(\);\s*weatherUi = hideSuggestions\(weatherUi\);\s*activeCityForm\?\.renderSuggestions\(\);\s*activeCityForm\?\.focusField\(\);/
    );
  });

  it("ignores a suggestion response that arrives while focus is on a list item", async () => {
    const code = await source();
    assert.match(
      code,
      /if \(signal\.aborted \|\| formGeneration !== weatherFormGeneration \|\| weatherBusy \|\| suggestionsList\.contains\(document\.activeElement\)\) \{/
    );
  });

  it("choosing a suggestion fills the field and closes the list; it does not save (D9)", async () => {
    const code = await source();
    const listeners = code.slice(code.indexOf("function attachCityModalListeners(root) {"), code.indexOf("let cityModalShownThisLoad"));
    const branchStart = listeners.indexOf('const suggestion = target.closest(\'[data-weather-action="select-city"]\');');
    assert.ok(branchStart > -1);
    const branch = listeners.slice(branchStart, listeners.indexOf("root.addEventListener(\"submit\""));
    assert.match(branch, /activeCityForm\?\.choose\(\{/);
    assert.doesNotMatch(branch, /changeCity/);
    const form = code.slice(code.indexOf("function createCityForm(mode, location) {"), code.indexOf("function buildCityModal("));
    const choose = form.slice(form.indexOf("choose(city) {"), form.indexOf("chosen: () =>"));
    assert.match(choose, /^choose\(city\) \{\s*closeList\(\);/);
    assert.match(choose, /input\.focus\(\)/);
    assert.match(form, /function closeList\(\) \{\s*cancelPendingSuggestionRequest\(\);/);
    // Save uses the remembered choice without a second geocoding request; edited text drops it.
    assert.match(listeners, /const picked = activeCityForm\?\.chosen\(\);\s*if \(picked\) \{\s*changeCity\(\(isStale\) => weatherService\.selectLocation\(/);
    assert.match(listeners, /selectLocation\(\{[^}]*\}, \{ persist: "after-forecast", isStale \}\)/);
    assert.match(form, /chosen: \(\) => \(chosenCity && chosenCity\.label === input\.value \? chosenCity : null\)/);
  });

  it("the clear button empties the field, closes the list, cancels the request, forgets the choice and focuses the field", async () => {
    const code = await source();
    const form = code.slice(code.indexOf("function createCityForm(mode, location) {"), code.indexOf("function buildCityModal("));
    const start = form.indexOf('clear.addEventListener("click"');
    assert.ok(start > -1);
    const handler = form.slice(start, form.indexOf("});", start));
    assert.match(handler, /input\.value = "";/);
    assert.match(handler, /chosenCity = null;/);
    assert.match(handler, /closeList\(\);/);
    assert.match(handler, /input\.focus\(\);/);
  });

  it("a pointer press is tracked for the main button only, cleared on window blur, and every listener is disposed", async () => {
    const code = await source();
    const form = code.slice(code.indexOf("function createCityForm(mode, location) {"), code.indexOf("function buildCityModal("));
    const down = form.slice(form.indexOf("const onPointerDown"), form.indexOf("const onPointerUp"));
    assert.match(down, /if \(event\.button !== 0\) return;/);
    assert.match(form, /const onWindowBlur = \(\) => \{\s*pressing = false;/);
    assert.match(form, /window\.addEventListener\("blur", onWindowBlur\);/);
    const dispose = form.slice(form.indexOf("dispose: () => {"), form.indexOf("choose(city) {"));
    for (const line of [
      'window.removeEventListener("resize", onResize)',
      'document.removeEventListener("pointerdown", onPointerDown, true)',
      'document.removeEventListener("pointerup", onPointerUp, true)',
      'document.removeEventListener("pointercancel", onPointerUp, true)',
      'window.removeEventListener("blur", onWindowBlur)'
    ]) {
      assert.ok(dispose.includes(line), line);
    }
    // A failed modal build disposes the half-built form before dropping it.
    const show = code.slice(code.indexOf("function showCityModal("), code.indexOf("function hideCityModal("));
    assert.match(show, /\} catch \(error\) \{[\s\S]*?activeCityForm\?\.dispose\?\.\(\);[^\n]*\n\s*activeCityForm = null;/);
  });

  it("popover items never shrink inside the capped list (the list scrolls instead)", async () => {
    const cssText = await css();
    const at = cssText.indexOf(".weather-form__suggestion {");
    assert.ok(at > -1);
    assert.match(cssText.slice(at, cssText.indexOf("}", at)), /\bflex: none;/);
  });

  it("ignores the second click of a double click on an item, but never a keyboard activation", async () => {
    const code = await source();
    const listeners = code.slice(code.indexOf("function attachCityModalListeners(root) {"), code.indexOf("let cityModalShownThisLoad"));
    assert.match(listeners, /event\.detail > 0 &&\s*activeCityForm\?\.recentlyChosen\(\) &&/);
    assert.match(listeners, /\[data-city-modal-action\], button\[type="submit"\]/);
    assert.match(code, /recentlyChosen: \(\) => performance\.now\(\) - chosenAt < 350/);
  });

  it("disambiguates suggestions with the same name using admin1", async () => {
    const code = await source();
    const formStart = code.indexOf("function createCityForm(mode, location) {");
    const formEnd = code.indexOf("function createWeatherMetricTile(");
    const form = code.slice(formStart, formEnd);

    assert.ok(formStart > -1 && formEnd > formStart);
    assert.match(
      form,
      /const labelParts = \[suggestion\.name, suggestion\.admin1, suggestion\.country\]\.filter\([\s\S]*?\(part\) => part[\s\S]*?\);/
    );
    assert.match(form, /const label = labelParts\.join\(", "\);/);
  });

  it("never replaces a mounted city form or a stale first load when weather results arrive late", async () => {
    const code = await source();

    assert.doesNotMatch(code, /formHost/);
    // run 48: startWeather also records the known city between the result and the render
    assert.match(code, /weatherResult = result;\s*if \(result\.location\) \{\s*weatherLocation = result\.location;\s*weatherLocationError = "";\s*\}\s*renderFavorites\(\);/);
    assert.match(code, /if \(generation !== weatherGeneration\) \{\s*return;\s*\}/);
    assert.match(code, /const result = await withTimeout\(run\(isStale\)\);[\s\S]*?weatherGeneration \+= 1;\s*weatherResult = result;/);
    assert.doesNotMatch(code, /function changeCity\(run\) \{\s*weatherGeneration \+= 1;/);
    assert.match(code, /if \(weatherChanging && currentLocation\(\)\) return null;/);
  });

  it("styles the city suggestion dropdown", async () => {
    const styles = await css();
    assert.match(styles, /\.weather-form__suggestions\s*\{/);
    assert.match(styles, /\.weather-form__suggestion\s*\{/);
  });
});

describe("newtab weather retry source (AS-WR-13)", () => {
  const fn = (code, name) => {
    const start = code.indexOf(`function ${name}(`);
    assert.ok(start > -1, name);
    return code.slice(start, code.indexOf("\n}\n", start));
  };

  it("the tile is a native button with the retry action, built without innerHTML", async () => {
    const code = await source();
    const tile = fn(code, "createWeatherMetricTile");
    assert.match(tile, /tile\.dataset\.favoriteAction = "retry-weather";/);
    assert.match(tile, /tile\.dataset\.retry = model\.retry;/);
    assert.match(tile, /createIconNode\("refresh"/);
    assert.match(tile, /aria-label", `Retry \$\{model\.label\}`/);
    assert.doesNotMatch(tile, /innerHTML/);
    assert.doesNotMatch(tile, /\.disabled = /);
  });

  it("the click branch calls retryWeather()", async () => {
    const code = await source();
    assert.match(code, /action === "retry-weather"\) \{\s*void retryWeather\(\);/);
  });

  it("retryWeather guards before the call, uses withTimeout and a token, and never echoes error.message", async () => {
    const code = await source();
    const retry = fn(code, "retryWeather");
    const start = retry.indexOf("startWeatherRetry(");
    const call = retry.indexOf("weatherService.initialize()");
    assert.ok(start > -1 && call > start, "startWeatherRetry before the service call");
    assert.match(retry, /await withTimeout\(weatherService\.initialize\(\)\)/);
    assert.match(retry, /const token = \+\+weatherRetryToken;/);
    assert.match(retry, /token !== weatherRetryToken/);
    assert.match(retry, /generation !== weatherGeneration/);
    assert.doesNotMatch(retry, /error\.message|String\(error\)|innerHTML/);
    assert.match(retry, /weatherLocationError = "";/);
    // Run 44 (decision 4): the "clear first" special case folded into `announce`; retryWeather only calls it.
    assert.doesNotMatch(retry, /desktopLive\.textContent = "";/);
    assert.match(retry, /announce\("Weather updated"\)/);
  });

  it("a thrown or timed-out attempt never assigns weatherResult", async () => {
    const code = await source();
    const retry = fn(code, "retryWeather");
    const handler = retry.slice(retry.indexOf("catch (error)"), retry.indexOf("catch (error)") + 400);
    assert.ok(retry.includes("catch (error)"));
    assert.doesNotMatch(handler.split("}")[0], /weatherResult =/);
    // run 50 (decision 3): a failed read never downgrades a tile that still has data (a stale one as before, now also a ready one)
    assert.match(retry, /const downgrade = failed && result\?\.status === "error" && weatherResult\?\.data;/);
  });

  it("the gone outcome clears a non-persist status line and the cooldown timer", async () => {
    const code = await source();
    const retry = fn(code, "retryWeather");
    const gone = retry.slice(retry.indexOf('outcome === "gone"'), retry.indexOf("const failed ="));
    // run 50: only the manual path clears the status line; the automatic one never touches it (companion pin below)
    assert.match(gone, /clearTimeout\(weatherRetryTimer\);\s*if \(!automatic && !desktopStatusPersistent\) showDesktopStatus\(""\);/);
  });

  it("the cooldown end updates nodes in place and never re-renders", async () => {
    const code = await source();
    const end = fn(code, "endWeatherRetryCooldown");
    assert.doesNotMatch(end, /renderFavorites|renderDesktop/);
    assert.match(end, /weather-tile--retry/);
    assert.match(end, /removeAttribute\("aria-disabled"\)/);
    assert.match(code, /clearTimeout\(weatherRetryTimer\)/);
  });

  it("a successful city change resets the retry state after weatherLocationError, not between generation and result", async () => {
    const code = await source();
    assert.match(code, /weatherLocationError = "";[^\n]*\n\s*weatherRetryToken \+= 1;[^\n]*\n\s*weatherUi = resetWeatherRetry\(weatherUi\);/);
    assert.match(code, /weatherGeneration \+= 1;\s*weatherResult = result;/);
    assert.match(code, /const CITY_REQUEST_TIMEOUT_MS = 15000;/);
  });

  it("CHANGELOG [Unreleased] has the Added entry for the weather retry (AS-WR-14)", async () => {
    const log = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
    const unreleased = log.slice(log.indexOf("## [Unreleased]"), log.indexOf("\n## [", log.indexOf("## [Unreleased]") + 5));
    assert.match(unreleased, /### Added[\s\S]*can now be pressed\s+to try again/);
    assert.match(unreleased, /dg-54-weather-tile-retry\.mjs/);
    assert.doesNotMatch(unreleased, /fresh tile can be refreshed/i);
  });

  it("startWeather (run 48): withTimeout, location and read error set after the generation check, now passed to the tile model", async () => {
    const code = await source();
    const start = code.indexOf("async function startWeather()");
    const body = code.slice(start, code.indexOf("\n}\n", start));
    assert.match(body, /await withTimeout\(weatherService\.initialize\(\)\)/);
    assert.match(body, /error: weatherErrorMessage\(error\)/);
    const guard = body.indexOf("generation !== weatherGeneration");
    const assign = body.indexOf("weatherLocation = result.location;");
    const clear = body.indexOf('weatherLocationError = "";');
    const render = body.lastIndexOf("renderFavorites();");
    assert.ok(guard > -1 && assign > guard && clear > guard && render > assign && render > clear, "assignments after the generation check, before render");
    assert.match(body, /if \(result\.location\) \{[\s\S]*weatherLocation = result\.location;[\s\S]*weatherLocationError = "";[\s\S]*\}/);
    assert.match(code, /const CITY_REQUEST_TIMEOUT_MS = 15000;/);
    assert.match(code, /retry: weatherRetryPhase\(weatherUi, Date\.now\(\)\), now: editing \? undefined : Date\.now\(\) \}\)/);
  });
});

describe("newtab weather on return (run 50, docs/tab-return-refresh.md, AS-TRR-01..06)", () => {
  const fn = (code, name) => {
    const start = code.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
    assert.ok(start > -1, name);
    return code.slice(start, code.indexOf("\n}\n", start));
  };
  // The text of a function without its manual-only parts: every `if (!automatic) { ... }` block (brace matched) and every one-line
  // `if (!automatic && ...) showDesktopStatus("");`.
  const withoutManualParts = (text) => {
    let out = text.replace(/if \(!automatic && [^\n]*showDesktopStatus\(""\);/g, "");
    for (let at = out.indexOf("if (!automatic) {"); at > -1; at = out.indexOf("if (!automatic) {")) {
      let depth = 0;
      let i = out.indexOf("{", at);
      for (; i < out.length; i += 1) {
        if (out[i] === "{") depth += 1;
        else if (out[i] === "}" && --depth === 0) break;
      }
      out = out.slice(0, at) + out.slice(i + 1);
    }
    return out;
  };

  it("retryWeather takes the options object; the manual call site stays void retryWeather();", async () => {
    const code = await source();
    assert.match(code, /async function retryWeather\(\{ automatic = false, ignorePause = false \} = \{\}\) \{/);
    assert.match(code, /action === "retry-weather"\) \{\s*void retryWeather\(\);/);
    assert.equal(code.match(/\bvoid retryWeather\(/g).length, 3, "the click branch and the two automatic calls start an attempt, nothing else does");
  });

  it("the gate of an automatic attempt is weatherRefreshDue on the shown result, the manual one stays error or stale", async () => {
    const retry = fn(await source(), "retryWeather");
    assert.match(retry, /const shown = effectiveWeatherResult\(\);/);
    assert.match(retry, /if \(automatic \? !weatherRefreshDue\(shown, Date\.now\(\)\) : shown\?\.status !== "error" && shown\?\.status !== "stale"\) return;/);
    assert.match(retry, /const started = startWeatherRetry\(weatherUi, Date\.now\(\), \{ ignorePause \}\);/);
    assert.ok(retry.indexOf("weatherRefreshDue(") < retry.indexOf("startWeatherRetry("), "the due test comes before the in-flight guard");
  });

  it("the automatic attempt never writes the status line and never announces: those calls sit in !automatic branches only", async () => {
    const retry = fn(await source(), "retryWeather");
    assert.ok(retry.includes("showDesktopStatus(") && retry.includes("announce("), "the manual path still reports");
    const rest = withoutManualParts(retry);
    assert.doesNotMatch(rest, /showDesktopStatus\(/);
    assert.doesNotMatch(rest, /announce\(/);
    assert.match(retry, /announce\("Weather updated"\)/);
  });

  it("an attempt whose shown result is ready does not render at its start (it has no retry control to show)", async () => {
    const retry = fn(await source(), "retryWeather");
    const beforeAwait = retry.slice(0, retry.indexOf("await withTimeout("));
    assert.match(beforeAwait, /const silentStart = automatic && shown\?\.status === "ready";/);
    assert.match(beforeAwait, /if \(!silentStart\) renderFavorites\(\);/);
    assert.equal(beforeAwait.match(/renderFavorites\(\)/g).length, 1, "that is the only render before the await");
    assert.match(retry, /if \(!silentStart \|\| replaced\) renderFavorites\(\);/, "at the end it renders only when something changed");
  });

  it("a thrown or timed-out attempt on a ready tile changes nothing: the result is replaced only by the service's own answer", async () => {
    const retry = fn(await source(), "retryWeather");
    assert.match(retry, /const replaced = Boolean\(result\) && !downgrade;/);
    assert.match(retry, /if \(replaced\) \{\s*weatherResult = result;/);
  });

  it("the gone outcome moves focus to the hint only if it was on a weather tile when the attempt started (read before the first render)", async () => {
    const retry = fn(await source(), "retryWeather");
    const capture = retry.indexOf("const focusWasOnWeatherTile =");
    assert.ok(capture > -1 && capture < retry.indexOf("renderFavorites()"), "read before the first render");
    assert.match(retry, /document\.activeElement\.closest\("\.weather-tile"\)/);
    assert.match(retry, /if \(automatic \? focusWasOnWeatherTile : !active \|\| active === document\.body\) favoritesRoot\?\.querySelector\(HINT_TILE_SELECTOR\)\?\.focus\(\);/);
  });

  it("the pause timer of a failed attempt is shared with the manual path (no new timer)", async () => {
    const retry = fn(await source(), "retryWeather");
    assert.equal(retry.match(/setTimeout\(/g).length, 1);
    assert.match(retry, /weatherRetryTimer = setTimeout\(endWeatherRetryCooldown,/);
  });

  it("WEATHER_CACHE_TTL_MS has one definition, in weatherShared.js, imported by the service and the pure UI state", async () => {
    const dir = new URL("../src/", import.meta.url);
    const [shared, service, uiState] = await Promise.all(["weatherShared.js", "weatherService.js", "weatherUiState.js"].map((n) => readFile(new URL(n, dir), "utf8")));
    assert.match(shared, /export const WEATHER_CACHE_TTL_MS = 30 \* 60 \* 1000;/);
    assert.doesNotMatch(service, /const WEATHER_CACHE_TTL_MS/);
    assert.match(service, /import \{ WEATHER_CACHE_TTL_MS \} from "\.\/weatherShared\.js";/);
    assert.match(uiState, /import \{ WEATHER_CACHE_TTL_MS \} from "\.\/weatherShared\.js";/);
    assert.doesNotMatch(uiState, /weatherService\.js|weatherApi\.js/, "the pure UI state does not pull in the service or the HTTP client");
  });
});
