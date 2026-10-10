# Post-onboarding grid: packed island after wizard Finish

## Status

`draft` — **OQ-1…OQ-8 resolved**; default decisions and acceptance matrix below (2026-10-10). **Part 2** of the onboarding-grid initiative (after **part 1** `docs/tile-size-1x2.md`, alongside **part 3** starter footprints table).

**Implementation prerequisite:** part 1 shipped (`1×2` footprints in UI/CSS where this spec assumes them).

Decision: **do it** (brainstorming 2026-10-10). After onboarding **Finish**, the desk shows **one island** of system widgets plus starter links: **solid rectangle** on the grid (no holes inside the bbox), **no skewed** left/right edge, **dense** mixed footprints. The island is **centered once** at Finish (horizontal: grid center line; vertical: middle of the first screen per `viewportRows` — see companion mockups). **Reload and resize do not** re-pack or re-center.

**Data compatibility: not required.**

Terms: **island** = union of all widgets placed by the Finish packer for that session. **k** = count of **favorite** widgets actually added on Finish (see OQ-2). **Golden layouts** = k=0 → **3×3 (A)**, k=3 → **5×3 (B1)**. **Companion** = brainstorm HTML/JSON under `.superpowers/brainstorm/…/onboarding-grid-*` (not in public `docs/`).

Related: `docs/onboarding-wizard.md` (Finish adds favorites), `docs/vertically-centered-defaults.md` (today’s `placeMissing` row), `src/desktopLayout.js` (stored/displayed `x`, `placeNew`).

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-10 | Replace scattered strip + `placeNew` links with one centered island; algorithm over hardcoding 255 checkbox sets; golden A + B1. | `confirmed` | Brainstorm packings + `onboarding-grid-algorithm-v1.html`. |
| 2026-10-10 | Acceptance: **all** valid post-onboarding outcomes (k 0…8, city/hint variants), not a minimal E2E trio only. | `confirmed` | Owner chat. |
| 2026-10-10 | OQ-1: **full repack** on Finish (variant A). | `confirmed` | See § Open questions. |
| 2026-10-10 | OQ-2: **k = added** favorites after dedupe (variant A). | `confirmed` | See § Open questions. |
| 2026-10-10 | OQ-3: packer **chooses** temperature 1×1 vs 1×2 (variant C). | `confirmed` | See § Open questions. |
| 2026-10-10 | OQ-4: **no fixed k=8 recipe** — solver score (variant C). | `confirmed` | See § Open questions. |
| 2026-10-10 | OQ-5: **escalate** footprints; last resort **As-Is** placement (A + fallback B). | `confirmed` | See § Open questions. |
| 2026-10-10 | OQ-6: **soft** first-screen height in score (variant C). | `confirmed` | See § Open questions. |
| 2026-10-10 | OQ-7: pack **only widgets on the desk** (variant A). | `confirmed` | See § Open questions. |
| 2026-10-10 | OQ-8: **local pack + island shift → stored grids** (B→A). | `confirmed` | See § Open questions. |
| 2026-10-10 | Default decisions 1–15, algorithm, Finish integration, AS-POG-01…15 matrix. | `confirmed` | This document § Default decisions, Acceptance. |

## Current behaviour (`main` at review time)

Boot runs `ensureWidgetsLayout` → `placeMissing` lays the **six** default widgets in one **horizontal strip**, vertically centered in the first screen when `screen` is valid (`docs/vertically-centered-defaults.md`). Onboarding **Finish** calls `addFavorites`: each checked starter is **`placeNew`** (today always **2×1**), independent of the weather strip — links above or beside, not one packed cluster.

## Default decisions (owner can override)

