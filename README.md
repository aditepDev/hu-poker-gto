# Poker Lab — 6-max Practice v2.0

Practice poker decisions without real money. The main page is now a Thai-first
six-max scenario trainer; the original heads-up game remains at `hu.html`.

## Play

Live site: https://aditepdev.github.io/hu-poker-gto/

Read the prior actions, select Fold / Check / Call / Bet-Raise, inspect the BB
arithmetic, then confirm. Opponents continue the same hand until your next turn
or showdown. You can pause, skip to another scenario, or replay the same seed.

- 12 legal replay-based scenario families, covering all six positions and all streets.
- 100 BB initial stacks, 0.5/1 blinds, no ante or rake; each new scenario resets stacks.
- Call costs subtract money already invested on the current street.
- Custom raise-to sizes, pot-fraction presets, minimum-raise validation and all-in.
- Planner separates immediate arithmetic from explicit caller assumptions.
- Multiway betting, short all-ins, reopening, uncalled refunds and side pots.
- Learn / Think for yourself / Review after the hand; no compulsory timer.
- Optional BB arithmetic exercise, local progress and recent-decision replay.
- Mobile layout, including compact inline amount preview; no account or payments.

**Not a GTO solver.** The new trainer does not assign GTO grades, solver action
frequencies or EV loss. Its feedback is arithmetic and context, not strategic
correctness. Scenario prefixes and illustrative hand pools are authored fixtures,
not solved ranges. Continuation bots use a lightweight heuristic and only their
own cards plus public information. Legacy HU heuristic scores are explicitly
labelled as a demonstration, not verified strategy grades.

## Run locally

Node.js 22. No runtime dependencies or npm install required.

```sh
npm start
# http://127.0.0.1:4173/
npm test
npm run build
```

Browser acceptance tests have a separate development-only dependency:

```sh
python -m pip install playwright==1.57.0
python -m playwright install --with-deps chromium
npm run test:browser
```

The browser check starts its own server at port 4184 under `/hu-poker-gto/`.
`CHROME_PATH` optionally selects an installed Chromium. `INLINE_BROWSER=1` is
for environments that block browser network navigation: it injects the same
HTML/CSS and rewrites ESM imports to data URLs. That variant does not validate
HTTP loading or native storage persistence; CI uses the full HTTP version.

## Deployment

Push to `main` runs unit tests, seeded simulations and browser acceptance before
publishing. Only `dist/` is uploaded. A failed test prevents deployment.
`build.json` records the deployed version and commit. Pages source must be
GitHub Actions (already enabled for this repository).

## Development entry points

Read [the v2 specification and handoff](docs/PRACTICE-V2.md) before extending it.

- `src/practice/engine.js`: independent six-max rules and arithmetic projection.
- `src/practice/scenarios.js`: replayable prefixes and continuation bot.
- `src/practice/learning.js`: honest feedback, arithmetic exercises and storage.
- `src/practice/app.js`, `index.html`, `practice.css`: new UI.
- `src/game.js`, `src/app.js`, `hu.html`: preserved legacy HU implementation.
- `tests/`, `scripts/browser-smoke.py`: regression and browser checks.

Timed Snap, solver-backed strategy grading, adaptive leak detection and
continuous six-max cash/tournament sessions are not implemented in v2.0.
