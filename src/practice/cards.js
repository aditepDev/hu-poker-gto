const SUITS={
  s:{symbol:'♠',name:'spade'},h:{symbol:'♥',name:'heart'},
  d:{symbol:'♦',name:'diamond'},c:{symbol:'♣',name:'club'}
};
const PIPS={
  A:[[2,3]],
  '2':[[2,1],[2,5]],
  '3':[[2,1],[2,3],[2,5]],
  '4':[[1,1],[3,1],[1,5],[3,5]],
  '5':[[1,1],[3,1],[2,3],[1,5],[3,5]],
  '6':[[1,1],[3,1],[1,3],[3,3],[1,5],[3,5]],
  '7':[[1,1],[3,1],[2,2],[1,3],[3,3],[1,5],[3,5]],
  '8':[[1,1],[3,1],[2,2],[1,3],[3,3],[2,4],[1,5],[3,5]],
  '9':[[1,1],[3,1],[1,2],[3,2],[2,3],[1,4],[3,4],[1,5],[3,5]],
  T:[[1,1],[3,1],[2,2],[1,2],[3,2],[1,4],[3,4],[2,4],[1,5],[3,5]]
};
const rankText=r=>r==='T'?'10':r;
const safeCard=card=>typeof card==='string'&&card.length===2&&'23456789TJQKA'.includes(card[0])&&SUITS[card[1]];
function pips(rank,suit){
  return (PIPS[rank]||[]).map(([col,row])=>`<span class="pip pip-r${row} pip-c${col}" aria-hidden="true">${SUITS[suit].symbol}</span>`).join('');
}
export function renderPlayingCard(card,{compact=false}={}){
  if(!safeCard(card))return '';
  const rank=card[0],suit=card[1],meta=SUITS[suit],face='JQK'.includes(rank);
  return `<span class="playing-card ${meta.name} ${compact?'playing-card--mini':''}" aria-label="${rankText(rank)}${meta.symbol}">
    <span class="card-corner card-corner--tl" aria-hidden="true"><b>${rankText(rank)}</b><i>${meta.symbol}</i></span>
    ${face
      ? `<span class="face-center" aria-hidden="true"><b>${rankText(rank)}</b><i>${meta.symbol}</i></span>`
      : `<span class="pip-grid" aria-hidden="true">${pips(rank,suit)}</span>`}
    <span class="card-corner card-corner--br" aria-hidden="true"><b>${rankText(rank)}</b><i>${meta.symbol}</i></span>
  </span>`;
}
export function renderHoleCards(cards,{compact=false}={}){
  if(!Array.isArray(cards))return '';
  return `<span class="hole-cards ${compact?'hole-cards--mini':''}">${cards.map(c=>renderPlayingCard(c,{compact})).join('')}</span>`;
}
export function renderCardBacks(count=2,{compact=false}={}){
  const n=Math.max(0,Math.min(2,Number(count)||0));
  return `<span class="hole-cards ${compact?'hole-cards--mini':''}">${Array.from({length:n},()=>`<span class="playing-card card-back ${compact?'playing-card--mini':''}" aria-label="ไพ่คว่ำ"></span>`).join('')}</span>`;
}
export function holeLabel(cards){
  if(!Array.isArray(cards)||cards.length!==2||!cards.every(safeCard))return '';
  const order='23456789TJQKA',[a,b]=cards,ra=a[0],rb=b[0];
  if(ra===rb)return `Pocket ${rankText(ra)}s`;
  const high=order.indexOf(ra)>order.indexOf(rb)?ra:rb,low=high===ra?rb:ra;
  return `${rankText(high)}${rankText(low)}${a[1]===b[1]?'s':'o'}`;
}
