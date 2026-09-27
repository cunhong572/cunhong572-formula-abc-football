export function scoreResult(f,teamId){
  const hs=Number(f?.home?.score), as=Number(f?.away?.score);
  if(!Number.isFinite(hs)||!Number.isFinite(as))return "";
  const isHome=Number(f?.home?.id)===Number(teamId);
  const gf=isHome?hs:as, ga=isHome?as:hs;
  return gf>ga?"W":gf<ga?"L":"D";
}
export function stateFromForm(arr){
  if(!Array.isArray(arr)||!arr.length)return "—";
  const pts=arr.reduce((s,r)=>s+(r==="W"?3:r==="D"?1:0),0);
  const ppg=pts/arr.length;
  if(arr.length>=5&&ppg>=2.7)return "很好";
  if(ppg>=2)return "好";
  if(ppg>=1)return "一般";
  if(ppg>=0.4)return "差";
  return "很差";
}
export function normalizeForm(form){
  return (form||[]).filter(x=>["W","D","L"].includes(x)).slice(0,5);
}
export function competitionForm(past,currentLeagueId,teamId){
  return past.filter(f=>Number(f?.tournament?.leagueId||0)===currentLeagueId).slice(-5).map(f=>scoreResult(f,teamId)).filter(Boolean);
}
