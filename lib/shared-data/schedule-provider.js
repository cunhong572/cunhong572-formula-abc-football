import { getProviderJson } from "lib/shared-data/cache.js";
export function allFixtures(payload){return payload?.fixtures?.allFixtures?.fixtures||[];}
export function filterSchedule(fixtures,{leagueId=null,limit=null,tail=false}={}){
  const filtered=leagueId===null?fixtures:fixtures.filter(f=>Number(f?.tournament?.leagueId??f?.leagueId??0)===Number(leagueId));
  return limit===null?filtered:tail?filtered.slice(-limit):filtered.slice(0,limit);
}
export function partitionSchedule(payload,kickoff){
  const fixtures=(Array.isArray(payload)?payload:allFixtures(payload)).filter(f=>!f?.status?.cancelled).slice().sort((a,b)=>new Date(a.status.utcTime)-new Date(b.status.utcTime));
  const ts=new Date(kickoff).getTime();
  return {all:fixtures,past:fixtures.filter(f=>new Date(f.status.utcTime).getTime()<ts&&f.status.finished),future:fixtures.filter(f=>new Date(f.status.utcTime).getTime()>ts&&!f.status.finished)};
}
export function scheduleView(payload,{kickoff,mode='a',leagueId=null,currentFixture=null,expectedGames=null}={}){
  const parts=partitionSchedule(payload,kickoff);
  if(mode==='a')return {previous:filterSchedule(parts.past,{limit:3,tail:true}),current:currentFixture,next:filterSchedule(parts.future,{limit:2})};
  if(mode==='nations')return filterSchedule(parts.future,{leagueId,limit:6});
  if(mode==='europe')return filterSchedule(parts.all,{leagueId,limit:expectedGames});
  return filterSchedule(parts.future,{limit:3});
}
export function fetchTeamData(teamId,options={}){return getProviderJson('/teams?id='+encodeURIComponent(teamId)+'&ccode3=USA',options);}
export async function fetchSchedule(teamId,rule,options={}){return scheduleView(await fetchTeamData(teamId,options),rule);}
