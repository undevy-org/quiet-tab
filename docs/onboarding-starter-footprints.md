# Onboarding starters: step 2 UI and link footprint hints

## Status

`draft` — **OQ-P3-1…OQ-P3-8 resolved** per owner recommendations (2026-10-10). **Part 3** of the onboarding-grid initiative (after **part 1** `docs/tile-size-1x2.md`, alongside **part 2** `docs/post-onboarding-grid.md`).

Decision: **do it**. (1) Replace step 2’s three-zone row (checkbox · text · preview) with **one full-width starter row** — the row looks like a grid link tile; the **checkbox is the 20×20 control on the right**, not a separate column. (2) Ship a **`linkFootprintHints(k)`** table (j-th added starter among checked rows in `ONBOARDING_STARTER_LINKS` order) to **prune** the part 2 packer search; the solver **may widen** candidates on escalation (part 2 OQ-5).

**Data compatibility: not required.**

Terms: **k** = count of favorites **actually added** on Finish (part 2 OQ-2 A). **j** = 1…**k**, index of an added link in **table order** among checked starters (not the row number in the full list of eight). **Hints** = preferred `{w,h}` per j for a given k; **not** a guarantee of final stored grids. **Companion (step 2)** = `.superpowers/brainstorm/69334-1791650307/content/onboarding-wizard-step2-starters-v1.html` (To-Be panel). **Companion (footprints)** = `onboarding-grid-algorithm-data.json` in the same brainstorm session (canonical source for the hint table below, aligned with golden **A** / **B1**).

Related: `docs/onboarding-wizard.md` (Finish, starters table), `docs/post-onboarding-grid.md` (island packer), `src/onboardingStarters.js`, `src/surfaces.css`.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-10 | Part 3 = starter footprints table + onboarding; defer from part 1/2 specs. | `confirmed` | `docs/tile-size-1x2.md`, `docs/post-onboarding-grid.md`. |
| 2026-10-10 | Step 2: cell **is** the control — full width, checkbox **right**, vertically centered; no duplicate row label. | `confirmed` | Companion `onboarding-wizard-step2-starters-v1.html`. |
| 2026-10-10 | OQ-P3-1: one spec (footprints + wizard UI amendment). | `confirmed` | This document. |
| 2026-10-10 | OQ-P3-2: hints **prune** search; solver may override (part 2 OQ-4 C). | `confirmed` | § Open questions. |
| 2026-10-10 | OQ-P3-3: footprint by **j-th added** among checked (table order). | `confirmed` | § `linkFootprintHints`. |
| 2026-10-10 | OQ-P3-4: `addFavorites` keeps interim **2×1** until repack. | `confirmed` | § Integration. |
| 2026-10-10 | OQ-P3-5: unchecked = mute **entire** row. | `confirmed` | § Step 2 UI. |
| 2026-10-10 | OQ-P3-6: checked = filled checkbox only; **no** primary border on row. | `confirmed` | § Step 2 UI. |
| 2026-10-10 | OQ-P3-7: canonize companion JSON (A/B1 goldens). | `confirmed` | § Hint table. |
| 2026-10-10 | OQ-P3-8: **not** a blocker for shipping part 2. | `confirmed` | § Default decisions. |

## Current behaviour (`main` at review time)

**Step 2** (`surfaces.css`, `newtab.js`): each starter is `label.onboarding-wizard__row` with a **20×20** checkbox, **`onboarding-wizard__row-label`** (duplicate title), and **`onboarding-wizard__preview`** → **`onboarding-wizard__preview-tile`** (fixed **152×72** preview). Unchecked rows mute **only** the preview (`opacity` + grayscale); the text label stays full contrast.

**Finish:** `docs/onboarding-wizard.md` decision 5 passes **`w: 2`, `h: 1`** per checked starter into `addFavorites`. Part 2 replaces interim placement with **`packOnboardingIsland`**; until part 2 ships, links stay **`placeNew`** 2×1.

