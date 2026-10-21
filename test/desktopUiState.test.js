import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIALOG_KINDS, closeDialog, closeMenu, createDesktopUiState, deskRefreshBlocker, deskRefreshDecision, endDrag, enterEditMode, escapeLayer, exitEditMode,
  openDialog, openMenu, startDrag, toggleEditMode, updateDrag
} from "../src/desktopUiState.js";

const edit = () => enterEditMode(createDesktopUiState());

describe("edit mode", () => {
  it("starts off, toggles on and off", () => {
    const s = createDesktopUiState();
    assert.equal(s.editMode, false);
    assert.equal(toggleEditMode(s).editMode, true);
    assert.equal(toggleEditMode(toggleEditMode(s)).editMode, false);
  });
  it("leaving edit mode closes the menu and cancels the drag but keeps a dialog", () => {
    let s = startDrag(openMenu(edit(), "add"), { id: "a", grab: { x: 0, y: 0 }, size: { w: 1, h: 1 }, pointerId: 1 });
    s = openDialog({ ...s, drag: null }, { kind: "edit-link", id: "a" });
    s = exitEditMode(startDrag(openMenu(s, "add"), { id: "a", grab: { x: 0, y: 0 }, size: { w: 1, h: 1 }, pointerId: 1 }));
    assert.equal(s.menu, null);
    assert.equal(s.drag, null);
    assert.deepEqual(s.dialog, { kind: "edit-link", id: "a" });
  });
  it("is immutable and idempotent", () => {
    const s = createDesktopUiState();
    enterEditMode(s);
    assert.equal(s.editMode, false);
    const on = enterEditMode(s);
    assert.equal(enterEditMode(on), on);
  });
});

describe("drag", () => {
  const spec = { id: "a", grab: { x: 1, y: 0 }, size: { w: 2, h: 1 }, pointerId: 7 };
  it("only starts in edit mode", () => {
    const s = createDesktopUiState();
    assert.equal(startDrag(s, spec), s);
    assert.equal(startDrag(edit(), spec).drag.id, "a");
  });
  it("tracks the target and clears on end", () => {
    let s = updateDrag(startDrag(edit(), spec), { x: 3, y: 1 }, true);
    assert.deepEqual(s.drag.target, { x: 3, y: 1 });
    assert.equal(s.drag.valid, true);
    assert.equal(endDrag(s).drag, null);
    assert.equal(updateDrag(edit(), { x: 0, y: 0 }, true).drag, null);
  });
});

describe("menu and dialog", () => {
  it("rejects unknown kinds", () => {
    assert.throws(() => openMenu(edit(), "x"));
    assert.throws(() => openDialog(edit(), { kind: "x" }));
  });
  it("AS-MO-15: confirm-hide-weather is a dialog kind next to the existing four, and opens with a metric id", () => {
    assert.ok(DIALOG_KINDS.has("confirm-hide-weather"));
    for (const kind of ["add-link", "edit-link", "edit-weather", "confirm-delete"]) assert.ok(DIALOG_KINDS.has(kind), kind);
    const s = openDialog(edit(), { kind: "confirm-hide-weather", id: "weather:uv" });
    assert.deepEqual(s.dialog, { kind: "confirm-hide-weather", id: "weather:uv" });
  });
  it("opening a dialog closes the menu", () => {
    const s = openDialog(openMenu(edit(), "add"), { kind: "add-link" });
    assert.equal(s.menu, null);
    assert.equal(closeDialog(s).dialog, null);
    assert.equal(closeMenu(openMenu(edit(), "restore-weather")).menu, null);
  });
});

