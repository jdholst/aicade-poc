const ACTIVE_CLASS = "is-cost-timeframe-active";

export function installCostCardNavigationGuard(
  summary,
  { onInteractionEnd = () => {}, onTimeframeChange }
) {
  let navigationSuppressed = false;
  let releaseTimer;

  function isTimeframeControl(target) {
    return target?.id === "cost-timeframe";
  }

  function activate(event) {
    if (!isTimeframeControl(event.target)) return;
    clearTimeout(releaseTimer);
    navigationSuppressed = true;
    event.target.closest(".cost-stat")?.classList.add(ACTIVE_CLASS);
  }

  function scheduleRelease(event) {
    if (event && !isTimeframeControl(event.target)) return;
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      navigationSuppressed = false;
      summary.querySelector(".cost-stat")?.classList.remove(ACTIVE_CLASS);
      onInteractionEnd();
    }, 0);
  }

  function handleNavigation(event) {
    const link = event.target.closest?.(".cost-stat-link");
    if (!link) return;
    if (navigationSuppressed) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const href = link.getAttribute("href");
    const target = href?.startsWith("#")
      ? summary.ownerDocument.querySelector(href)
      : null;
    if (!target) return;

    event.preventDefault();
    const view = summary.ownerDocument.defaultView;
    if (view.location.hash !== href) view.history.pushState(null, "", href);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function changeTimeframe(event) {
    if (!isTimeframeControl(event.target)) return;
    onTimeframeChange(event.target.value);
    scheduleRelease();
  }

  summary.addEventListener("pointerdown", activate);
  summary.addEventListener("focusin", activate);
  summary.addEventListener("focusout", scheduleRelease);
  summary.addEventListener("click", handleNavigation, true);
  summary.addEventListener("change", changeTimeframe);

  return {
    isActive() {
      return navigationSuppressed;
    },
  };
}