1. **Finish-only.** `packOnboardingIsland` runs **only** on successful onboarding **Finish** (including k = 0, Escape/backdrop Finish on step 2). Never on reload, resize, Add link, or boot after the flag is set.
2. **Full repack (OQ-1 A).** After favorites exist, assign **displayed** `grid` for **every** island member (system + new links) in **one** `widgetsService` mutate. Boot `placeMissing` geometry under the veil is discarded before unveil.
3. **k = added (OQ-2 A).** `k` = length of `addFavorites` return value (ids actually created). Deduped starters do not consume footprint slots.
4. **Members (OQ-7 A).** Island input = `collectIslandMembers(state)`: enabled `weather-metric` tiles, **`weather:hint` or `weather:temperature`** (never both), `chrome:settings`, `chrome:add`, and the **k** new favorite ids. Hidden metrics are omitted.
5. **Pure layout module.** New **`src/onboardingLayout.js`** (or exports added to `src/desktopLayout.js` if kept small): **no** DOM, **no** storage. Exports at minimum: `collectIslandMembers`, `packOnboardingIsland`, `islandCenterTarget`, `assertSolidRectangle`, `scorePacking` (names TBD). Unit-tested.
6. **Footprints.** Allowed rectangles per widget: **`w,h ∈ {1,2}`** per `isValidGrid`. Chrome **1×1** only. Each **link** footprint chosen by the solver from allowed set (part **3** may constrain **per-index** candidates for onboarding starters; until part 3 ships, use solver search with caps in decision 12).
7. **Temperature / hint (OQ-3 C).** Solver picks **1×1 or 1×2** for temperature when city exists; **hint** matches that size. No city → hint **1×1** only. Other metrics use `defaultSize(id)` unless part 1 changes them.
8. **Scoring (OQ-4 C, OQ-6 C).** Among **solid** packings, rank by: (a) **fits first screen** — bbox height after translate ≤ `screen.rows` preferred; (b) minimize **|W − H|**; (c) maximize **total link cell area**; (d) prefer **1×2** temperature when tied. Implementation may use weighted score; tests pin **ordering** on fixed fixture packings.
9. **Search (OQ-4 C).** No authoritative fixed recipe for **k = 8** (or any k). Companion JSON table is **hints** to prune search, not normative. **Golden** layouts **k = 0** and **k = 3** are regression fixtures (companion **A** / **B1** at reference viewport).
10. **Escalation + fallback (OQ-5).** Ladder: hinted footprints → widen link assignments → force temperature **1×1** → try alternate **W×H** for same area → relax first-screen preference → **fallback B** (`placeMissing` + per-link `placeNew` for new ids only). Log `quietTab:onboardingPackFallback` (debug). Acceptance matrix must **not** trigger fallback B.
11. **Coordinates (OQ-8 B→A).** Pack in **local** `(0…W−1, 0…H−1)`; apply one **island translate** `(dx, dy)` so bbox center matches `islandCenterTarget(columns, screen)`; convert to **stored** with `toStored` per widget at Finish `columns`.
12. **Link footprint caps (until part 3).** For each of the **k** links (table order), allow **`{1×1, 1×2, 2×1, 2×2}`** in search. Part 3 may replace with a finite table per `(k, index)`; solver must accept injected candidate lists.
13. **Finish integration.** `finishOnboardingWizard` (`src/newtab.js`): after `addFavorites` (or skip when k = 0), call **`widgetsService.applyOnboardingIslandLayout({ screen, columns, addedFavoriteIds })`** (name TBD) **before** `markComplete` / unveil. Refactor `addFavorites` so Finish does **not** leave intermediate `placeNew` grids visible to the user (either repack in the same flow or add favorites with temporary grids overwritten immediately).
14. **Zero links.** k = 0 still runs pack (system-only island). Expect reference **3×3** with temperature **1×2** when solver ranks it best (golden **A**).
15. **Companion.** Brainstorm HTML/JSON illustrates intent; **this spec + unit goldens** win on conflict.

## Scope

- `src/onboardingLayout.js` (new) — packer, score, escalation, island translate.
- `src/widgetsService.js` — Finish-time mutate applying island grids to all members; possible `addFavorites` adjustment for Finish path.
- `src/newtab.js` — `finishOnboardingWizard` calls layout apply; pass `screen: { rows, columns }` like boot (`viewportRows` + `currentColumns()`).
- `test/onboardingLayout.test.js` — matrix + goldens + fallback ladder (mock).
- E2E: new `dg-61-post-onboarding-grid.mjs` (or split by group) — **full k matrix** where product-visible (see acceptance).
- Docs: `docs/architecture.md` (Finish layout paragraph) when implemented; **not** in this spec commit unless owner asks.

## Algorithm sketch

```
collectIslandMembers(state) → pieces[]  // id + candidate footprints
packOnboardingIsland({ pieces, screen, columns, hints? })
  → try packings in score order
  → escalation ladder on failure
  → { localPlacements, dx, dy } | { fallback: true }
applyIslandTranslate(local, dx, dy) → displayed grids
toStored per widget → persist
```

