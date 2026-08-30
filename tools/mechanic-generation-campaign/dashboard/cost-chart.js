import { formatNanoUsd } from "./cost.js";

const CHART_HEIGHT = 300;
const MIN_BUCKET_WIDTH = 72;
const PLOT = { top: 24, right: 24, bottom: 52, left: 64 };

export function createCostChartLayout({ buckets, width, height = CHART_HEIGHT }) {
  const plotWidth = Math.max(1, width - PLOT.left - PLOT.right);
  const plotHeight = Math.max(1, height - PLOT.top - PLOT.bottom);
  const slotWidth = plotWidth / Math.max(1, buckets.length);
  const barWidth = Math.max(10, Math.min(54, slotWidth * 0.62));
  const maxNanoUsd = Math.max(1, ...buckets.map(({ totalNanoUsd }) => totalNanoUsd));
  const baseline = PLOT.top + plotHeight;
  const bars = buckets.map((bucket, index) => {
    const scaledHeight = bucket.totalNanoUsd === 0
      ? 2
      : Math.max(2, bucket.totalNanoUsd / maxNanoUsd * plotHeight);
    return {
      index,
      bucket,
      x: PLOT.left + index * slotWidth + (slotWidth - barWidth) / 2,
      y: baseline - scaledHeight,
      width: barWidth,
      height: scaledHeight,
    };
  });
  return {
    width,
    height,
    plot: {
      left: PLOT.left,
      top: PLOT.top,
      right: width - PLOT.right,
      bottom: baseline,
      width: plotWidth,
      height: plotHeight,
    },
    maxNanoUsd,
    bars,
  };
}

export function hitTestCostChartBar(layout, x, y) {
  return layout.bars.find((bar) =>
    x >= bar.x &&
    x <= bar.x + bar.width &&
    y >= Math.min(bar.y, layout.plot.bottom - 8) &&
    y <= layout.plot.bottom + 8
  ) ?? null;
}

