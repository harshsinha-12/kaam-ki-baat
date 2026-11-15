import type { ActionReceipt, BrowserAction, PageState, SpatialContext } from "./contracts";

// Browser-only executor. The model chooses semantic IDs, never selectors,
// scripts, HTML, external URLs, participants or task-write operations.
export async function executeBrowserAction(
  action: BrowserAction, context: SpatialContext,
  current: () => PageState, update: (next: PageState) => void,
): Promise<ActionReceipt> {
  if (action.type === "scroll_page") {
    const before = window.scrollY;
    window.scrollBy({ top: (action.target === "down" ? 1 : -1) * window.innerHeight * 0.75, behavior: "instant" });
    return { ok: true, message: before === window.scrollY ? "The page is already at its scroll boundary." : `Scrolled ${action.target}.` };
  }
  const target = context.targets.find(t => t.id === action.target);
  if (!target || action.type === "focus_evidence" && !context.cards.some(c => c.evidence.some(e => e.id === action.target))) {
    return { ok: false, message: "That target is no longer on the authorized page." };
  }
  update({ ...current(), space: target.space, selectedEvidence: action.type === "focus_space" ? null : action.target });
  // Wait for React to reveal the requested panel before reading its DOM back.
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const element = [...document.querySelectorAll<HTMLElement>("[data-spatial-id]")].find(e => e.dataset.spatialId === action.target && !e.closest("[hidden]"));
  if (!element || current().space !== target.space || !element.isConnected) return { ok: false, message: "The page target could not be displayed." };
  element.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  element.focus({ preventScroll: true });
  return { ok: true, message: `Displayed ${target.label}.` };
}
