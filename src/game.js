import { createDeck, shuffle, evaluateBest, compareRanks, handName } from './poker.js';

const OTHER = p => p === 'hero' ? 'bot' : 'hero';
const STREETS = ['preflop','flop','turn','river'];

export class HeadsUpGame {
  constructor({stackBb = 100, smallBlind = 1, bigBlind = 2, rng = Math.random} = {}) {
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.rng = rng;
    this.resetMatch(stackBb);
  }

  resetMatch(stackBb = this.stackBb || 100) {
    this.stackBb = Number(stackBb);
    const chips = this.stackBb * this.bigBlind;
    this.players = {
      hero: {stack: chips, streetBet: 0, hole: []},
      bot: {stack: chips, streetBet: 0, hole: []}
    };
    this.matchTotal = chips * 2;
    this.handNumber = 0;
    this.dealer = 'bot';
    this.status = 'idle';
    this.street = 'preflop';
    this.board = [];
    this.pot = 0;
    this.lastPot = 0;
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.pending = new Set();
    this.raiseLocked = {hero:false, bot:false};
    this.toAct = null;
    this.result = null;
    this.actionLog = [];
  }

  startHand() {
    if (this.status === 'active') throw new Error('Hand already active');
    if (this.players.hero.stack <= 0 || this.players.bot.stack <= 0) throw new Error('Match is over; reset match first');

    this.handNumber += 1;
    this.dealer = this.dealer === 'hero' ? 'bot' : 'hero';
    this.street = 'preflop';
    this.board = [];
    this.pot = 0;
    this.lastPot = 0;
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.pending = new Set();
    this.raiseLocked = {hero:false, bot:false};
    this.result = null;
    this.actionLog = [];
    this.status = 'active';

    this.deck = shuffle(createDeck(), this.rng);
    this.players.hero.hole = [this.deck.pop(), this.deck.pop()];
    this.players.bot.hole = [this.deck.pop(), this.deck.pop()];
    this.players.hero.streetBet = 0;
    this.players.bot.streetBet = 0;

    const sbPlayer = this.dealer;
    const bbPlayer = OTHER(this.dealer);
    this.#postBlind(sbPlayer, this.smallBlind);
    this.#postBlind(bbPlayer, this.bigBlind);
    this.currentBet = Math.max(this.players.hero.streetBet, this.players.bot.streetBet);
    this.lastRaiseSize = this.bigBlind;

    for (const p of [sbPlayer, bbPlayer]) {
      if (this.players[p].stack > 0) this.pending.add(p);
    }
    this.toAct = this.pending.has(sbPlayer) ? sbPlayer : (this.pending.has(bbPlayer) ? bbPlayer : null);

    if (!this.toAct || this.#allInNoDecisionNeeded()) this.#finishStreet();
    return this.snapshot();
  }

  #postBlind(player, amount) {
    const paid = Math.min(amount, this.players[player].stack);
    this.players[player].stack -= paid;
    this.players[player].streetBet += paid;
  }

  get potTotal() {
    return this.pot + this.players.hero.streetBet + this.players.bot.streetBet;
  }

  get callAmountHero() { return this.callAmount('hero'); }

  callAmount(player) {
    return Math.max(0, this.currentBet - this.players[player].streetBet);
  }

  legalActions(player = this.toAct) {
    if (this.status !== 'active' || player !== this.toAct || !player) return [];
    const me = this.players[player];
    if (me.stack <= 0) return [];
    const call = this.callAmount(player);
    const out = [];
    if (call > 0) {
      out.push({id:'fold', label:'Fold'});
      out.push({id:'call', label: call >= me.stack ? `Call all-in ${me.stack}` : `Call ${call}`});
    } else {
      out.push({id:'check', label:'Check'});
    }

    const canIncrease = me.streetBet + me.stack > this.currentBet && !this.raiseLocked[player];
    if (canIncrease) {
      const halfTarget = this.targetForFraction(player, 0.5);
      const potTarget = this.targetForFraction(player, 1);
      if (halfTarget > this.currentBet) out.push({id:'half', label: this.currentBet ? `Raise ${halfTarget}` : `Bet ${halfTarget}`, target: halfTarget});
      if (potTarget > this.currentBet && potTarget !== halfTarget) out.push({id:'pot', label: this.currentBet ? `Raise ${potTarget}` : `Bet ${potTarget}`, target: potTarget});
      out.push({id:'allin', label:`All-in ${me.stack}`, target: me.streetBet + me.stack});
    }
    return out;
  }

