export function parseGoals(scoresStr){
  const m=String(scoresStr||"").match(/(\d+)\s*-\s*(\d+)/);
  return m?{gf:Number(m[1]),ga:Number(m[2])}:{gf:0,ga:0};
}

export function tableFromTeam(t,leagueId){
  const id=Number(leagueId);
  const candidates=(t?.table||[]).filter(entry=>{
    const entryId=Number(entry?.leagueId??entry?.data?.leagueId??entry?.id);
    return id>0&&entryId===id&&Array.isArray(entry?.data?.table?.all);
  });
  if(candidates.length!==1){
    const error=new Error(candidates.length>1
      ?`Multiple standings tables match competition ${leagueId}; refusing to guess.`
      :`No identified standings table matches competition ${leagueId}; refusing to use another competition.`);
    error.code=candidates.length>1?"STANDINGS_AMBIGUOUS":"STANDINGS_NOT_FOUND";
    throw error;
  }
  return candidates[0].data.table.all;
}

export function standingRows(table,teamId){
  const total=table.length>1?2*(table.length-1):null;
  const rows=table.map(x=>{
    const played=Number(x.played||0),pts=Number(x.pts||0);
    const remaining=total==null?"":Math.max(0,total-played);
    return {
      rank:Number(x.idx||0),team:x.name||"",teamId:Number(x.id),focus:Number(x.id)===Number(teamId),
      points:pts,gd:Number(x.goalConDiff||0),played,remaining,maxPoints:remaining===""?"":pts+remaining*3,
      scoresStr:x.scoresStr||""
    };
  });
  const idx=rows.findIndex(x=>x.focus);
  if(idx<0)return [];
  return rows.slice(Math.max(0,idx-3),Math.min(rows.length,idx+4));
}
export function avgFromTable(table,teamId){
  const x=table.find(r=>Number(r.id)===Number(teamId));
  if(!x||!x.played)return {gf:"",ga:"",raw:null};
  const g=parseGoals(x.scoresStr);
  return {gf:(g.gf/Number(x.played)).toFixed(2),ga:(g.ga/Number(x.played)).toFixed(2),raw:{...g,played:Number(x.played)}};
}


export function centeredRanking(rows){
  const out=Array(7).fill(null);
  const list=Array.isArray(rows)?rows:[];
  const fi=list.findIndex(x=>x&&x.focus);
  if(fi<0)return out;
  const above=list.slice(0,fi).slice(-3);
  const below=list.slice(fi+1,fi+4);
  above.forEach((x,i)=>{out[3-above.length+i]=x;});
  out[3]=list[fi];
  below.forEach((x,i)=>{out[4+i]=x;});
  return out;
}
