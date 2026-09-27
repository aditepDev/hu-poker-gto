import test from 'node:test'; import assert from 'node:assert/strict';
import {evaluateBest,compareRanks,handName} from '../src/poker.js'; import {HeadsUpGame} from '../src/game.js'; import {analyzeDecision} from '../src/gto.js';
const rng=()=>0.42;

test('hand evaluator ranks strong hands correctly',()=>{
  const sf=evaluateBest(['As','Ks','Qs','Js','Ts','2d','3c']); const quads=evaluateBest(['Ah','Ad','Ac','As','Kd','2s','3h']);
  assert.equal(handName(sf),'Straight Flush'); assert.equal(handName(quads),'Four of a Kind'); assert.ok(compareRanks(sf.rank,quads.rank)>0);
});

test('heads-up blind/action order alternates',()=>{
  const g=new HeadsUpGame({stackBb:100,rng}); g.startHand(); assert.equal(g.dealer,'hero'); assert.equal(g.toAct,'hero'); g.act('hero','fold'); g.startHand(); assert.equal(g.dealer,'bot'); assert.equal(g.toAct,'bot'); g.assertInvariants();
});

test('call then check reaches flop without losing chips',()=>{
  const g=new HeadsUpGame({stackBb:100,rng}); g.startHand(); g.act('hero','call'); assert.equal(g.toAct,'bot'); g.act('bot','check'); assert.equal(g.street,'flop'); assert.equal(g.toAct,'bot'); g.assertInvariants();
});

test('fold awards the full pot',()=>{
  const g=new HeadsUpGame({stackBb:20,rng}); g.startHand(); const before=g.players.bot.stack; g.act('hero','fold'); assert.equal(g.status,'complete'); assert.equal(g.result.winner,'bot'); assert.ok(g.players.bot.stack>before); g.assertInvariants();
});

test('all-in/call resolves showdown and conserves chips',()=>{
  const g=new HeadsUpGame({stackBb:20,rng}); g.startHand(); g.act('hero','allin'); const legal=g.legalActions('bot').map(x=>x.id); assert.ok(legal.includes('call')); g.act('bot','call'); assert.equal(g.status,'complete'); assert.equal(g.board.length,5); g.assertInvariants();
});

test('GTO analysis returns normalized legal mix',()=>{
  const g=new HeadsUpGame({stackBb:100,rng}); g.startHand(); const a=analyzeDecision(g,'hero',{iterations:20,rng}); const sum=Object.values(a.mix).reduce((x,y)=>x+y,0); assert.ok(Math.abs(sum-1)<1e-9); for(const k of Object.keys(a.mix)) assert.ok(g.legalActions('hero').some(x=>x.id===k));
});

test('random legal play never deadlocks or destroys chips',()=>{
  for(let h=0;h<120;h++){
    const g=new HeadsUpGame({stackBb:20+((h%3)*30)}); g.startHand(); let guard=0;
    while(g.status==='active' && guard++<80){ const legal=g.legalActions(); assert.ok(legal.length>0); const pick=legal[Math.floor(Math.random()*legal.length)]; g.act(g.toAct,pick.id); g.assertInvariants(); }
    assert.ok(guard<80,'hand deadlocked'); g.assertInvariants();
  }
});
