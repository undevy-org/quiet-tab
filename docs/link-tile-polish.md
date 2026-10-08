# Link tile polish: Add link size and 2×2 icon centering

## Status

`draft`

Decision: **do it**. Owner request 2026-10-07 (pipeline stage 0, run #19 / `dg-61`): two small UI fixes in one run — restore the **Size** row on **Add link**, and **center the favicon/letter horizontally** on **2×2** favorite tiles (label/host block stays left-aligned).

Owner decision (2026-10-07): combine ideas 2 and 3 into a single run (no separate specs).

**Data compatibility: not required.**

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-07 | Restore Size on Add link; center 2×2 tile icon. | `confirmed` | `src/newtab.js:454` comment "add dialog adds 1×1"; `src/newtab.css:266-272` 2×2 `align-items: flex-start`. |

## Current behaviour (`main` @ `7f6f69d`)

Baseline for this spec is the current `main` HEAD at stage 1 review (after onboarding-wizard merge). Re-check line numbers if `main` moves before implementation.

- **Add link** (`createFavoriteForm(null)`): rows Link, Name, Icon, Custom icon, Color — **no Size row** (`src/newtab.js:453-454`, Size only when `isEdit`). Submit uses `readFavoriteFormPayload` only (`src/newtab.js:1661-1666`); `addFavorite` gets default grid **1×1** from placement (`widgetsService.addFavorite`, default `w`/`h`).
- **Edit link** includes Size (`createSizeControl`, `readSize` on submit) (`src/newtab.js:1688-1689`).
- **2×2 tile** (`data-w="2"[data-h="2"]`): `flex-direction: column; align-items: flex-start`; icon sits left while text is full width (`src/newtab.css:266-285`, `:351-355`).

## Default decisions (owner can override)

1. **Add link Size row** matches Edit link: `createFormRow("Size", createSizeControl({ w: 1, h: 1 }))` inserted before the footer (after Color row). Default selection **1×1**. On submit, `readSize(data.get("size"))` merges into the payload passed to `widgetsService.addFavorite` so placement uses the chosen `w`/`h` (same validation as edit).
2. **2×2 icon centering** applies only to `.favorite-icon` and `.favorite-letter` on `.favorite-tile[data-w="2"][data-h="2"]`: horizontal center within the tile content box; `.favorite-tile__text` remains `align-self: stretch` / left-aligned text. Do not change 1×1 or 2×1 layout.
3. **No copy, token, or storage changes.** **Data compatibility: not required.**

## Scope

- `src/newtab.js`: `createFavoriteForm` add path; `add-link` submit handler.
- `src/newtab.css`: 2×2 icon alignment (e.g. `align-self: center` on icon, or `align-items: center` on column with text `width: 100%`).
- Unit tests: **required** update to `test/newtabSource.test.js` pin(s) so Add link includes the Size row (default 1×1) and add-link submit uses `readSize` like edit-link; additional DOM asserts optional if `dg-61` covers AS-LP-01/02.
- E2E: new `dg-61-link-tile-polish.mjs` (AS-LP-01..03). Touch `dg-*` add-link scenarios only if they assert row count — list in run record if changed.
- Docs: `CHANGELOG.md` one line under `[Unreleased]`; no architecture change unless a one-sentence tile layout note is warranted.

## Process

Full UI pipeline (smaller scope; checkpoint may be lighter per plan). Branches: `docs/link-tile-polish-spec`, `feat/link-tile-polish`, notes `docs/link-tile-polish-plan`.

## Non-goals

- Default size for drag-add or other entry points.
- Weather tile sizes or chrome tiles.
- Changing 2×2 label typography or host line.
- **Data compatibility: not required.**

## Accepted exceptions

- **2×2 letter icon** centers the same as favicon (both 40×40 block).

## Acceptance scenarios

### AS-LP-01 Add link dialog shows Size defaulting to 1×1
- Given: Add link open.
- When: inspecting the form.
- Then: Size radiogroup present with 1×1 selected.
- Verified by: E2E `dg-61` group 1.

### AS-LP-02 Add link creates a 2×1 tile when Size is 2×1
- Given: Add link, valid url, Size 2×1.
- When: Save/submit.
- Then: new favorite stored and drawn with `w: 2, h: 1`.
- Verified by: E2E `dg-61` group 2.

### AS-LP-03 2×2 favorite icon is horizontally centered
- Given: a 2×2 favorite on the grid (E2E may seed one favorite with `grid: { w: 2, h: 2 }` in sync storage, or create via Add link with Size 2×2 after Task 1).
- When: comparing icon center x to tile center x.
- Then: within ±1 px; label block still left-aligned.
- Verified by: E2E `dg-61` group 3.

## Review focus

- None (owner confirmed defaults).

## Visual reference

No separate mockup; reference production dialogs for Size control and a 2×2 tile after CSS change.
