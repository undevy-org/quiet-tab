// src/desktopUiState.js — pure UI state for the desktop grid (no DOM, no I/O). Spec § Edit mode, § Escape order (AS-11).
export const MENU_KINDS = new Set(["add", "restore-weather"]);
export const DIALOG_KINDS = new Set(["add-link", "edit-link", "edit-weather", "confirm-delete", "confirm-hide-weather", "confirm-reset-grid"]);

export function createDesktopUiState() {
  return { editMode: false, menu: null, dialog: null, drag: null };
}

export function enterEditMode(state) {
  return state.editMode ? state : { ...state, editMode: true };
}

// Leaving edit mode also closes a menu and cancels a drag; an open dialog is not touched (it is modal).
export function exitEditMode(state) {
  return { ...state, editMode: false, menu: null, drag: null };
}

export function toggleEditMode(state) {
  return state.editMode ? exitEditMode(state) : enterEditMode(state);
}

export function openMenu(state, kind) {
  if (!MENU_KINDS.has(kind)) throw new Error(`Unknown menu: ${kind}`);
  return { ...state, menu: kind };
}

export function closeMenu(state) {
  return state.menu === null ? state : { ...state, menu: null };
}

export function openDialog(state, dialog) {
  if (!DIALOG_KINDS.has(dialog?.kind)) throw new Error(`Unknown dialog: ${dialog?.kind}`);
  return { ...state, dialog, menu: null };
}

export function closeDialog(state) {
  return state.dialog === null ? state : { ...state, dialog: null };
}

// Dragging only exists in edit mode. `grab` = cell offset inside the block, `size` = {w,h}.
export function startDrag(state, { id, grab, size, pointerId }) {
  if (!state.editMode) return state;
  return { ...state, drag: { id, grab, size, pointerId, target: null, valid: false } };
}

export function updateDrag(state, target, valid) {
  return state.drag === null ? state : { ...state, drag: { ...state.drag, target, valid } };
}

export function endDrag(state) {
  return state.drag === null ? state : { ...state, drag: null };
}

// Which layer one Escape press closes, topmost first. `flags` comes from the DOM-owning caller.
export function escapeLayer(
  state,
  { tooltip = false, citySuggestions = false, onboardingWizard = false, cityModal = false, status = false } = {}
) {
  if (state.drag) return "drag";
  if (tooltip) return "tooltip";
  if (citySuggestions) return "citySuggestions";
  if (onboardingWizard) return "onboardingWizard";
  if (cityModal) return "cityModal";
  if (state.dialog) return "dialog";
  if (state.menu) return "menu";
  if (state.editMode) return "exitEdit";
  if (status) return "status"; // the layout-failure chip (docs/stale-tab-closeout.md): nothing above it is open
  return null;
}

// ---- the grid re-read on a return of the tab (docs/tab-return-refresh.md decisions 5 and 6) ------------------------------------------------
// The name of the first layer that owns the screen while it is up, or null: a drag (started, or settling after the drop), an open dialog,
// the city modal, the first-run wizard, the Add menu, edit mode, a write in flight. The grid must not change under a layer. The order is the
// order of the list; a drag and the Add menu exist only inside edit mode, so edit mode follows them. `state` is the desktop UI state; the
// options (`cityModal`, `onboardingWizard`, `busy`, `dragSettling`) are booleans that the DOM-owning caller (`newtab.js`) reads.
export function deskRefreshBlocker(state, { cityModal = false, onboardingWizard = false, busy = false, dragSettling = false } = {}) {
  if (state.drag || dragSettling) return "drag";
  if (state.dialog) return "dialog";
  if (cityModal) return "cityModal";
  if (onboardingWizard) return "onboardingWizard";
  if (state.menu) return "menu";
  if (state.editMode) return "editMode";
  if (busy) return "busy";
  return null;
}

// What a return does with the grid, in this order: "skip" (no state to refresh, or the grid is locked read-only), "pending" (the grid is
// not drawn yet, or a layer is up: keep it for later), "again" (the state this tab shows is no longer the one the re-read started from: this
// tab changed it while the read ran, so the read is older than the screen), "apply". `startedFrom` and `current` are the widgets state objects
// compared by identity; at entry they are the same object, so an entry call never answers "again".
export function deskRefreshDecision({ hasState, locked, drawn, blocker, startedFrom, current }) {
  if (!hasState || locked) return "skip";
  if (!drawn || blocker !== null) return "pending";
  if (current !== startedFrom) return "again";
  return "apply";
}

// ---- which message a heal of a cleared storage shows (docs/backlog-closeout.md decision 3, Ruling 3, 154 (2)) -------------------------------
// "silent": the heal is this tab's own retry of an ensure that failed at load, and the state the tab showed before it had no Settings tile (a
// tab that never showed Settings never had a layout that something could have reset). Otherwise "reset": the storage was really cleared in another
// tab and the message `Your layout was reset in another tab.` is true. `ensureFailed` is the tab's `widgetsEnsureFailed`; `shownItems` the items of
// the state the tab showed BEFORE the heal's result replaced it (null when it showed none: that counts as no Settings). The same rule at the three
// heal sites of newtab.js (the return re-read, runDesktopMutation, recoverFromGoneLink).
export function healNotice({ ensureFailed, shownItems }) {
  const shownSettings = Array.isArray(shownItems) && shownItems.some((item) => item?.id === "chrome:settings");
  return ensureFailed === true && !shownSettings ? "silent" : "reset";
}

// ---- the second press of a swap in the Add menu (docs/backlog-closeout.md decision 12, Ruling 11 and 13, 183 variant A) --------------------------------
// The click that moves the Add menu to its second level (`Add weather tile…`) records its point and time; a pointer press that comes at most
// ADD_MENU_DOUBLE_PRESS_MS later and at most ADD_MENU_DOUBLE_PRESS_SLOP_PX away (straight line) is the second press of a double click and does nothing. 300 ms is the
// length of the project's other guards (a human double click is mostly under it; the 450 ms recipe of dg-93 stays outside), 4 px is a hand's tremor.
// `record` is { x, y, t } of the opening click (null when there is none: no swap yet, or a keyboard activation, which records nothing); `press` is { x, y, t }
// of the pointerdown, both `t` from `event.timeStamp`. A press that is earlier than the record (a clock that does not add up) is never a second press.
export const ADD_MENU_DOUBLE_PRESS_MS = 300;
export const ADD_MENU_DOUBLE_PRESS_SLOP_PX = 4;
export function isSwapSecondPress(record, press) {
  if (!record || !press) return false;
  const values = [record.x, record.y, record.t, press.x, press.y, press.t];
  if (!values.every(Number.isFinite)) return false;
  const elapsed = press.t - record.t;
  if (elapsed < 0 || elapsed > ADD_MENU_DOUBLE_PRESS_MS) return false;
  return Math.hypot(press.x - record.x, press.y - record.y) <= ADD_MENU_DOUBLE_PRESS_SLOP_PX;
}