**Solid rectangle:** every cell in `[minX, maxX) × [minY, maxY)` occupied exactly once.

**Center target** (reference mockups, **1280×800**, stable gutter): horizontal center of island bbox = horizontal center of the **desktop grid**; vertical center of island bbox = **`GRID_PAD + (firstScreenGridHeight / 2)`** where `firstScreenGridHeight` uses the same `viewportRows` / `gridMetrics` as boot. Translate `(dx, dy)` in **displayed cell integers** moves all island widgets together.

**Hints table (non-normative draft)** — companion `onboarding-grid-algorithm-data.json` lists example **W×H** and link footprints per k for k = 0…7; k = 8 illustrative only.

## Integration (Finish)

Today (`main`): `addFavorites` assigns each starter with **`placeNew`** inside its mutate. **Target:** Finish ends with **one** layout mutate that sets **all** island `grid` values. Suggested sequence:

1. `addedIds = await addFavorites(...)` (may be `[]`).
2. `widgetsState = await getState()`.
3. `await applyOnboardingIslandLayout({ addedFavoriteIds: addedIds, screen, columns })`.
4. `markComplete`, hide wizard, `renderFavorites`.

`applyOnboardingIslandLayout` runs under the same **mutation lock** as other service ops. If pack returns **fallback B**, still persist (strip + `placeNew`); E2E matrix treats as defect.

## Accepted exceptions

- **Fallback B** exists but is **test-forbidden** on the standard matrix (OQ-5).
- **Solver non-determinism** among equal scores: any tied packing allowed if score equal; goldens use **pinned** seed/order in tests.
- **Part 3** may narrow link footprints later without changing island invariants.

## Open questions (owner decisions)

### OQ-1 — What is repositioned on Finish?

**Question:** Repack **all** island widgets (system + links) or only links?

| ID | Option | Summary |
|----|--------|---------|
| **A** | **Full repack** | One pack assigns `grid` for **every** island widget; boot `placeMissing` layout is discarded before first unveil. |
| B | Links only | System stays on `placeMissing`; only favorites get new cells. |
| C | Fixed system strip + move block | Preserve internal weather strip geometry; translate as a unit with links. |
| D | Boot-only layout | Island geometry chosen at boot before k is known. |

**Decision: A (confirmed 2026-10-10).**

**Why A:** Only A guarantees a single solid bbox, shared centering, and the k-based recipes (A, B1, …) without fighting the legacy strip.

**Rejected alternatives (revisit if…):**

- **B** — If we ever drop the “one island” goal and only want “nicer link placement” while keeping today’s weather band. *Revisit when:* product accepts two visual clusters or a non-rectangular union.
- **C** — If legal/branding requires the **exact** current metric order in a single row inside the island. *Revisit when:* packer can embed that strip as a rigid sub-rectangle without breaking square recipes for large k.
- **D** — If Finish becomes instant with **no** geometry change (links only data). *Revisit when:* wizard step 2 selections are persisted earlier and first paint can use final k without a second layout pass (still needs k at boot).

**Spec implication:** `widgetsService` Finish path (or dedicated helper) must **create favorites then assign every island id’s grid in one locked mutate**; tests assert system tiles move when k>0.

---

### OQ-2 — Effective k when URLs dedupe?

**Question:** Does **`linkFootprints(k)`** use the number of **checked** starters or **actually added** favorites (after URL dedupe)?

| ID | Option | Summary |
|----|--------|---------|
| **A** | **k = added** | `k = addedFavoriteIds.length` after `addFavorites`; pack includes only real widget ids. |
| B | k = checked | Packer assumes checked count even when some URLs were skipped. |
| C | k = checked, fail if added < checked | Finish errors when dedupe drops any selected row. |
| D | k = checked with empty placeholder cells | Reserve grid cells for skipped URLs without widgets. |

**Decision: A (confirmed 2026-10-10).**

**Why A:** Solid rectangle and footprint area must match **physical** tiles; dedupe is silent today and must not leave holes or ghost slots.

**Rejected alternatives (revisit if…):**

- **B** — If marketing wants layout size to follow “intent” (checkboxes) not desk contents. *Revisit when:* willing to accept non-rectangular packs or dummy chrome tiles (conflicts with island invariants).
- **C** — If duplicate URLs on Finish should be **visible errors** for the user to fix. *Revisit when:* product changes dedupe to block Finish with copy instead of skip.
- **D** — Never compatible with “no holes”; listed only for completeness.

