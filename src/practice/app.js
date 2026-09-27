import { BB, bb, fmt, POSITIONS, project } from './engine.js';
import { SCENARIOS, makeScenario, practiceBot } from './scenarios.js';
import { cardLabel, isRed, evaluateBest, handName, shuffle } from '../poker.js';
import { freshProgress, loadProgress, saveProgress, mathCorrect, describeAction, reviewText } from './learning.js';
import { MODE_LABELS, pendingAfter, actionSummary, contextSummary, sizePresets, parseBB, decisionKey, canShowPlan } from './ux.js';
import { renderHoleCards, renderCardBacks, holeLabel } from './cards.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage = (()=>{try{return window.localStorage;}catch{return null;}})();
let progress=loadProgress(storage),run,g,spec,selected=null,preview=null,latest=null;
let timer=null,cooldown=null,generation=0,lockedUntil=0,selectedKey=null;
let paused=false,recorded=false,revealed=false,quizUsed=false,botSteps=0,bag=[];
const mode = () => $('mode').value;
const overlayOpen = () => $('settings-dialog').open || $('review-dialog').open;
const signed = n => `${n>0?'+':''}${fmt(n)}`;
const boardCard = c => `<span class="card ${isRed(c)?'red':''}" aria-label="${esc(cardLabel(c))}"><span>${c[0]==='T'?'10':c[0]}</span><span class="suit">${cardLabel(c).slice(-1)}</span></span>`;
const seed = () => {const a=new Uint32Array(1);if(window.crypto?.getRandomValues){window.crypto.getRandomValues(a);return a[0];}return Math.floor(Math.random()*4294967296);};
const handNames={'High Card':'ไพ่สูง','One Pair':'หนึ่งคู่','Two Pair':'สองคู่','Three of a Kind':'ตอง','Straight':'เรียง','Flush':'ฟลัช','Full House':'ฟูลเฮาส์','Four of a Kind':'โฟร์การ์ด','Straight Flush':'สเตรทฟลัช'};
function save(){ $('save-status').textContent=saveProgress(storage,progress)?'บันทึกในเบราว์เซอร์นี้แล้ว · ไม่เก็บข้ามเครื่อง':'บันทึกไม่ได้ สถิติรอบนี้จะหายเมื่อปิดหน้า'; }
function savePrefs(){try{storage?.setItem('poker-lab.ux.v1',JSON.stringify({mode:mode(),scenario:$('scenario').value}));}catch{/* optional storage */}}
function fail(e){paused=true;clearTimeout(timer);timer=null;$('error').hidden=false;$('error').textContent=`หยุดเกมเพื่อป้องกันข้อมูลผิด: ${e.message} — กดเปลี่ยนโจทย์เพื่อเริ่มใหม่`;$('confirm').disabled=true;}
function getScenario(){if($('scenario').value!=='mixed')return $('scenario').value;if(!bag.length)bag=shuffle(SCENARIOS.map(s=>s.id).filter(id=>id!==spec?.id));return bag.pop();}
function start(id,value=seed()){
  clearTimeout(timer);clearTimeout(cooldown);timer=null;cooldown=null;generation++;lockedUntil=0;
  run=makeScenario(id,value);g=run.game;spec=run.spec;
  selected=null;selectedKey=null;preview=null;latest=null;paused=false;recorded=false;revealed=false;quizUsed=false;botSteps=0;
  $('error').hidden=true;$('math-details').open=false;$('advanced-plan').open=false;
  $('math-answer').value='';$('math-feedback').textContent='';$('callers').innerHTML='';
  $('decision-dock').scrollTop=0;document.querySelector('.play-column').scrollTop=0;
  render();drive();
}
function moveTo(id,value,ask=true){
  if(g?.status==='active'){
    if(ask&&!g.players[spec.hero].folded&&!window.confirm('มือนี้ยังไม่จบ เปลี่ยนโจทย์และนับเป็นมือที่ข้าม?'))return;
    progress.skipped=(progress.skipped||0)+1;save();
  }
  start(id,value);closeDialogs();
}
function choice(action){
  if(g.status!=='active'||g.toAct!==spec.hero||performance.now()<lockedUntil||overlayOpen())return;
  selected=action;selectedKey=decisionKey(g,spec.hero,generation);
  $('math-feedback').textContent=quizUsed?'จังหวะนี้ตรวจคำตอบไปแล้วหนึ่งครั้ง':'';
  renderActions();renderPlanner();
}
function callerIds(){const value=$('callers').value;return value==='all'||value===''?g.live.filter(p=>p.id!==spec.hero).map(p=>p.id):value==='none'?[]:[Number(value)];}
function renderActions(){
  const l=g.legal(spec.hero),locked=performance.now()<lockedUntil;
  document.body.dataset.sizing=String(!!l&&selected?.kind==='raise');
  $('actions').innerHTML='';$('sizing').hidden=true;$('size-error').hidden=true;$('size-error').textContent='';
  $('confirm').disabled=true;$('confirm').textContent='เลือกการเล่นก่อน';$('confirm').hidden=!l;$('selection').hidden=!l;
  $('decision-heading').textContent=l?'คุณจะเล่นอย่างไร?':g.status==='complete'?'จบมือแล้ว':g.players[spec.hero].folded?'คุณหมอบแล้ว':'รอคู่ต่อสู้';
  $('practice-label').textContent=MODE_LABELS[mode()];
  $('waiting').textContent=l?`หลังคุณ${selected?.kind==='raise'?'เพิ่มเดิมพัน':''}: ${pendingAfter(g,spec.hero,selected?.kind==='raise').join(', ')||'ไม่มีคนรอในรอบนี้'}`:'';
  if(!l){$('actions').innerHTML=`<p class="empty">${g.status==='complete'?'พร้อมแล้วไปโจทย์ถัดไปได้เลย':g.players[spec.hero].folded?'ดูบอทเล่นต่อ หรือข้ามได้โดยไม่นับว่ามือจบ':paused?'พักไว้ กดเล่นต่อเมื่อพร้อม':'บอทกำลังเล่นต่อจนถึงตาคุณ'}</p>`;return;}
  const btn=(kind,label,cls='')=>`<button data-kind="${kind}" aria-pressed="${selected?.kind===kind}" ${locked?'disabled':''} class="${cls} ${selected?.kind===kind?'selected':''}">${label}</button>`;
  // These positions never change between decisions. Free fold is not offered.
  $('actions').innerHTML=(l.fold?btn('fold','หมอบ<br><small>Fold</small>','fold-button'):'')+btn(l.call?'call':'check',l.call?`ตาม ${fmt(l.call)}<br><small>Call เพิ่ม</small>`:'ผ่าน<br><small>Check ฟรี</small>')+(l.canRaise?btn('raise',`${g.currentBet?'เพิ่มเดิมพัน':'ลงเดิมพัน'}<br><small>${g.currentBet?'Raise to':'Bet'}</small>`):'');
  if(selected?.kind==='raise'){
    $('sizing').hidden=false;const target=selected.target;
    $('raise-label').textContent=g.currentBet?'เพิ่มยอดรอบนี้เป็น (BB)':'ลงเดิมพัน (BB)';
    $('raise-to').min=bb(Math.min(l.min,l.max));$('raise-to').max=bb(l.max);
    if(document.activeElement!==$('raise-to'))$('raise-to').value=Number.isFinite(target)?bb(target):'';
    $('presets').innerHTML=sizePresets(g,spec.hero).map(s=>`<button data-target="${s.target}" aria-pressed="${s.target===target}" class="${s.target===target?'selected':''}">${g.currentBet?`ถึง ${fmt(s.target)}`:s.name}<small>${g.currentBet?s.name:fmt(s.target)}</small></button>`).join('');
    $('all-in').setAttribute('aria-pressed',String(target===l.max));$('all-in').title=`ยอดรวม ${fmt(l.max)}`;
    $('size-note').textContent=`ลงแล้ว ${fmt(g.players[spec.hero].bet)} · ขั้นต่ำถึง ${fmt(Math.min(l.min,l.max))} · สูงสุด ${fmt(l.max)}`;
    $('raise-to').setAttribute('aria-invalid','false');
  }
  if(!selected){$('selection').textContent=locked?'เปิดจังหวะใหม่…':'เลือกก่อน แล้วค่อยยืนยัน · ยังไม่ลงชิป';return;}
  try{
    const p=project(g,spec.hero,selected);
    $('selection').textContent=selected.kind==='raise'?`${g.currentBet?'Raise to':'Bet'} ${fmt(selected.target)} · จ่ายเพิ่มจริง ${fmt(p.invest)}`:selected.kind==='fold'?'หมอบแล้วชิปที่ลงก่อนหน้าไม่คืน':'ยังไม่ลงชิปจนกดยืนยัน';
    $('confirm').disabled=locked;$('confirm').textContent=`ยืนยัน · ${describeAction(g,spec.hero,selected)}`;
  }catch{
    $('selection').textContent='แก้ขนาดก่อนยืนยัน';$('size-error').hidden=false;
    $('size-error').textContent=`ใช้ยอดรวม ${fmt(Math.min(l.min,l.max))} ถึง ${fmt(l.max)} ไม่เกิน 2 ตำแหน่งทศนิยม`;
    $('raise-to').setAttribute('aria-invalid','true');
  }
}
const cell=(label,value)=>`<div class="plan-cell"><span>${label}</span><strong>${value}</strong></div>`;
function renderPlanner(){
  const l=g.legal(spec.hero),quizOpen=$('math-details').open;
  const show=canShowPlan(mode(),revealed,quizOpen,quizUsed);
  $('selection').hidden=!l;
  preview=null;$('planner').innerHTML='';$('conditional').innerHTML='';$('caller-control').hidden=true;$('advanced-plan').hidden=true;
  $('reveal').hidden=mode()!=='practice'||revealed||!l||(quizOpen&&!quizUsed);
  $('helper-tools').hidden=!l||!selected||selected.kind==='fold'||mode()==='shadow';
  $('math-panel').hidden=mode()==='shadow'||!l||!selected||!['call','raise'].includes(selected.kind);
  $('math-check').disabled=quizUsed||!l||!selected||!['call','raise'].includes(selected.kind);
  if(!l||!selected)return;
  try{preview=project(g,spec.hero,selected,callerIds());}catch{$('helper-tools').hidden=true;return;}
  $('math-question').textContent=`${describeAction(g,spec.hero,selected)} → Pot ทันทีเป็นกี่ BB?`;
  if(!show){$('planner').innerHTML=`<p class="empty">${quizOpen&&!quizUsed?'ซ่อนเฉลยไว้ — ลองคิดก่อนตรวจคำตอบ':mode()==='shadow'?'ทดสอบ: ไม่แสดงผลล่วงหน้าหรือรีวิวก่อนจบมือ':'ตัวช่วยถูกซ่อน · ลองคิดเองก่อน'}</p>`;return;}
  if(selected.kind==='fold')return;
  $('selection').hidden=true;
  $('planner').innerHTML=`<div class="plan-grid">${cell('ลงเพิ่มจริง',fmt(preview.invest))}${cell('Stack เหลือ',fmt(preview.remaining))}${cell('Pot ทันที',fmt(preview.potNow))}</div><span class="muted">ก่อนคนอื่นตอบ / ก่อนคืนส่วนเกิน · ไม่ใช่ Pot สุดท้าย</span>`;
  if(selected.kind==='raise'){
    $('advanced-plan').hidden=false;$('caller-control').hidden=false;
    const current=$('callers').value||'all',others=g.live.filter(p=>p.id!==spec.hero&&p.stack>0);
    $('callers').innerHTML='<option value="all">ทุกคนที่ยังอยู่ตาม</option>'+others.map(p=>`<option value="${p.id}">เฉพาะ ${p.position} ตาม · ที่เหลือหมอบ</option>`).join('')+'<option value="none">ทุกคนที่ยังมีชิปหมอบ</option>';
    $('callers').value=[...$('callers').options].some(o=>o.value===current)?current:'all';
    preview=project(g,spec.hero,selected,callerIds());const q=preview.conditional;
    $('conditional').innerHTML=`<div class="assumption"><b>ผลสมมติ ไม่รับประกันว่าจะมีคนตาม</b><br>Pot <strong>${fmt(q.pot)}</strong> · Stack เหลือ ${fmt(q.remaining)}${q.refund?`<br>คืนส่วนเกิน ${fmt(q.refund)}`:''}${q.closed?'<br>ทุกคนหมอบ จ่าย Pot แล้วจบมือ':`<br>${q.effectiveSpr===null?'Stack เรา / Pot':'Effective SPR'} = <strong>${(q.effectiveSpr??q.stackToPot)?.toFixed(2)??'—'}</strong>`}${q.sidePots?'<br>มี Side pot ต้องแยกสิทธิ์ชิง':''}${q.opponents.length>1?'<br>หลายคน: ค่าเดียวไม่แทน SPR ของทุกคู่':''}<br><small>ผู้เล่น All-in อยู่แล้วไม่หมอบ · % ของ Raise คิดจาก Pot หลังสมมติ Call และปรับขั้นต่ำ</small></div>`;
  }
}
function commit(event){
  if(event?.detail>1||!selected||$('confirm').disabled||!g.legal(spec.hero)||overlayOpen()||selectedKey!==decisionKey(g,spec.hero,generation)||performance.now()<lockedUntil)return;
  try{
    const actor=spec.hero,p=g.players[actor],before={stack:p.stack,pot:g.pot},street=g.street;
    const forecast=project(g,actor,selected,callerIds()),label=describeAction(g,actor,selected);
    const waiting=pendingAfter(g,actor,selected.kind==='raise');
    const text=reviewText({label,before,forecast,waiting,street});
    g.act(actor,selected.kind,selected.target);
    latest={label,text,street,brief:`${label} · เหลือ ${fmt(forecast.remaining)}${selected.kind==='fold'?'':` · Pot ทันที ${fmt(forecast.potNow)}`}`};
    progress.decisions++;progress.recent.unshift({scenario:spec.id,seed:run.seed,position:POSITIONS[actor],text});progress.recent=progress.recent.slice(0,30);
    selected=null;selectedKey=null;preview=null;revealed=false;quizUsed=false;
    $('math-details').open=false;$('advanced-plan').open=false;$('callers').value='all';$('math-answer').value='';$('math-feedback').textContent='';
    // Guard against a second touch becoming a selection on the next street.
    lockedUntil=performance.now()+450;const token=generation;
    clearTimeout(cooldown);cooldown=setTimeout(()=>{if(token===generation){lockedUntil=0;renderActions();renderPlanner();}cooldown=null;},460);
    save();render();$('decision-dock').scrollTop=0;drive();
  }catch(e){fail(e);}
}
function drive(){
  if(timer!==null||paused||overlayOpen()||g.status!=='active'||g.toAct===spec.hero)return;
  const token=generation,owner=g;
  timer=setTimeout(()=>{
    timer=null;if(token!==generation||owner!==g||paused||overlayOpen())return;
    try{if(++botSteps>250)throw new Error('ขีดจำกัดการจำลอง');const a=practiceBot(g);g.act(g.toAct,a.kind,a.target);render();drive();}catch(e){fail(e);}
  },400);
}
function render(){
  const hero=g.players[spec.hero],ended=g.status==='complete';
  document.body.dataset.turn=ended?'complete':g.toAct===spec.hero?'hero':'bot';document.body.dataset.scenario=spec.id;
  $('tag').textContent=`${spec.tag} · ไม่จับเวลา`;$('spot-title').textContent=spec.title;$('seed-label').textContent=`รหัสไพ่ #${run.seed.toString(36)}`;
  $('street').textContent=ended?(g.result.type==='fold'?'จบมือ':'SHOWDOWN'):g.street.toUpperCase();
  $('pot').textContent=fmt(ended?g.result.pot:g.pot);$('pot-label').textContent=ended?'Pot จ่ายแล้ว':'Pot รวม Bet แล้ว';$('table-pot').textContent=fmt(ended?g.result.pot:g.pot);
  $('stack').textContent=fmt(hero.stack);$('call').textContent=g.legal(spec.hero)?fmt(g.callAmount(spec.hero)):'—';
  $('context-summary').textContent=contextSummary(g,spec.hero);
  $('live-label').textContent=ended?'Pot ที่จ่ายเมื่อจบมือ':`${g.live.length} คนยังไม่หมอบ`;
  $('seats').innerHTML=g.players.map(p=>{
    const visible=p.id===spec.hero||(ended&&g.result.type==='showdown'&&!p.folded),acting=!ended&&g.toAct===p.id;
    return `<div class="seat seat-${p.id} ${p.folded?'folded':''} ${p.id===spec.hero?'hero':''} ${acting?'acting':''}" data-seat="${p.id}" ${acting?'aria-current="true"':''}><div class="seat-top"><span class="seat-pos">${p.position}${p.id===3?'<span class="dealer">D</span>':''}</span><span class="seat-stack">${fmt(p.stack)}</span></div><div class="mini-cards">${visible?renderHoleCards(p.hole,{compact:true}):p.folded?'—':renderCardBacks(2,{compact:true})}</div><span class="last">${p.folded?'หมอบ · Fold':!ended&&p.stack===0?'ALL-IN':esc(p.last||'ยังไม่เล่น')}</span><span class="badge">${acting?'ถึงตา ':''}${p.id===spec.hero?'คุณ':''}</span></div>`;
  }).join('');
  $('board').innerHTML=g.board.map(boardCard).join('')+Array.from({length:5-g.board.length},()=>'<span class="card placeholder" aria-hidden="true"></span>').join('');
  $('hero-position').textContent=`คุณ · ${hero.position}`;$('hero-cards').innerHTML=renderHoleCards(hero.hole);
  $('hand-name').textContent=g.board.length>=3?handNames[handName(evaluateBest([...hero.hole,...g.board]))]:`ไพ่เริ่มต้น · ${holeLabel(hero.hole)}`;
  $('turn-status').textContent=ended?`ผลสุทธิ ${signed(g.result.net[spec.hero])}`:paused?'พักบอทไว้':g.toAct===spec.hero?'ถึงตาคุณ · ไม่ต้องรีบ':`${POSITIONS[g.toAct]} กำลังตัดสินใจ`;
  $('pause').textContent=paused?'เล่นต่อ':'พัก';$('pause').disabled=ended;$('pause').setAttribute('aria-label',paused?'เล่นบอทต่อ':'พักบอท');
  $('hand-result').hidden=!ended;$('end-controls').hidden=!ended&&!hero.folded;
  $('next').textContent=ended?'โจทย์ถัดไป →':'ข้ามไปโจทย์ใหม่ →';
  if(ended){
    $('hand-result').innerHTML=`<strong>ผลสุทธิ ${signed(g.result.net[spec.hero])}</strong><br>Pot จ่ายรวม ${fmt(g.result.pot)} · คุณได้รับ ${fmt(g.result.payouts[spec.hero])}<br><small>ผลสุทธิหักชิปที่คุณลงแล้ว ไม่ใช่กำไรเท่ากับ Pot ทั้งหมด</small>`;
    if(!recorded){recorded=true;progress.hands++;save();}
  }
  let lastStreet='';$('action-history').innerHTML=g.log.map(a=>{const heading=a.street!==lastStreet?`<div class="history-street">${a.street.toUpperCase()}</div>`:'';lastStreet=a.street;return `${heading}<div class="history-row ${a.id===spec.hero?'you':''}"><span class="who">${a.position}</span><span>${esc(actionSummary(a).replace(a.position+' ',''))}</span><span class="after">Pot ${fmt(a.potAfterAction)}</span></div>`;}).join('')||'<p class="muted">SB ลง 0.5 BB และ BB ลง 1 BB · ยังไม่มี action</p>';
  renderActions();renderPlanner();renderReview();renderProgress();
}
function renderReview(){
  const hidden=mode()==='shadow'&&g.status!=='complete';
  $('brief-review').hidden=hidden||!latest;
  $('brief-review').textContent=latest?.brief||'';
  $('review').innerHTML=hidden?'<p class="empty">เล่นเองจนจบมือ แล้วค่อยเปิดทบทวน</p>':`${latest?`<div class="review-title">${esc(latest.street.toUpperCase())} · ${esc(latest.label)}</div><p>${esc(latest.text)}</p>`:'<p class="empty">ยังไม่มีการตัดสินใจให้ทบทวน</p>'}${latest||g.status==='complete'?`<p class="muted">สิ่งที่โจทย์นี้ให้ฝึก: ${esc(spec.lesson)}</p>`:''}`;
  $('recent').parentElement.hidden=hidden;
}
function renderProgress(){
  $('decisions-count').textContent=progress.decisions;$('hands-count').textContent=progress.hands;$('skipped-count').textContent=progress.skipped||0;$('math-count').textContent=progress.mathTotal?`${progress.mathCorrect}/${progress.mathTotal}`:'—';
  $('recent').innerHTML=progress.recent.slice(0,6).map((r,i)=>`<div class="recent-row"><b>${esc(r.position)} · ${esc(SCENARIOS.find(s=>s.id===r.scenario)?.title||'โจทย์เดิม')}</b><br>${esc(r.text)}<br><button data-recent="${i}">ลองสถานการณ์นี้อีกครั้ง</button></div>`).join('')||'<p class="muted">ยังไม่มีบันทึก</p>';
}
function openDialog(id,history=false){clearTimeout(timer);timer=null;$(id).showModal();if(history){$('history-details').open=true;$('history-details').scrollIntoView({block:'start'});}}
function closeDialogs(){for(const id of ['settings-dialog','review-dialog'])if($(id).open)$(id).close();drive();}
for(const id of ['settings-dialog','review-dialog']){
  $(id).addEventListener('close',()=>drive());
  $(id).querySelector('[data-close]').onclick=()=>$(id).close();
}
$('open-settings').onclick=()=>openDialog('settings-dialog');$('open-review').onclick=()=>openDialog('review-dialog');
$('review-details').onclick=()=>openDialog('review-dialog');$('open-history').onclick=()=>openDialog('review-dialog',true);
$('scenario').insertAdjacentHTML('beforeend',SCENARIOS.map(s=>`<option value="${s.id}">${s.title}</option>`).join(''));
$('actions').onclick=e=>{if(e.detail>1)return;const kind=e.target.closest('[data-kind]')?.dataset.kind,l=g.legal(spec.hero);if(kind&&l)choice({kind,...(kind==='raise'?{target:Math.min(l.min,l.max)}:{})});};
$('presets').onclick=e=>{if(e.detail>1)return;const value=e.target.closest('[data-target]')?.dataset.target;if(value)choice({kind:'raise',target:Number(value)});};
$('all-in').onclick=()=>{const l=g.legal(spec.hero);if(l?.canRaise)choice({kind:'raise',target:l.max});};
$('raise-to').oninput=()=>choice({kind:'raise',target:parseBB($('raise-to').value)});
$('confirm').onclick=commit;$('callers').onchange=renderPlanner;$('reveal').onclick=()=>{revealed=true;renderPlanner();};
$('mode').onchange=()=>{revealed=false;$('math-details').open=false;savePrefs();renderActions();renderPlanner();renderReview();};
$('load-scenario').onclick=()=>{try{savePrefs();moveTo(getScenario());}catch(e){fail(e);}};
$('next').onclick=$('skip').onclick=e=>{if(e.detail>1)return;try{moveTo(getScenario());}catch(err){fail(err);}};
$('replay').onclick=()=>moveTo(spec.id,run.seed);document.querySelector('[data-replay]').onclick=()=>moveTo(spec.id,run.seed);
$('pause').onclick=()=>{paused=!paused;if(paused){clearTimeout(timer);timer=null;}render();drive();};
$('recent').onclick=e=>{const i=e.target.closest('[data-recent]')?.dataset.recent;if(i!==undefined){const r=progress.recent[Number(i)];if(SCENARIOS.some(s=>s.id===r.scenario))moveTo(r.scenario,r.seed);}};
$('math-details').addEventListener('toggle',()=>{if(g)renderPlanner();});
$('math-check').onclick=()=>{
  if(quizUsed||!preview||!selected||!['call','raise'].includes(selected.kind)||mode()==='shadow')return;
  const answer=$('math-answer').value;
  if(answer.trim()===''||!Number.isFinite(Number(answer))||Number(answer)<0){$('math-feedback').textContent='ใส่จำนวน BB ที่ไม่ติดลบก่อน';return;}
  const correct=mathCorrect(answer,preview.potNow);quizUsed=true;progress.mathTotal++;if(correct)progress.mathCorrect++;
  $('math-feedback').textContent=`${correct?'คำนวณถูก':'ลองทบทวน'}: ${fmt(g.pot)} + ลงเพิ่ม ${fmt(preview.invest)} = ${fmt(preview.potNow)} (ไม่บวก Bet คู่ต่อสู้ซ้ำ)`;
  save();renderProgress();renderPlanner();
};
$('reset-progress').onclick=()=>{if(window.confirm('ล้างสถิติและประวัติการฝึกในเบราว์เซอร์นี้?')){progress=freshProgress();save();renderProgress();}};
window.addEventListener('pagehide',()=>{clearTimeout(timer);clearTimeout(cooldown);timer=null;cooldown=null;lockedUntil=0;generation++;selectedKey=null;selected=null;});
window.addEventListener('pageshow',()=>{if(g){renderActions();renderPlanner();drive();}});
window.addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||overlayOpen()||/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName))return;const l=g.legal(spec.hero);if(!l)return;const k=e.key.toLowerCase();if(k==='f'&&l.fold)choice({kind:'fold'});if(k==='c')choice({kind:l.call?'call':'check'});});
try{
  try{const p=JSON.parse(storage?.getItem('poker-lab.ux.v1'));if(p&&MODE_LABELS[p.mode])$('mode').value=p.mode;if(p&&(p.scenario==='mixed'||SCENARIOS.some(s=>s.id===p.scenario)))$('scenario').value=p.scenario;}catch{/* corrupt preferences use defaults */}
  const params=new URLSearchParams(window.location.search),id=params.get('scenario'),n=Number(params.get('seed'));
  start(SCENARIOS.some(s=>s.id===id)?id:'bb-open-call',params.has('seed')&&Number.isInteger(n)&&n>=0&&n<=4294967295?n:seed());
}catch(e){fail(e);}
