function iso(v){return String(v||"").slice(0,10)}
export function daysBetween(a,b){
  if(!a||!b)return null;
  return Math.max(0,Math.round((new Date(b+"T12:00:00Z")-new Date(a+"T12:00:00Z"))/86400000)-1);
}

export function fatigueFromPast(past,currentDate){
  const p=past.slice(-3);
  if(!p.length)return "—";
  const d1=daysBetween(iso(p[p.length-1].status.utcTime),currentDate);
  if(d1==null||d1>=4)return "不累";
  const d2=p.length>=2?daysBetween(iso(p[p.length-2].status.utcTime),iso(p[p.length-1].status.utcTime)):null;
  return d2!=null&&d2<=3?"很累":"累";
}

export function futureMark(next,currentDate){
  const n=next.slice(0,2);
  if(!n.length)return "❌";
  const first=daysBetween(currentDate,n[0].date);
  if(first==null||first>=4)return "❌";
  let tight=0,prev=currentDate;
  for(const f of n){const d=daysBetween(prev,f.date);if(d!=null&&d<=3)tight++;prev=f.date;}
  return tight>=2?"☑️×2":tight===1?"☑️":"❌";
}

export function fatigueScore(side){
  let v=side.fatigue==="不累"?70:side.fatigue==="累"?48:side.fatigue==="很累"?28:50;
  if(side.density==="☑️")v-=8;
  if(side.density==="☑️×2")v-=18;
  return Math.max(0,Math.min(100,v));
}