describe("escapeLayer (AS-11)", () => {
  it("returns the topmost layer first", () => {
    let s = openDialog(edit(), { kind: "edit-weather", id: "weather:uv" });
    assert.equal(escapeLayer(s, { tooltip: true, cityModal: true }), "tooltip");
    assert.equal(escapeLayer(s, { citySuggestions: true, onboardingWizard: true, cityModal: true }), "citySuggestions");
    assert.equal(escapeLayer(s, { onboardingWizard: true, cityModal: true }), "onboardingWizard");
    assert.equal(escapeLayer(s, { cityModal: true }), "cityModal");
    assert.equal(escapeLayer(s), "dialog");
    s = closeDialog(s);
    assert.equal(escapeLayer(s), "exitEdit");
    assert.equal(escapeLayer(openMenu(s, "add")), "menu");
    assert.equal(escapeLayer(createDesktopUiState()), null);
  });
  it("the layout-failure chip is the lowest layer (docs/stale-tab-closeout.md decision 1)", () => {
    const s = edit();
    assert.equal(escapeLayer(createDesktopUiState(), { status: true }), "status");
    assert.equal(escapeLayer(s, { status: true }), "exitEdit"); // edit mode leaves first
    assert.equal(escapeLayer(openMenu(s, "add"), { status: true }), "menu");
    assert.equal(escapeLayer(openDialog(s, { kind: "add-link" }), { status: true }), "dialog");
    assert.equal(escapeLayer(createDesktopUiState(), { status: false }), null);
  });
  it("a drag in progress is cancelled before anything else", () => {
    const s = startDrag(edit(), { id: "a", grab: { x: 0, y: 0 }, size: { w: 1, h: 1 }, pointerId: 1 });
    assert.equal(escapeLayer(s, { tooltip: true }), "drag");
  });
});

// ---- the grid re-read on a return (docs/tab-return-refresh.md decisions 5 and 6) ---------------------------------------------------
// The order of the layers is the order of the list; a layer is built from its own input so that every row can be named.
const LAYER_ORDER = ["drag", "dialog", "cityModal", "onboardingWizard", "menu", "editMode", "busy"];
function layersUp(names) {
  const state = createDesktopUiState();
  const flags = {};
  for (const name of names) {
    if (name === "drag") state.drag = { id: "a", grab: { x: 0, y: 0 }, size: { w: 1, h: 1 }, pointerId: 1, target: null, valid: false };
    if (name === "dialog") state.dialog = { kind: "add-link" };
    if (name === "menu") state.menu = "add";
    if (name === "editMode") state.editMode = true;
    if (name === "cityModal") flags.cityModal = true;
    if (name === "onboardingWizard") flags.onboardingWizard = true;
    if (name === "busy") flags.busy = true;
  }
  return [state, flags];
}

describe("deskRefreshBlocker", () => {
  it("is null when no layer is up", () => {
    assert.equal(deskRefreshBlocker(createDesktopUiState()), null);
    assert.equal(deskRefreshBlocker(createDesktopUiState(), {}), null);
    assert.equal(deskRefreshBlocker(createDesktopUiState(), { cityModal: false, onboardingWizard: false, busy: false, dragSettling: false }), null);
  });

  it("names each layer when it is the only one", () => {
    for (const name of LAYER_ORDER) {
      const [state, flags] = layersUp([name]);
      assert.equal(deskRefreshBlocker(state, flags), name, name);
    }
  });

  it("a started drag and a drag that is settling after the drop are both the drag layer", () => {
    assert.equal(deskRefreshBlocker(startDrag(edit(), { id: "a", grab: { x: 0, y: 0 }, size: { w: 1, h: 1 }, pointerId: 1 })), "drag");
    assert.equal(deskRefreshBlocker(createDesktopUiState(), { dragSettling: true }), "drag");
    assert.equal(deskRefreshBlocker(edit(), { dragSettling: true }), "drag");
  });

  it("a real dialog, menu and edit mode state of the pure module are seen (not only hand-built ones)", () => {
    assert.equal(deskRefreshBlocker(openDialog(createDesktopUiState(), { kind: "edit-weather", id: "weather:temperature" })), "dialog");
    assert.equal(deskRefreshBlocker(openMenu(edit(), "add")), "menu");
    assert.equal(deskRefreshBlocker(edit()), "editMode");
    assert.equal(deskRefreshBlocker(exitEditMode(edit())), null);
    assert.equal(deskRefreshBlocker(closeDialog(openDialog(createDesktopUiState(), { kind: "add-link" }))), null);
  });

  it("with several layers up the first of the documented order is returned, for every pair and for all of them", () => {
    for (let i = 0; i < LAYER_ORDER.length; i += 1) {
      for (let j = i + 1; j < LAYER_ORDER.length; j += 1) {
        const [state, flags] = layersUp([LAYER_ORDER[j], LAYER_ORDER[i]]);
        assert.equal(deskRefreshBlocker(state, flags), LAYER_ORDER[i], `${LAYER_ORDER[i]} before ${LAYER_ORDER[j]}`);
      }
    }
    const [state, flags] = layersUp([...LAYER_ORDER].reverse());
    assert.equal(deskRefreshBlocker(state, flags), "drag");
  });

  it("edit mode with a dialog, a menu or a drag names the inner layer (the dialog, the menu, the drag)", () => {
    assert.equal(deskRefreshBlocker(openDialog(edit(), { kind: "edit-link", id: "f0" })), "dialog");
    assert.equal(deskRefreshBlocker(openMenu(edit(), "add")), "menu");
    assert.equal(deskRefreshBlocker(startDrag(edit(), { id: "a", grab: { x: 0, y: 0 }, size: { w: 1, h: 1 }, pointerId: 1 })), "drag");
  });

  it("does not change its input", () => {
    const [state, flags] = layersUp(LAYER_ORDER);
    const before = JSON.stringify([state, flags]);
    deskRefreshBlocker(state, flags);
    assert.equal(JSON.stringify([state, flags]), before);
  });
});

