import { createDeck, shuffle, evaluateBest, compareRanks, handName } from '../poker.js';

// Integer units only: 100 units = 1 BB. This table always starts six-handed.
export const BB = 100;
export const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
export const STREETS = ['preflop', 'flop', 'turn', 'river'];
export const bb = units => Number((units / BB).toFixed(2));
export const fmt = units => `${bb(units)} BB`;
export function seeded(seed) {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const sum = xs => xs.reduce((a,b) => a+b, 0);

// Folded contributions fund pots but folded players cannot win them.
export function potLayers(players) {
  let previous = 0;
  const layers = [...new Set(players.map(p => p.total).filter(Boolean))].sort((a,b)=>a-b).map(cap => {
    const contributors = players.filter(p => p.total >= cap);
    const layer = {amount: (cap - previous) * contributors.length,
      eligible: contributors.filter(p => !p.folded).map(p => p.id)};
    previous = cap;
    return layer;
  });
  const merged = [];
  for (const layer of layers) {
    const last = merged.at(-1);
    if (last && last.eligible.join(',') === layer.eligible.join(',')) last.amount += layer.amount;
    else merged.push(layer);
  }
  return merged;
}

export class SixMaxGame {
  constructor({seed = Date.now(), stacks = Array(6).fill(100 * BB), holes = {}} = {}) {
    if (stacks.length !== 6 || stacks.some(n => !Number.isSafeInteger(n) || n <= 0 || n > 10000000)) throw new Error('Six positive integer stacks required');
    this.rng = seeded(seed); this.seed = seed; this.initialTotal = sum(stacks);
    this.players = POSITIONS.map((position,id) => ({id, position, initial: stacks[id], stack: stacks[id], total: 0, bet: 0, folded: false, hole: [], last: ''}));
    const fixed = Object.values(holes).flat();
    if (fixed.some(c => !createDeck().includes(c)) || new Set(fixed).size !== fixed.length) throw new Error('Invalid or duplicate cards');
    for (const [id, cards] of Object.entries(holes)) if (!this.players[id] || cards.length !== 2) throw new Error('Invalid fixed hole cards');
    this.deck = shuffle(createDeck().filter(c => !fixed.includes(c)), this.rng);
    for (const p of this.players) p.hole = holes[p.id] ? [...holes[p.id]] : [this.deck.pop(), this.deck.pop()];
    this.board = []; this.burned = []; this.street = 'preflop'; this.currentBet = BB;
    this.lastRaise = BB; this.actedAt = Array(6).fill(null);
    this.pending = new Set(this.players.map(p=>p.id)); this.log = []; this.result = null; this.status = 'active';
    for (const [id,n] of [[4,BB/2],[5,BB]]) { const paid = Math.min(n,this.players[id].stack); this.pay(id,paid); this.players[id].last = `Blind ${fmt(paid)}`; }
    this.toAct = 0; this.progress(5); this.assert();
  }
  get pot() { return sum(this.players.map(p => p.total)); }
  get live() { return this.players.filter(p => !p.folded); }
  callAmount(id) {
    const p = this.players[id];
    let target = this.currentBet;
    const others = this.live.filter(q => q.id !== id);
    // No need to match a nominal full blind if every opponent is already all-in.
    if (others.every(q => q.stack === 0)) target = Math.min(target, Math.max(0,...others.map(q=>q.bet)));
    return Math.min(p.stack, Math.max(0,target-p.bet));
  }
  legal(id = this.toAct) {
    const p = this.players[id];
    if (this.status !== 'active' || id !== this.toAct || !p || p.folded || p.stack === 0) return null;
    const call = this.callAmount(id), max = p.bet + p.stack;
    const reopened = this.actedAt[id] === null || this.currentBet-this.actedAt[id] >= this.lastRaise;
    const canRaise = reopened && max > this.currentBet && this.live.some(q=>q.id!==id && q.stack>0);
    return {fold: call>0, check: call===0, call, canRaise, min: this.currentBet + this.lastRaise, max};
  }
  pay(id, amount) {
    const p = this.players[id];
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > p.stack) throw new Error('Invalid contribution');
    p.stack -= amount; p.bet += amount; p.total += amount;
  }
  act(id, kind, target = null) {
    const l = this.legal(id), p = this.players[id];
    if (!l) throw new Error('Not this player’s turn');
    const potBefore = this.pot, stackBefore = p.stack, street = this.street, opening = this.currentBet === 0;
    let amount = 0;
    if (kind === 'fold' && l.fold) p.folded = true;
    else if (kind === 'check' && l.check) { /* no chips */ }
    else if (kind === 'call' && l.call > 0) { amount = l.call; this.pay(id,amount); }
    else if (kind === 'raise' && l.canRaise) {
      if (!Number.isSafeInteger(target) || target > l.max || target <= this.currentBet || (target < l.min && target !== l.max)) throw new Error('Invalid raise-to amount');
      const increase = target-this.currentBet;
      amount = target-p.bet; this.pay(id,amount);
      if (increase >= this.lastRaise) this.lastRaise = increase;
      this.currentBet = target;
      for (const q of this.live) if (q.id !== id && q.stack > 0 && q.bet < target) this.pending.add(q.id);
    } else throw new Error('Illegal action');
    // A check before an opening wager does not surrender the right to raise.
    this.actedAt[id] = kind === 'check' && this.currentBet === 0 ? null : this.currentBet;
    this.pending.delete(id);
    p.last = kind === 'raise' ? `${opening ? 'Bet' : 'Raise to'} ${fmt(target)}` : kind === 'call' ? `Call ${fmt(amount)}` : kind === 'check' ? 'Check' : 'Fold';
    this.log.push({id, position:p.position, street, kind, target:kind==='raise'?target:null, amount, potBefore, potAfterAction:potBefore+amount, stackBefore, stackAfterAction:p.stack});
    this.progress(id); this.assert();
    return this.log.at(-1);
  }
  progress(after) {
    for (const id of this.pending) if (this.players[id].folded || this.players[id].stack === 0) this.pending.delete(id);
    if (this.live.length === 1) { this.refund(); return this.settle(true); }
    const funded = this.live.filter(p=>p.stack>0);
    if (funded.length <= 1 && (funded.length===0 || this.callAmount(funded[0].id)===0)) return this.finishRound();
    if (!this.pending.size) return this.finishRound();
    for (let n=1;n<=6;n++) { const id=(after+n)%6; if(this.pending.has(id)) {this.toAct=id;return;} }
    throw new Error('No next actor');
  }
  refund() {
    const ordered=[...this.players].sort((a,b)=>b.bet-a.bet), high=ordered[0];
    const excess=high.bet-ordered[1].bet;
    if (excess > 0) { high.bet-=excess; high.total-=excess; high.stack+=excess; }
    return excess;
  }
  dealStreet() {
    this.burned.push(this.deck.pop());
    this.street = STREETS[STREETS.indexOf(this.street)+1];
    for(let i=0;i<(this.street==='flop'?3:1);i++) this.board.push(this.deck.pop());
  }
  finishRound() {
    this.refund();
    for(const p of this.players) p.bet=0;
    this.currentBet=0;this.lastRaise=BB;this.actedAt=Array(6).fill(null);
    if(this.street==='river' || this.live.filter(p=>p.stack>0).length<=1) {
      while(this.board.length<5) this.dealStreet();
      return this.settle(false);
    }
    this.dealStreet();
    this.pending=new Set(this.live.filter(p=>p.stack>0).map(p=>p.id));
    this.progress(3); // first live seat left of BTN, never re-label as heads-up
  }
  settle(fold) {
    const pot=this.pot, payouts=Array(6).fill(0), ranks={};
    const layers=fold ? [{amount:pot,eligible:[this.live[0].id]}] : potLayers(this.players);
    if(!fold) for(const p of this.live) ranks[p.id]=evaluateBest([...p.hole,...this.board]);
    for(const layer of layers) {
      if(!layer.eligible.length) throw new Error('Pot has no eligible winner');
      let winners=[layer.eligible[0]];
      if(!fold) for(const id of layer.eligible.slice(1)) {
        const cmp=compareRanks(ranks[id].rank,ranks[winners[0]].rank);
        if(cmp>0) winners=[id]; else if(cmp===0) winners.push(id);
      }
      winners.sort((a,b)=>((a+2)%6)-((b+2)%6)); // odd unit left of BTN first
      const share=Math.floor(layer.amount/winners.length); let odd=layer.amount%winners.length;
      for(const id of winners) payouts[id]+=share+(odd-->0?1:0);
      layer.winners=winners;
    }
    this.result={type:fold?'fold':'showdown',pot,payouts,layers,net:this.players.map((p,id)=>p.stack+payouts[id]-p.initial),hands:Object.fromEntries(Object.entries(ranks).map(([id,r])=>[id,handName(r)]))};
    for(const p of this.players) {p.stack+=payouts[p.id];p.total=0;p.bet=0;}
    this.currentBet=0;this.status='complete';this.toAct=null;this.pending.clear();
  }
  assert() {
    const nums=this.players.flatMap(p=>[p.stack,p.total,p.bet]);
    if(nums.some(n=>!Number.isSafeInteger(n)||n<0)) throw new Error('Invalid chip balance');
    if(sum(this.players.map(p=>p.stack+p.total))!==this.initialTotal) throw new Error('Chip conservation');
    if(this.players.some(p=>p.bet>p.total)) throw new Error('Street contribution exceeds total');
    const cards=[...this.deck,...this.board,...this.burned,...this.players.flatMap(p=>p.hole)];
    if(cards.length!==52 || new Set(cards).size!==52) throw new Error('Duplicate/missing card');
    if(this.status==='active'&&!this.legal()) throw new Error('Deadlocked hand');
    return true;
  }
}