  targetForFraction(player, fraction) {
    const me = this.players[player];
    const maxTarget = me.streetBet + me.stack;
    const call = this.callAmount(player);
    let target;
    if (this.currentBet === 0) {
      const desired = Math.max(this.bigBlind, Math.round(this.potTotal * fraction));
      target = desired;
    } else {
      const potAfterCall = this.potTotal + call;
      const raiseBy = Math.max(this.lastRaiseSize, Math.round(potAfterCall * fraction));
      target = this.currentBet + raiseBy;
    }
    const minTarget = this.currentBet === 0 ? this.bigBlind : this.currentBet + this.lastRaiseSize;
    target = Math.max(target, minTarget);
    return Math.min(maxTarget, target);
  }

  act(player, actionId) {
    if (this.status !== 'active') throw new Error('No active hand');
    if (player !== this.toAct) throw new Error(`It is not ${player}'s turn`);
    const legal = this.legalActions(player);
    const item = legal.find(a => a.id === actionId);
    if (!item) throw new Error(`Illegal action: ${actionId}`);

    const before = {
      street: this.street,
      player,
      action: actionId,
      pot: this.potTotal,
      callAmount: this.callAmount(player),
      stack: this.players[player].stack,
      currentBet: this.currentBet,
      streetBet: this.players[player].streetBet
    };

    if (actionId === 'fold') {
      this.actionLog.push({...before, label:'fold'});
      this.#awardFold(OTHER(player));
      return this.snapshot();
    }
    if (actionId === 'check') {
      this.pending.delete(player);
      this.actionLog.push({...before, label:'check'});
    } else if (actionId === 'call') {
      const call = Math.min(this.callAmount(player), this.players[player].stack);
      this.#putChips(player, this.players[player].streetBet + call);
      this.pending.delete(player);
      this.actionLog.push({...before, label:'call', amount:call});
    } else {
      const target = actionId === 'allin' ? this.players[player].streetBet + this.players[player].stack : item.target;
      const oldCurrent = this.currentBet;
      if (target <= oldCurrent) {
        const call = Math.min(this.callAmount(player), this.players[player].stack);
        this.#putChips(player, this.players[player].streetBet + call);
        this.pending.delete(player);
        this.actionLog.push({...before, label:'call', amount:call, via:actionId});
      } else {
        this.#putChips(player, target);
        const newCurrent = this.players[player].streetBet;
        const raiseSize = newCurrent - oldCurrent;
        const fullRaise = oldCurrent === 0 ? newCurrent >= this.bigBlind : raiseSize >= this.lastRaiseSize;
        this.currentBet = newCurrent;
        if (fullRaise) {
          this.lastRaiseSize = oldCurrent === 0 ? newCurrent : raiseSize;
          this.raiseLocked.hero = false;
          this.raiseLocked.bot = false;
        } else {
          this.raiseLocked[OTHER(player)] = true;
        }
        this.pending = new Set();
        if (this.players[OTHER(player)].stack > 0) this.pending.add(OTHER(player));
        this.actionLog.push({...before, label:oldCurrent === 0 ? 'bet' : 'raise', target:newCurrent, via:actionId, fullRaise});
      }
    }

    if (this.pending.size === 0 || this.#allInNoDecisionNeeded()) {
      this.#finishStreet();
    } else {
      const opp = OTHER(player);
      this.toAct = this.pending.has(opp) ? opp : [...this.pending][0];
    }
    return this.snapshot();
  }

