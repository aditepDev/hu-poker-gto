import { HeadsUpGame } from './game.js';
import { chooseBotAction } from './bot.js';
import { analyzeDecision, scoreDecision, formatMix } from './gto.js';
import { cardLabel, isRed } from './poker.js';

const $ = id => document.getElementById(id);
let game = new HeadsUpGame({stackBb:100});
let botThinking = false;
let latestReview = null;
const decisions = [];

function bb(chips){
  const value = chips / game.bigBlind;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} BB`;
}
function amount(chips){ return `${chips} chips · ${bb(chips)}`; }
function cardHtml(card, hidden=false){
  if (hidden) return '<div class="card back"></div>';
  const label = cardLabel(card);
  return `<div class="card ${isRed(card)?'red':''}"><span>${label}</span><span class="bottom">${label}</span></div>`;
}
function position(player){ return game.dealer===player ? 'BTN / SB' : 'BB'; }

function actionLabel(a){
  if(a.id==='fold') return 'Fold';
  if(a.id==='check') return 'Check';
  if(a.id==='call'){
    const chips=Math.min(game.callAmount('hero'),game.players.hero.stack);
    return `Call ${chips} · ${bb(chips)}`;
  }
  if(a.id==='allin'){
    const target=game.players.hero.streetBet+game.players.hero.stack;
    return `All-in to ${target} · ${bb(target)}`;
  }
  if(a.id==='half' || a.id==='pot'){
    const verb=game.currentBet ? 'Raise to' : 'Bet';
    return `${verb} ${a.target} · ${bb(a.target)}`;
  }
  return a.label;
}

function render(){
  const s = game.snapshot();
  $('hero-stack').textContent = amount(s.players.hero.stack);
  $('bot-stack').textContent = amount(s.players.bot.stack);
  $('hero-position').textContent = s.status==='idle' ? '' : position('hero');
  $('bot-position').textContent = s.status==='idle' ? '' : position('bot');
  $('pot').textContent = s.pot ? amount(s.pot) : `0 chips · 0 BB`;
  $('street-label').textContent = s.status==='idle' ? 'READY' : s.street.toUpperCase();
  $('hero-cards').innerHTML = s.players.hero.hole.map(c=>cardHtml(c)).join('');
  const revealBot = s.status==='complete' && s.result?.type==='showdown';
  $('bot-cards').innerHTML = s.players.bot.hole.map(c=>cardHtml(c,!revealBot)).join('');
  $('board').innerHTML = s.board.map(c=>cardHtml(c)).join('');
  $('deal').disabled = s.status==='active' || s.players.hero.stack<=0 || s.players.bot.stack<=0;
  $('deal').textContent = s.handNumber===0 ? 'Deal hand' : 'Next hand';

  if (s.status==='idle') $('result-banner').textContent='Start a hand to play';
  else if (s.status==='active') $('result-banner').textContent = s.toAct==='hero' ? 'Your turn' : 'Bot thinking…';
  else if (s.result?.winner==='tie') $('result-banner').textContent=`Split pot · ${s.result.heroHand || ''}`;
  else if (s.result) $('result-banner').textContent=`${s.result.winner==='hero'?'You win':'Bot wins'} ${amount(s.result.amount)}${s.result.heroHand?` · ${s.result.heroHand} vs ${s.result.botHand}`:''}`;

  if(s.status==='active' && s.toAct==='hero'){
    const call=game.callAmount('hero');
    $('hero-status').textContent = call ? `To call: ${amount(call)}` : `Check available · Pot ${bb(s.pot)}`;
  } else $('hero-status').textContent = '';
  $('bot-status').textContent = botThinking ? 'Thinking…' : '';
  renderActions(); renderCoach();
}

function renderActions(){
  const wrap=$('action-buttons'); wrap.innerHTML='';
  if(game.status!=='active' || game.toAct!=='hero') return;
  for(const a of game.legalActions('hero')){
    const b=document.createElement('button'); b.textContent=actionLabel(a); b.dataset.action=a.id;
    if(a.id==='fold') b.classList.add('danger');
    b.onclick=()=>heroAction(a.id); wrap.appendChild(b);
  }
}

function heroAction(id){
  if(game.toAct!=='hero') return;
  const analysis=analyzeDecision(game,'hero',{iterations:220});
  const scored=scoreDecision(analysis,id);
  latestReview={analysis,scored,action:id,street:game.street};
  decisions.unshift(latestReview);
  game.act('hero',id); game.assertInvariants(); render(); maybeBot();
}

function renderCoach(){
  const avg=decisions.length?Math.round(decisions.reduce((s,d)=>s+d.scored.score,0)/decisions.length):null;
  $('session-score').textContent=avg??'—'; $('decision-count').textContent=`${decisions.length} decision${decisions.length===1?'':'s'}`;
  if(!latestReview){$('coach-empty').classList.remove('hidden');$('coach').classList.add('hidden');}
  else{
    $('coach-empty').classList.add('hidden');$('coach').classList.remove('hidden');
    $('grade').textContent=latestReview.scored.label; $('decision-score').textContent=`${latestReview.scored.score}/100`;
    $('equity').textContent=`${Math.round(latestReview.analysis.equity*100)}%`;
    $('pot-odds').textContent=`${Math.round(latestReview.analysis.potOdds*100)}%`;
    $('spr').textContent=latestReview.analysis.spr.toFixed(1);
    $('mix').innerHTML=formatMix(latestReview.analysis).map(m=>`<div class="mix-row"><span>${m.label}</span><div class="bar"><i style="width:${m.percent}%"></i></div><strong>${m.percent}%</strong></div>`).join('');
  }
  $('history').innerHTML=decisions.slice(0,12).map(d=>`<div class="history-item"><div><strong>${d.street.toUpperCase()} · ${d.action}</strong><br><small>Eq ${Math.round(d.analysis.equity*100)}% · Odds ${Math.round(d.analysis.potOdds*100)}% · Pot ${bb(d.analysis.pot)} · Call ${bb(d.analysis.callAmount)}</small></div><span class="history-score">${d.scored.score}</span></div>`).join('');
}

function maybeBot(){
  if(botThinking || game.status!=='active' || game.toAct!=='bot') return;
  botThinking=true; render();
  setTimeout(()=>{
    const pick=chooseBotAction(game,{iterations:150});
    if(pick && game.status==='active' && game.toAct==='bot') game.act('bot',pick.action);
    game.assertInvariants(); botThinking=false; render(); maybeBot();
  },350);
}

$('deal').onclick=()=>{ game.startHand(); game.assertInvariants(); render(); maybeBot(); };
$('new-match').onclick=()=>{ game=new HeadsUpGame({stackBb:Number($('stack-depth').value)}); decisions.length=0; latestReview=null; botThinking=false; render(); };
$('stack-depth').onchange=()=>{};
window.addEventListener('keydown',e=>{
  if(game.toAct!=='hero') return;
  const map={f:'fold',c:game.callAmount('hero')?'call':'check',h:'half',p:'pot',a:'allin'};
  const id=map[e.key.toLowerCase()]; if(id && game.legalActions('hero').some(x=>x.id===id)) heroAction(id);
});
render();
