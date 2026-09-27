import { fixtureDate, kickoffContext } from "lib/shared-data/timezone.js";
import { scoreResult } from "lib/formula-a/form.js";
function iso(v){return String(v||"").slice(0,10)}
export function fixtureRow(f,teamId,competitionTimeZones){
  const h=f?.home?.name||"", a=f?.away?.name||"";
  const done=!!f?.status?.finished && !f?.status?.cancelled;
  const score=done && f?.status?.scoreStr ? f.status.scoreStr.replace(/\s+/g,"") : "";
  return {
    date:fixtureDate(f,competitionTimeZones),
    competition:f?.tournament?.name||"",
    opponent:Number(f?.home?.id)===Number(teamId)?a:h,
    ha:Number(f?.home?.id)===Number(teamId)?"H":"A",
    result:done?scoreResult(f,teamId):"",
    fixtureId:f?.id||null,
    status:done?"FT":"NS",
    display:done&&score?(h+" "+score+" "+a):(h+"-"+a)
  };
}
export function rowFixture(f,teamId){
  const home=Number(f?.home?.id)===Number(teamId);
  return {
    date:iso(f?.status?.utcTime),
    utcTime:f?.status?.utcTime||"",
    competition:f?.tournament?.name||"",
    leagueId:Number(f?.tournament?.leagueId||0),
    ha:home?"H":"A",
    opponent:home?(f?.away?.name||""):(f?.home?.name||""),
    display:(f?.home?.name||"")+" vs "+(f?.away?.name||"")
  };
}

export function normalizeFixture(fixture,zones={}){
  return {id:fixture?.id??null,competitionId:Number(fixture?.tournament?.leagueId||0),home:fixture?.home||null,away:fixture?.away||null,kickoff:kickoffContext(fixture,zones),finished:!!fixture?.status?.finished,cancelled:!!fixture?.status?.cancelled};
}
export function selectCurrentFixture(fixtures,resolvedFixture,homeId,awayId,now){
  const candidates=fixtures.filter(f=>{const ids=[Number(f?.home?.id),Number(f?.away?.id)],ts=new Date(f?.status?.utcTime||0).getTime();return ids.includes(homeId)&&ids.includes(awayId)&&ts>=now&&!f?.status?.cancelled;}).sort((a,b)=>new Date(a.status.utcTime)-new Date(b.status.utcTime));
  return (resolvedFixture&&!resolvedFixture?.status?.cancelled&&new Date(resolvedFixture?.status?.utcTime||0).getTime()>=now?resolvedFixture:null)||candidates.find(f=>Number(f?.home?.id)===homeId&&Number(f?.away?.id)===awayId)||candidates[0]||null;
}