**Packer (part 2, when implemented):** decision 12 allows **`{1×1, 1×2, 2×1, 2×2}`** per link until this spec’s hints are wired.

## Default decisions (owner can override)

1. **Single spec (OQ-P3-1 B).** This document is the source of truth for step 2 row UI **and** `linkFootprintHints`. Implementation updates `docs/onboarding-wizard.md` decision 5 UI bullets and affected **AS-OB** scenarios to match (no separate UX spec).

2. **Hints, not law (OQ-P3-2 B).** Export **`linkFootprintHints(k)`** from `src/onboardingLayout.js` (or `src/onboardingStarters.js` if kept data-only). For each island link piece **j** (1…k), the packer’s **first** search pass uses **only** the hinted footprint (if valid). On escalation (part 2 decision 10), widen that piece to the full candidate set **`{1×1, 1×2, 2×1, 2×2}`** in a documented order. Hints **never** skip the solver or scoring.

3. **Index j (OQ-P3-3 B).** After `addFavorites`, build the ordered list of added widget ids by walking **`ONBOARDING_STARTER_LINKS`** in order and keeping **checked** rows that produced an id. Piece **j** maps to the **j-th** id in that list. Hint row **`linkFootprintHints(k)[j−1]`** applies to that widget. **Not** keyed by slot 1…8 in the full table when the user skips rows.

4. **Interim add size (OQ-P3-4 A).** Do **not** change `onboarding-wizard.md` Finish payload **`w: 2`, `h: 1`** for this run. Part 2 Finish repack overwrites all grids before unveil; hints affect **packer input only**.

5. **Part 2 may ship first (OQ-P3-8).** Part 2 implementation may use decision 12 (full four footprints per link) until part 3 lands. Part 3 is a **follow-up** PR: hints module + step 2 CSS/DOM. No change to island invariants.

6. **Step 2 row structure.** Replace the three-zone row with one control per list item:

   ```html
   <li>
     <label class="onboarding-wizard__starter">
       <input type="checkbox" … />
       <span class="onboarding-wizard__starter-surface">
         <img class="onboarding-wizard__starter-icon" … />
         <span class="favorite-tile__label">…</span>
         <span class="onboarding-wizard__starter-check" aria-hidden="true"></span>
       </span>
     </label>
   </li>
   ```

   - **`onboarding-wizard__starter`:** `display: block`, `width: 100%`, `height: var(--cell-size)` (72 at reference), `min-height: 44px`, `position: relative`, `cursor: pointer`.
   - **Checkbox:** `position: absolute; inset: 0; opacity: 0;` full-row hit target; keep native input for a11y (`aria-label` unchanged: `Add {label} to your grid`).
   - **`onboarding-wizard__starter-surface`:** flex row, `align-items: center`, `gap: 8px`, `padding: 0 10px`, same border/radius/background as today’s **`onboarding-wizard__preview-tile`** (`surfaces.css` tokens). **`pointer-events: none`** on surface (clicks hit the input).
   - **Icon:** **22×22**, `border-radius: 4px` (reuse preview icon rules / letter fallback from `createOnboardingStarterPreview`).
   - **Label:** `favorite-tile__label` only **inside** the surface — **remove** `onboarding-wizard__row-label` and **`onboarding-wizard__preview`** wrapper.
   - **`onboarding-wizard__starter-check`:** **20×20**, `border-radius: 6px`, same border/background/checked glyph as today’s row checkbox (`::after` mask or equivalent). Positioned as **last flex item** (right side), **vertically centered** via flex; `flex-shrink: 0`, `margin-left: 4px` optional.

7. **Step 2 visual states (OQ-P3-5 A, OQ-P3-6).**
   - **Unchecked:** apply **`opacity: 0.4`** and **`filter: grayscale(1)`** to **`onboarding-wizard__starter-surface`** (entire row, including icon, label, and empty checkbox chrome).
   - **Checked:** checkbox uses **primary** fill + contrast glyph (today’s checked style). **Do not** add a **primary** border on the full surface (tile border stays **`var(--border)`**).
   - **Focus-visible:** ring on the surface (same pattern as today’s checkbox focus on the row).

