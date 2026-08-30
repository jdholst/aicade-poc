const DEFAULT_INTERACTION_SELECTOR =
  ".nav-link, .stat-link, [data-cost-chart-scroll]";

export function installDashboardInteractionGuard(
  root,
  {
    interactionSelector = DEFAULT_INTERACTION_SELECTOR,
    onInteractionEnd = () => {},
  } = {}
) {
  let activeRegion = null;

  function regionFor(target) {
    return target?.closest?.(interactionSelector) ?? null;
  }

  function onPointerOver(event) {
    const region = regionFor(event.target);
    if (region) activeRegion = region;
  }

  function onPointerOut(event) {
    if (!activeRegion) return;
    const nextRegion = regionFor(event.relatedTarget);
    if (nextRegion === activeRegion) return;
    if (nextRegion) {
      activeRegion = nextRegion;
      return;
    }
    activeRegion = null;
    onInteractionEnd();
  }

  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("pointerout", onPointerOut);

  return {
    isActive() {
      return activeRegion !== null;
    },
    destroy() {
      root.removeEventListener("pointerover", onPointerOver);
      root.removeEventListener("pointerout", onPointerOut);
    },
  };
}
