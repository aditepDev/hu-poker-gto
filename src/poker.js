export const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
export const SUITS = ['s','h','d','c'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

export function createDeck() {
  return SUITS.flatMap(s => RANKS.map(r => `${r}${s}`));
}

export function shuffle(deck, rng = Math.random) {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rankValue(card) { return RANK_VALUE[card[0]]; }
export function suit(card) { return card[1]; }

export function combinations(arr, k) {
  const out = [];
  function rec(start, chosen) {
    if (chosen.length === k) { out.push([...chosen]); return; }
    for (let i = start; i <= arr.length - (k - chosen.length); i++) {
      chosen.push(arr[i]); rec(i + 1, chosen); chosen.pop();
    }
  }
  rec(0, []);
  return out;
}

export function evaluate5(cards) {
  if (cards.length !== 5) throw new Error('evaluate5 requires 5 cards');
  const values = cards.map(rankValue).sort((a,b)=>b-a);
  const suits = cards.map(suit);
  const flush = suits.every(s => s === suits[0]);
  const unique = [...new Set(values)].sort((a,b)=>b-a);
  let straightHigh = null;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (JSON.stringify(unique) === JSON.stringify([14,5,4,3,2])) straightHigh = 5;
  }

  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const groups = [...counts.entries()].sort((a,b) => b[1]-a[1] || b[0]-a[0]);

  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) {
    const kickers = groups.filter(g=>g[1]===1).map(g=>g[0]).sort((a,b)=>b-a);
    return [3, groups[0][0], ...kickers];
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const hi = Math.max(groups[0][0], groups[1][0]);
    const lo = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups.find(g=>g[1]===1)[0];
    return [2, hi, lo, kicker];
  }
  if (groups[0][1] === 2) {
    const pair = groups[0][0];
    const kickers = groups.filter(g=>g[1]===1).map(g=>g[0]).sort((a,b)=>b-a);
    return [1, pair, ...kickers];
  }
  return [0, ...values];
}

export function compareRanks(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0, bv = b[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

export function evaluateBest(cards) {
  if (cards.length < 5 || cards.length > 7) throw new Error('evaluateBest requires 5-7 cards');
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const rank = evaluate5(combo);
    if (!best || compareRanks(rank, best.rank) > 0) best = {rank, cards: combo};
  }
  return best;
}

const CATEGORY_NAMES = [
  'High Card','One Pair','Two Pair','Three of a Kind','Straight',
  'Flush','Full House','Four of a Kind','Straight Flush'
];

export function handName(rankOrBest) {
  const rank = Array.isArray(rankOrBest) ? rankOrBest : rankOrBest.rank;
  return CATEGORY_NAMES[rank[0]];
}

export function estimateEquity(hole, board = [], knownDead = [], iterations = 240, rng = Math.random) {
  const used = new Set([...hole, ...board, ...knownDead]);
  const base = createDeck().filter(c => !used.has(c));
  let score = 0;
  for (let i = 0; i < iterations; i++) {
    const sample = shuffle(base, rng);
    const opp = sample.slice(0, 2);
    const need = 5 - board.length;
    const runout = sample.slice(2, 2 + need);
    const fullBoard = [...board, ...runout];
    const heroRank = evaluateBest([...hole, ...fullBoard]).rank;
    const oppRank = evaluateBest([...opp, ...fullBoard]).rank;
    const cmp = compareRanks(heroRank, oppRank);
    score += cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0;
  }
  return score / iterations;
}

export function cardLabel(card) {
  const rankMap = {T:'10',J:'J',Q:'Q',K:'K',A:'A'};
  const suitMap = {s:'♠',h:'♥',d:'♦',c:'♣'};
  return `${rankMap[card[0]] || card[0]}${suitMap[card[1]]}`;
}

export function isRed(card) { return card[1] === 'h' || card[1] === 'd'; }