8. **Remove obsolete step 2 CSS** when implementing: `.onboarding-wizard__row`, `.onboarding-wizard__row-label`, `.onboarding-wizard__preview`, `.onboarding-wizard__preview-tile`, `.onboarding-wizard__preview-icon` (unless letter fallback class is renamed and kept), and row `:has(> input:checked)::before` glyph (glyph moves to **`.onboarding-wizard__starter-check`**). Update `test/borderContrast.test.js` selector if it pins the old checkbox path.

9. **Hint table source (OQ-P3-7).** The normative **hint sequences** for implementation and unit tests are the **`linkFootprints`** column in § **Hint table** below (derived from brainstorm `onboarding-grid-algorithm-data.json`, **f0…f{k−1}** order, goldens **k=3 → B1**). If companion JSON and this table diverge, **this spec wins**.

10. **k = 0.** `linkFootprintHints(0)` returns **`[]`** (no link pieces).

11. **Dedupe.** If checked count exceeds **added** count, **k** for hints is **added** length; only the first **k** entries of the **checked-in-order** id list receive hints (same j semantics).

## `linkFootprintHints(k)`

Pure function: **`linkFootprintHints(k: number) → ReadonlyArray<{ w: 1|2, h: 1|2 }>`** with **`length === k`**.

For each **j**, the packer seeds piece **j** with candidates **`[hint[j−1]]`** first; escalation appends the other three footprints per part 2.

### Hint table (canonical)

| k | Link footprints j = 1 … k (w×h) | Golden / note |
|---|----------------------------------|---------------|
| 0 | — | System-only island (part 2 **A**) |
| 1 | 1×1 | 3×3 companion |
| 2 | 2×1, 2×1 | |
| 3 | **1×2, 2×2, 1×1** | **B1** |
| 4 | 2×2, 2×1, 1×1, 1×1 | |
| 5 | 2×1, 2×1, 2×1, 1×1, 1×1 | |
| 6 | 2×2, 2×2, 2×2, 2×1, 2×1, 1×1 | 5×5 companion |
| 7 | 2×2, 2×2, 2×2, 2×1, 1×1, 1×1, 1×1 | 5×5 companion |
| 8 | 1×1 × 8 | Illustrative dense square; **solver chooses** final footprints (part 2 OQ-4 C) — hints are **search seeds only** |

**Example (k = 3, default three checked):** ChatGPT → 1×2, YouTube → 2×2, X → 1×1. **Example (k = 3, GitHub + Gmail + Amazon checked):** j = 1 → 1×2, j = 2 → 2×2, j = 3 → 1×1 (same hint row; not GitHub’s row index 4).

## Scope

- `src/onboardingLayout.js` (or adjacent): **`linkFootprintHints`**, unit tests for all k and j length.
- `src/newtab.js`: `buildOnboardingStep2` / `createOnboardingStarterPreview` → new starter row DOM; remove preview-only path.
- `src/surfaces.css`: new starter row rules; delete obsolete row/preview rules.
- `docs/onboarding-wizard.md`: decision 5 UI description; replace **AS-OB** rows that assert three-zone row / preview-only mute (see § Acceptance).
- `test/onboardingLayout.test.js` or `test/onboardingStarters.test.js`: hint table pins.
- E2E: extend **`dg-60`** (or small **`dg-63`**) — step 2 full-width row, checkbox right, unchecked mute; optional visual regression vs companion.
- **Part 2 wiring:** when both ship, `collectIslandMembers` / `packOnboardingIsland` reads hints for link pieces (optional PR order: part 2 first without hints, then part 3 connects).

## Integration

**Finish (unchanged payload):** checked starters still call `addFavorites` with **`w: 2`, `h: 1`** until a future spec explicitly changes interim size.

