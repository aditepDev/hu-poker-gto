import test from 'node:test'; import assert from 'node:assert/strict';

class Classes { constructor(){this.s=new Set()} add(...x){x.forEach(v=>this.s.add(v))} remove(...x){x.forEach(v=>this.s.delete(v))} contains(x){return this.s.has(x)} }
class El {
  constructor(id=''){this.id=id;this.textContent='';this.innerHTML='';this.disabled=false;this.dataset={};this.children=[];this.classList=new Classes();this.value=id==='stack-depth'?'100':'';this.onclick=null;this.onchange=null;}
  appendChild(el){this.children.push(el);return el;}
}

test('UI wires Deal button and creates hero action buttons', async()=>{
  const ids=['stack-depth','new-match','bot-position','bot-stack','bot-cards','bot-status','street-label','pot','board','result-banner','hero-position','hero-stack','hero-cards','hero-status','deal','action-buttons','session-score','coach-empty','coach','grade','decision-score','equity','pot-odds','spr','mix','decision-count','history'];
  const els=Object.fromEntries(ids.map(id=>[id,new El(id)]));
  globalThis.document={getElementById:id=>els[id],createElement:()=>new El()};
  globalThis.window={addEventListener:()=>{}};
  await import(`../src/app.js?smoke=${Date.now()}`);
  assert.equal(typeof els.deal.onclick,'function');
  assert.equal(els.deal.textContent,'Deal hand');
  els.deal.onclick();
  assert.ok(els['action-buttons'].children.length>=2,'expected playable actions after deal');
  assert.equal(els['result-banner'].textContent,'Your turn');
});
