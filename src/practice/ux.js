// Presentation helpers only. The engine remains the source of truth for money/legal moves.
import { BB, POSITIONS, fmt } from './engine.js';
export const MODE_LABELS = {learn:'เรียนรู้', practice:'คิดเอง', shadow:'ทดสอบ'};
export const STREET_LABELS = {preflop:'PREFLOP', flop:'FLOP', turn:'TURN', river:'RIVER'};
export function pendingAfter(game, hero, raising = false) {
  const candidates = raising ? game.live.filter(p=>p.id!==hero && p.stack>0).map(p=>p.id)
    : [...game.pending].filter(id=>id!==hero);
  return candidates.sort((a,b)=>(a-hero+6)%6-(b-hero+6)%6).map(id=>POSITIONS[id]);
}
export function actionSummary(a) {
  const action = a.kind==='raise' ? `เพิ่มถึง ${fmt(a.target)}` : a.kind==='call' ? `ตาม ${fmt(a.amount)}` : a.kind==='fold' ? 'หมอบ' : 'ผ่าน';
  return `${a.position} ${action}`;
}
export function contextSummary(game, hero) {
  const onStreet=game.log.filter(a=>a.street===game.street);
  const recent=(onStreet.length?onStreet:game.log).filter(a=>a.kind!=='fold');
  if(recent.length) {
    const tail=recent.slice(-2), street=tail.at(-1).street;
    return `${STREET_LABELS[street]} · ${tail.map(actionSummary).join(' → ')}`;
  }
  const folds=game.log.filter(a=>a.kind==='fold').map(a=>a.position);
  return folds.length?`${folds.join(', ')} หมอบ → ถึงคุณ ${POSITIONS[hero]}`:`เริ่มที่ ${POSITIONS[hero]} · ยังไม่มีใครเปิด`;
}
export function sizePresets(game, hero) {
  const l=game.legal(hero); if(!l?.canRaise)return [];
  const sizes=[['⅓ Pot',1/3],['½ Pot',.5],['¾ Pot',.75],['Pot',1]], seen=new Set();
  return sizes.map(([name,f])=>({name, target:Math.min(l.max,Math.max(l.min,game.currentBet+Math.round((game.pot+l.call)*f)))}))
    .filter(s=>{if(seen.has(s.target)||s.target===l.max)return false;seen.add(s.target);return true;});
}
export function parseBB(value) {
  // Do not silently round user input with more than two decimals into a legal wager.
  if(!/^\d+(\.\d{1,2})?$/.test(value.trim())) return NaN;
  const units=Math.round(Number(value)*BB);
  return Number.isSafeInteger(units)?units:NaN;
}
export function decisionKey(game, hero, generation) { return `${generation}:${game.street}:${game.log.length}:${hero}`; }
export function canShowPlan(mode, revealed, quizOpen, quizUsed) {
  return (mode==='learn'||(mode==='practice'&&revealed)) && !(quizOpen&&!quizUsed);
}
