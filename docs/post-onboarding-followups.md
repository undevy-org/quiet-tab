# Post-onboarding follow-ups: focus after a failed Finish, a failed read-back, 56 px labels

## Status

`implemented` — closes backlog 76, 77 and 78 (Minor findings of run 25, `docs/post-onboarding-grid.md`); backlog 79 (`dg-70` network dependence) is a test-only fix. No new strings.

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`).

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-13 | "Do everything you can right now" on the Minor items left by run 25. | `confirmed` | Owner chat; notes `pipeline/backlog.md` 76–79. |

## Default decisions (owner can override)

1. **Focus after a failed Finish (backlog 77).** After the add error (`Couldn't add links. Try again.`) and after the completion-flag error (`Couldn't save setup. Try again.`) the buttons are enabled again and the focus moves to Finish, unless it is already inside the wizard. Before, the disabled pressed button dropped the focus to `body`.
2. **Read-back failure after the links are written (backlog 76).** If the add succeeded but reading the state back (or the heal) throws, Finish goes on: the wizard closes and the persistent failure message (`Couldn't restore your layout. Reload this tab.`, `docs/stale-tab-closeout.md`) shows; there is no add error. The links are saved and a reload shows them; a retry cannot add them again.
3. **Link labels at the 56 px cell (backlog 78).** At `:root[data-cell="56"]` the 1×2 link tile has 3 px side padding (label column 48 px) and a 10 px label; the 2×1 link label is 12 px. Every starter label (ChatGPT, YouTube, X, GitHub, Gmail, Spotify, Reddit, Amazon) sits on one line, unclipped. The 64 px and 72 px cells are unchanged (11 px and 13 px).
4. **`dg-70` (backlog 79).** The scenario fails the `/_favicon/` request, so the accent color of the added link no longer writes a 4th `set()` on a machine with a network.

## Scope

`src/newtab.js` (`layOutFinishIsland`, `restoreWizardFocusAfterFinishError`), `src/newtab.css`, `test/newtabSource.test.js`; E2E `dg-65` groups 20 and 21, new `dg-72-label-fit-56.mjs`, `dg-70` favicon route; docs: `CHANGELOG.md`, `docs/onboarding-wizard.md`, `docs/tile-size-1x2.md`.

## Acceptance scenarios

### AS-PF-01 Focus returns to Finish after a failed Finish
- Given: wizard on step 2, k = 3, the widgets write is rejected once (or the completion-flag write is rejected once).
- When: Finish.
- Then: the wizard stays on step 2 with the error text of the case; the focused element is the Finish button; Enter on it retries and closes the wizard with the island.
- Verified by: E2E `dg-65` group 20; source pin.

### AS-PF-02 Read-back failure after the write
- Given: wizard on step 2, k = 3, the first widgets write succeeds and the next read of the meta key is rejected.
- When: Finish.
- Then: the wizard closes, no add error, `#desktop-status` says `Couldn't restore your layout. Reload this tab.`; storage holds the island and three links; after a reload the desk shows the island with one set of three links and the wizard stays closed.
- Verified by: E2E `dg-65` group 21; source pin.

### AS-PF-03 Labels fit at the 56 px cell
- Given: window 320 px (4 columns, 56 px cell), one link tile alone, label each of the eight starters.
- When: the desk renders.
- Then: at 1×2 and at 2×1 every label is on one line and `scrollWidth <= clientWidth`; at 1280 px (72 px cell) and 500 px (64 px cell) the 1×2 label is 11 px and the 2×1 label 13 px.
- Verified by: E2E `dg-72`; source pin.

### AS-PF-04 AS-SFU-04 write count is network independent
- Given: `dg-70` on a machine with a network.
- When: the add of a link on a stale tab runs.
- Then: exactly 3 `set()` calls as before.
- Verified by: E2E `dg-70`.

## Review focus

- The focus move after the error must not fight the focus trap or the alert announcement (a11y lens).
- The message on a failed read-back is the existing persistent chip; it must not appear together with an add error.
- 10 px and 12 px labels at the narrowest cell stay readable and do not touch the other cells' type.

## Accepted exceptions

- Window widths up to 360 px only; labels longer than the starters may still ellipsize or wrap (3 lines on 1×2).
- No placeholder for a failed read-back other than the existing reload chip.

## Copy

No new strings. Existing: `Couldn't add links. Try again.`, `Couldn't save setup. Try again.`, `Couldn't restore your layout. Reload this tab.`.

## Non-goals

Changing the wizard UX, the 64 px and 72 px type scale, and the spec of `docs/post-onboarding-grid.md`.
