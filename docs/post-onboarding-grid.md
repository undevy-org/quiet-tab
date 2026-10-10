# Post-onboarding grid: one island after wizard Finish

## Status

`draft` — revision 2 (2026-10-10) after two independent spec reviews (notes `pipeline/reports/onboarding-grid-initiative-spec-review.md`). **Part 2** of the onboarding-grid initiative: part 1 `docs/tile-size-1x2.md` (prerequisite: 1×2 footprints in UI/CSS), part 3 `docs/onboarding-starter-rows.md` (step 2 UI, independent of this spec).

Decision: **do it**. After onboarding **Finish** on a fresh desk, the system widgets and the new starter links form **one island**: a solid rectangle (no empty cell inside its bbox), centered once (horizontal: the grid's center line; vertical: the first screen). The island geometry per link count **k** is a **normative table** in this spec (§ Island table). Reload and resize never re-pack.

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`).

Terms: **k** = number of starter links added on Finish. **j** = 1…k, the rank of an added link among the checked starters in `ONBOARDING_STARTER_LINKS` order. **Island** = the six system widgets plus the k new links, placed by § Island table. **Fresh desk** = § Default decision 3. **Local** coordinates = `(0…W−1, 0…H−1)` inside the island.

Related: `docs/onboarding-wizard.md` (Finish), `docs/vertically-centered-defaults.md` (`centeredDefaultRow`), `docs/centered-grid.md` (stored frame), `src/desktopLayout.js`, `src/widgetsService.js` (`addFavorites`).

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-10 | Replace scattered strip + `placeNew` links with one centered island; golden A for k = 0. | `confirmed` | Brainstorm companion (archived in notes `superpowers/mockups/2026-10-10-onboarding-grid/`). |
| 2026-10-10 | Acceptance covers **all** valid post-onboarding outcomes (k 0…8, city saved / skipped). | `confirmed` | Owner chat. |
| 2026-10-10 | OQ-1…OQ-8 answered (full repack, k = added, temperature chosen per layout, no fixed k = 8 recipe, escalate then fall back, soft first-screen height, on-desk members only, local pack + one shift). | `confirmed`, then **revised** | § Decision log. |
| 2026-10-10 | Review answers: k = 3 → **4×4 with tall temperature** (not B1 5×3); Settings and Add **always the bottom-right corner**; city skipped → **same geometry**, the reserved metric cells stay empty until a city is set; k = 8 → **4×4 of 1×1 icons** is fine. | `confirmed` | Owner answers to the spec review, 2026-10-10. |
| 2026-10-10 | Layout depends only on k (j semantics), so the 9 islands are a hand-drawn table checked by tests, not a runtime solver. | `default` (reviewer recommendation; owner may override) | Spec review, main proposal. |
| 2026-10-10 | Link footprints differ from the brainstorm hints at k = 2 (2×1, 2×1 → 1×2, 2×1), k = 3 (order: ChatGPT 2×2, YouTube 1×2, X 1×1) and k = 6 (2×1, 2×1 → 2×1, 1×2): with the owner's chrome corner the old sets have **no** solid layout under R2–R4 (brute force, spec review 2). | `default` (forced by R2–R4; owner may override) | Notes `pipeline/reports/onboarding-grid-initiative-spec-review-2.md`. |

## Current behaviour (`main` at review time)

Boot runs `ensureWidgetsLayout` → `placeMissing`: the six system widgets as one horizontal strip, vertically centered in the first screen (`docs/vertically-centered-defaults.md`). Finish calls `widgetsService.addFavorites(inputs, { columns })` (`src/newtab.js` `finishOnboardingWizard`): each checked starter is placed by `placeNew` as 2×1, independent of the strip. With zero checked starters nothing is written. Without a city, only the first enabled metric shows a tile (the hint); the other metric cells stay reserved and empty (`src/newtab.js`, render loop).

## Default decisions (owner can override)

1. **Finish-only.** The island is applied only inside a successful Finish (button, Escape or backdrop on step 2, `docs/onboarding-wizard.md` decision 6), including k = 0. Never on reload, resize, Add link, or boot.

2. **One write.** Finish makes **one** service call: `widgetsService.addFavorites(inputs, { columns, island: { rows } })`. Inside its single `mutate` (one `setState`, one `set()`): read fresh state, decide fresh desk (decision 3) on the state **before** the adds, add the links exactly as today (dedupe, cap), then, if the island applies (decision 4), overwrite the grid of every island member with § Island table. No intermediate grids are ever persisted. Finish calls it also when no starter is checked (k = 0, `inputs = []`). **No-op rule:** when no link is added and the island does not apply (decisions 3–4), `addFavorites` returns `[]` **without** writing (no `setState`), so a zero-link Finish on a desk that is not fresh never rewrites it.

3. **Fresh desk.** The island applies only when, before the adds: there is **no** `favorite` item; all six system items (`DEFAULT_ENTRY_ORDER`) exist with a valid grid; all four metrics are `enabled`; every system item has its `defaultSize` footprint; and `weather:temperature` is the first metric in `meta.order` (so the city hint, which renders in the first enabled metric's cell, lands in the temperature cell). The check reads `base.items` after the mutation's usual `rebase`. Positions are not checked: a synced desk of only system tiles that someone arranged by hand is re-packed (accepted). Anything else (links synced from another device, links left by an earlier Finish whose complete flag failed to write, a hidden or resized metric, a second tab that finished first) is **not fresh**: the links are added by `placeNew` as 2×1 (today's behaviour) and no other widget moves beyond the `rebase` every mutation does (on a window narrower than the stored layout that rewrite already happens on any write). On a fresh desk dedupe cannot drop a starter (the starter URLs are distinct and no favorite exists), so k = number of checked starters.

4. **Fit.** The island applies only when its width fits the window: `W ≤ columns` (`columns` = `currentColumns()` at Finish). Otherwise behave as "not fresh" (decision 3, last sentence). Height is soft: an island taller than the first screen is still applied, at row 0 (decision 6).

5. **Island table is normative.** § Island table gives, for each k = 0…8, `W×H`, the temperature footprint, the footprint of each link j, and the local cell of every member. Implementation exports it as data from a new pure module **`src/onboardingLayout.js`** (no DOM, no storage) together with `isFreshDesk(items)` and `islandPlacements({ k, linkIds, rows, columns })` → `Map<id, storedGrid>` or `null` (does not fit). There is no runtime search, score, escalation ladder or fallback logging.

6. **Coordinates.** Each member's stored grid = local cell shifted by `(dx, dy)`: `dx = −floor(W / 2)` (stored frame, signed from the center line; an odd `W` sits half a cell right of the center line, the same "ties to the right" as `placeMissing`), `dy = centeredDefaultRow(rows, H)` (`src/desktopLayout.js`; 0 when the island is taller than the first screen). `rows` = `viewportRows(clientHeight, viewportWidth())` read at Finish. The stored grid does not depend on `columns`; `displayLayout` then shows the island at `floor(columns / 2) + dx` with no repack, because `W ≤ columns`.

7. **Members.** Island members: `weather:temperature`, `weather:precipitation`, `weather:airQuality`, `weather:uv`, `chrome:settings`, `chrome:add`, and the k added links, link j = the j-th added id in `ONBOARDING_STARTER_LINKS` order. The city hint is not a widget: without a city it renders in `weather:temperature`'s cell with that cell's footprint (part 1 decision 4 covers the 1×2 hint), and the other three metric cells stay empty until a city is set (owner, 2026-10-10). The island geometry does not depend on the city.

8. **Link sizes.** Each link is stored with its table footprint (1×1, 1×2, 2×1 or 2×2). The interim `w: 2, h: 1` in the Finish payload stays as the size used on a not-fresh desk (decision 3).

9. **Failure.** If the call throws with `k ≥ 1`: today's path (inline "Couldn't add links. Try again.", stay on step 2, nothing written). If it throws with `k = 0`: Finish continues (flag, close, reveal); the desk keeps the boot strip; no message (the layout is cosmetic and the user selected nothing). `onboardingStartersCommitted` is set after a **successful** call for any k (k = 0 included), so a retry after a flag-write failure never calls the service again. After a swallowed k = 0 failure it stays false, which is harmless: Finish goes on to write the flag; if that write also fails, the Finish retry calls the service once more (the desk is still veiled and fresh, so the island may apply now); once the flag is set the wizard never reopens and the desk keeps the boot strip.

10. **Veil.** The service call runs before `markComplete` and before the wizard closes, so the first unveiled frame already shows the island. `refreshAutoAccent` for `auto` links stays `void` after close.

## Island table

Normative. Rows top to bottom are local `y = 0…H−1`, characters left to right are local `x`. `T` temperature (or the hint without a city), `P` precipitation 2×1, `Q` air quality 2×1, `U` UV 1×1, `S` Settings, `+` Add, digits = link j. Each letter or digit covers one solid rectangle.

| k | W×H | Temperature | Links j = 1…k (w×h) | Layout |
|---|-----|-------------|----------------------|--------|
| 0 | 3×3 | 1×2 | — | `TPP` · `TQQ` · `US+` |
| 1 | 3×3 | 1×1 | 1×1 | `TPP` · `QQU` · `1S+` |
| 2 | 4×3 | 1×1 | 1×2, 2×1 | `TPP1` · `QQU1` · `22S+` |
| 3 | 4×4 | 1×2 | 2×2, 1×2, 1×1 | `TPP2` · `TQQ2` · `11U3` · `11S+` |
| 4 | 4×4 | 1×1 | 2×2, 2×1, 1×1, 1×1 | `TPP3` · `QQU4` · `1122` · `11S+` |
| 5 | 4×4 | 1×1 | 2×1, 2×1, 2×1, 1×1, 1×1 | `TPP4` · `QQU5` · `1122` · `33S+` |
| 6 | 5×5 | 1×1 | 2×2, 2×2, 2×2, 2×1, 1×2, 1×1 | `TPPQQ` · `U1144` · `61122` · `53322` · `533S+` |
| 7 | 5×5 | 1×1 | 2×2, 2×2, 2×2, 2×1, 1×1, 1×1, 1×1 | `TPPQQ` · `U1122` · `51122` · `33446` · `337S+` |
| 8 | 4×4 | 1×1 | 1×1 × 8 | `TPP1` · `QQU2` · `3456` · `78S+` |

Rules the table satisfies (unit tests pin them, and any later edit of the table must keep them):

- **R1 Solid:** every cell of `W×H` is covered exactly once; every footprint is in `{1,2}×{1,2}`.
- **R2 Chrome corner:** `S` at `(W−2, H−1)`, `+` at `(W−1, H−1)`, both 1×1.
- **R3 Weather block:** the four metrics are edge-connected, temperature is at local `(0, 0)`, and they read in `DEFAULT_ENTRY_ORDER` order (temperature, precipitation, air quality, UV) by `(y, x)` of their top-left cell; precipitation and air quality 2×1, UV 1×1, temperature 1×1 or 1×2. (The render sorts tiles by `(y, x)`, so this is also the DOM and Tab order.)
- **R4 Link priority:** link areas never increase with j (earlier starters get the larger tiles); links of equal area read in j order by `(y, x)`.
- **R5 Shape:** the squarest `W×H` for the area, wider than tall on a tie; `H ≤ 5`.

Example (k = 3, default three checked): ChatGPT 2×2, YouTube 1×2, X 1×1. Same row for any three checked starters (GitHub, Gmail, Amazon → 2×2, 1×2, 1×1).

The table is also archived as JSON in notes `superpowers/mockups/2026-10-10-onboarding-grid/onboarding-islands.json`; this spec wins on conflict. The brainstorm companion JSON (`onboarding-grid-algorithm-data.json`) is superseded: its k = 3 (B1), chrome positions and k = 6 footprints no longer apply (k = 6's companion footprints cannot keep R2 in 5×5).

## Integration (Finish)

`finishOnboardingWizard` (`src/newtab.js`), replacing today's guarded `addFavorites` call:

1. `inputs = checkedStarterInputs(...)` (unchanged, `w: 2, h: 1`).
2. If `!onboardingStartersCommitted`: `addedIds = await widgetsService.addFavorites(inputs, { columns: currentColumns(), island: { rows: viewportRows(clientHeight, viewportWidth()) } })`, `widgetsState = await getState()`, `onboardingStartersCommitted = true`. The call runs for `inputs = []` too.
3. `markComplete`, close, `renderFavorites` (unchanged order and flag-failure handling).

`addFavorites` without `island` behaves exactly as today (no other caller changes).

## Amendments to `docs/onboarding-wizard.md` (in the implementation PR)

- **Decision 5 (Finish):** Finish calls `addFavorites(inputs, { columns, island })` also with zero links; on a fresh desk that fits, the result is § Island table, otherwise 2×1 `placeNew` as before; the k = 0 failure rule (decision 9 here).
- **AS-OB-05:** "four new favorites 2×1" → four new favorites with the k = 4 table footprints (2×2, 2×1, 1×1, 1×1) on a fresh desk.
- **AS-OB-06:** zero links → system-only island (k = 0 row).
- **AS-OB-13 / AS-OB-25:** "same storage outcome as Finish" stays; the outcome now includes the island.
- **AS-OB-27 (dedupe):** the seeded existing favorite makes the desk not fresh → 2×1 `placeNew`, no system tile moves.
- **AS-OB-29:** Skip + zero links → k = 0 island; the hint shows at 1×2 in the temperature cell.
- **AS-OB-30:** at 1280×800 and 500×500 (6 columns) the k = 3 island applies (4×4); the "2×1 `placeNew`" assertion moves to a not-fresh or too-narrow case.
- **Decision 11** ("Nothing else changes … grid layout defaults") and the bullets "Finish with zero links … default desk only" / "Zero links on Finish leaves only system tiles": the system tiles now form the k = 0 island.

## Amendments to other docs and E2E (in the implementation PR)

- **`docs/vertically-centered-defaults.md`:** decision 6 ("measured once, never recomputed … none of them rewrite `y`") and decision 9 ("Nothing else changes") gain the exception "except onboarding Finish on a fresh desk (`docs/post-onboarding-grid.md`)"; AS-VC-05 (a)(b)(c) are rewritten for the wizard (positions after Finish follow the island table, not row 4).
- **`docs/first-run-empty-desk.md`:** AS-FE-05 / AS-FE-11 positions after Finish follow the island table.
- **E2E sweep:** every scenario that reaches Finish (`grep -lE "Finish|finishFromStep1|finishStep2ZeroLinks" .private/e2e/scenarios/*.mjs`; at least `dg-03`, `dg-15`, `dg-45`, `dg-56`, `dg-58`, `dg-59`, `dg-60`, `10`, `13`, `14`) is reviewed; each assertion on tile positions or on the set of tiles after Finish is rewritten to the island or moved to a seed that skips the wizard. `dg-59` AS-VC-05 and `dg-56` AS-FE-05/11 are known to break.

## Scope

- `src/onboardingLayout.js` (new): island table, `isFreshDesk`, `islandPlacements`.
- `src/widgetsService.js`: `addFavorites` optional `island: { rows }`.
- `src/newtab.js`: `finishOnboardingWizard` per § Integration.
- `test/onboardingLayout.test.js` (new): R1–R5 for every k; stored grids for every k at `rows` 9 and 3; `isFreshDesk` true/false cases; `islandPlacements` → `null` when `W > columns`. `test/widgetsService.test.js`: island write, not-fresh path, k = 0, one `set()`.
- E2E: a new `dg-NN-post-onboarding-grid.mjs` (the plan takes the next free number; the new post-onboarding scenario…`dg-63` are taken); `dg-60` groups touched by the amendments; the E2E sweep of § Amendments to other docs.
- Docs in the implementation PR: `docs/onboarding-wizard.md` amendments, `docs/architecture.md` (Finish paragraph), `CHANGELOG.md`, agent-config `CLAUDE.md` (bootstrap/Finish facts).

## Acceptance scenarios

Common setup unless noted: harness **1280×800** (cell 72, gap 8, pad 16, **14** columns, **9** first-screen rows); fresh profile, wizard auto-opens; weather fixtures as `dg-15` / `dg-60`; city saved on step 1 unless noted. **Island** = all `[data-widget-id]` tiles plus the reserved metric cells. Expected displayed cell of a member = local cell + (`7 − floor(W / 2)`, `centeredDefaultRow(9, H)`).

### AS-POG-01 Island per k (table)
- Given: exactly k starters checked, the first k rows in table order, k = 0…8.
- When: Finish; desk unveils.
- Then: every member's displayed `(x, y, w, h)` equals § Island table shifted as above; tile count 6 + k; no overlap; Settings and Add in the bottom-right corner. The tile positions recorded at the moment the veil drops (a `MutationObserver` on `data-veiled`) already equal the island (no strip frame).
- Verified by: unit (all k); E2E one group per k for k = 0, 3, 6, 8 (the other k are unit-only; same code path, table data).

### AS-POG-02 Same table row for any starter choice
- Given: k = 3 with GitHub, Gmail, Amazon checked.
- When: Finish.
- Then: GitHub 2×2, Gmail 1×2, Amazon 1×1 at the k = 3 link cells.
- Verified by: unit; E2E the new post-onboarding scenario.

### AS-POG-03 City skipped
- Given: Skip on step 1; k = 0 and k = 3.
- When: Finish.
- Then: same geometry as with a city; the hint tile occupies the temperature cell at 1×2 (pin and `Set a city`, part 1 AS-1X2-04); precipitation, air quality and UV cells are empty; no other tile is in them. After setting a city through the hint, the metric tiles appear in their island cells and nothing moves.
- Verified by: E2E the new post-onboarding scenario.

### AS-POG-04 Not fresh: existing link
- Given: storage seeded with one favorite (any URL) and the default system strip; wizard open (complete flag false).
- When: Finish with the default three checked.
- Then: three new 2×1 links by `placeNew`; every pre-existing widget keeps its stored grid; no overlap.
- Verified by: unit; E2E the new post-onboarding scenario.

### AS-POG-05 Not fresh: hidden or resized metric
- Given: one metric `enabled: false`, or temperature stored 2×1.
- When: Finish with k = 3.
- Then: as AS-POG-04 (no island, nothing moves).
- Verified by: unit.

### AS-POG-06 Too narrow
- Given: harness width 320 (4 columns).
- When: Finish with k = 3 (`W = 4`) and, separately, k = 6 (`W = 5`).
- Then: k = 3 island applies; k = 6 falls back to the AS-POG-04 behaviour.
- Verified by: unit (all k × columns 2, 4, 6); E2E the new post-onboarding scenario k = 6 at 320×800.

### AS-POG-07 Low window
- Given: harness 1280×400 (4 first-screen rows).
- When: Finish with k = 6 (`H = 5`).
- Then: island applied at displayed row 0 (`centeredDefaultRow(4, 5) = 0`), shape per table; the page scrolls to reach the last row.
- Verified by: unit; E2E the new post-onboarding scenario.

### AS-POG-08 One write, nothing intermediate
- Given: k = 3, fresh desk.
- When: Finish.
- Then: exactly one `chrome.storage.sync.set` for the widgets (meta + items); no stored grid other than the island grids ever appears for the new links.
- Verified by: unit (a counting wrapper around `test/memoryStorageArea.js`).

### AS-POG-09 Failure with links
- Given: k = 3; the widgets write fails.
- When: Finish.
- Then: inline "Couldn't add links. Try again."; step 2 stays; storage unchanged; a later successful Finish applies the island.
- Verified by: unit; E2E `dg-60` group of AS-OB-19 extended.

### AS-POG-10 Failure with zero links
- Given: k = 0; the widgets write fails.
- When: Finish.
- Then: wizard completes and closes; desk shows the boot strip; no error text.
- Verified by: unit.

### AS-POG-11 No re-pack on reload or resize
- Given: Finish done with k = 3.
- When: reload; then resize to 1440×900 and to 800×800.
- Then: stored grids identical to right after Finish; at 1440×900 (16 columns) and 800×800 (8 columns) the island is shifted by the new origin only, still solid.
- Verified by: E2E the new post-onboarding scenario.

### AS-POG-12 Escape and backdrop on step 2
- Given: k = 2 checked.
- When: Escape (and separately backdrop) after the step-2 guard.
- Then: same storage outcome as AS-POG-01 for k = 2.
- Verified by: E2E `dg-60` groups of AS-OB-13 / AS-OB-25.

### AS-POG-13 Flag write failure retry
- Given: k = 3; the add + island write succeeds, the first flag write fails.
- When: Finish again.
- Then: no second widgets write; island unchanged; second flag write succeeds and the wizard closes.
- Verified by: unit; E2E `dg-60` group of AS-OB-20.

### AS-POG-14 Finish after a long pause on step 2
Step 2 waits on the person; the island reads `columns`, `rows` and "fresh" at Finish, not at load (lesson 2026-10-10).
- Given: load at 1280×800, wizard on step 2.
- When: (a) the window becomes 320×600, then Finish with k = 6; (b) a favorite appears in sync storage (another device), then Finish with k = 3; (c) the window becomes 1280×400, then Finish with k = 3.
- Then: (a) `W = 5 > 4` → no island, links by `placeNew`, nothing else rewritten beyond `rebase`; (b) not fresh → as AS-POG-04; (c) island applied with `dy = centeredDefaultRow(4, 4) = 0`.
- Verified by: unit (service called with the new `columns` / `rows` / state); E2E for (a) and (b).

### AS-POG-15 Zero links on a desk that is not fresh
- Given: storage seeded with one favorite; wizard open.
- When: Finish with nothing checked.
- Then: no widgets write (`set` not called); every stored grid unchanged.
- Verified by: unit.

The network is not involved (the write is local storage).

## Decision log

| ID | Original answer (2026-10-10) | Revision 2 |
|----|------------------------------|------------|
| OQ-1 | A: full repack of system + links. | Kept, on a fresh desk only (decision 3). |
| OQ-2 | A: k = added after dedupe. | Kept; on a fresh desk dedupe cannot drop a starter, so k = checked. |
| OQ-3 | C: packer picks temperature 1×1 / 1×2. | Fixed per k in the table (1×2 at k = 0 and k = 3). |
| OQ-4 | C: no fixed k = 8 recipe; solver score. | Superseded: the table is normative (owner kept 4×4 icons at k = 8). The score could not produce the owner's layouts (k = 3 golden B1 lost to 4×4 under it) and did not fix positions. |
| OQ-5 | A: escalate, then fall back to As-Is. | Replaced: As-Is only when not fresh or too narrow; no escalation. |
| OQ-6 | C: soft first-screen height. | Kept: `centeredDefaultRow` gives row 0 when taller. |
| OQ-7 | A: on-desk members only. | Replaced by the fresh-desk rule (a hidden metric means not fresh). |
| OQ-8 | B→A: local pack, one shift, stored v3 grids. | Kept, made exact in cells (decision 6). |

## Non-goals

- Re-pack on reload, resize, Add link, or a later "tidy up" action.
- Island for a desk that is not fresh, or for more than 8 links.
- Changing the wizard UX (part 3 changes step 2 visuals only).
- Rendering placeholders in the empty metric cells while no city is set.

## Review focus

- First unveiled frame already shows the island (no strip flash).
- Fresh-desk rule cannot move widgets on a synced or retried desk; the no-op rule (decision 2) keeps a zero-link Finish from writing.
- Accepted: a fresh-by-rule desk whose system tiles were arranged by hand on another device is re-packed (decision 3).
- Odd-width islands: half a cell right of center, consistently.
- Table rules R1–R5 pinned by tests, not only the coordinates.
- Part 1 dependency: 1×2 favorite and 1×2 hint/temperature render correctly inside the island.

## Process

Full UI pipeline (`quiet-tab-pipeline`): spec review → plan in notes → E2E-first implementation → design checkpoint against § Island table (notes mockup `onboarding-islands.html`) → verification. Ships after part 1; part 3 is independent.