  #putChips(player, targetStreetBet) {
    const me = this.players[player];
    const add = Math.max(0, Math.min(me.stack, targetStreetBet - me.streetBet));
    me.stack -= add;
    me.streetBet += add;
  }

  #allInNoDecisionNeeded() {
    const h = this.players.hero, b = this.players.bot;
    if (h.stack > 0 && b.stack > 0) return false;
    const alive = h.stack > 0 ? 'hero' : b.stack > 0 ? 'bot' : null;
    if (!alive) return true;
    return this.callAmount(alive) === 0;
  }

  #normalizeUnmatched() {
    const h = this.players.hero, b = this.players.bot;
    if (h.streetBet === b.streetBet) return;
    if (h.stack === 0 || b.stack === 0) {
      const high = h.streetBet > b.streetBet ? 'hero' : 'bot';
      const low = OTHER(high);
      const diff = this.players[high].streetBet - this.players[low].streetBet;
      if (diff > 0) {
        this.players[high].streetBet -= diff;
        this.players[high].stack += diff;
      }
    }
  }

  #finishStreet() {
    if (this.status !== 'active') return;
    this.#normalizeUnmatched();
    this.pot += this.players.hero.streetBet + this.players.bot.streetBet;
    this.players.hero.streetBet = 0;
    this.players.bot.streetBet = 0;
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.raiseLocked = {hero:false, bot:false};
    this.pending = new Set();

    if (this.players.hero.stack === 0 || this.players.bot.stack === 0) {
      while (this.board.length < 5) this.board.push(this.deck.pop());
      this.#showdown();
      return;
    }

    if (this.street === 'river') {
      this.#showdown();
      return;
    }

    const idx = STREETS.indexOf(this.street);
    this.street = STREETS[idx + 1];
    if (this.street === 'flop') this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    else this.board.push(this.deck.pop());

    const first = OTHER(this.dealer);
    const second = this.dealer;
    if (this.players[first].stack > 0) this.pending.add(first);
    if (this.players[second].stack > 0) this.pending.add(second);
    this.toAct = this.pending.has(first) ? first : (this.pending.has(second) ? second : null);
    if (!this.toAct) this.#showdown();
  }

  #showdown() {
    const heroBest = evaluateBest([...this.players.hero.hole, ...this.board]);
    const botBest = evaluateBest([...this.players.bot.hole, ...this.board]);
    const cmp = compareRanks(heroBest.rank, botBest.rank);
    const total = this.pot;
    this.lastPot = total;
    if (cmp > 0) {
      this.players.hero.stack += total;
      this.result = {type:'showdown', winner:'hero', amount:total, heroHand:handName(heroBest), botHand:handName(botBest)};
    } else if (cmp < 0) {
      this.players.bot.stack += total;
      this.result = {type:'showdown', winner:'bot', amount:total, heroHand:handName(heroBest), botHand:handName(botBest)};
    } else {
      const half = Math.floor(total / 2);
      this.players.hero.stack += half;
      this.players.bot.stack += half;
      const odd = total - half * 2;
      if (odd) this.players[OTHER(this.dealer)].stack += odd;
      this.result = {type:'showdown', winner:'tie', amount:total, heroHand:handName(heroBest), botHand:handName(botBest)};
    }
    this.pot = 0;
    this.toAct = null;
    this.pending.clear();
    this.status = 'complete';
  }

  #awardFold(winner) {
    const total = this.potTotal;
    this.lastPot = total;
    this.players[winner].stack += total;
    this.pot = 0;
    this.players.hero.streetBet = 0;
    this.players.bot.streetBet = 0;
    this.currentBet = 0;
    this.toAct = null;
    this.pending.clear();
    this.result = {type:'fold', winner, amount:total};
    this.status = 'complete';
  }

  assertInvariants() {
    const values = [this.players.hero.stack, this.players.bot.stack, this.pot, this.players.hero.streetBet, this.players.bot.streetBet];
    if (values.some(v => !Number.isFinite(v) || v < 0)) throw new Error(`Invalid chip state: ${values.join(',')}`);
    const total = values.reduce((a,b)=>a+b,0);
    if (total !== this.matchTotal) throw new Error(`Chip conservation failed: ${total} != ${this.matchTotal}`);
    if (this.status === 'active' && !this.toAct && this.players.hero.stack > 0 && this.players.bot.stack > 0) throw new Error('Active hand has no actor');
    return true;
  }

  snapshot() {
    return {
      status:this.status, handNumber:this.handNumber, dealer:this.dealer, street:this.street,
      board:[...this.board], pot:this.potTotal, settledPot:this.pot, lastPot:this.lastPot,
      currentBet:this.currentBet, toAct:this.toAct, result:this.result ? {...this.result} : null,
      players:{
        hero:{...this.players.hero, hole:[...this.players.hero.hole]},
        bot:{...this.players.bot, hole:[...this.players.bot.hole]}
      },
      legalActions:this.legalActions().map(x=>({...x})),
      actionLog:this.actionLog.map(x=>({...x}))
    };
  }
}

export const otherPlayer = OTHER;
