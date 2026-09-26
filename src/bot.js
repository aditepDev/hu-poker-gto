import { analyzeDecision } from './gto.js';

export function chooseBotAction(game, {iterations=140, rng=Math.random} = {}) {
  const analysis = analyzeDecision(game, 'bot', {iterations, rng});
  if (!analysis) return null;
  const roll = rng();
  let acc = 0;
  let chosen = Object.keys(analysis.mix)[0];
  for (const [id, p] of Object.entries(analysis.mix)) {
    acc += p;
    if (roll <= acc) { chosen = id; break; }
  }
  return {action: chosen, analysis};
}
