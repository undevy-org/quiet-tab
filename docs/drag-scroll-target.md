# Drag and scrolling: the drop target follows the page, the page does not slip after a drop

## Status

`draft` — revision 1 (2026-10-19, stage 0 of run 47). Run №47 (`drag-scroll-target`), row Р47 of the roadmap ("Drag и прокрутка", marathon `kickoffs/marathon-45-51.md`). Backlog items 18 and 19 (item 21 was closed by run 39, item 24 moved to Р42 and is done). Both items are first reproduced on `origin/main` (step 1 of the kickoff); the triage below is by reading `main` at `ed74a79` (runs 45 and 46 merged). Run 46 changed the document padding and `scroll-padding-bottom` for the status chip (`--status-reserve`) but touched nothing in the drag code (`beginPointerDrag` … `returnDraggedTile`), so the triage still holds.

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). Nothing is stored or migrated by this run; a drop writes exactly what it writes today.

Related: `docs/widget-drag-limits.md` (the whole window is the drop area, `maxDropRow`, the drag grid height), `docs/centered-grid.md`, `docs/layers-low-window.md` (the status chip reserve and `scroll-padding-bottom`; its AS-LLW-14 case 4 uses a drop), `src/newtab.js` (`beginPointerDrag`, `onDragPointerMove`, `autoscrollFrame`, `updateDragTarget`, `commitDrop`, `settleTileAt`, `cancelDrag`), `src/newtab.css` (`.desktop-grid { height: calc(var(--rows) …) }`, `.desktop` padding).

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| run #13 checkpoint | 18 (L1-02, Minor): the drop target is recomputed only in `pointermove` and in the autoscroll frame; a mouse wheel scroll with a still pointer leaves the outline and the drop on the old cell until the next move. Data are not hurt (outline and write agree). | `confirmed` by reading: no `scroll` listener exists (`grep` for `"scroll"` listeners in `src/newtab.js`: none during a drag); the only recompute paths are `onDragPointerMove` → `applyDragVisuals` and `autoscrollFrame` | decision 1 |
| run #13 final | 19 (L2-01, Minor): page scrolled to the bottom, the drag grid is higher than at rest; after the drop the grid shrinks, the browser clamps `scrollY` (264 → 184 at 1280×800, lowest row 12) and the tile lands 80 px lower than the outline. | `confirmed` by reading: `applyDragVisuals` sets `--rows` to `s.rows = max(occupiedRows, maxY + h)`; after the drop `renderFavorites` rebuilds the grid at its resting `--rows` and nothing keeps or restores the document height or `scrollY` (`grep scrollY src/newtab.js` finds no compensation: only `autoscrollFrame` and the add menu) | decision 2, Ruling 1 |

Not reproduced by reading: none. Step 1 (browser, § Live measurement, filled in at the kickoff) decides; an item that fails to reproduce there is closed by a `backlog.md` line and its decision and AS are dropped.

## Triage (reading `main`)

- **Target recompute today.** `updateDragTarget(s)` reads the grid box (`getBoundingClientRect`, so it already follows the scrolled page) and the stored pointer position `s.lastX/lastY`. It is called from `applyDragVisuals` (pointer move) and from `autoscrollFrame` (only when the autoscroll moved the page). Any other scroll while a drag is active (wheel, trackpad, keyboard Page Down / Space / arrows, scrollbar drag, scroll anchoring) moves the grid under a still pointer and leaves the target stale.
- **Drag grid height.** While dragging `.desktop-grid` is `--rows: s.rows` high (the allowed drop area, at least the resting grid). `commitDrop` settles the tile with `placeTile` inside the same (high) grid and then `runDesktopMutation(…, { renderPending: false })`; the re-render after success, or `returnDraggedTile`, sets the resting `--rows`. The document is shorter by `(s.rows − restingRows) × (cell + gap)`; if `scrollY` was above the new maximum the browser clamps it and everything below the old top moves down.

## Live measurement

Filled in at step 1 of the kickoff (2026-10-19 or later): real Chromium with the unpacked extension, `origin/main` head printed, probe in notes `scratch/run-47-triage/`. It measures, with premises printed first: item 18 (wheel `deltaY` 200 with a still pointer at 1280×800 and 500×800, 188 links; outline cell before and after, drop cell after release; the same by keyboard Page Down); item 19 (188 links, page at the bottom, drag the lowest tile to the first-screen row, outline rectangle against the tile rectangle after the drop and `scrollY` before and after, at 1280×800, 500×800 and 320×600; the same on a page that fits).

## Decisions

