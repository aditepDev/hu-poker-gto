# 6-max Practice v2.0 — specification and handoff

## Locked scope

Build a repetition-friendly learning game: realistic prior actions, actual BB
accounting, self-directed decisions and continuation through the same hand.
Start six-handed, 100 BB each, SB/BB 0.5/1, no ante, no rake. Do not force speed.
Keep the old HU mode accessible. Do not claim a heuristic is GTO or an EV oracle.

The default experience is 6-max Practice. The user selects an action before
committing. Learn mode exposes the arithmetic; Think mode requires an explicit
reveal; Shadow mode withholds planner/review until hand completion. Existing
positions are never renamed just because four players fold.

## Delivered

Twelve fixtures cover UTG opening, HJ/CO facing an open, unopened BTN, SB versus
BTN, BB facing an open plus caller, BB facing a 3-bet, BB against limpers,
two-player flop, multiway flop with another player waiting, turn sizing and
river call price. Each fixture is constructed by replaying legal actions through
the engine. The remaining deck and illustrative hero hand vary with the seed;
exact replay is deterministic. Scripted preflop aggressors receive illustrative
playable hole cards, not a solver-derived range distribution.

The engine supports integer accounting, live/folded/all-in status, minimum
raises, non-reopening short raises, cumulative short-all-in reopening, refunds,
main/side pots, split pots and odd units. Positions remain UTG/HJ/CO/BTN/SB/BB.
Postflop starts at the first live seat after BTN. Six-max and HU engines are
separate; do not retrofit the old two-player equity evaluator as a multiway solver.

Bots use their own hole cards, public board and public chip state only. They do
not inspect hero cards or hidden future board cards. Their strategy is deliberately
simple and is NOT used to label player decisions correct or incorrect.

## Arithmetic contract

All internal money is integer units; 100 units = 1 BB. UI precision is 0.01 BB.
The visible current Pot includes every contribution, including the current Bet.

- Call investment = min(stack behind, current wager minus own street contribution).
- Raise investment = raise-to target minus own street contribution.
- Immediate Pot = current Pot + own investment, BEFORE other responses/refunds.
- Remaining stack immediately = current stack minus own investment.
- Conditional raise preview explicitly chooses callers; others fold. Existing
  all-in players cannot fold. Each caller is capped at its actual stack.
- Conditional Pot includes all existing dead money and matching new contributions,
  minus uncalled excess refunded to its owner.
- Only a single-opponent conditional preview uses effective SPR. Multiway shows
  own Stack/Pot and warns that one number is not a universal multiway SPR.
- Call price uses the portion of the Pot the caller can actually win after calling,
  excluding unmatched amounts above a short caller's contribution cap. It is a
  cost threshold, not proof a call is strategically correct, especially with
  future streets or potential raises behind.
- Results distinguish gross payout from net stack change across the full hand.

Regression examples (not solver recommendations):

1. HJ opens 2.5 BB, BTN calls, SB folds, hero BB posted 1 BB: Pot is 6.5 BB,
   Call costs 1.5 BB, immediate Pot becomes 8 BB, hero has 97.5 BB remaining.
2. Hero instead raises to 10 BB: invest 9 BB, immediate Pot 15.5 BB. If HJ and
   BTN both call: Pot 30.5 BB. If only HJ calls and BTN folds: Pot 23 BB.
3. UTG opens 2.5 BB, HJ raises to 8.5 BB, hero BB acts: Call costs 7.5 BB, not
   8.5 BB. UTG still has a decision after hero; action is not closed.

## Honest feedback and progress

No new strategy grade, GTO-frequency grade, EV-loss number, equity estimate or
unverified leak score. Feedback describes investment, remaining chips, immediate
Pot and clearly labelled assumptions. A separate optional question checks the
arithmetic only. One exercise is counted per decision, with no speed bonus.

Progress uses versioned localStorage `poker-lab.practice.v2`, bounded to 30 recent
decisions. It contains counters, scenario IDs, seeds and explanatory text; it
has no account, cloud sync or cross-device history. Corrupt or inaccessible storage
falls back safely. Current in-progress hands are not restored after a reload.
Reset requires confirmation. Mode switching and skipping cancel stale bot timers.
The visual app remains local-only; client JavaScript is inspectable, not an
anti-cheating multiplayer boundary.

## Validation evidence

Before the first v2 commit: `npm test` passed 34 tests, including 3,000 seeded
multiway chip-conservation/deadlock simulations. Browser acceptance passed all
12 scenario continuations and checked widths 320/390/768/1366, Call/Raise math,
invalid sizing, arithmetic checks, hidden aids, shadow review, timer cancellation,
deterministic replay, and legacy HU startup, with no uncaught page errors.

The local browser environment blocks network navigation, so that local run used
`INLINE_BROWSER=1 CHROME_PATH=/usr/bin/chromium`. It injected real DOM/CSS and
loaded ESM via data URLs; it did not verify HTTP asset delivery or actual native
localStorage persistence. The Pages workflow runs the normal HTTP variant at
`/hu-poker-gto/`, including native progress reload, before publishing.

Do not report CI/deployment success until the corresponding commit's Actions
run is complete. Do not claim physical iPhone/Safari testing: responsive Chromium
is what is covered. Further tests should target WebKit, range-aware opponents,
side-pot decision analytics and long sessions.

## Deferred (not shipped)

Timed Snap; adaptive scheduling/leak detection; solver-backed ranges, EVs and
strategy grades; continuous 6-max matches; cash rake/ante, tournaments and ICM;
accounts, multiplayer, payments and cross-device sync. If adding solver data,
store the exact positions, stacks, rake/ante, bet tree, source/version and usable
licence alongside it. Never infer EV loss from how rarely an action was selected.

## Sources for rule mechanics and deployment

Poker TDA 2026 rules 21/23 (odd units/side pots), 36-C (HU distinction), 45/49
(raise increments/reopening) were used as references for the betting mechanics,
not to claim this no-rake training mode implements tournament policy or ICM:
https://www.pokertda.com/view-poker-tda-rules/

General Hold'em betting/street reference:
https://www.pokerstars.com/poker/games/texas-holdem/

GitHub Pages custom workflow permissions and deployment prerequisites:
https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