**Spec implication:** Finish flow: `addFavorites` → compute **k from return value** → `packOnboardingIsland({ k, widgetIds, … })`. Tests: seed existing favorite with same URL as a checked starter; expect **lower k** preset and no duplicate tile.

### OQ-3 — Temperature 1×2 vs 1×1 when k>0?

**Question:** Is temperature **always 1×2** when there is a city, **always 1×1** when k>0 (packing draft), or **chosen per layout**?

| ID | Option | Summary |
|----|--------|---------|
| A | 1×2 iff k = 0 | Fixed rule; k≥1 always 1×1 (companion draft). |
| B | Always 1×2 with city | Tall weather whenever city stored; repack link recipes around it. |
| **C** | **Packer chooses** | For each pack attempt, temperature (and matching hint) may be **1×1 or 1×2** whichever yields a valid, preferred solid rectangle. |
| D | 1×2 for k≤1 only | Hybrid fixed tiers. |

**Decision: C (confirmed 2026-10-10).**

**Why C:** Keeps **one algorithm** for all k: footprint table for **links** plus **optional** tall temperature when it still allows a good bbox (e.g. k=0 → 3×3 with 1×2). When tall blocks a square pack, solver uses 1×1 without a separate product rule per k.

**Rejected alternatives (revisit if…):**

- **A** — If we want zero ambiguity in screenshots and a one-line doc for PMs. *Revisit when:* packer complexity outweighs predictability; golden table can be fully static again.
- **B** — If brand requires tall weather whenever a city exists, even in dense 5×3 islands. *Revisit when:* willing to drop or rework **B1**-class presets.
- **D** — If only k=1 should look “hero weather” without full solver.

**Spec implication:**

1. `systemFootprints` exposes **temperature candidates** `{1×1, 1×2}` (hint mirrors chosen size; no city → hint 1×1 only).
2. `packOnboardingIsland` tries footprints in a **documented order** (e.g. prefer **more square** bbox, then **larger temperature** when tied — tie-break TBD in implementation plan).
3. **Golden tests** pin **layouts** for k=0 and k=3, not “always 1×1 at k=3”; companion **B1** remains reference frame for k=3 but solver may emit 1×1 ° if that is what the chosen recipe uses.
4. Part 1 **tall** CSS must work for temperature/hint at **1×2** whenever solver picks it, at **1×1** otherwise.

### OQ-4 — k=8 recipe (4×4 all 1×1 vs larger tiles)?

**Question:** Is **k = 8** a fixed footprint row in the table (e.g. eight **1×1** in **4×4**) or left to the solver?

| ID | Option | Summary |
|----|--------|---------|
| A | Fixed **4×4**, eight **1×1** | Companion square; smallest link tiles. |
| B | Fixed **5×5** with mostly **2×1** | Larger tiles; explicit k=8 art direction. |
| **C** | **No special k=8** | Same search as other k: valid solid rectangle, optimize **score** (see below). |
| D | Fixed **4×5** / **5×4** | Wide strip variant. |

**Decision: C (confirmed 2026-10-10).**

**Why C:** Aligns with OQ-3: one **`packOnboardingIsland`** search rather than a growing override table. Companion **4×4** / **5×5** examples are **illustrations**, not normative for k=8.

**Rejected alternatives (revisit if…):**

- **A** or **B** — If design wants a **pinned screenshot** for “all starters checked” marketing or store assets. *Revisit when:* add `linkFootprints(8)` override in part 3 without changing the default solver path.
- **D** — If a horizontal “ribbon” is preferred over square for k=8 only.

**Spec implication — default score** (implementation plan may refine weights):

1. Must produce a **solid** rectangle packing.
2. Minimize **|W − H|** (squarer bbox).
3. Among ties: prefer **larger total link footprint area** (fewer forced **1×1** links).
4. Among ties: prefer **taller temperature** when OQ-3 allows **1×2**.

`linkFootprints(k)` for k≠8 may still ship as **hints** to prune search (companion draft table); for **k = 8** no row is authoritative—solver runs the same candidate generation as for other k.

### OQ-5 — Packer failure fallback?

**Question:** If no solid packing is found, escalate, error, or fall back to today’s `placeMissing` + `placeNew`?