**Packer (part 2):** for each favorite id in the ordered added list, set `candidates = [hint, …widenOnEscalation]`. Scoring and solid-rectangle rules unchanged.

**Visual companion:** To-Be panel in `onboarding-wizard-step2-starters-v1.html` is the layout reference; implementation class names follow § decision 6 (companion used `starter-tile-check*` — rename to `onboarding-wizard__starter*` in product).

## Open questions (owner decisions)

### OQ-P3-1 — Scope of part 3 document

**Question:** Footprints only, or footprints + step 2 UI?

| ID | Option | Summary |
|----|--------|---------|
| **A** | Footprints only | New doc for `linkFootprintHints`; wizard UI stays in `onboarding-wizard.md` patch. |
| **B** | **Footprints + step 2 UI** | One spec owns hints table and row redesign; `onboarding-wizard.md` updated at implement time. |
| C | Two public specs | Split `onboarding-starter-footprints.md` and `onboarding-wizard-step2-ui.md`. |

**Decision: B (confirmed 2026-10-10).**

**Why B:** One initiative slice, one review; UI and hints share the “starter link” product surface.

**Rejected alternatives (revisit if…):**

- **A** — If design wants independent approval cycles for UX vs algorithm. *Revisit when:* step 2 ships before part 2 packer without touching hints.
- **C** — If the hint table grows large enough to warrant a separate maintainer. *Revisit when:* non-onboarding consumers appear.

---

### OQ-P3-2 — Hint table normativity

**Question:** Must the packer use exactly the table footprints?

| ID | Option | Summary |
|----|--------|---------|
| A | **Normative** | Stored grids must match hints for each (k, j) on the standard matrix. |
| **B** | **Hints prune search** | Try hinted footprint first; solver may pick other valid footprints per part 2 scoring/escalation. |
| C | Hints for k≤7 only | k = 8 fixed eight 1×1; other k normative. |

**Decision: B (confirmed 2026-10-10).**

**Why B:** Preserves part 2 **OQ-4 C** and escalation; companion k = 8 layout is not a hard product rule.

**Rejected alternatives (revisit if…):**

- **A** — If marketing needs pixel-stable screenshots per k without solver variance. *Revisit when:* acceptance adds grid `data-w`/`data-h` pins per k on the matrix.
- **C** — If k = 8 should be the only “free” k. *Revisit when:* store listing demands eight 1×1 in a 4×4 block.

---

### OQ-P3-3 — Hint index semantics

**Question:** Footprint keyed by table slot 1…8 or by j-th added among checked?

| ID | Option | Summary |
|----|--------|---------|
| A | Slot in full table | Row 5 (Gmail) always uses Gmail’s footprint column. |
| **B** | **j-th among checked** (table order) | k = 3 → three hints from the k = 3 row regardless of which three sites. |
| C | j-th among checked (check order) | Depends on click order (not today’s model). |

**Decision: B (confirmed 2026-10-10).**

**Why B:** Matches part 2 E2E “first k rows” and dedupe-safe **k = added**; one row per k in the hint table.

**Rejected alternatives (revisit if…):**

- **A** — If specific brands must always spawn as 2×2 when selected. *Revisit when:* `ONBOARDING_STARTER_LINKS` gains per-row `defaultFootprint`.
- **C** — Not applicable without persisting click order.

---

### OQ-P3-4 — `addFavorites` interim grid

**Question:** Pass hinted size into `addFavorites` before repack?

| ID | Option | Summary |
|----|--------|---------|
| **A** | **Keep 2×1 interim** | Hints only in packer; interim grids invisible under veil. |
| B | Pass hint per row | `addFavorites` uses `linkFootprintHints` per j at add time. |
| C | Placeholder 1×1 | Minimize interim cells until pack. |

**Decision: A (confirmed 2026-10-10).**

**Why A:** Decouples part 3 from `addFavorites`; part 2 already overwrites grids on Finish.

