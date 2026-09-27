export function isUCL(name){return /champions league/i.test(name||"")&&!/women/i.test(name||"")}

export function isUEL(name){return /europa league/i.test(name||"")&&!/conference/i.test(name||"")}

export function isUECL(name){return /conference league/i.test(name||"")}

export function isNationsLeague(name){return /(?:UEFA\s*)?Nations\s+League/i.test(name||"")&&!/(women|u\s?[-]?\s?(?:17|19|21)|youth)/i.test(name||"")}

export function resolveCompetition(fixture){
  const candidates=[fixture?.tournament?.leagueId,fixture?.competition?.id,fixture?.leagueId].filter(v=>v!=null&&Number(v)>0).map(Number);
  const ids=[...new Set(candidates)];
  if(ids.length!==1)return {competition:null,diagnostic:{code:ids.length?'COMPETITION_AMBIGUOUS':'COMPETITION_MISSING',message:'Current fixture must identify one competition.'}};
  const name=fixture?.tournament?.name||fixture?.competition?.name||'';
  const kind=isNationsLeague(name)?'nations-league':isUECL(name)?'conference-league':isUEL(name)?'europa-league':isUCL(name)?'champions-league':'domestic';
  return {competition:{id:ids[0],name,kind,leagueLevel:fixture?.tournament?.leagueLevel||String(name).match(/(?:Nations\s+League|League)\s+([A-D])\b/i)?.[1]||null,group:fixture?.tournament?.group||null},diagnostic:null};
}
export function selectStandingsRoot(payload,leagueId,{boundLeagueId=null}={}){
  const roots=Array.isArray(payload?.table)?payload.table:[];
  const matches=roots.filter(x=>Number(x?.leagueId??x?.data?.leagueId??x?.id)===Number(leagueId));
  if(matches.length===1)return {root:matches[0],diagnostic:null};
  if(!matches.length&&Number(leagueId)>0&&Number(boundLeagueId)===Number(leagueId)&&roots.length===1&&roots[0]?.leagueId==null&&roots[0]?.data?.leagueId==null&&roots[0]?.id==null)return {root:roots[0],diagnostic:null};
  return {root:null,diagnostic:{code:matches.length>1?'STANDINGS_AMBIGUOUS':'STANDINGS_NOT_FOUND',message:'No unique current-competition standings; refusing to use another table.'}};
}