1. **The target follows every scroll of the page during a drag (item 18).** From the moment a drag starts (`s.started`) until it ends, a passive `scroll` listener on `window` calls `updateDragTarget(s)` with the last pointer position, coalesced to one call per animation frame. It is attached at drag start and removed in every end path: drop (`onDragPointerUp`), `cancelDrag` (Escape, `pointercancel`, window blur, pointer leaving the window, resize, leaving edit mode) and `reattachDrag`'s drag-lost branch. The autoscroll frame keeps its own `updateDragTarget` call (one call per frame at most; a duplicate call in the same frame is harmless and idempotent). No new text, no new control, no change to the pointer rules.
2. **The tile lands where the outline was (item 19).** At a committed drop (a valid target, the write starts) the document keeps the height it had at drop time, so the browser does not clamp `scrollY`: the settled tile and every other tile stay exactly where they were on screen. The held height is released at the first of: a user scroll (a `scroll` event after the drop settled that is not caused by the release), the next drag start, a dialog opening, leaving edit mode, a viewport resize, a re-render other than the drop's own. Mechanics are the implementer's choice inside these rules (e.g. a `min-height` on `.desktop` in px written at drop time and removed on release); nothing a layout reads (`documentElement.clientHeight/Width`, `--rows`, `gridMetrics`, `viewportRows`) may change, and the stored layout, `maxDropRow` and the DOM contract stay as they are. A rejected drop and a cancelled drag need no hold: the tile returns to its origin and the page was never shorter than at rest plus the drag grid, so the clamp case is the same: if `returnDraggedTile`'s final `renderFavorites` would clamp `scrollY`, the same hold applies for the 180 ms return and is released with it (the tile returns to where it started, the page below it does not jump).
3. **A page that fits is untouched.** With no scrolling before the drop (document height ≤ window height) nothing is held and nothing differs from today.
4. **Reduced motion.** No animation is added; the hold is a layout fact, identical with and without `prefers-reduced-motion`.

Ruling 1 (item 19). Ruling (марафон, на проверку Киру): after a drop the page keeps its drag-time height until the next scroll, drag, dialog, resize or leaving edit mode, so the tile never jumps; альтернатива: let the browser clamp `scrollY` and animate or accept the jump (80 px at 1280×800), or compensate `scrollY` (impossible: the document is shorter than `scrollY` + window, so the clamp happens first); цена ошибки: up to one drag-grid height of empty space (the rows the drag area added below the last tile, at most about one screen) stays under the grid in edit mode until the next scroll or exit, and a later release can move content by that amount once, at a moment the user caused by scrolling or leaving edit mode.

## Acceptance scenarios

Common premises printed by every scenario before its values: the `origin/main` head, the window size, `scrollY`, `document.documentElement.scrollHeight`, the tile and outline rectangles, `[data-dragging]`. Seed: 188 links (rows well past the first screen) unless a scenario says otherwise, edit mode on.

### AS-DST-01 Wheel scroll with a still pointer moves the outline (decision 1, item 18)
- Given: 1280×800, 188 links, edit mode, the tile `f0` dragged and held over a free cell near the bottom of the window (printed outline cell `A`), page at `scrollY` 0.
- When: a wheel scroll (`page.mouse.wheel(0, 200)`) with the pointer not moving, then 300 ms of waiting; no `pointermove` is sent.
- Then: `scrollY` is 200; the outline (`.drop-highlight`, `--x/--y`) sits on the cell now under the pointer (`cellFromPoint` of the pointer against the grid box, printed), not on `A`; its `data-valid` equals `canPlace` of that cell (an occupied cell is `false`); releasing without moving the mouse writes `f0` to the outlined cell (stored grid read back), or writes nothing and returns the tile when the outlined cell is occupied.
- Verified by: E2E `dg-87` group 1.