**Rejected alternatives (revisit if…):**

- **B** — If Finish repack is delayed or removed. *Revisit when:* part 2 non-goals change.
- **C** — If interim layout becomes visible in a bug or partial Finish path.

---

### OQ-P3-5 — Unchecked row appearance

**Question:** What is muted when a starter is unchecked?

| ID | Option | Summary |
|----|--------|---------|
| **A** | **Entire row** | Surface + checkbox chrome muted (companion). |
| B | Icon + label only | Checkbox stays full contrast on the right. |
| C | No mute | Only empty checkbox state. |

**Decision: A (confirmed 2026-10-10).**

**Why A:** Single visual object; “off the grid” reads clearly.

**Rejected alternatives (revisit if…):**

- **B** — If users miss that the row is tappable when unchecked. *Revisit when:* usability test shows low discoverability.
- **C** — If contrast audit flags muted checkbox as confusing.

---

### OQ-P3-6 — Checked row chrome

**Question:** Primary border on the full row when checked?

| ID | Option | Summary |
|----|--------|---------|
| A | Primary **2px** border on surface | Companion early draft. |
| **B** | **Checkbox only** | Surface border unchanged; checked = filled box + glyph. |
| C | Accent glow on surface | Favorite accent shadow on row. |

**Decision: B (confirmed 2026-10-10).**

**Why B:** Avoid double “selected” signals; grid tiles do not gain primary outline on select.

**Rejected alternatives (revisit if…):**

- **A** — If step 2 must mirror edit-mode selection chrome. *Revisit when:* design system adds “list tile selected” token.
- **C** — If brand wants per-starter accent on the row before add.

---

### OQ-P3-7 — Table provenance

**Question:** Where does the k → footprints table come from?

| ID | Option | Summary |
|----|--------|---------|
| **A** | **Canonize companion JSON** | This spec’s table + tests; tweak only for A/B1 alignment. |
| B | Re-solve manually | New table independent of brainstorm. |
| C | Generated at build | Script from packer goldens. |

**Decision: A (confirmed 2026-10-10).**

**Why A:** Brainstorm work already tuned for squarer islands; goldens **A** / **B1** are regression anchors.

**Rejected alternatives (revisit if…):**

- **B** — If companion recipes are rejected in design review. *Revisit when:* part 2 goldens fail with hint-first search.
- **C** — If the table changes every sprint; not needed at current scale.

---

### OQ-P3-8 — Ship order vs part 2

**Question:** Must part 3 ship before part 2?

| ID | Option | Summary |
|----|--------|---------|
| A | Part 3 blocks part 2 | No island pack without hints + UI. |
| **B** | **Part 2 may ship first** | Full search (decision 12); part 3 follows. |
| C | UI only first | Step 2 before packer hints. |

**Decision: B (confirmed 2026-10-10).**

**Why B:** Reduces coupling; hints are an optimization and UX slice.

**Rejected alternatives (revisit if…):**

- **A** — If product refuses to ship island pack without the new step 2 list. *Revisit when:* launch bundles onboarding visual refresh with grid island.
- **C** — If hints are worthless without UI copy change (not the case).

## Accepted exceptions

- **Solver** may assign footprints **≠** hints when scoring or escalation requires it (OQ-P3-2 B).
- **Companion class names** (`starter-tile-check*`) differ from shipped **`onboarding-wizard__starter*`**; pixel layout must match.
- **Letter favicon fallback** on step 2: same behaviour as today’s preview icon letter span (class name may change).

## Acceptance scenarios

Common setup: harness **1280×800** unless noted; wizard step 2; eight starters per `onboardingStarters.js`.

### AS-OSF-01 Step 2 row is full-width single surface
- Given: onboarding step 2 visible.
- When: inspecting any starter list item.
- Then: one `label.onboarding-wizard__starter` per row; **no** `onboarding-wizard__row-label`; **no** `onboarding-wizard__preview`; surface **width 100%** of list content; height **72px** at reference cell size.
- Verified by: E2E / DOM assertion; `newtabSource` pin optional.

