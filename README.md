# HU Poker Lab

Playable heads-up No-Limit Texas Hold'em training game vs a mixed-strategy bot, with post-action GTO-inspired review.

## Run

```bash
npm start
```
Open http://127.0.0.1:4173

## Test

```bash
npm test
```

The project has no runtime dependencies. GTO review is an educational approximation using Monte Carlo equity, pot odds, SPR, and mixed action heuristics; it is not a full CFR/GTO solver.

### Included
- Correct HU blind and action order (BTN/SB acts first preflop; BB first postflop)
- Fold/check/call/half-pot/pot/all-in actions
- Short all-in unmatched-chip refund
- Automatic runout/showdown
- 5–7 card hand evaluator
- Bot mixed strategy
- Post-action equity, pot odds, SPR, suggested mix, decision score
- 20/50/100 BB matches
- Node tests + randomized chip-conservation/deadlock simulation

## GitHub Pages

A Pages workflow is included. In the repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** once. Pushes to `main` then deploy the playable static site automatically.
