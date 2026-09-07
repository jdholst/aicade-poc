# Design QA

## QA artifact storage

Store every QA image under the repository's `.qa/` directory. For this report, use `.qa/design-qa/`. Do not place QA screenshots, source captures, or comparison images in the repository root or `docs/`.

Source visual truth: `.qa/design-qa/design-qa-cost-history-source.png`

Focused implementation screenshot: `.qa/design-qa/design-qa-cost-history-panel.png`

Desktop implementation screenshot: `.qa/design-qa/design-qa-cost-history-desktop-final.png`

Compact implementation screenshot: `.qa/design-qa/design-qa-cost-history-compact-final.png`

Mobile implementation screenshot: `.qa/design-qa/design-qa-cost-history-mobile-final.png`

Side-by-side comparison: `.qa/design-qa/design-qa-cost-history-comparison.png`

## Capture normalization

- Primary viewport: 1200 x 800 CSS px.
- Compact viewport: 675 x 605 CSS px.
- Mobile viewport: 390 x 844 CSS px.
- State: six priced provider calls across eight UTC day buckets, one excluded call, Day grouping selected.
- The reference supplied the panel structure and chart hierarchy. The implementation retains the dashboard's existing typography, green accent, spacing, borders, and panel treatment.

## Fidelity review

- Structure: The implementation matches the reference hierarchy with total spend at the upper left, grouping at the upper right, a full-width bar chart, a dashed maximum guide, and period labels below the bars.
- Typography: Existing dashboard families, weights, tracking, and heading scale are preserved.
- Color: The reference's purple data color is intentionally mapped to the dashboard's existing green success accent. Background, borders, grid lines, text, and muted copy use existing dashboard tokens.
- Layout: The panel spans the dashboard width. Day, week, and month grouping use the same chart frame and preserve the all-history total.
- Responsive behavior: The compact chart scrolls horizontally and opens at the newest period. The mobile layout stacks the grouping control without page-level horizontal overflow.
- Content: Unknown historical calls are excluded from spend and reported quietly below the chart.

## Interaction and runtime evidence

- Day, Week, and Month each render the correct aggregation while preserving the $2.60 total.
- The Day view renders eight periods, Week renders two, and Month renders one for the controlled evidence set.
- Pointer and keyboard inspection expose period, total, exact, conservative-estimate, and priced-call details.
- Home, End, Left Arrow, and Right Arrow navigate chart periods from the focused canvas.
- Collapsing and reopening the panel restores the chart.
- The grouping selector remains active across multiple one-second live-data refresh ticks.
- The compact chart initially scrolls to its newest bucket.
- The mobile page and panel remain within the 390 px viewport.
- The existing Known Cost summary card navigates to `#dashboard-cost-history`.
- No browser console errors or warnings were recorded.

## Comparison history

1. The initial implementation reproduced the reference's total, grouping control, bars, guide line, and date labels using the dashboard's visual system.
2. The first compact pass found that an already-open chart did not reposition after a viewport resize. A clean compact reload confirmed the required initial newest-period positioning.
3. The first mobile pass found page-level horizontal overflow caused by the accessible table. Wrapping the table in the visually hidden container removed the overflow while retaining screen-reader access.
4. The initial no-evidence styles allowed author CSS to override the `hidden` attribute. Explicit hidden-state rules now suppress the canvas, scroller, and tooltip correctly.
5. The side-by-side comparison found no remaining actionable P0, P1, or P2 visual issues.

## Panel position revision

- Requested source state: the browser annotation places Known Cost after the Stage survival and Classifications row and before Campaign runs.
- Final position screenshot: `.qa/design-qa/design-qa-cost-history-position-final.png`
- Before-and-after comparison: `.qa/design-qa/design-qa-cost-history-position-comparison.png`
- The final DOM order is Stage survival/Classifications, Known Cost, then Campaign runs.
- The panel's content, dimensions, visual tokens, collapse behavior, chart rendering, and grouping selector are unchanged.
- Week grouping still renders two periods with the same $2.60 total after a live refresh. No browser errors or warnings were recorded.
- The position comparison found no actionable P0, P1, or P2 visual issues.

## Summary cost rounding revision

- Requested source state: display summary cost as standard two-decimal currency, including `$2.60` and `$0.26`.
- Final screenshot: `.qa/design-qa/design-qa-cost-summary-rounded-final.png`
- Before-and-after comparison: `.qa/design-qa/design-qa-cost-summary-rounding-comparison.png`
- The summary card now renders `$2.60`, has equal client and scroll widths, and no longer overflows.
- Detailed chart evidence retains its existing higher-precision formatting.
- No browser errors or warnings were recorded, and the comparison found no actionable P0, P1, or P2 visual issues.

## Summary navigation and weekly default revision

- Requested interaction state: the Known Cost summary card opens the full Known Cost history panel, while the rolling summary starts on Past 7 days.
- Final screenshot after card navigation: `.qa/design-qa/design-qa-cost-navigation-weekly-final.png`
- A clean reload selects Past 7 days. Clicking the card changes the URL fragment to `#dashboard-cost-history` and places the full panel within the viewport.
- The timeframe selector still changes independently without activating card navigation.
- The final capture retains the established chart hierarchy, responsive panel dimensions, typography, color tokens, and spacing. The source-to-implementation comparison found no new P0, P1, or P2 visual issues.

final result: passed
