import test from 'node:test';
import assert from 'node:assert/strict';
import {makeScenario} from '../src/practice/scenarios.js';
import {pendingAfter,contextSummary,sizePresets,parseBB,canShowPlan,decisionKey} from '../src/practice/ux.js';
import {project} from '../src/practice/engine.js';
import {loadProgress,saveProgress,freshProgress} from '../src/practice/learning.js';

test('context keeps opener, caller and original six-max positions',()=>{
 const {game:g,spec:s}=makeScenario('bb-open-call',42);
 assert.match(contextSummary(g,s.hero),/HJ.*2.5 BB.*BTN.*2.5 BB/);
 assert.deepEqual(pendingAfter(g,s.hero),[]);
 assert.deepEqual(pendingAfter(g,s.hero,true),['HJ','BTN']);
});
test('pending actors are in actual order, not Set insertion order',()=>{
 const {game:g,spec:s}=makeScenario('flop-multi',42);
 assert.deepEqual(pendingAfter(g,s.hero),['BB']);
 assert.deepEqual(pendingAfter(g,s.hero,true),['BB','CO']);
});
test('preflop call pays only difference; direct preview does not mutate',()=>{
 const {game:g,spec:s}=makeScenario('bb-open-call',42), before=JSON.stringify(g);
 const p=project(g,s.hero,{kind:'call'});
 assert.equal(p.invest,150);assert.equal(p.remaining,9750);assert.equal(p.potNow,800);
 assert.equal(JSON.stringify(g),before);
});
test('raise input distinguishes total from incremental contribution and callers',()=>{
 const {game:g,spec:s}=makeScenario('bb-open-call',42), target=parseBB('10');
 const p=project(g,s.hero,{kind:'raise',target});
 assert.equal(p.invest,900);assert.equal(p.remaining,9000);assert.equal(p.potNow,1550);assert.equal(p.conditional.pot,3050);
 assert.equal(project(g,s.hero,{kind:'raise',target},[1]).conditional.pot,2300);
});
test('presets are legal and unique, with all-in separated',()=>{
 for(const id of ['bb-open-call','bb-3bet','flop-ip','turn-plan']){
  const {game:g,spec:s}=makeScenario(id,12);const options=sizePresets(g,s.hero);
  assert.equal(new Set(options.map(o=>o.target)).size,options.length);
  for(const o of options){assert.ok(o.target<g.legal().max);assert.doesNotThrow(()=>project(g,s.hero,{kind:'raise',target:o.target}));}
 }
});
test('BB input rejects empty, NaN, infinity, negative and extra decimals',()=>{
 for(const v of ['', 'NaN', 'Infinity', '-1', '10.005', '1e2', '.5', '  '])assert.ok(Number.isNaN(parseBB(v)),v);
 assert.equal(parseBB('0.5'),50);assert.equal(parseBB('10.01'),1001);assert.equal(parseBB(' 10 '),1000);
});
test('quiz hides answer even in learn mode; shadow never reveals a plan',()=>{
 assert.equal(canShowPlan('learn',false,false,false),true);
 assert.equal(canShowPlan('learn',false,true,false),false);
 assert.equal(canShowPlan('learn',false,true,true),true);
 assert.equal(canShowPlan('practice',false,false,false),false);
 assert.equal(canShowPlan('practice',true,false,false),true);
 for(const r of [false,true])for(const q of [false,true])for(const u of [false,true])assert.equal(canShowPlan('shadow',r,q,u),false);
});
test('decision key invalidates choices on another street or scenario',()=>{
 const {game:g,spec:s}=makeScenario('bb-open-call',42),key=decisionKey(g,s.hero,1);
 g.act(s.hero,'call');assert.notEqual(decisionKey(g,s.hero,1),key);
 assert.notEqual(decisionKey(g,s.hero,2),decisionKey(g,s.hero,1));
});
test('existing progress migrates skipped=0 without losing counts',()=>{
 const old={version:2,decisions:12,hands:3,mathTotal:1,mathCorrect:1,recent:[]};
 const storage={getItem:()=>JSON.stringify(old)};
 const p=loadProgress(storage);assert.equal(p.decisions,12);assert.equal(p.hands,3);assert.equal(p.skipped,0);
});
test('skips persist independently and cannot be negative',()=>{
 const storage={v:'',setItem(k,v){this.v=v;},getItem(){return this.v;}};
 const p=freshProgress();p.skipped=2;p.hands=1;saveProgress(storage,p);
 assert.equal(loadProgress(storage).skipped,2);assert.equal(loadProgress(storage).hands,1);
 p.skipped=-3;saveProgress(storage,p);assert.equal(loadProgress(storage).skipped,0);
});
