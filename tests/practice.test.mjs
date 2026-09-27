import test from 'node:test';
import assert from 'node:assert/strict';
import {SixMaxGame,project,potLayers,seeded,POSITIONS,BB} from '../src/practice/engine.js';
import {SCENARIOS,makeScenario,practiceBot} from '../src/practice/scenarios.js';

const act=(g,k,t)=>g.act(g.toAct,k,t);
const passive=g=>act(g,g.callAmount(g.toAct)?'call':'check');

test('12 replayable fixtures: all end legally at the advertised hero',()=>{
  for(const s of SCENARIOS) for(let seed=1;seed<=30;seed++) {
    const {game:g}=makeScenario(s.id,seed);assert.equal(g.toAct,s.hero);g.assert();
    assert.deepEqual(makeScenario(s.id,seed).game.players,g.players);
  }
});
test('BB open + caller: pot 6.5, call 1.5, pot after call 8 BB (no double counting)',()=>{
  const {game:g}=makeScenario('bb-open-call',42),p=project(g,5,{kind:'call'});
  assert.equal(g.pot,650);assert.equal(p.invest,150);assert.equal(p.potNow,800);assert.equal(p.remaining,9750);assert.equal(p.potOdds,150/800);
  g.act(5,'call');assert.equal(g.street,'flop');assert.equal(g.pot,800);assert.equal(g.toAct,5);
});
test('BB against 3-bet subtracts posted blind and leaves opener pending',()=>{
  const {game:g}=makeScenario('bb-3bet',7);assert.equal(g.callAmount(5),750);g.act(5,'call');assert.equal(g.toAct,0);assert.equal(g.street,'preflop');
});
test('unopened BTN has limp/call, not check',()=>{
  const {game:g}=makeScenario('btn-unopened',7);assert.equal(g.legal().call,100);assert.equal(g.legal().check,false);
});
test('BB vs limpers can check; postflop still starts at SB',()=>{
  const {game:g}=makeScenario('bb-limp',7);assert.equal(g.legal().check,true);g.act(5,'check');assert.equal(g.toAct,4);
});
test('6-max down to two retains CO/BTN, BB not renamed as HU SB',()=>{
  const {game:g}=makeScenario('flop-ip',7);assert.deepEqual(g.live.map(p=>p.position),['CO','BTN']);assert.equal(g.toAct,3);g.act(3,'check');assert.equal(g.street,'turn');assert.equal(g.toAct,2);
});
test('multiway flop call does not skip BB waiting behind',()=>{
  const {game:g}=makeScenario('flop-multi',7);assert.equal(g.pot,1500);g.act(4,'call');assert.equal(g.toAct,5);assert.equal(g.pot,2000);
});
test('raise-to preview separates investment and explicitly selected callers',()=>{
  const {game:g}=makeScenario('bb-open-call',7);
  const p=project(g,5,{kind:'raise',target:1000},[1,3]);assert.equal(p.invest,900);assert.equal(p.potNow,1550);assert.equal(p.remaining,9000);assert.equal(p.conditional.pot,3050);assert.equal(p.conditional.effectiveSpr,null);
  const q=project(g,5,{kind:'raise',target:1000},[1]);assert.equal(q.conditional.pot,2300);assert.equal(q.conditional.effectiveSpr,9000/2300);
  const z=project(g,5,{kind:'raise',target:1000},[]);assert.equal(z.conditional.closed,true);assert.equal(z.conditional.refund,750);
});
test('check/call and previews reject NaN, illegal minimum, wrong actor, repeated action',()=>{
  const {game:g}=makeScenario('bb-open-call',7);for(const n of [NaN,Infinity,-1,300,1.2,10001])assert.throws(()=>g.act(5,'raise',n));
  assert.throws(()=>g.act(1,'call'));assert.throws(()=>project(g,5,{kind:'check'}));assert.throws(()=>project(g,5,{kind:'raise',target:NaN}));
});
test('under-raise all-in does not reopen prior caller but unacted BB retains raise rights',()=>{
  const g=new SixMaxGame({seed:2,stacks:[1000,1000,175,1000,1000,1000]});
  act(g,'call');act(g,'fold');act(g,'raise',175);act(g,'fold');act(g,'fold');
  assert.equal(g.toAct,5);assert.equal(g.legal().canRaise,true);assert.equal(g.legal().min,275);act(g,'call');
  assert.equal(g.toAct,0);assert.equal(g.legal().canRaise,false);act(g,'call');g.assert();
});
test('cumulative short all-ins reopen only for a player facing a full raise',()=>{
  const g=new SixMaxGame({seed:2,stacks:[1000,125,1000,200,1000,1000]});
  act(g,'call');act(g,'raise',125);act(g,'call');act(g,'raise',200);act(g,'call');act(g,'call');
  assert.equal(g.toAct,0);assert.equal(g.legal().canRaise,true);act(g,'call');
  assert.equal(g.toAct,2);assert.equal(g.legal().canRaise,false);
});
test('side pot eligibility includes folded money but excludes folded winners',()=>{
  const ps=[{id:0,total:100,folded:false},{id:1,total:300,folded:false},{id:2,total:300,folded:true}];
  assert.deepEqual(potLayers(ps),[{amount:300,eligible:[0,1]},{amount:400,eligible:[1]}]);
});
test('unequal all-ins settle main and side pots',()=>{
  const g=new SixMaxGame({seed:6,stacks:[100,300,300,1000,1000,1000]});
  act(g,'call');act(g,'raise',300);act(g,'call');act(g,'fold');act(g,'fold');act(g,'fold');
  assert.equal(g.status,'complete');assert.equal(g.result.layers.length,2);g.assert();
  // Main = 100*3 + SB 50 + BB 100, side = 200*2. Dead blind tiers may remain separate.
  assert.equal(g.result.pot,850);assert.equal(g.result.layers.reduce((n,p)=>n+p.amount,0),850);
  assert.ok(g.result.layers.filter(p=>p.amount===400).every(p=>!p.eligible.includes(0)));
});
test('all-in call odds exclude pots the short caller cannot win',()=>{
  const g=new SixMaxGame({seed:3,stacks:[1000,100,1000,1000,1000,1000]});
  act(g,'raise',500);const p=project(g,1,{kind:'call'});assert.equal(p.invest,100);assert.equal(p.eligiblePot,350);assert.equal(p.potOdds,100/350);
});
test('uncalled overbet returns chips; nobody can raise into only all-in opponents',()=>{
  const g=new SixMaxGame({seed:3,stacks:[1000,100,1000,1000,1000,1000]});
  act(g,'raise',1000);act(g,'call');for(let i=0;i<4;i++)act(g,'fold');
  assert.equal(g.status,'complete');assert.equal(g.result.pot,350);assert.ok(g.players[0].stack>=900);g.assert();
});
test('fold outcome records net profit, not gross returned pot',()=>{
  const g=new SixMaxGame({seed:1});act(g,'raise',1000);for(let i=0;i<5;i++)act(g,'fold');
  assert.equal(g.result.net[0],150);assert.equal(g.result.net.reduce((a,b)=>a+b,0),0);
});
test('no full blind call is required against only a short all-in BB',()=>{
  const g=new SixMaxGame({seed:1,stacks:[1000,1000,1000,1000,1000,30]});
  for(let i=0;i<4;i++)act(g,'fold');assert.equal(g.status,'complete');g.assert();
});
test('short all-in does not prevent two funded opponents betting later streets',()=>{
  const g=new SixMaxGame({seed:4,stacks:[100,1000,1000,1000,1000,1000]});
  act(g,'call');act(g,'raise',300);act(g,'call');act(g,'fold');act(g,'fold');act(g,'fold');
  assert.equal(g.status,'active');assert.equal(g.street,'flop');assert.equal(g.toAct,1);
  act(g,'raise',200);assert.equal(g.toAct,2);assert.equal(g.callAmount(2),200);g.assert();
});
test('board tie: odd unit awarded to first tied player left of BTN',()=>{
  const g=new SixMaxGame({seed:22,holes:{0:['As','Ad'],1:['Ks','Kd'],2:['Qs','Qd'],3:['Js','Jd'],4:['Ts','Td'],5:['9s','9d']}});
  const board=['Ah','Kh','Qh','Jh','Th'];g.deck=g.deck.filter(c=>!board.includes(c));
  const burns=[g.deck.pop(),g.deck.pop(),g.deck.pop()];
  g.deck.push(...[burns[0],...board.slice(0,3),burns[1],board[3],burns[2],board[4]].reverse());
  act(g,'raise',201);act(g,'call');act(g,'fold');act(g,'fold');act(g,'call');act(g,'fold');
  let n=0;while(g.status==='active'&&n++<50)passive(g);
  assert.equal(g.result.pot,703);assert.equal(g.result.payouts[4],235);assert.equal(g.result.payouts[0],234);assert.equal(g.result.payouts[1],234);
  assert.equal(g.result.net.reduce((a,b)=>a+b,0),0);g.assert();
});
test('3000 seeded random multiway hands conserve integer chips and cannot deadlock',()=>{
  for(let seed=1;seed<=3000;seed++) {
    const rng=seeded(seed),g=new SixMaxGame({seed,stacks:Array.from({length:6},()=>1+Math.floor(rng()*10000))});
    let n=0;while(g.status==='active'&&n++<250){const l=g.legal(),z=rng();if(l.canRaise&&z>.65)act(g,'raise',z>.9?l.max:Math.min(l.max,l.min+Math.floor(rng()*(l.max-l.min+1))));else if(l.fold&&z<.22)act(g,'fold');else passive(g);}
    assert.ok(n<250,`deadlock seed ${seed}`);g.assert();assert.equal(g.result.net.reduce((a,b)=>a+b,0),0);
  }
});
test('practice bots never inspect opponent cards or hidden runout',()=>{
  const {game:a}=makeScenario('bb-open-call',55),{game:b}=makeScenario('bb-open-call',55);
  b.players.filter(p=>p.id!==b.toAct).forEach(p=>p.hole=['As','Ah']);b.deck.reverse();
  assert.deepEqual(practiceBot(a),practiceBot(b));
});