| ID | Option | Summary |
|----|--------|---------|
| **A** | **Escalate** then succeed | Widen search (footprint variants, temperature 1×1-only pass, bbox sizes, …) until a pack exists. |
| B | **As-Is fallback** | Immediately use legacy strip + per-link `placeNew`. |
| C | **Block Finish** | Inline wizard error; user retries. |
| D | **Partial island** | System preset + loose links. |

**Decision: A with terminal fallback B (confirmed 2026-10-10).**

Primary path: **escalation ladder** (documented in implementation plan) must run to completion for all **supported** inputs (k 0…8, default six system widgets, hint vs temperature). **Only if** the ladder exhausts without a pack: **fallback B** — system layout as today’s `placeMissing` (for first screen when applicable) and each new favorite via **`placeNew`**; island invariants are **not** guaranteed. **Log** (console / debug) that fallback ran; v1 tests aim for **zero** fallback on the acceptance matrix.

**Rejected alternatives (revisit if…):**

- **C** — If silent degradation is unacceptable and a visible failure is better than a strip layout. *Revisit when:* telemetry shows fallback B in the wild.
- **D** — Never matched “one island”; keep for historical comparison only.

**Spec implication:** Finish **succeeds** from the user’s perspective even on fallback B; QA treats any fallback in E2E as a **failure** unless testing the ladder itself.

### OQ-6 — Max island height vs first screen?

**Question:** May the island bbox be **taller than `viewportRows`** at Finish, or must it fit the first screen?

| ID | Option | Summary |
|----|--------|---------|
| A | No row limit | Any solid bbox; center per companion; scroll if needed. |
| B | Hard **H ≤ viewportRows** | Discard taller packings. |
| **C** | **Soft limit** | Score **prefers** packings that fit entirely in the first screen; allow taller if no fitting pack exists. |
| D | Area cap only | Unusual; not proposed. |

**Decision: C (confirmed 2026-10-10).**

**Why C:** On reference **1280×800**, typical islands (k≤8) stay on screen; tall **5×5** is penalized but still allowed if the solver cannot fit otherwise—works with OQ-5 escalation without forcing fallback B.

**Rejected alternatives (revisit if…):**

- **B** — If “no scroll on first paint after onboarding” becomes a hard product requirement. *Revisit when:* E2E on low heights (`dg-48`-class) must pass with zero scroll.
- **A** — If soft penalty is too weak and tall islands ship too often. *Revisit when:* score weights are tuned in implementation.

**Spec implication:** At Finish, pass **`screen.rows`** (same `viewportRows` inputs as boot) into the packer. **Score** (after solid + squarish, OQ-4): add tier **prefer bbox height ≤ screen.rows** (after centering shift, max occupied row index < rows). Taller packings remain **legal** with lower rank. Acceptance on **1280×800**: document expected row counts per k; optional E2E assert **no vertical scroll** for matrix where a fitting pack exists.

### OQ-7 — Hidden weather metrics at Finish?

**Question:** Does the packer assume the **full six** default system tiles or only **widgets that exist and are shown** at Finish?

| ID | Option | Summary |
|----|--------|---------|
| **A** | **On-desk members only** | Island input = visible system widgets (enabled metrics, hint or temperature, chrome) + **k** added favorites; footprints per actual ids. |
| B | Always six slots | Hidden metrics still occupy cells (conflicts with hide). |
| C | v1 assumes six | Undefined edge cases → fallback B. |
| D | Partial set → fallback B | Skip custom pack when not six. |

**Decision: A (confirmed 2026-10-10).**

**Why A:** Hidden metrics must not reappear in layout math; island area matches what the user will see when the veil drops.

**Rejected alternatives (revisit if…):**

- **C** — If implementation cost of variable system piece count is too high for v1. *Revisit only as schedule cut,* not product preference (owner chose A for correctness).
- **B** / **D** — Listed for completeness; incompatible with hide semantics or A.

**Spec implication:**

1. **`collectIslandMembers(state)`** after favorites exist: filter `weather-metric` with `enabled !== false`; include `weather:hint` **or** `weather:temperature` per city; always `chrome:settings`, `chrome:add`; all new favorite ids.
2. **Footprint map** per id (metrics from `defaultSize` / part 1; chrome 1×1; links from solver candidates).
3. Acceptance matrix includes cases with **one metric hidden** before Finish (if product allows hide pre-complete—else unit-only): pack uses **five** metrics + chrome, not six.
4. Companion draft table “six system tiles” applies to **default** install only; solver generalizes to **n** system pieces.