### AS-DST-02 Keyboard and scrollbar scrolls do the same
- Given: as AS-DST-01, the drag still held.
- When: (a) Page Down on the keyboard (`page.keyboard.press("PageDown")`); (b) the page scrolled by script (`window.scrollBy(0, 150)`, standing for the scrollbar and trackpad paths).
- Then: after each, within 2 animation frames, the outline is on the cell under the pointer, with `data-valid` as in AS-DST-01. Pressing a key does not cancel the drag (today's behaviour: only Escape does).
- Verified by: E2E `dg-87` group 1.

### AS-DST-03 Autoscroll is unchanged
- Given: `dg-33`'s seed, a drag held within 48 px of the bottom edge.
- When: 500 ms pass, then the release over the free cell `(9, 17)` after the page reached the bottom.
- Then: `dg-33` stays green as is (scroll > 100 px in 500 ms, the release commits at `(9, 17)`); in addition the outline cell changes between frames while the page scrolls under the still pointer, and the `scroll` listener adds no second step per frame (the number of `updateDragTarget` calls per frame is not asserted; the number of `scrollY` steps per frame is 12 px as before, `AUTOSCROLL_STEP_PX`).
- Verified by: E2E `dg-33` (existing, may need no change) and `dg-87` group 1.

### AS-DST-04 The drop lands where the outline was (decision 2, item 19)
- Given: 1280×800 and, in separate runs, 500×800 and 320×600; 188 links; edit mode; the page scrolled to the bottom (`scrollY` printed, equal to the maximum); premise printed: the drag grid is higher than the resting grid (`dragRows > restingRows`), so a clamp would happen on main.
- When: the lowest tile is dragged to the first-screen row of the window (an allowed cell, outline printed), released.
- Then: after the settle (400 ms): `scrollY` equals its value before the drop (no clamp: not 184 for 264); the tile rectangle top equals the outline rectangle top recorded just before the release within 1 px; every other tile's rectangle is unchanged within 1 px; the stored grid of the tile is the outlined cell.
- Verified by: E2E `dg-87` group 2.

### AS-DST-05 The hold is released by the user and by leaving
- Given: AS-DST-04 just finished (the page still at the held height, premise: `scrollHeight` > resting height printed).
- When, one run each: (a) the user scrolls up by 100 px; (b) a new drag starts (pointer down and move past 6 px); (c) a dialog is opened (Add link); (d) edit mode is left (Settings, Escape or a background click); (e) the window is resized by 40 px.
- Then: in each case `scrollHeight` is back to the resting height after the event (printed before and after); in (a) and (e) the content under the pointer does not jump by more than the amount the user scrolled; in (d) the page may clamp (accepted exception 1); in no case does a write happen because of the release.
- Verified by: E2E `dg-87` group 3.

### AS-DST-06 A page that fits, and a drag from the top, are untouched
- Given: 1280×800, the 6 default tiles and 3 links (document height ≤ window, premise printed); and the 188-link desk at `scrollY` 0 with a drop inside the first screen.
- When: a drop on a free cell (both cases).
- Then: `scrollHeight` after the drop equals the resting value (nothing held); `scrollY` is unchanged; the tile is on the outlined cell. (On the 188-link desk the drag grid is not higher than the resting grid when the lowest row is beyond the first screen: premise printed; if it is higher, the case is AS-DST-04 and the hold applies.)
- Verified by: E2E `dg-87` group 2 (control).

### AS-DST-07 Rejected drop and cancelled drag
- Given: AS-DST-04's setup.
- When: (a) release over an occupied cell (rejected, `returnDraggedTile`); (b) Escape during the drag; (c) the pointer leaves the window; (d) the window loses focus (`blur`).
- Then: nothing is written (stored grids equal before and after); the tile is back on its origin cell; `scrollY` is not reduced by more than 0 px during the 180 ms return (no jump of the content below the tile); after each end the `scroll` listener is gone: a further `window.scrollBy(0, 100)` does not move any outline or `[data-dragging]` (premise printed: no `.drop-highlight` exists).
- Verified by: E2E `dg-87` group 4.

### AS-DST-08 Keyboard, announcements and focus are as before
- Given: edit mode, a drag by pointer.
- When: any of AS-DST-01…07.
- Then: focus ends on the dropped tile after a successful drop (`focusDragTile`), as today; no new live-region text, no new control, no new tab stop; `#desktop-status` shows the same texts as today for a failed drop. Text strings in this feature: none new.
- Verified by: E2E `dg-87` group 4; `test/newtabSource.test.js` pins.

### AS-DST-09 Narrow and low windows
- Given: 500×800, 320×600 and 1280×600 (low), 188 links.
- When: AS-DST-01 and AS-DST-04.
- Then: same results (cell size 64 / 56, gap 8 / 6 do not change the rules); at 320×600 the status chip (`--status-reserve`) is not shown, and if a failure chip is shown the hold does not change `--status-reserve` or the padding of `.desktop`.
- Verified by: E2E `dg-87` group 5.

## Review focus

- **Scenarios/states:** the listener is attached for exactly the life of a started drag and removed on every path (drop, rejected drop, Escape, blur, pointer leave, resize, edit mode exit, `reattachDrag` losing the tile); a scroll that arrives after `onDragPointerUp` must not touch a finished drag. The hold released by each trigger of decision 2 and never stuck (stuck extra space after a failed write, after a re-render caused by weather data, after a second drag).
- **Visual/layout:** tile and outline rectangles agree within 1 px after a drop at every width; no empty gap that persists after the user scrolls; the added space does not change `clientHeight`/`viewportRows`; the chip reserve of run 46 (`--status-reserve`, `.desktop` padding-bottom) stays additive and exact.
- **Accessibility/texts:** no new text; focus returns to the dropped tile; reduced motion does not change the result; screen-reader order of the tiles is untouched.

## Accepted exceptions

1. Leaving edit mode (or any release by resize) may clamp `scrollY` once and move the content by up to one drag-grid height; the user caused it and no drag is under the pointer.
2. While held, the empty space under the last tile can be up to about one screen high in edit mode (Ruling 1, cost of the alternative being a jump of the dropped tile).
3. A scroll caused by the browser's own scroll anchoring or by `scroll-margin` focus alignment during a drag moves the outline like any other scroll (the target always follows the pointer, not the tile's origin).

## Non-goals

- Changing the autoscroll speed, edge size (48 px) or step (12 px); adding wheel acceleration or inertia handling.
- Changing the drop rules (`maxDropRow`, `clampDropCell`, `canPlace`), the drag threshold, the whole-window drop area (`docs/widget-drag-limits.md`), or the drag grid height.
- Touch dragging, keyboard-only tile moving, the status chip geometry (run 46), the Add menu position, weather reliability (Р48), typography (Р49).
- Any storage change, new text or control.

## Review rounds

Revision 1: stage 0 author. Filled in by stages 1 to 3 of run 47.