// Preview is arithmetic, not an EV estimate. Callers are an explicit assumption.
export function project(game,id,action,callers=game.live.filter(p=>p.id!==id).map(p=>p.id)) {
  const l=game.legal(id); if(!l) throw new Error('No decision to project');
  if(action.kind==='fold'&&!l.fold || action.kind==='check'&&!l.check || action.kind==='call'&&!l.call) throw new Error('Illegal preview');
  if(!['fold','check','call','raise'].includes(action.kind)) throw new Error('Unknown action');
  if(action.kind==='raise'&&(!l.canRaise||!Number.isSafeInteger(action.target)||action.target>l.max||action.target<=game.currentBet||(action.target<l.min&&action.target!==l.max))) throw new Error('Invalid preview size');
  const me=game.players[id], invest=action.kind==='raise'?action.target-me.bet:action.kind==='call'?l.call:0;
  const potNow=game.pot+invest, remaining=me.stack-invest;
  const output={invest,potNow,remaining,conditional:null,potOdds:null};
  if(action.kind==='call') {
    const cap=me.total+invest;
    const eligiblePot=sum(game.players.map(p=>Math.min(p.total+(p.id===id?invest:0),cap)));
    output.potOdds=eligiblePot>0?invest/eligiblePot:0;
    output.eligiblePot=eligiblePot;
  }
  if(action.kind!=='raise') return output;
  const ps=game.players.map(p=>({...p})); const h=ps[id];
  h.stack-=invest;h.bet+=invest;h.total+=invest;
  for(const q of ps) if(q.id!==id&&!q.folded&&q.stack>0) {
    if(!callers.includes(q.id)) {q.folded=true;continue;}
    const pay=Math.min(q.stack,Math.max(0,action.target-q.bet));q.stack-=pay;q.bet+=pay;q.total+=pay;
  }
  const order=[...ps].sort((a,b)=>b.bet-a.bet), excess=order[0].bet-order[1].bet;
  if(excess>0) {order[0].bet-=excess;order[0].total-=excess;order[0].stack+=excess;}
  const pot=sum(ps.map(p=>p.total)), opp=ps.filter(p=>p.id!==id&&!p.folded), layers=potLayers(ps);
  output.conditional={pot,remaining:h.stack,refund:h.stack-remaining,opponents:opp.map(p=>p.id),
    stackToPot:pot?h.stack/pot:null,effectiveSpr:opp.length===1&&pot?Math.min(h.stack,opp[0].stack)/pot:null,
    sidePots:layers.length>1,closed:opp.length===0};
  return output;
}