### OQ-8 — How pack results become stored `grid`?

**Question (plain):** The packer lays out an island in a **small local grid** (0…W−1), then moves the cluster to the **center of the real desk**. What numbers do we **write to storage**?

| ID | Option | Summary |
|----|--------|---------|
| A | **Final desk cells only** | Compute each widget’s position on the full desktop grid, then persist with today’s v3 rules (`toStored` after displayed placement). |
| **B→A** | **Local pack, one shift, then A** | (1) Pack in local coordinates. (2) Apply one **island translate** `(dx, dy)` so the bbox meets the Finish center target (OQ-6). (3) Write **displayed** grids and **`toStored`** per widget in one mutate — same as after drag. |
| C | Reuse migrate **`centerShift`** only | Shift bbox to center line; does **not** match viewport + first-screen vertical target from mockups. |
| D | New coordinate convention | Rejected. |

**Decision: B→A (confirmed 2026-10-10).**

**Why B→A:** Tests and companion JSON stay in **local** layouts; production storage stays **unchanged** v3 (no new migration). Finish centering is **explicit translate**, not the v2→v3 migration helper.

**Rejected alternatives (revisit if…):**

- **C** — If we ever drop custom vertical centering and only care about horizontal bbox centering. *Revisit when:* product aligns Finish with `centerShift` semantics only.
- **A without documented local step** — Still allowed in code if implementation packs directly in displayed space; spec requires the **same outcome** as B→A (one rigid motion for the whole island, no per-widget drift).

**Spec implication:** `packOnboardingIsland` returns local placements + `(dx, dy)` or equivalent; apply shift using **current `columns`** and `screen` from Finish; persist via existing widget service / `toStored`. Unit tests: round-trip **displayed ↔ stored** for golden k=0 and k=3.

## Acceptance scenarios

Common setup unless noted: harness **1280×800**; `gridMetrics` → cell **72**, gap **8**, pad **16**; **14** columns; fresh profile or `clearAll` + onboarding auto-open; weather fixtures as `dg-15` / `dg-60`; wizard **Finish** completes. **Island** = all `[data-widget-id]` on desk after unveil. **k** = added favorites (OQ-2).

**Matrix (must be covered by automated tests):**

| Axis | Values |
|------|--------|
| **k** | **0, 1, 2, 3, 4, 5, 6, 7, 8** (achieved via checkbox selection on step 2; k = 0 = none checked) |
| **City** | **saved** on step 1 (temperature tile) · **skipped** (hint tile) |
| **Dedupe** | at least one run where a checked starter URL **already exists** → lower effective k |
| **Hidden metric** | unit (and E2E if hide is reachable pre-Finish): one metric `enabled: false` → pack omits it |

Every matrix cell that the product allows must satisfy **AS-POG-01** and **AS-POG-02**. Cells **k = 0** and **k = 3** with city saved also satisfy **AS-POG-03** (golden). **Fallback B** must not occur on the full matrix (AS-POG-10).

### AS-POG-01 Solid island after Finish
- Given: any allowed matrix cell above.
- When: Finish succeeds and veil drops.
- Then: union of island widgets forms a **solid axis-aligned rectangle** on the grid (no empty cell inside bbox); no two widgets overlap.
- Verified by: unit `assertSolidRectangle` on displayed layout; E2E geometry script per k group.

### AS-POG-02 Island centered at Finish
- Given: same.
- When: measuring displayed positions at reference viewport.
- Then: island bbox center matches **islandCenterTarget** within **≤ half a cell** horizontally and vertically (integer grid quantization allowed).
- Verified by: unit at 1280×800; E2E spot-check k ∈ {0, 3, 8}.

### AS-POG-03 Golden layouts (regression)
- Given: **k = 0**, city saved or skipped (hint vs ° only id differs); **k = 3**, three default starters added, city saved.
- When: pack completes without fallback.
- Then: displayed `(x, y, w, h)` per widget id match pinned fixtures **GOLDEN_K0** / **GOLDEN_K3** (from companion **A** / **B1**, 14 columns, 1280×800).
- Verified by: unit only (deterministic).

### AS-POG-04 k equals added favorites
- Given: step 2 checks **N** starters, one checked URL already a favorite.
- When: Finish.
- Then: exactly **N − 1** new favorite tiles; packer used **k = N − 1** footprints (not N).
- Verified by: unit + E2E seed.

