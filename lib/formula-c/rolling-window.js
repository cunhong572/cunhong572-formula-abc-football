// Shared clock and short-lived tactical evidence; no intent decisions live here.
export function matchMinute(value){
  if(value==null||value==='')return null;
  if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null;
  const m=String(value).trim().match(/^(\d+(?:\.\d+)?)(?:\s*\+\s*(\d+(?:\.\d+)?))?(?:\s*['′’]|\s*min(?:utes)?)?$/i);
  return m?Number(m[1])+Number(m[2]||0):null;
}
export function inRecentWindow(value,minute){
  const t=matchMinute(value),now=matchMinute(minute);
  return t!==null&&now!==null&&t>=Math.max(0,now-5)&&t<=now;
}
