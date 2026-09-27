import { fmt, POSITIONS } from './engine.js';
export const STORAGE_KEY='poker-lab.practice.v2';
export const freshProgress=()=>({version:2,decisions:0,hands:0,skipped:0,mathTotal:0,mathCorrect:0,recent:[]});
export function loadProgress(storage) {
  try {
    const p=JSON.parse(storage.getItem(STORAGE_KEY));
    if(!p || p.version!==2) return freshProgress();
    const out=freshProgress();
    for(const k of ['decisions','hands','skipped','mathTotal','mathCorrect']) if(Number.isSafeInteger(p[k])&&p[k]>=0)out[k]=p[k];
    out.mathCorrect=Math.min(out.mathCorrect,out.mathTotal);
    out.recent=Array.isArray(p.recent)?p.recent.filter(r=>r&&typeof r.scenario==='string'&&Number.isInteger(r.seed)&&typeof r.text==='string'&&r.text.length<1500&&POSITIONS.includes(r.position)).slice(0,30):[];
    return out;
  }catch{return freshProgress();}
}
export function saveProgress(storage,progress) {try{storage.setItem(STORAGE_KEY,JSON.stringify(progress));return true;}catch{return false;}}
export function mathCorrect(answer,expected) {
  if(typeof answer!=='string'||answer.trim()==='')return false;
  const n=Number(answer);return Number.isFinite(n)&&n>=0&&Math.abs(n*100-expected)<.501;
}
export function describeAction(game,id,action) {
  if(action.kind==='fold')return 'Fold · หมอบ';
  if(action.kind==='check')return 'Check · ผ่าน';
  if(action.kind==='call')return `Call · ตามเพิ่ม ${fmt(game.callAmount(id))}`;
  return `${game.currentBet?'Raise to':'Bet'} ${fmt(action.target)}`;
}
export function reviewText({label,before,forecast,waiting,street}) {
  if(label.startsWith('Fold')) return `${label} — เก็บ Stack ที่เหลือ ${fmt(before.stack)}; ชิปที่ลงไปก่อนหน้าไม่คืนให้ การแพ้หรือชนะมือนี้ไม่ได้พิสูจน์ว่าการหมอบถูกหรือผิด`;
  let text=`${label} — ลงเพิ่ม ${fmt(forecast.invest)} จาก Stack ${fmt(before.stack)} เหลือ ${fmt(forecast.remaining)}; Pot ทันที ${fmt(forecast.potNow)} (รวมเดิมพันเดิมแล้ว)`;
  if(forecast.conditional)text+=`; ถ้า ${forecast.conditional.opponents.map(id=>POSITIONS[id]).join(', ')||'ทุกคนหมอบ'} ตามสมมติฐาน: Pot ${fmt(forecast.conditional.pot)} และเหลือ ${fmt(forecast.conditional.remaining)}`;
  if(waiting.length)text+=`. ยังมี ${waiting.join(', ')} รอตัดสินใจ จึงยังไม่ใช่ Pot สุดท้าย`;
  if(street!=='river')text+='. ยังมีไพ่และการเดิมพันรอบถัดไป';
  return text;
}
