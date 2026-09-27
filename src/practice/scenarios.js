import { SixMaxGame, seeded, POSITIONS } from './engine.js';
const f=id=>[id,'fold'], c=id=>[id,'call'], x=id=>[id,'check'], r=(id,n)=>[id,'raise',n];
const HU_FLOP=[f(0),f(1),r(2,250),c(3),f(4),f(5)];
export const SCENARIOS = [
  {id:'bb-open-call',hero:5,title:'BB เจอคนเปิด + คนตาม',tag:'Multiway · Preflop',prefix:[f(0),r(1,250),f(2),c(3),f(4)], lesson:'แยกยอด Raise to กับยอดที่ต้องจ่ายเพิ่ม และดูว่าใครยังอาจ Raise หลังคุณ'},
  {id:'btn-unopened',hero:3,title:'หมอบมาถึง BTN',tag:'Unopened · Position',prefix:[f(0),f(1),f(2)],lesson:'ยังมี SB และ BB รอตอบ ถ้าตาม blind เรียกว่า Limp ไม่ใช่ Check'},
  {id:'utg-first',hero:0,title:'คุณเปิดเกมจาก UTG',tag:'Early position',prefix:[],lesson:'มีอีกห้าตำแหน่งรอเล่น เลือกโดยคำนึงถึงคนข้างหลัง ไม่ใช่ดูไพ่เราอย่างเดียว'},
  {id:'hj-open',hero:1,title:'HJ เจอ UTG เปิด',tag:'Facing open',prefix:[r(0,250)],lesson:'การ Call ไม่ได้ปิด action ยังมี CO, BTN, SB และ BB รอเล่น'},
  {id:'co-open',hero:2,title:'CO เจอ HJ เปิด',tag:'Facing open',prefix:[f(0),r(1,250)],lesson:'ก่อนตัดสินใจ ตรวจยอด Call และจำนวนคนที่ยังอาจตามหรือเพิ่มเดิมพัน'},
  {id:'sb-btn',hero:4,title:'SB เจอ BTN เปิด',tag:'Blind defense',prefix:[f(0),f(1),f(2),r(3,250)],lesson:'คุณลง SB ไปแล้ว 0.5 BB และยังมี BB เล่นต่อจากคุณ'},
  {id:'bb-3bet',hero:5,title:'BB เจอ Open และ 3-bet',tag:'3-bet pot',prefix:[r(0,250),r(1,850),f(2),f(3),f(4)],lesson:'คุณลง BB แล้ว 1 BB จึงจ่ายเพิ่ม 7.5 BB เพื่อ Call ถึง 8.5 BB และ UTG ยังรอตอบ'},
  {id:'bb-limp',hero:5,title:'BB เจอสองคน Limp',tag:'Check or raise',prefix:[f(0),f(1),f(2),c(3),c(4)],lesson:'ไม่มีส่วนต่างให้ตาม คุณ Check ได้โดยไม่ลงเงินเพิ่ม'},
  {id:'flop-ip',hero:3,title:'Flop เหลือสองคน · คุณ BTN',tag:'Single-raised · In position',prefix:[...HU_FLOP,x(2)],lesson:'แม้เหลือสองคน ตำแหน่งยังเป็น CO กับ BTN ไม่เปลี่ยนเป็น HU BTN/SB'},
  {id:'flop-multi',hero:4,title:'Flop หลายคน · มีคนรอข้างหลัง',tag:'Multiway · Facing bet',prefix:[f(0),f(1),r(2,250),c(3),c(4),c(5),x(4),x(5),r(2,500),f(3)],lesson:'BTN หมอบแล้ว แต่ BB ยังรอเล่นหลังคุณ การ Call ครั้งนี้ไม่ปิดรอบเดิมพัน'},
  {id:'turn-plan',hero:3,title:'Turn · วางแผน Pot ถัดไป',tag:'Turn · Sizing',prefix:[...HU_FLOP,x(2),r(3,325),c(2),x(2)],lesson:'เปรียบเทียบ Stack หลัง Bet กับ Pot ถ้าอีกฝ่าย Call นี่คือสมมติฐาน ไม่ใช่ผลที่รับประกัน'},
  {id:'river-call',hero:5,title:'River · อ่านราคา Call',tag:'River · Pot odds',prefix:[f(0),f(1),r(2,250),f(3),f(4),c(5),x(5),r(2,300),c(5),x(5),x(2),x(5),r(2,800)],lesson:'Pot ที่เห็นรวม Bet ล่าสุดแล้ว อย่าบวกเงินของคู่ต่อสู้ซ้ำเมื่อคิด Pot หลัง Call'}
];

// Teaching fixtures, not solver ranges. Prefixes are replayed through legal actions.
// Hero hands vary; scripted aggressors receive illustrative playable hands.
const HERO_HANDS=['AsJd','KhQh','8s8d','Ah5h','KsTd','6c5c','QcJd','9h8h','AcKc','7s7d','As2d','Kd9d'];
const OPEN_HANDS=['AsKd','KhQh','9s9d','AcTc','JsTs','8c8d'];
export function makeScenario(id='bb-open-call',seed=Date.now()) {
  const spec=SCENARIOS.find(s=>s.id===id);if(!spec) throw new Error('Unknown scenario');
  const rng=seeded(seed), fixed={},used=new Set();
  const pick=(seat,pool)=>{
    const choices=pool.map(h=>[h.slice(0,2),h.slice(2)]).filter(cs=>cs.every(c=>!used.has(c)));
    if(!choices.length)return;
    const cards=choices[Math.floor(rng()*choices.length)];fixed[seat]=cards;cards.forEach(c=>used.add(c));
  };
  pick(spec.hero,HERO_HANDS);
  for(const [seat,kind] of spec.prefix) if(kind==='raise' && seat!==spec.hero && !fixed[seat]) pick(seat,OPEN_HANDS);
  const game=new SixMaxGame({seed,holes:fixed});
  for(const [seat,kind,target] of spec.prefix) game.act(seat,kind,target);
  if(game.toAct!==spec.hero) throw new Error(`Fixture ${id} does not end on ${POSITIONS[spec.hero]}`);
  return {game,spec,seed};
}

// Lightweight practice opponent. It sees its own cards + public board only.
// This is deliberately NOT exported as a strategy grader or a GTO policy.
export function practiceBot(game) {
  const p=game.players[game.toAct],l=game.legal(),[a,b]=p.hole.map(c=>'23456789TJQKA'.indexOf(c[0])+2);
  let strength=(a+b)/28+(a===b?.30:0)+(p.hole[0][1]===p.hole[1][1]?.05:0);
  if(game.board.length>=3) {
    // Rank category is not equity. No opponent hole cards are consulted.
    const ranks=[...p.hole,...game.board].map(c=>c[0]);
    const matches=p.hole.reduce((n,c)=>n+game.board.filter(d=>d[0]===c[0]).length,0)+(a===b?1:0);
    strength=.30+Math.min(matches,3)*.23+Math.max(a,b)/80;
    if(ranks.filter(r=>r===ranks[0]).length>=3) strength+=.1;
  }
  const roll=game.rng(),price=l.call/(game.pot+l.call||1);
  if(l.call>0 && roll<Math.max(.08,Math.min(.65,price+.55-strength*.50))) return {kind:'fold'};
  if(l.canRaise && roll>(strength>.95?.56:.82)) {
    const target=Math.min(l.max,Math.max(l.min,game.currentBet+Math.round((game.pot+l.call)*.5)));
    return {kind:'raise',target};
  }
  return {kind:l.call?'call':'check'};
}
