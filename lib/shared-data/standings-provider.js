import { selectStandingsRoot, isNationsLeague } from "lib/shared-data/competition-resolver.js";
import { tableFromTeam } from "lib/formula-a/standings.js";
import { getProviderJson } from "lib/shared-data/cache.js";
export function leagueRoot(payload,leagueId){return selectStandingsRoot(payload,leagueId,{boundLeagueId:leagueId}).root;}
function rows(raw,formMap=null){return raw.map(x=>({rank:Number(x.idx||0),team:x.name||'',teamId:Number(x.id),played:Number(x.played||0),points:Number(x.pts||0),gd:Number(x.goalConDiff||0),scores:x.scoresStr||'',...(formMap?{form:(Array.isArray(formMap?.[String(x.id)])?formMap[String(x.id)]:[]).map(z=>z?.resultString).filter(Boolean).slice(-5)}:{})}));}
export function getStandings(payload,{leagueId,competitionName='',fixture=null,sourceKind='league'}={}){
  const failure=diagnostic=>({rows:[],rawRows:[],leagueLevel:null,group:null,diagnostic});
  const selected=selectStandingsRoot(payload,leagueId,{boundLeagueId:sourceKind==='league'?leagueId:null});
  if(sourceKind==='team'){
    try{const rawRows=tableFromTeam(payload,leagueId);return {rawRows,rows:rows(rawRows),leagueLevel:null,group:null,diagnostic:rawRows.length?null:{code:'STANDINGS_EMPTY',message:'Current competition table is empty.'}};}
    catch(error){return failure({code:error.code,message:error.message});}
  }
  if(!selected.root)return failure(selected.diagnostic);
  const root=selected.root;
  if(isNationsLeague(competitionName)){
    const matches=(Array.isArray(root?.data?.tables)?root.data.tables:[]).filter(g=>{
      const ids=(g?.table?.all||[]).map(x=>Number(x.id));return ids.includes(Number(fixture?.home?.id))&&ids.includes(Number(fixture?.away?.id));
    });
    if(matches.length!==1)return failure({code:matches.length?'STANDINGS_GROUP_AMBIGUOUS':'STANDINGS_GROUP_MISSING',message:'Cannot uniquely identify current Nations League group.'});
    const group=matches[0].leagueName||null,rawRows=matches[0]?.table?.all||[];
    return {rawRows,rows:rows(rawRows,root.teamForm||{}),group,leagueLevel:String(competitionName+' '+(group||'')).match(/(?:Nations\s+League|League)\s+([A-D])\b/i)?.[1]||null,diagnostic:null};
  }
  const rawRows=root?.data?.table?.all||[];
  return {rawRows,rows:rows(rawRows),leagueLevel:null,group:null,diagnostic:rawRows.length?null:{code:'STANDINGS_EMPTY',message:'Current competition table is empty.'}};
}
export function getTeamStandings(payload,leagueId){
  const result=getStandings(payload,{leagueId,sourceKind:'team'});
  if(result.diagnostic&&result.diagnostic.code!=='STANDINGS_EMPTY'){const e=new Error(result.diagnostic.message);e.code=result.diagnostic.code;throw e;}
  return result.rawRows;
}
export function tableRows(payload,leagueId){return getStandings(payload,{leagueId}).rows;}
export function nationsStandings(payload,leagueId,fixture){const r=getStandings(payload,{leagueId,fixture,competitionName:'UEFA Nations League'});return {table:r.rows,nationsGroupName:r.group};}
export async function fetchStandings(context,options={}){
  const payload=await getProviderJson('/leagues?id='+context.leagueId+'&ccode3=USA',options);
  return getStandings(payload,context);
}
