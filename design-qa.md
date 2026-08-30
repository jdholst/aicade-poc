# Design QA

Source visual truth: `/Users/jdholst/Git/aicade-poc/design-qa-source.png`, interpreted with the two browser annotations requesting a standard-width Known Cost card and removal of the exact, estimate, and unknown-call line.

Implementation screenshot: `/Users/jdholst/Git/aicade-poc/design-qa-implementation.png`

Desktop implementation screenshot: `/Users/jdholst/Git/aicade-poc/design-qa-implementation-desktop.png`

Side-by-side comparison: `/Users/jdholst/Git/aicade-poc/design-qa-comparison.png`

Interaction source: `/Users/jdholst/Git/aicade-poc/design-qa-source-interaction.png`

Interaction implementation: `/Users/jdholst/Git/aicade-poc/design-qa-implementation-interaction.png`

Interaction comparison: `/Users/jdholst/Git/aicade-poc/design-qa-comparison-interaction.png`

## Capture normalization

- Primary viewport: 675 x 605 CSS px.
- Source pixels: 675 x 605.
- Implementation pixels: 675 x 605.
- Device pixel ratio: 2 for both browser captures.
- State: all-time cost timeframe, no priced historical evidence.
- Desktop check: 1200 x 800 CSS px.

## Fidelity review

- Fonts and typography: Existing font family, weights, letter spacing, and hierarchy are unchanged.
- Spacing and layout rhythm: Known Cost is 309.25 x 120.34 px at the primary viewport, matching every other summary card. At 1200 px, all six cards are approximately 174.66 x 141.34 px.
- Colors and visual tokens: Existing panel, border, text, muted text, and focus tokens are unchanged.
- Image quality and asset fidelity: This dashboard region contains no image assets.
- Copy and content: The exact, estimate, and unknown-call breakdown is removed. The Known Cost value and timeframe selector remain.

## Interaction and runtime evidence

- The timeframe selector changed from `all` to `week` and back to `all` successfully.
- Before the stacking fix, the dropdown-center hit target was `a.cost-stat-link`. After the fix, the hit target is `select#cost-timeframe`.
- Clicking the dropdown leaves the location hash unchanged. Clicking the surrounding card still navigates to `#dashboard-attempts`.
- The dropdown retains focus across multiple one-second live-data refresh ticks. Dashboard rendering is deferred until the dropdown interaction ends, while snapshot polling continues.
- No browser console errors were recorded.
- No card overflow was detected at 675 x 605 or 1200 x 800.

## Comparison history

1. Initial source review found the two annotated P2 issues: the cost card spanned the full two-column row and displayed the unwanted breakdown line.
2. The card span and breakdown line were removed. The 675 px layout then matched the standard cards exactly.
3. A 1200 px check found a P2 dropdown overflow in the narrower six-column card. The heading was allowed to wrap, and the repeated check found no overflow.
4. Final comparison found no actionable P0, P1, or P2 issues.
5. A later interaction review found the card navigation overlay above the dropdown's parent stacking context. The header was moved above the overlay; pointer hit testing and real clicks now reach the select while the rest of the card remains navigable.
6. A final runtime review found the one-second live refresh replacing the active select and closing its native menu. Refresh rendering is now gated by the dropdown interaction state, and a 2.5-second browser check confirmed the control survives multiple refresh ticks.

Focused region comparison was sufficient because the requested change is limited to the Known Cost card. The surrounding dashboard layout and visual tokens were intentionally preserved.

final result: passed
