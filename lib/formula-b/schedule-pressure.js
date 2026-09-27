import { strengthTier } from "lib/formula-b/strength-tiers.js";
export function scheduleOpportunity(side){
  const t=side.tier;if(!t)return null;
  const tiers=(side.next3||[]).slice(0,2).map(x=>strengthTier(x.opponent)).filter(x=>x!=null);
  if(!tiers.length)return 50;
  let v=50;
  for(const x of tiers){
    if(x>=t+2)v+=18;
    else if(x===t+1)v+=10;
    else if(x<=t-1)v-=5;
  }
  return Math.max(0,Math.min(100,v));
}
