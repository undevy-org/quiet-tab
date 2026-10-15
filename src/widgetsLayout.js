// Where the shared tooltip goes: above the trigger if it fits, else below; centered on the
// trigger and clamped so it never leaves the viewport. Pure so it is testable without a DOM.
export function placeTooltip({ trigger, tooltip, viewport, gap = 8, margin = 8 }) {
  const spaceAbove = trigger.top - gap - margin;
  const side = spaceAbove >= tooltip.height ? "top" : "bottom";
  const rawTop = side === "top" ? trigger.top - gap - tooltip.height : trigger.bottom + gap;
  const top = Math.min(Math.max(rawTop, margin), Math.max(margin, viewport.height - margin - tooltip.height));
  const centered = trigger.left + trigger.width / 2 - tooltip.width / 2;
  const maxLeft = Math.max(margin, viewport.width - margin - tooltip.width);
  return { left: Math.min(Math.max(centered, margin), maxLeft), top, side };
}
