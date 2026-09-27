import { estimateEquity } from './poker.js';

const clamp = (v, lo=0, hi=1) => Math.min(hi, Math.max(lo, v));

function normalize(raw, legalIds) {
  const filtered = Object.fromEntries(legalIds.map(id => [id, Math.max(0, raw[id] || 0)]));
  let total = Object.values(filtered).reduce((a,b)=>a+b,0);
  if (total <= 0) {
    const each = 1 / Math.max(1, legalIds.length);
    return Object.fromEntries(legalIds.map(id => [id, each]));
  }
  return Object.fromEntries(Object.entries(filtered).map(([k,v]) => [k, v/total]));
}

export function analyzeDecision(game, player, {iterations=180, rng=Math.random} = {}) {
  const legal = game.legalActions(player);
  if (!legal.length) return null;
  const ids = legal.map(a=>a.id);
  const me = game.players[player];
  const equity = estimateEquity(me.hole, game.board, [], iterations, rng);
  const call = game.callAmount(player);
  const pot = game.potTotal;
  const potOdds = call > 0 ? call / (pot + call) : 0;
  const spr = pot > 0 ? me.stack / pot : 99;
  const raw = {};

  if (call > 0) {
    const edge = equity - potOdds;
    raw.fold = clamp(0.50 - edge * 2.8, 0.03, 0.92);
    raw.call = clamp(0.46 + edge * 1.4 - Math.max(0, equity - 0.70) * 0.8, 0.08, 0.78);

    let aggr = clamp((equity - 0.50) * 2.1, 0, 0.95);
    if (equity < potOdds - 0.08) aggr += 0.07;
    if (spr < 1.4 && equity > 0.55) aggr += 0.22;
    raw.half = aggr * (spr < 1.2 ? 0.20 : 0.48);
    raw.pot = aggr * (spr < 1.2 ? 0.18 : 0.34);
    raw.allin = aggr * (spr < 1.2 ? 0.62 : 0.18);
  } else {
    const strong = clamp((equity - 0.50) * 2.0, 0, 1);
    const bluff = equity < 0.38 ? 0.10 + game.board.length * 0.008 : 0;
    const aggr = clamp(0.18 + strong * 0.68 + bluff, 0.12, 0.92);
    raw.check = 1 - aggr;
    raw.half = aggr * (equity > 0.72 ? 0.42 : 0.58);
    raw.pot = aggr * (equity > 0.72 ? 0.38 : 0.30);
    raw.allin = aggr * (spr < 1.0 && equity > 0.58 ? 0.35 : 0.12);
  }

  const mix = normalize(raw, ids);
  const sorted = Object.entries(mix).sort((a,b)=>b[1]-a[1]);
  return {
    street: game.street,
    equity,
    potOdds,
    spr,
    callAmount: call,
    pot,
    mix,
    recommended: sorted[0]?.[0] || null,
    legal
  };
}

export function scoreDecision(analysis, actionId) {
  if (!analysis || !(actionId in analysis.mix)) return null;
  const p = analysis.mix[actionId];
  const best = Math.max(...Object.values(analysis.mix));
  const score = Math.round(100 * Math.sqrt(best > 0 ? p / best : 1));
  const label = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 55 ? 'Mixed' : 'Mistake';
  return {score, label, frequency:p, bestFrequency:best};
}

export function formatMix(analysis) {
  if (!analysis) return [];
  const names = {fold:'Fold', check:'Check', call:'Call', half:'½-pot', pot:'Pot', allin:'All-in'};
  return Object.entries(analysis.mix)
    .sort((a,b)=>b[1]-a[1])
    .map(([id,p]) => ({id, label:names[id] || id, percent:Math.round(p*100)}));
}
