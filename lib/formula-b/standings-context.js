export function leagueRoot(league,leagueId){
  const roots=league?.table||[];
  const matched=roots.filter(x=>Number(x?.leagueId??x?.data?.leagueId??x?.id)===Number(leagueId));
  if(matched.length===1)return matched[0];
  // The response is from /leagues?id=<current competition>. An unlabelled
  // singleton belongs to that request; multiple roots must never be guessed.
  if(!matched.length&&roots.length===1&&roots[0]?.leagueId==null&&roots[0]?.data?.leagueId==null&&roots[0]?.id==null)return roots[0];
  return null;
}

export function tableRows(league,leagueId){
  const raw=leagueRoot(league,leagueId)?.data?.table?.all||[];
  return raw.map(x=>({
    rank:Number(x.idx||0),team:x.name||"",teamId:Number(x.id),played:Number(x.played||0),
    points:Number(x.pts||0),gd:Number(x.goalConDiff||0),scores:x.scoresStr||""
  }));
}

export function domesticTableRows(teamObj){
  const raw=teamObj?.table?.[0]?.data?.table?.all||[];
  return raw.map(x=>({
    rank:Number(x.idx||0),team:x.name||"",teamId:Number(x.id),played:Number(x.played||0),
    points:Number(x.pts||0),gd:Number(x.goalConDiff||0),scores:x.scoresStr||""
  }));
}
