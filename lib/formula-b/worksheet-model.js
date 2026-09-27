import { classifyIntent } from "lib/formula-b/intent-engine.js";
import { strengthTier } from "lib/formula-b/strength-tiers.js";
import { fatigueFromPast, futureMark } from "lib/formula-b/fatigue.js";
import { isUCL, isUEL, isUECL, isNationsLeague } from "lib/formula-b/competition-context.js";
import { expectedLeagueGames, incompleteEuropeanSchedule, missingEuropeanTable } from "lib/formula-b/european-league-phase.js";
function iso(v){return String(v||"").slice(0,10)}
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
export function resultForTeam(f,teamId){
  if(!f?.status?.finished)return null;
  const hs=Number(f?.home?.score),as=Number(f?.away?.score);
  if(!Number.isFinite(hs)||!Number.isFinite(as))return null;
  const home=Number(f?.home?.id)===Number(teamId);
  const gf=home?hs:as,ga=home?as:hs;
  return gf>ga?"W":gf<ga?"L":"D";
}
export function formScore(past,teamId){
  const arr=past.slice(-5).map(f=>resultForTeam(f,teamId)).filter(Boolean);
  if(!arr.length)return {form:[],score:null};
  const pts=arr.reduce((s,r)=>s+(r==="W"?3:r==="D"?1:0),0);
  return {form:arr,score:Math.round((pts/(arr.length*3))*100)};
}
export function analyzeSuppliedData(data){
  const match=data.match,nations=isNationsLeague(match.competition);
  const uel=isUEL(match.competition),uecl=isUECL(match.competition),ucl=isUCL(match.competition);
  const leagueId=Number(match.leagueId||0),table=data.competitionTable||[];
  const warnings=[];
  const level=data.nationsLeague?.leagueLevel||String(match.competition||"").match(/Nations\s+League\s+([A-D])/i)?.[1]||null;
  function convert(raw,isHome){
    const name=raw.name||match[isHome?"home":"away"],teamId=Number(raw.teamId||0);
    const next3=(raw.next||raw.next3||[]).filter(f=>!nations||
      (leagueId?Number(f.leagueId)===leagueId:isNationsLeague(f.competition))).slice(0,nations?6:3);
    const row=leagueId?table.find(x=>x.teamId===teamId):null;
    if(!row)warnings.push("INSUFFICIENT_STANDINGS: no verified current-competition ranking for "+name);
    return {...raw,name,teamId,isHome,tier:strengthTier(name),rank:row?.rank??null,rankSource:row?match.competition:"Unverified",
      fatigue:fatigueFromPast((raw.previous||[]).map(x=>({status:{utcTime:x.utcTime||x.date}})),match.date),
      density:futureMark(next3,match.date),next3:next3.map(x=>({...x,display:x.display||
        (x.ha==="A"?x.opponent+" vs "+name:name+" vs "+x.opponent)})),form:raw.form||[],formScore:null};
  }
  const home=convert(data.home,true),away=convert(data.away,false);
  const expectedGames=expectedLeagueGames(uel,uecl,ucl);
  if(incompleteEuropeanSchedule([home,away],expectedGames,true))
    warnings.push("INCOMPLETE_SCHEDULE: full competition schedule not supplied.");
  if(missingEuropeanTable(uel,uecl,table))warnings.push("INSUFFICIENT_STANDINGS: expected 36-team competition table.");
  if(nations&&(!level||!data.nationsLeague?.groupName))warnings.push("INSUFFICIENT_NATIONS_CONTEXT: League/Group not supplied.");
  const ctx={competition:match.competition,leagueId,table,isNationsLeague:nations,isUEL:uel,isUECL:uecl,isUCL:ucl,
    isDomesticLeague:!!data.competitionContext?.isDomesticLeague,insufficientData:warnings.length>0,
    leagueLevel:level,groupName:data.nationsLeague?.groupName};
  for(const [s,o] of [[home,away],[away,home]]){
    const result=classifyIntent(s,o,ctx);
    Object.assign(s,{intent:result.intent,intentReason:result.reason,intentScore:ctx.insufficientData?null:result.score,dataCoverage:ctx.insufficientData?0:result.coverage});
  }
  return {engineVersion:"Formula B PREMATCH",match,home,away,competitionTable:table,warnings,
    nationsLeague:{isNationsLeague:nations,leagueLevel:level,groupName:data.nationsLeague?.groupName||null},
    european:{isUCL:ucl,isUEL:uel,isUECL:uecl,expectedGames},qa:{insufficientData:ctx.insufficientData}};
}


export function formatFormulaBResult(result){
  const format=side=>({...side,formResults:Array.isArray(side.form)?side.form:[],
    form:Array.isArray(side.form)?side.form.join(""):side.form||""});
  return {...result,home:format(result.home),away:format(result.away)};
}
