import { BB, bb, fmt, POSITIONS, project } from './engine.js';
import { SCENARIOS, makeScenario, practiceBot } from './scenarios.js';
import { cardLabel, isRed, evaluateBest, handName, shuffle } from '../poker.js';
import { freshProgress, loadProgress, saveProgress, mathCorrect, describeAction, reviewText } from './learning.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage=(()=>{try{return window.localStorage;}catch{return null;}})();
let progress=loadProgress(storage), run, g, spec, selected=null, preview=null, latest=null;
let timer=null,generation=0,paused=false,recorded=false,revealed=false,quizUsed=false,botSteps=0,bag=[];
const mode=()=>$('mode').value;
const seed=()=>{const a=new Uint32Array(1);if(window.crypto?.getRandomValues){window.crypto.getRandomValues(a);return a[0];}return Math.floor(Math.random()*4294967296);};
const card=c=>`<span class="card ${isRed(c)?'red':''}" aria-label="${esc(cardLabel(c))}"><span>${c[0]==='T'?'10':c[0]}</span><span class="suit">${cardLabel(c).slice(-1)}</span></span>`;
const signed=n=>`${n>0?'+':''}${fmt(n)}`;
function save(){ $('save-status').textContent=saveProgress(storage,progress)?'บันทึกสถิติในเบราว์เซอร์นี้แล้ว · ไม่เก็บข้ามเครื่อง':'เบราว์เซอร์ไม่อนุญาตให้บันทึก สถิติรอบนี้จะหายเมื่อปิดหน้า'; }
function fail(e){paused=true;clearTimeout(timer);timer=null;$('error').hidden=false;$('error').textContent=`หยุดเกมเพื่อป้องกันข้อมูลผิด: ${e.message} — กดโจทย์ถัดไปเพื่อเริ่มใหม่`;$('confirm').disabled=true;}
function getScenario(){if($('scenario').value!=='mixed')return $('scenario').value;if(!bag.length)bag=shuffle(SCENARIOS.map(s=>s.id).filter(id=>id!==spec?.id));return bag.pop();}
function start(id, value=seed()) {
  clearTimeout(timer);timer=null;generation++;
  run=makeScenario(id,value);g=run.game;spec=run.spec;
  selected=null;preview=null;latest=null;paused=false;recorded=false;revealed=false;quizUsed=false;botSteps=0;
  $('error').hidden=true;$('math-answer').value='';$('math-feedback').textContent='';
  render();drive();
}
function choice(action){
  if(g.status!=='active'||g.toAct!==spec.hero)return;
  selected=action;$('math-feedback').textContent=quizUsed?'ตรวจไปแล้วหนึ่งครั้งในจังหวะนี้':'';
  renderActions();renderPlanner();
}
function callerIds(){const value=$('callers').value;return value==='all'||value===''?g.live.filter(p=>p.id!==spec.hero).map(p=>p.id):value==='none'?[]:[Number(value)];}
function renderActions(){
  const l=g.legal(spec.hero);$('actions').innerHTML='';$('sizing').hidden=true;
  $('confirm').disabled=true;$('confirm').textContent='ยืนยันการเล่น';$('confirm').hidden=!l;$('selection').hidden=!l;
  $('waiting').textContent=l?`รอต่อจากคุณ: ${(selected?.kind==='raise'?g.live.filter(p=>p.id!==spec.hero&&p.stack>0).map(p=>p.position):[...g.pending].filter(id=>id!==spec.hero).map(id=>POSITIONS[id])).join(', ')||'ไม่มี'}`:'';
  if(!l){$('actions').innerHTML=`<p class="muted">${g.status==='complete'?'จบมือแล้ว เลือกโจทย์ถัดไปหรือเล่นโจทย์นี้ซ้ำ':g.players[spec.hero].folded?'คุณหมอบแล้ว บอทจะเล่นมือนี้ให้จบ':paused?'หยุดบอทไว้ กดเล่นต่อเมื่อพร้อม':'กำลังเล่นต่อจนถึงตาคุณ…'}</p>`;return;}
  const actionButton=(kind,label,cls='')=>`<button data-kind="${kind}" aria-pressed="${selected?.kind===kind}" class="${cls} ${selected?.kind===kind?'selected':''}">${label}</button>`;
  $('actions').innerHTML=(l.fold?actionButton('fold','หมอบ<br><small>Fold</small>','fold-button'):'')+actionButton(l.call?'call':'check',l.call?`ตาม ${fmt(l.call)}<br><small>Call เพิ่ม</small>`:'ผ่าน<br><small>Check ฟรี</small>')+(l.canRaise?actionButton('raise',`${g.currentBet?'เพิ่มเดิมพัน':'ลงเดิมพัน'}<br><small>${g.currentBet?'Raise to':'Bet'}</small>`):'');
  if(selected?.kind==='raise'){
    $('sizing').hidden=false;const target=selected.target;
    $('raise-to').min=bb(Math.min(l.min,l.max));$('raise-to').max=bb(l.max);
    if(document.activeElement!==$('raise-to'))$('raise-to').value=Number.isFinite(target)?bb(target):'';
    const sizes=[['⅓ pot',1/3],['½ pot',.5],['¾ pot',.75],['Pot',1]].map(([name,f])=>({name,target:Math.min(l.max,Math.max(l.min,g.currentBet+Math.round((g.pot+l.call)*f)))}));
    sizes.push({name:'All-in',target:l.max});
    $('presets').innerHTML=sizes.map(s=>`<button data-target="${s.target}" class="${s.target===target?'selected':''}">${s.name}<small>ถึง ${fmt(s.target)}</small></button>`).join('');
    $('size-note').textContent=`ขั้นต่ำถึง ${fmt(Math.min(l.min,l.max))} · สูงสุดถึง ${fmt(l.max)} · ลงไปแล้ว ${fmt(g.players[spec.hero].bet)} · % คิดจาก Pot หลังสมมติ Call แล้ว ปรับขั้นต่ำอัตโนมัติ`;
  }
  if(!selected){$('selection').textContent='เลือก action ก่อน ยังไม่ลงชิปจนกดยืนยัน';return;}
  try{project(g,spec.hero,selected);$('selection').textContent=`เลือก: ${describeAction(g,spec.hero,selected)} — กดยืนยันจึงลงชิป`;$('confirm').disabled=false;$('confirm').textContent=`ยืนยัน · ${describeAction(g,spec.hero,selected)}`;}
  catch{$('selection').textContent='ขนาดไม่ถูกต้อง: ใช้ยอดรวม BB ระหว่างขั้นต่ำและ Stack (All-in ต่ำกว่าขั้นต่ำได้)';}
}
const cell=(label,value,wide=false)=>`<div class="plan-cell ${wide?'wide':''}"><span>${label}</span><strong>${value}</strong></div>`;
function renderPlanner(){
  const l=g.legal(spec.hero),canShow=mode()==='learn'||(mode()==='practice'&&revealed);
  $('planner').innerHTML='';$('conditional').innerHTML='';$('quick-plan').hidden=true;$('caller-control').hidden=true;
  $('reveal').hidden=mode()!=='practice'||revealed||!l;
  $('math-panel').hidden=mode()==='shadow'||!l;
  $('math-check').disabled=quizUsed||!selected||selected.kind==='fold'||selected.kind==='check';
  if(!l){$('planner').innerHTML='<p class="empty">ตัวช่วยจะเปิดเมื่อถึงจังหวะที่คุณตัดสินใจ</p>';return;}
  if(!selected){$('planner').innerHTML='<p class="empty">เลือก Call หรือขนาด Bet/Raise เพื่อดูว่าต้องลงเพิ่มเท่าไร และเหลือ Stack เท่าไร</p>';return;}
  try{preview=project(g,spec.hero,selected,callerIds());}catch{preview=null;return;}
  $('math-question').textContent=`ถ้า ${describeAction(g,spec.hero,selected)}: Pot ทันทีจะเป็นกี่ BB? (ก่อนคนอื่นตอบ)`;
  if(!canShow){$('planner').innerHTML=`<p class="empty">${mode()==='shadow'?'ทดสอบด้วยตัวเอง — ไม่แสดงคำตอบก่อนจบมือ':'ลองคิดเองก่อน เปิดตัวช่วยเฉพาะเมื่อจำเป็น'}</p>`;return;}
  if(selected.kind==='fold'){$('planner').innerHTML=`<p class="empty">หมอบแล้วเก็บ Stack ${fmt(g.players[spec.hero].stack)} ไว้ ชิปที่ลงก่อนหน้าไม่กลับคืน</p>`;return;}
  $('quick-plan').hidden=false;$('quick-plan').textContent=`ลงเพิ่ม ${fmt(preview.invest)} · เหลือ ${fmt(preview.remaining)} · Pot ทันที ${fmt(preview.potNow)}`;
  $('planner').innerHTML=`<span class="muted">ตัวเลขทันที ก่อนคนอื่นตอบ / ก่อนคืนยอดเกิน</span><div class="plan-grid">${cell('ลงเพิ่มจริง',fmt(preview.invest))}${cell('Stack เราเหลือ',fmt(preview.remaining))}${cell('Pot รวมหลัง action ของคุณ',fmt(preview.potNow),true)}</div>`;
  if(preview.potOdds!==null)$('planner').innerHTML+=`<p class="muted">ราคา Call = ${(preview.potOdds*100).toFixed(1)}% ของ Pot ที่มีสิทธิ์ชิงหลัง Call (${fmt(preview.eligiblePot)})<br>เป็นเกณฑ์ต้นทุน ไม่ใช่คำแนะนำให้ Call; ยังไม่คิดการเดิมพันถัดไปหรือ Range คู่ต่อสู้</p>`;
  if(selected.kind==='raise'){
    $('caller-control').hidden=false;
    const current=$('callers').value||'all',others=g.live.filter(p=>p.id!==spec.hero&&p.stack>0);
    $('callers').innerHTML='<option value="all">ทุกคนที่ยังอยู่ตาม</option>'+others.map(p=>`<option value="${p.id}">เฉพาะ ${p.position} ตาม · ที่เหลือหมอบ</option>`).join('')+'<option value="none">ทุกคนที่ยังมีชิปหมอบ</option>';
    $('callers').value=[...$('callers').options].some(o=>o.value===current)?current:'all';
    preview=project(g,spec.hero,selected,callerIds());const q=preview.conditional;
    $('conditional').innerHTML=`<div class="assumption"><b>ถ้าเป็นไปตามสมมติฐาน</b><br>Pot ${fmt(q.pot)} · Stack เหลือ ${fmt(q.remaining)}${q.refund?`<br>คืนชิปส่วนเกิน ${fmt(q.refund)}`:''}${q.closed?'<br>ทุกคนหมอบ มือจะจบและจ่าย Pot ให้คุณ':`<br>${q.effectiveSpr===null?'Stack เรา / Pot':'Effective SPR'} = <strong>${(q.effectiveSpr??q.stackToPot)?.toFixed(2)??'—'}</strong>`}${q.sidePots?'<br>มี Side pot ต้องดูสิทธิ์ชิงแยกแต่ละ pot':''}${q.opponents.length>1?'<br>หลายคน: ไม่ใช้ค่า SPR เดียวแทนทุกคู่':''}<br><span class="muted">ผู้เล่นที่ All-in อยู่แล้วไม่หมอบ ไม่ได้คาดการณ์ว่าคนอื่นจะ Call จริง</span></div>`;
  }
}
function commit(){
  if(!selected||$('confirm').disabled||!g.legal(spec.hero))return;
  try{
    const actor=spec.hero,p=g.players[actor],before={stack:p.stack,pot:g.pot},street=g.street;
    const forecast=project(g,actor,selected,callerIds()),label=describeAction(g,actor,selected);
    const waiting=(selected.kind==='raise'?g.live.filter(q=>q.id!==actor&&q.stack>0).map(q=>q.position):[...g.pending].filter(id=>id!==actor).map(id=>POSITIONS[id]));
    const text=reviewText({label,before,forecast,waiting,street});
    g.act(actor,selected.kind,selected.target);
    latest={label,text,street};progress.decisions++;
    progress.recent.unshift({scenario:spec.id,seed:run.seed,position:POSITIONS[actor],text});progress.recent=progress.recent.slice(0,30);
    selected=null;preview=null;revealed=false;quizUsed=false;$('callers').value='all';$('math-answer').value='';$('math-feedback').textContent='';
    save();render();drive();
  }catch(e){fail(e);}
}
function drive(){
  if(timer!==null||paused||g.status!=='active'||g.toAct===spec.hero)return;
  const token=generation,owner=g;
  timer=setTimeout(()=>{
    timer=null;if(token!==generation||owner!==g||paused)return;
    try{if(++botSteps>250)throw new Error('ขีดจำกัดการจำลอง');const a=practiceBot(g);g.act(g.toAct,a.kind,a.target);render();drive();}catch(e){fail(e);}
  },300);
}
function render(){
  const hero=g.players[spec.hero],ended=g.status==='complete';
  document.body.dataset.turn=ended?'complete':g.toAct===spec.hero?'hero':'bot';
  document.body.dataset.scenario=spec.id;
  $('tag').textContent=`${spec.tag} · ไม่จับเวลา`;$('spot-title').textContent=spec.title;$('seed-label').textContent=`#${run.seed.toString(36)}`;
  $('street').textContent=ended?(g.result.type==='fold'?'HAND COMPLETE':'SHOWDOWN'):g.street.toUpperCase();
  $('pot').textContent=fmt(ended?g.result.pot:g.pot);$('pot-label').textContent=ended?'Pot ที่จ่ายแล้ว':'Pot รวม Bet ล่าสุด';$('table-pot').textContent=fmt(ended?g.result.pot:g.pot);
  $('stack').textContent=fmt(hero.stack);$('invested').textContent=fmt(hero.bet);$('call').textContent=g.legal(spec.hero)?fmt(g.callAmount(spec.hero)):'—';
  $('live-label').textContent=ended?'Pot ที่จ่ายเมื่อจบมือ':`${g.live.length} คนยังไม่หมอบ จากโต๊ะ 6-max`;
  $('seats').innerHTML=g.players.map(p=>{
    const visible=p.id===spec.hero||(ended&&g.result.type==='showdown'&&!p.folded);
    return `<div class="seat seat-${p.id} ${p.folded?'folded':''} ${p.id===spec.hero?'hero':''} ${g.toAct===p.id?'acting':''}" data-seat="${p.id}"><div class="seat-top"><span class="seat-pos">${p.position}${p.id===3?'<span class="dealer">D</span>':''}</span><span class="seat-stack">${fmt(p.stack)}</span></div><div class="mini-cards">${visible?p.hole.map(c=>esc(cardLabel(c))).join(' '):p.folded?'—':'▰ ▰'}</div><span class="last ${p.folded?'fold-label':''}">${p.folded?'FOLD':!ended&&p.stack===0?'ALL-IN':esc(p.last||'ยังไม่เล่น')}</span>${p.id===spec.hero?'<span class="badge">คุณอยู่ตรงนี้</span>':''}</div>`;
  }).join('');
  $('board').innerHTML=g.board.map(card).join('')+Array.from({length:5-g.board.length},()=>'<span class="card placeholder" aria-hidden="true"></span>').join('');
  $('hero-position').textContent=`ไพ่คุณ · ${hero.position}`;$('hero-cards').innerHTML=hero.hole.map(card).join('');
  $('hand-name').textContent=g.board.length>=3?handName(evaluateBest([...hero.hole,...g.board])):'ไพ่เริ่มต้นของคุณ';
  $('turn-status').textContent=ended?`จบมือ · ผลสุทธิ ${signed(g.result.net[spec.hero])}`:paused?'หยุดบอทไว้ อ่านข้อมูลได้ตามสบาย':g.toAct===spec.hero?'ถึงคุณแล้ว — เลือกเอง ไม่ต้องรีบ':`${POSITIONS[g.toAct]} กำลังตัดสินใจ`;
  $('pause').textContent=paused?'เล่นต่อ':'หยุดบอท';$('pause').disabled=ended;
  $('hand-result').hidden=!ended;
  if(ended){
    $('hand-result').innerHTML=`<strong>ผลสุทธิของคุณ ${signed(g.result.net[spec.hero])}</strong><br>Pot จ่ายรวม ${fmt(g.result.pot)} · คุณได้รับ ${fmt(g.result.payouts[spec.hero])}<br><small>ผลสุทธิหักชิปของคุณที่ลงตลอดมือแล้ว ไม่ใช่กำไรเท่ากับ Pot ทั้งหมด</small>`;
    if(!recorded){recorded=true;progress.hands++;save();}
  }
  let lastStreet='';$('action-history').innerHTML=g.log.map(a=>{const heading=a.street!==lastStreet?`<div class="history-street">${a.street.toUpperCase()}</div>`:'';lastStreet=a.street;const desc=a.kind==='raise'?`Bet / Raise to ${fmt(a.target)}`:a.kind==='call'?`Call เพิ่ม ${fmt(a.amount)}`:a.kind==='fold'?'Fold · หมอบ':'Check · ผ่าน';return `${heading}<div class="history-row ${a.id===spec.hero?'you':''}"><span class="who">${a.position}</span><span>${desc}</span><span class="after">Pot ${fmt(a.potAfterAction)}</span></div>`;}).join('')||'<p class="muted">ยังไม่มี action · SB ลง 0.5 BB และ BB ลง 1 BB แล้ว</p>';
  renderActions();renderPlanner();renderReview();renderProgress();
}
function renderReview(){
  const hidden=mode()==='shadow'&&g.status!=='complete';
  $('review').innerHTML=hidden?'<p class="empty">เล่นเองจนจบมือ แล้วค่อยเปิดทบทวน ไม่มีเฉลยระหว่างทาง</p>':`${latest?`<div class="review-title">${esc(latest.street.toUpperCase())} · ${esc(latest.label)}</div><p>${esc(latest.text)}</p>`:'<p class="empty">ตัดสินใจเองก่อน แล้วดูผลของขนาดที่เลือก</p>'}${latest||g.status==='complete'?`<p class="muted">สิ่งที่โจทย์นี้ให้ฝึก: ${esc(spec.lesson)}</p>`:''}`;
  $('recent').parentElement.hidden=hidden;
}
function renderProgress(){
  $('decisions-count').textContent=progress.decisions;$('hands-count').textContent=progress.hands;$('math-count').textContent=progress.mathTotal?`${progress.mathCorrect}/${progress.mathTotal}`:'—';
  $('recent').innerHTML=progress.recent.slice(0,6).map((r,i)=>`<div class="recent-row"><b>${esc(r.position)} · ${esc(SCENARIOS.find(s=>s.id===r.scenario)?.title||'โจทย์เดิม')}</b><br>${esc(r.text)}<br><button data-recent="${i}">ลองสถานการณ์นี้อีกครั้ง</button></div>`).join('')||'<p class="muted">ยังไม่มีบันทึก</p>';
}
$('scenario').insertAdjacentHTML('beforeend',SCENARIOS.map(s=>`<option value="${s.id}">${s.title}</option>`).join(''));
$('actions').onclick=e=>{const kind=e.target.closest('[data-kind]')?.dataset.kind;if(kind)choice({kind,...(kind==='raise'?{target:Math.min(g.legal().min,g.legal().max)}:{})});};
$('presets').onclick=e=>{const value=e.target.closest('[data-target]')?.dataset.target;if(value)choice({kind:'raise',target:Number(value)});};
const custom=()=>choice({kind:'raise',target:$('raise-to').value.trim()===''?NaN:Math.round(Number($('raise-to').value)*BB)});
$('raise-to').oninput=custom;$('choose-size').onclick=custom;
$('confirm').onclick=commit;$('callers').onchange=renderPlanner;
$('reveal').onclick=()=>{revealed=true;renderPlanner();};
$('mode').onchange=()=>{revealed=false;renderPlanner();renderReview();};
$('next').onclick=()=>{try{start(getScenario());}catch(e){fail(e);}};
$('scenario').onchange=()=>{try{start(getScenario());}catch(e){fail(e);}};
$('replay').onclick=()=>start(spec.id,run.seed);
$('pause').onclick=()=>{paused=!paused;if(paused){clearTimeout(timer);timer=null;}render();drive();};
$('recent').onclick=e=>{const i=e.target.closest('[data-recent]')?.dataset.recent;if(i!==undefined){const r=progress.recent[Number(i)];if(SCENARIOS.some(s=>s.id===r.scenario))start(r.scenario,r.seed);}};
$('math-check').onclick=()=>{
  if(quizUsed||!preview||!selected||!['call','raise'].includes(selected.kind))return;
  const answer=$('math-answer').value;
  if(answer.trim()===''||!Number.isFinite(Number(answer))||Number(answer)<0){$('math-feedback').textContent='ใส่จำนวน BB ที่ไม่ติดลบก่อน';return;}
  const correct=mathCorrect(answer,preview.potNow);quizUsed=true;progress.mathTotal++;if(correct)progress.mathCorrect++;
  $('math-feedback').textContent=`${correct?'คำนวณถูก':'ลองทบทวน'}: ${fmt(g.pot)} + ลงเพิ่ม ${fmt(preview.invest)} = ${fmt(preview.potNow)} (ไม่บวก Bet คู่ต่อสู้ซ้ำ)`;
  $('math-check').disabled=true;save();renderProgress();
};
$('reset-progress').onclick=()=>{if(window.confirm('ล้างสถิติและประวัติการฝึกในเบราว์เซอร์นี้?')){progress=freshProgress();save();renderProgress();}};
window.addEventListener('pagehide',()=>{clearTimeout(timer);timer=null;generation++;});
window.addEventListener('pageshow',()=>drive());
window.addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName))return;const l=g.legal(spec.hero);if(!l)return;const k=e.key.toLowerCase();if(k==='f'&&l.fold)choice({kind:'fold'});if(k==='c')choice({kind:l.call?'call':'check'});});
try{
  const params=new URLSearchParams(window.location.search),id=params.get('scenario'),n=Number(params.get('seed'));
  start(SCENARIOS.some(s=>s.id===id)?id:'bb-open-call',params.has('seed')&&Number.isInteger(n)&&n>=0&&n<=4294967295?n:seed());
}catch(e){fail(e);}
