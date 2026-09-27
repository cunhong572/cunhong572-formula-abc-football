export function europeanNeed(side,ctx,row){
  const rank=Number(row.rank||0),played=Number(row.played||0),points=Number(row.points||0);
  const euroTotal=ctx.isUEL?8:ctx.isUECL?6:ctx.isUCL?8:null;

  if(euroTotal!=null){
    const rem=Math.max(0,euroTotal-played);
    const cutoff=(ctx.table||[]).find(x=>x.rank===24);
    const cutoffPts=Number(cutoff?.points);
    const mustWin=rem===1&&Number.isFinite(cutoffPts)&&(points+1<cutoffPts)&&(points+3>=cutoffPts);
    if(mustWin)return {score:100,mustWin:true,reason:"欧战最后阶段：平局不足以追上当前晋级线，胜利仍可保留资格路径"};
    if(rank>24&&rem<=3)return {score:88,mustWin:false,reason:"欧战处淘汰区且剩余场次少"};
    if(rank>8&&rem<=2)return {score:78,mustWin:false,reason:"欧战晋级区压力较高"};
    if(rank<=8)return {score:55,mustWin:false,reason:"欧战排名较稳"};
    return {score:66,mustWin:false,reason:"欧战仍有明确拿分价值"};
  }
  return null;
}

export function expectedLeagueGames(uel,uecl,ucl){return uel?8:uecl?6:ucl?8:null;}

export function incompleteEuropeanSchedule(sides,expected,preferExport=false){
  return !!expected&&sides.some(s=>(preferExport?(s.europeSchedule||s.competitionSchedule||[]):s.competitionSchedule).length<expected);
}

export function missingEuropeanTable(uel,uecl,table){return (uel||uecl)&&table.length!==36;}

export function attachEuropeanSchedule(home,away,expectedGames){
  if(expectedGames){
    home.europeSchedule=(home.competitionSchedule||[]).slice(0,expectedGames);
    away.europeSchedule=(away.competitionSchedule||[]).slice(0,expectedGames);
  }
}
