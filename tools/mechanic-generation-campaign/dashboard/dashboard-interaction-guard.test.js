import { afterEach, describe, expect, it, vi } from "vitest";

import { installDashboardInteractionGuard } from "./dashboard-interaction-guard.js";

describe("dashboard interaction guard", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps live rendering paused while navigation or a cost bar remains hovered", () => {
    document.body.innerHTML = `
      <a class="nav-link" href="/documentation.html"><span>Documentation</span></a>
      <a class="stat-link" href="#dashboard-attempts">Attempts</a>
      <div data-cost-chart-scroll><canvas></canvas><div data-cost-tooltip></div></div>
    `;
    const onInteractionEnd = vi.fn();
    const guard = installDashboardInteractionGuard(document, { onInteractionEnd });
    const navLabel = document.querySelector(".nav-link span");
    const nav = document.querySelector(".nav-link");
    const chart = document.querySelector("[data-cost-chart-scroll]");
    const canvas = document.querySelector("canvas");
    const tooltip = document.querySelector("[data-cost-tooltip]");

    navLabel.dispatchEvent(pointerEvent("pointerover"));
    expect(guard.isActive()).toBe(true);

    navLabel.dispatchEvent(pointerEvent("pointerout", nav));
    expect(guard.isActive()).toBe(true);
    expect(onInteractionEnd).not.toHaveBeenCalled();

    nav.dispatchEvent(pointerEvent("pointerout", document.body));
    expect(guard.isActive()).toBe(false);
    expect(onInteractionEnd).toHaveBeenCalledOnce();

    canvas.dispatchEvent(pointerEvent("pointerover"));
    expect(guard.isActive()).toBe(true);

    canvas.dispatchEvent(pointerEvent("pointerout", tooltip));
    expect(guard.isActive()).toBe(true);

    chart.dispatchEvent(pointerEvent("pointerout", document.body));
    expect(guard.isActive()).toBe(false);
    expect(onInteractionEnd).toHaveBeenCalledTimes(2);

    guard.destroy();
  });
});

function pointerEvent(type, relatedTarget = null) {
  return new MouseEvent(type, { bubbles: true, relatedTarget });
}
