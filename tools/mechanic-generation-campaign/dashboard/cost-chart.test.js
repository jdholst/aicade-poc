import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCostChartLayout,
  hitTestCostChartBar,
  installCostHistoryChart,
} from "./cost-chart.js";

describe("known cost history chart", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("lays out proportional bars and hit-tests them in CSS pixels", () => {
    const layout = createCostChartLayout({
      buckets: [bucket("Aug 29", 1_000), bucket("Aug 30", 0), bucket("Aug 31", 2_000)],
      width: 640,
      height: 300,
    });

    expect(layout.bars).toHaveLength(3);
    expect(layout.bars[2].height).toBeGreaterThan(layout.bars[0].height);
    expect(layout.bars[1].height).toBe(2);
    expect(hitTestCostChartBar(
      layout,
      layout.bars[0].x + layout.bars[0].width / 2,
      layout.bars[0].y + 2
    )?.index).toBe(0);
    expect(hitTestCostChartBar(layout, 2, 2)).toBeNull();
  });

  it("renders high-DPI chart evidence and keeps the grouping control interactive", () => {
    document.body.innerHTML = markup();
    const root = document.querySelector("#dashboard-cost-history");
    const scroll = root.querySelector("[data-cost-chart-scroll]");
    const canvas = root.querySelector("canvas");
    Object.defineProperty(scroll, "clientWidth", { configurable: true, value: 640 });
    canvas.getContext = vi.fn(() => canvasContext());
    canvas.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: Number.parseFloat(canvas.style.width),
      height: Number.parseFloat(canvas.style.height),
    }));
    const onGroupByChange = vi.fn();
    const chart = installCostHistoryChart(root, {
      devicePixelRatio: 2,
      ResizeObserverClass: FakeResizeObserver,
      onGroupByChange,
    });

    chart.render({
      groupBy: "day",
      exactNanoUsd: 1_000_000_000,
      estimatedNanoUsd: 1_600_000_000,
      totalNanoUsd: 2_600_000_000,
      pricedCalls: 2,
      unknownCalls: 3,
      invalidCalls: 1,
      futureCalls: 0,
      fixtureCalls: 0,
      buckets: [bucket("Aug 29", 1_000_000_000), bucket("Aug 30", 1_600_000_000)],
    });

    expect(root.querySelector("[data-cost-total]").textContent).toBe("$2.60");
    expect(root.querySelector("[data-cost-empty]").hidden).toBe(true);
    expect(root.querySelector("[data-cost-excluded]").textContent).toContain("4 call records excluded");
    expect(root.querySelectorAll("[data-cost-table-body] tr")).toHaveLength(2);
    expect(canvas.width).toBe(Number.parseFloat(canvas.style.width) * 2);
    expect(canvas.getAttribute("aria-label")).toContain("2 priced calls");

    const select = root.querySelector("#cost-group-by");
    select.value = "week";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onGroupByChange).toHaveBeenCalledWith("week");

    canvas.dispatchEvent(new FocusEvent("focus"));
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(root.querySelector("[data-cost-tooltip]").hidden).toBe(false);

    chart.destroy();
    select.value = "month";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onGroupByChange).toHaveBeenCalledTimes(1);
  });

  it("shows an explicit empty state when no calls have priced evidence", () => {
    document.body.innerHTML = markup();
    const root = document.querySelector("#dashboard-cost-history");
    const canvas = root.querySelector("canvas");
    canvas.getContext = vi.fn(() => canvasContext());
    const chart = installCostHistoryChart(root, {
      ResizeObserverClass: FakeResizeObserver,
    });

    chart.render({
      groupBy: "day",
      exactNanoUsd: 0,
      estimatedNanoUsd: 0,
      totalNanoUsd: 0,
      pricedCalls: 0,
      unknownCalls: 5,
      invalidCalls: 0,
      futureCalls: 0,
      fixtureCalls: 0,
      buckets: [],
    });

    expect(root.querySelector("[data-cost-total]").textContent).toBe("—");
    expect(root.querySelector("[data-cost-empty]").hidden).toBe(false);
    expect(canvas.hidden).toBe(true);
  });

  it("uses the compact chart height at the mobile breakpoint", () => {
    document.body.innerHTML = markup();
    const root = document.querySelector("#dashboard-cost-history");
    const scroll = root.querySelector("[data-cost-chart-scroll]");
    const canvas = root.querySelector("canvas");
    Object.defineProperty(scroll, "clientWidth", { configurable: true, value: 390 });
    canvas.getContext = vi.fn(() => canvasContext());
    const chart = installCostHistoryChart(root, {
      devicePixelRatio: 2,
      ResizeObserverClass: FakeResizeObserver,
    });

    chart.render({
      groupBy: "day",
      exactNanoUsd: 1_000_000_000,
      estimatedNanoUsd: 0,
      totalNanoUsd: 1_000_000_000,
      pricedCalls: 1,
      unknownCalls: 0,
      invalidCalls: 0,
      futureCalls: 0,
      fixtureCalls: 0,
      buckets: [bucket("Aug 30", 1_000_000_000)],
    });

    expect(canvas.style.height).toBe("240px");
    expect(canvas.height).toBe(480);
  });
});

function bucket(shortLabel, totalNanoUsd) {
  return {
    key: shortLabel,
    label: shortLabel,
    shortLabel,
    exactNanoUsd: totalNanoUsd,
    estimatedNanoUsd: 0,
    totalNanoUsd,
    pricedCalls: totalNanoUsd > 0 ? 1 : 0,
  };
}

function markup() {
  return `
    <section id="dashboard-cost-history">
      <select id="cost-group-by"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select>
      <strong data-cost-total></strong>
      <div data-cost-chart-scroll><div data-cost-chart-frame><canvas tabindex="0"></canvas><div data-cost-tooltip hidden></div></div></div>
      <p data-cost-empty hidden>No priced provider calls yet.</p>
      <p data-cost-excluded></p>
      <table><tbody data-cost-table-body></tbody></table>
    </section>`;
}

function canvasContext() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
  };
}

class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
}
