import test from 'node:test';import assert from 'node:assert/strict';
import {renderPlayingCard,renderHoleCards,renderCardBacks,holeLabel} from '../src/practice/cards.js';

const count=(s,needle)=>(s.match(new RegExp(needle,'g'))||[]).length;

test('numeric hole cards render the correct number of pips',()=>{
  assert.equal(count(renderPlayingCard('7s'),'class="pip '),7);
  assert.equal(count(renderPlayingCard('Td'),'class="pip '),10);
  assert.equal(count(renderPlayingCard('Ah'),'class="pip '),1);
});
test('face cards use center face instead of pips',()=>{
  const html=renderPlayingCard('Qh');assert.match(html,/face-center/);assert.doesNotMatch(html,/class="pip /);assert.match(html,/heart/);
});
test('hole cards and backs render as two physical cards',()=>{
  assert.equal(count(renderHoleCards(['7s','7d']),'playing-card '),2);
  assert.equal(count(renderCardBacks(2),'card-back'),2);
});
test('preflop labels distinguish pairs suited and offsuit',()=>{
  assert.equal(holeLabel(['7s','7d']),'Pocket 7s');
  assert.equal(holeLabel(['As','Js']),'AJs');
  assert.equal(holeLabel(['Kh','Qc']),'KQo');
});
test('invalid card input is rejected safely',()=>{
  assert.equal(renderPlayingCard('ZZ'),'');assert.equal(holeLabel(['As','ZZ']),'');
});
