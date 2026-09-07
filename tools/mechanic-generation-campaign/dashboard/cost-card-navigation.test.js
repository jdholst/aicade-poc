import { afterEach, describe, expect, it, vi } from "vitest";

import { installCostCardNavigationGuard } from "./cost-card-navigation.js";

describe("cost card navigation guard", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("keeps card navigation disabled through the dropdown dismissal click", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <section id="summary">
        <article class="cost-stat">
          <a class="cost-stat-link" href="#dashboard-attempts">Submissions</a>
          <select id="cost-timeframe"><option value="all">All time</option></select>
        </article>
      </section>
    `;
    const summary = document.querySelector("#summary");
    const card = document.querySelector(".cost-stat");
    const link = document.querySelector(".cost-stat-link");
    const select = document.querySelector("#cost-timeframe");
    let navigations = 0;
    link.addEventListener("click", () => { navigations += 1; });

    const onInteractionEnd = vi.fn();
    const guard = installCostCardNavigationGuard(summary, {
      onInteractionEnd,
      onTimeframeChange() {},
    });
    select.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    select.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    select.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(guard.isActive()).toBe(true);
    expect(card.classList.contains("is-cost-timeframe-active")).toBe(true);
    expect(link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).toBe(false);
    expect(navigations).toBe(0);

    vi.runAllTimers();
    expect(guard.isActive()).toBe(false);
    expect(onInteractionEnd).toHaveBeenCalledOnce();
    expect(card.classList.contains("is-cost-timeframe-active")).toBe(false);
    expect(link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).toBe(true);
    expect(navigations).toBe(1);
  });

  it("navigates the card to the known cost history section", () => {
    document.body.innerHTML = `
      <section id="summary">
        <article class="cost-stat">
          <a class="cost-stat-link" href="#dashboard-cost-history">Known cost history</a>
          <select id="cost-timeframe"><option value="week">Past 7 days</option></select>
        </article>
      </section>
      <section id="dashboard-cost-history"></section>
    `;
    const summary = document.querySelector("#summary");
    const link = document.querySelector(".cost-stat-link");
    const target = document.querySelector("#dashboard-cost-history");
    target.scrollIntoView = vi.fn();
    window.history.replaceState(null, "", "#dashboard-attempts");

    installCostCardNavigationGuard(summary, {
      onTimeframeChange() {},
    });
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(window.location.hash).toBe("#dashboard-cost-history");
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });
});