### AS-OSF-02 Checkbox on the right, vertically centered
- Given: step 2, any row.
- When: measuring layout.
- Then: **20×20** check control is the **last** item in the surface flex row; vertically aligned with icon and label; native `input` covers full label for hit target.
- Verified by: E2E; visual vs companion To-Be.

### AS-OSF-03 Unchecked row fully muted
- Given: one unchecked starter.
- When: inspecting surface.
- Then: `opacity` and grayscale match shipped intent (~0.4 + grayscale on **whole** surface).
- Verified by: E2E or computed style sample.

### AS-OSF-04 Checked row without primary surface border
- Given: checked starter.
- When: inspecting surface border and checkbox.
- Then: checkbox **primary** filled; surface border **not** primary 2px outline.
- Verified by: E2E.

### AS-OSF-05 Tab order and aria unchanged
- Given: step 2.
- When: tabbing.
- Then: order remains checkboxes → Back → Finish; each checkbox keeps `aria-label` `Add {label} to your grid`.
- Verified by: `docs/onboarding-wizard.md` AS-OB-17 adapted.

### AS-OSF-06 `linkFootprintHints` table pins
- Given: unit test.
- When: `linkFootprintHints(k)` for k = 0…8.
- Then: lengths match k; values match § Hint table (including k = 3 → 1×2, 2×2, 1×1).
- Verified by: `test/onboardingLayout.test.js` or dedicated test file.

### AS-OSF-07 Hints map to j-th added id (table order)
- Given: k = 2 with rows 4 and 5 checked (GitHub, Gmail), both added.
- When: packer builds pieces from added ids.
- Then: first id gets **2×1**, second gets **2×1** from `linkFootprintHints(2)`; not slot-4/slot-5 columns.
- Verified by: unit test with mock id list.

### AS-OSF-08 Finish still sends 2×1 in add payload
- Given: part 2 not required for this assertion.
- When: Finish with checked starters (source or harness intercept).
- Then: `addFavorites` inputs still include **`w: 2`, `h: 1`** per row.
- Verified by: unit / `newtabSource` pin until part 2 removes visibility of interim grids entirely.

### AS-OSF-09 Packer tries hint before widen (when part 2 + part 3 both shipped)
- Given: `packOnboardingIsland` with k = 3, default ids.
- When: first search pass.
- Then: link pieces use hinted footprints before escalation widens candidates.
- Verified by: unit test on candidate ordering.

## Non-goals (v1)

- Changing starter **URLs**, labels, or default-checked set (`onboardingStarters.js` table).
- Persisting checkbox state across reloads (wizard decision 9 unchanged).
- Normative **island layout** or centering (part 2).
- Fourth size / tall weather CSS (part 1).
- Replacing **`dg-60`** wizard flow keys; extend, do not fork onboarding completion semantics.

## Review focus

- Step 2: no duplicate label; list scroll cap unchanged (`max-height` ~3.5 rows).
- Hint table matches **B1** for k = 3; part 2 golden tests still pass when hints are wired.
- Border contrast on **`.onboarding-wizard__starter-check`** (unchecked) vs surface background.
- Do not regress city step, Finish guard, or dedupe behaviour.

## Process

Pipeline per `quiet-tab-pipeline` when implementation starts: spec review → plan; may land **after** part 2 packer PR. Design checkpoint: companion **To-Be** panel + hint table row k = 3.

## Amendments to `docs/onboarding-wizard.md` (at implement time)

- **Decision 5 (UI):** describe full-width starter row (§ default decision 6); remove three-zone row / preview tile.
- **AS-OB** visual cases that reference separate preview mute or middle label: replace with **AS-OSF-01…05** or cross-link this spec.
- **Finish payload:** keep **`w: 2`, `h: 1`** (OQ-P3-4 A); add footnote pointing to part 2 repack + this spec’s hints.