describe("deskRefreshDecision", () => {
  const stateA = { items: [] };
  const stateB = { items: [] };
  const base = { hasState: true, locked: false, drawn: true, blocker: null, startedFrom: stateA, current: stateA };
  const decide = (over) => deskRefreshDecision({ ...base, ...over });

  it("apply: a state, not locked, drawn, no layer, the same object", () => {
    assert.equal(decide({}), "apply");
  });

  it("skip: no state to refresh, or a grid locked read-only", () => {
    assert.equal(decide({ hasState: false }), "skip");
    assert.equal(decide({ locked: true }), "skip");
    assert.equal(decide({ hasState: false, locked: true }), "skip");
  });

  it("skip wins over everything below it: not drawn, a layer up, a changed state", () => {
    for (const cannot of [{ hasState: false }, { locked: true }]) {
      assert.equal(decide({ ...cannot, drawn: false }), "skip");
      for (const blocker of LAYER_ORDER) assert.equal(decide({ ...cannot, blocker }), "skip", blocker);
      assert.equal(decide({ ...cannot, current: stateB }), "skip");
      assert.equal(decide({ ...cannot, drawn: false, blocker: "dialog", current: stateB }), "skip");
    }
  });

  it("pending: the grid is not drawn yet", () => {
    assert.equal(decide({ drawn: false }), "pending");
  });

  it("pending: each layer alone", () => {
    for (const blocker of LAYER_ORDER) assert.equal(decide({ blocker }), "pending", blocker);
  });

  it("pending wins over again: a layer is up and this tab's own state changed meanwhile", () => {
    for (const blocker of LAYER_ORDER) assert.equal(decide({ blocker, current: stateB }), "pending", blocker);
    assert.equal(decide({ drawn: false, current: stateB }), "pending");
  });

  it("again: the state is not the one the re-read started from, and no layer is up", () => {
    assert.equal(decide({ current: stateB }), "again");
    assert.equal(decide({ startedFrom: null, current: stateA }), "again");
  });

  it("an entry call (the same object twice) never returns again", () => {
    for (const hasState of [true, false]) {
      for (const locked of [true, false]) {
        for (const drawn of [true, false]) {
          for (const blocker of [null, ...LAYER_ORDER]) {
            assert.notEqual(decide({ hasState, locked, drawn, blocker, startedFrom: stateA, current: stateA }), "again");
          }
        }
      }
    }
  });

  it("the order of the tests is skip, pending, again, apply (every input combination)", () => {
    const expected = ({ hasState, locked, drawn, blocker, same }) =>
      !hasState || locked ? "skip" : !drawn || blocker !== null ? "pending" : !same ? "again" : "apply";
    for (const hasState of [true, false]) {
      for (const locked of [true, false]) {
        for (const drawn of [true, false]) {
          for (const blocker of [null, "dialog", "busy"]) {
            for (const same of [true, false]) {
              assert.equal(decide({ hasState, locked, drawn, blocker, current: same ? stateA : stateB }), expected({ hasState, locked, drawn, blocker, same }));
            }
          }
        }
      }
    }
  });
});
