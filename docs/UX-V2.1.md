# Poker Lab UX v2.1 — Play first

## Scope

This release changes the practice interface, not the poker engine, scenario
fixtures, hand evaluator or bot policy. It is not a GTO solver or strategy grader.
Legacy HU remains at `hu.html`. The repository and Pages URL are unchanged.

## Interaction

- Main page: current street, starting scenario, six seats, community cards,
  hero cards, recent action context, Pot / Stack / extra Call, and decision dock.
- Settings and reviews use native dialogs. Opening either pauses the bot queue;
  closing resumes only when the user has not explicitly paused. Escape works.
- Settings separates choosing a scenario from starting it. Changing learning
  aids does not restart the hand. Mode and selected scenario persist when
  localStorage is available. Blocked/corrupt storage falls back safely.
- Selection never commits chips. Typed sizes update the preview immediately;
  the redundant size-submit button is removed. All-in is separate from presets
  and still requires the final amount-labelled confirmation.
- Live sizes are raise-to totals, with additional investment shown separately.
  Empty, negative, nonfinite, overstack and overprecise inputs are rejected.
- One shared inline planner shows investment, remaining Stack and immediate Pot.
  Caller assumptions / SPR are in an optional disclosure beside the decision.
- A short context trail shows the relevant street, opener/caller/checks. Players
  waiting behind the hero are listed clockwise, not by Set insertion order.
- Completed hands show net result and nearby Next / Replay buttons. Skipping
  an unfinished hand is counted separately. Abandoning a live hand prompts;
  already-folded players can skip without another confirmation.
- A decision key and brief touch cooldown prevent repeated confirmation or a
  second click selecting an action on a new street. New scenarios clear timers.
- Opening a math exercise removes the answer from the planner until submission.
  Think mode requires explicit reveal; Shadow hides advice and recent reviews
  during the hand. Public actions remain available in history.

## Layout and accessibility

Desktop places the table beside the decision dock. Mobile uses a bounded play
area and a dock; optional details can scroll inside it on short screens. While
selecting a size the table uses compact seats to keep community cards visible.
Main action, confirmation, preset and numeric-input controls target >=48 CSS px.
Focus styling, visible amounts, native dialog focus containment, status messages,
input labels, and a textual Fold state are retained. No speed bonus is added.

At 390x844 the acceptance script exercises ten decisions without scrolling to
find confirmation. At reduced height, inputs and confirmation remain reachable
through the dock scroll area. This is not a claim that everything fits without
scrolling on every phone or that an actual iOS software keyboard was tested.

## Verification

Run `npm test` for engine/learning regression tests plus 10 new UX-helper tests.
Run `npm run test:browser` after installing test-only Playwright 1.57.0 + Chromium.
The default browser suite uses HTTP under `/hu-poker-gto/`, including persistence.
`INLINE_BROWSER=1 CHROME_PATH=/usr/bin/chromium npm run test:browser` is the local
restricted-runtime fallback: it tests DOM/ESM/CSS, but not HTTP or persistence.
`SCREENSHOT_DIR=/path` optionally saves desktop/mobile verification screenshots.

Browser coverage: all 12 scenarios through completion, live Call/Raise arithmetic,
all-in confirmation, invalid-size handling, quiz concealment, Shadow concealment,
dialog pause/resume, stale timers, double-tap protection, pending actor order,
replay, ten phone decisions, narrow/desktop layouts, reduced viewport, and HU.
Viewports: 320x720, 390x844, 768x1000, 1366x1000; reduced-height 390x520.
The existing Pages workflow gates deployment on unit and browser tests.

## Data and limits

Progress keeps storage version 2; missing `skipped` migrates to zero without
losing earlier decision/hand/math counts. Preferences use `poker-lab.ux.v1`.
No accounts, telemetry, payments, remote data store or real-money play are added.
No Safari/iPhone hardware acceptance claim; Chromium responsive tests only.
No new solver ranges, EV-loss estimates, adaptive drills or strategic scores.