export function installCostHistoryChart(
  root,
  {
    onGroupByChange = () => {},
    devicePixelRatio = globalThis.devicePixelRatio ?? 1,
    ResizeObserverClass = globalThis.ResizeObserver,
  } = {}
) {
  const select = root.querySelector("#cost-group-by");
  const total = root.querySelector("[data-cost-total]");
  const scroll = root.querySelector("[data-cost-chart-scroll]");
  const frame = root.querySelector("[data-cost-chart-frame]");
  const canvas = root.querySelector("canvas");
  const tooltip = root.querySelector("[data-cost-tooltip]");
  const empty = root.querySelector("[data-cost-empty]");
  const excluded = root.querySelector("[data-cost-excluded]");
  const tableBody = root.querySelector("[data-cost-table-body]");
  const context = canvas.getContext("2d");
  let series = null;
  let layout = null;
  let activeIndex = null;
  let renderedGroupBy = null;

  function render(nextSeries) {
    const groupChanged = renderedGroupBy !== nextSeries.groupBy;
    series = nextSeries;
    renderedGroupBy = nextSeries.groupBy;
    select.value = nextSeries.groupBy;
    total.textContent = nextSeries.pricedCalls > 0
      ? formatHeadlineCost(nextSeries.totalNanoUsd)
      : "—";
    const excludedCalls =
      nextSeries.unknownCalls + nextSeries.invalidCalls + nextSeries.futureCalls;
    excluded.textContent = excludedCalls === 0
      ? ""
      : `${excludedCalls} call record${excludedCalls === 1 ? "" : "s"} excluded because pricing or completion evidence is unavailable.`;
    excluded.hidden = excludedCalls === 0;
    renderAccessibleTable(tableBody, nextSeries.buckets);
    empty.hidden = nextSeries.pricedCalls > 0;
    scroll.hidden = nextSeries.pricedCalls === 0;
    canvas.hidden = nextSeries.pricedCalls === 0;
    hideTooltip();
    if (nextSeries.pricedCalls === 0) return;
    draw();
    if (groupChanged) scroll.scrollLeft = scroll.scrollWidth;
  }

  function draw() {
    if (!series || series.pricedCalls === 0 || !context) return;
    const viewportWidth = scroll.clientWidth || root.clientWidth || 640;
    const height = viewportWidth <= 620 ? 240 : CHART_HEIGHT;
    const width = Math.max(
      viewportWidth,
      PLOT.left + PLOT.right + series.buckets.length * MIN_BUCKET_WIDTH
    );
    const ratio = Math.max(1, devicePixelRatio);
    frame.style.width = `${width}px`;
    canvas.style.width = `${width}px`;
    frame.style.minHeight = `${height}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.scale(ratio, ratio);
    layout = createCostChartLayout({
      buckets: series.buckets,
      width,
      height,
    });
    drawChart(context, layout, root, activeIndex);
    canvas.setAttribute(
      "aria-label",
      `Known provider cost history grouped by ${series.groupBy}; ${series.pricedCalls} priced calls totaling ${formatNanoUsd(series.totalNanoUsd)}.`
    );
  }

  function showBucket(index) {
    if (!series?.buckets.length || !layout) return;
    activeIndex = Math.max(0, Math.min(index, series.buckets.length - 1));
    const bucket = series.buckets[activeIndex];
    const bar = layout.bars[activeIndex];
    tooltip.replaceChildren(
      tooltipLine("strong", bucket.label),
      tooltipLine("span", `Total ${formatNanoUsd(bucket.totalNanoUsd)}`),
      tooltipLine("span", `Exact ${formatNanoUsd(bucket.exactNanoUsd)}`),
      tooltipLine("span", `Estimate ${formatNanoUsd(bucket.estimatedNanoUsd)}`),
      tooltipLine("span", `${bucket.pricedCalls} priced call${bucket.pricedCalls === 1 ? "" : "s"}`)
    );
    tooltip.style.left = `${bar.x + bar.width / 2}px`;
    tooltip.style.top = `${Math.max(4, bar.y - 8)}px`;
    tooltip.hidden = false;
    draw();
  }

  function hideTooltip() {
    activeIndex = null;
    tooltip.hidden = true;
  }

  function bucketAtPointer(event) {
    if (!layout) return null;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return hitTestCostChartBar(
      layout,
      (event.clientX - bounds.left) * layout.width / bounds.width,
      (event.clientY - bounds.top) * layout.height / bounds.height
    );
  }

  function onPointer(event) {
    const bar = bucketAtPointer(event);
    if (bar) showBucket(bar.index);
  }

  function onPointerLeave() {
    if (document.activeElement !== canvas) hideTooltip();
  }

  function onFocus() {
    if (activeIndex === null && series?.buckets.length) {
      showBucket(series.buckets.length - 1);
    }
  }

  function onBlur() {
    hideTooltip();
    draw();
  }

  function onKeyDown(event) {
    if (!series?.buckets.length) return;
    const current = activeIndex ?? series.buckets.length - 1;
    const next = event.key === "ArrowLeft"
      ? current - 1
      : event.key === "ArrowRight"
        ? current + 1
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? series.buckets.length - 1
            : null;
    if (next === null) return;
    event.preventDefault();
    showBucket(next);
  }

  function onSelectChange() {
    hideTooltip();
    onGroupByChange(select.value);
  }

  select.addEventListener("change", onSelectChange);
  canvas.addEventListener("pointermove", onPointer);
  canvas.addEventListener("pointerdown", onPointer);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("focus", onFocus);
  canvas.addEventListener("blur", onBlur);
  canvas.addEventListener("keydown", onKeyDown);
  const resizeObserver = ResizeObserverClass
    ? new ResizeObserverClass(() => draw())
    : null;
  resizeObserver?.observe(scroll);

  return {
    render,
    destroy() {
      select.removeEventListener("change", onSelectChange);
      canvas.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerdown", onPointer);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("focus", onFocus);
      canvas.removeEventListener("blur", onBlur);
      canvas.removeEventListener("keydown", onKeyDown);
      resizeObserver?.disconnect();
    },
  };
}

function drawChart(context, layout, root, activeIndex) {
  const styles = getComputedStyle(root);
  const muted = styles.getPropertyValue("--muted").trim() || "#91a39f";
  const line = styles.getPropertyValue("--line").trim() || "#2b3f49";
  const green = styles.getPropertyValue("--green").trim() || "#77d1ad";
  const text = styles.getPropertyValue("--text").trim() || "#edf3ef";
  context.clearRect(0, 0, layout.width, layout.height);
  context.font = "12px Inter, ui-sans-serif, system-ui, sans-serif";
  context.textBaseline = "middle";

  for (let step = 0; step <= 4; step += 1) {
    const y = layout.plot.top + layout.plot.height * step / 4;
    const value = layout.maxNanoUsd * (1 - step / 4);
    context.beginPath();
    context.setLineDash(step === 0 ? [5, 5] : []);
    context.strokeStyle = line;
    context.moveTo(layout.plot.left, y);
    context.lineTo(layout.plot.right, y);
    context.stroke();
    context.fillStyle = muted;
    context.textAlign = "right";
    context.fillText(formatAxisCost(value), layout.plot.left - 10, y);
  }
  context.setLineDash([]);

  for (const bar of layout.bars) {
    context.fillStyle = bar.index === activeIndex ? text : green;
    context.fillRect(bar.x, bar.y, bar.width, bar.height);
    context.fillStyle = muted;
    context.textAlign = "center";
    context.fillText(
      bar.bucket.shortLabel,
      bar.x + bar.width / 2,
      layout.plot.bottom + 24
    );
  }
}

function renderAccessibleTable(tableBody, buckets) {
  tableBody.replaceChildren(...buckets.map((bucket) => {
    const row = document.createElement("tr");
    for (const value of [
      bucket.label,
      formatNanoUsd(bucket.totalNanoUsd),
      formatNanoUsd(bucket.exactNanoUsd),
      formatNanoUsd(bucket.estimatedNanoUsd),
      String(bucket.pricedCalls),
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }));
}

function tooltipLine(tagName, value) {
  const element = document.createElement(tagName);
  element.textContent = value;
  return element;
}

function formatAxisCost(nanoUsd) {
  const dollars = nanoUsd / 1_000_000_000;
  const digits = dollars >= 1 ? 2 : dollars >= 0.01 ? 3 : 6;
  return `$${dollars.toFixed(digits)}`;
}

function formatHeadlineCost(nanoUsd) {
  const dollars = nanoUsd / 1_000_000_000;
  const digits = dollars >= 1 ? 2 : dollars >= 0.01 ? 3 : 6;
  return `$${dollars.toFixed(digits)}`;
}