### AS-POG-05 City vs hint membership
- Given: Finish with city saved vs Skip city on step 1.
- When: desk unveiled.
- Then: `#weather:temperature` or hint id present per city rules; packer input matches OQ-7; island still solid.
- Verified by: E2E pairs for each k in {0, 3} minimum; unit for all k.

### AS-POG-06 Hidden metric excluded
- Given: before Finish, one weather metric hidden (`enabled: false`) in storage (test seed).
- When: pack runs.
- Then: hidden id absent from island; solid rectangle on remaining members; no hole where hidden tile was.
- Verified by: unit; E2E if feasible without violating wizard non-goals.

### AS-POG-07 System tiles move when k > 0
- Given: k ≥ 1.
- When: comparing displayed grid before pack (boot strip) vs after Finish (not user-visible today — unit simulates).
- Then: at least one system widget `grid` changes from boot placement.
- Verified by: unit integration with `applyOnboardingIslandLayout`.

### AS-POG-08 No re-pack on reload
- Given: Finish completed, desk visible.
- When: reload tab at same size.
- Then: every widget `grid` unchanged; island still solid.
- Verified by: E2E one k = 3 path.

### AS-POG-09 No re-pack on resize
- Given: after Finish at 1280×800.
- When: resize to 1440×900 (or harness second size).
- Then: stored grids unchanged (display may reflow columns per `displayLayout` rules — assert **stored** `x,y,w,h` identical).
- Verified by: E2E or unit store read.

### AS-POG-10 Primary path only on matrix
- Given: full **k × city** product matrix (k = 0…8 × city × dedupe case).
- When: `packOnboardingIsland` in tests.
- Then: **no** fallback B; no `quietTab:onboardingPackFallback` log.
- Verified by: unit matrix job.

### AS-POG-11 Stored frame v3
- Given: any successful pack.
- When: reading sync shards.
- Then: `grid.x` is **stored** (signed from center line); round-trip `toDisplayed(toStored(g))` equals displayed placement used for render.
- Verified by: unit on goldens.

### AS-POG-12 Finish k = 0 without addFavorites
- Given: no starters checked.
- When: Finish.
- Then: no favorite tiles; system-only island; AS-POG-01/02; matches **GOLDEN_K0** when city/hint variant pinned.
- Verified by: E2E `dg-60` zero-links path extended; unit.

### AS-POG-13 E2E matrix groups (k sweep)
- Given: harness onboarding wizard.
- When: for each **k = 0…8**, select exactly **k** starters (fixed selection rule: first k rows in table order), city saved, Finish.
- Then: AS-POG-01/02 visual/script checks; tile count = **6 + k** (or **5 + k** if one metric hidden scenario separate).
- Verified by: `dg-61-post-onboarding-grid.mjs` groups **1–9** (one per k).

### AS-POG-14 E2E city sweep
- Given: k = 3 and k = 0.
- When: Finish with city **saved** vs **skipped**.
- Then: correct hint vs temperature; island solid and centered.
- Verified by: `dg-61` groups **10–13**.

### AS-POG-15 E2E eight starters checked
- Given: all eight starters checked, city saved.
- When: Finish.
- Then: **k = 8** favorites; solid island; centered; no fallback.
- Verified by: `dg-61` group **14** (not a separate product rule for 4×4 — solver chooses footprint).

## Non-goals (v1)

- Re-pack on reload, resize, or Add link (algorithm may be reused later; see initiative note).
- Replacing onboarding wizard UX (`docs/onboarding-wizard.md`).
- Users who dismissed weather entirely before wizard (unchanged non-goal).
- Pinning marketing screenshot for k = 8 (OQ-4 C).

## Review focus

- Finish veil → unveil: user never sees boot strip or intermediate `placeNew` link positions.
- Hint vs temperature footprint parity (OQ-3).
- Horizontal/vertical center matches companion crosshair rule.
- **Do not** regress `dg-60` wizard flows; extend for layout assertions.
- Part 1 prerequisite: link **1×2** in solver does not break chrome **1×1** invariant.

## Process

Pipeline per `quiet-tab-pipeline` when implementation starts: spec review → plan → kickoff; design checkpoint against companion **A** / **B1** frames; stage 4 implements `onboardingLayout.js` before wiring Finish.
