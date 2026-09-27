import { leagueRoot } from "lib/formula-b/standings-context.js";
import { strengthTier } from "lib/formula-b/strength-tiers.js";
export function nationsNeed(side,ctx,row){
  const requirement=ctx.pointsRequirements?.[side.teamId];
  if(ctx.isNationsLeague&&requirement?.verified===true&&[1,3].includes(requirement.requiredPoints)&&
    ["elimination","relegation","qualification_loss"].includes(requirement.consequence))
    return {score:100,mustWin:true,requiredPoints:requirement.requiredPoints,reason:"已验证欧国联本场必须拿分，否则淘汰/降级/失去资格"};
  const rank=Number(row.rank||0),played=Number(row.played||0),points=Number(row.points||0);
    const table=(ctx.table||[]).slice().sort((a,b)=>Number(a.rank||99)-Number(b.rank||99));
    const groupSize=table.length||4;
    const totalGames=groupSize<=3?4:6;
    const rem=Math.max(0,totalGames-played);
    const above=table.find(x=>Number(x.rank)===rank-1);
    const below=table.find(x=>Number(x.rank)===rank+1);
    const gapUp=above?Number(above.points||0)-points:null;
    const gapDown=below?points-Number(below.points||0):null;

    let score=55;
    let reason="欧国联按通用联赛规则计算拿分价值：胜3分、平1分、负0分；再结合当前排名与剩余场次";
    if(rem<=2)score+=10;
    if(rem===1)score+=8;
    if(Number.isFinite(gapUp)&&gapUp>=0&&gapUp<=3)score+=8;
    if(Number.isFinite(gapDown)&&gapDown>=0&&gapDown<=3)score+=6;
    score=Math.max(45,Math.min(87,score));

    // Keep the same conservative Formula B principle used in domestic leagues:
    // do not manufacture Must Win unless the mathematical necessity is clear.
    let mustWin=false;
    if(rem===1&&Number.isFinite(gapUp)&&gapUp>1&&gapUp<=3){
      mustWin=true;
      score=100;
      reason="欧国联最后一轮：按3/1/0积分规则，平局不足以追上紧邻目标位置，而胜利仍可追赶；按公式B通用数学必要条件判定";
    }
    return {score,mustWin,reason};
}

export function nationsAbility(side,opp){return Math.max(10,Math.min(90,50+(side.tier-opp.tier)*18));}

export function nationsIntent(side,opp,ctx,support,ability){
  const t=side.tier,ot=opp.tier;
  // Nations League prioritizes ability and points value over venue.
  if(ctx.isNationsLeague&&t>ot&&ability>=58&&
    (support.need.score>=65||(side.next3||[]).some(x=>Number(x.leagueId)===Number(ctx.leagueId)&&strengthTier(x.opponent)>=t)||side.formScore>=67))
    return {intent:"Want Win",reason:"欧国联现实能力及拿分/赛程证据支持争胜；不套用国内联赛客场上限",...support};

  return null;
}

export function nationsFuture(fixtures,leagueId){return fixtures.filter(f=>Number(f?.tournament?.leagueId||0)===leagueId).slice(0,6);}

export function nationsStandings(league,leagueId,cur){
      const root=leagueRoot(league,leagueId)||{};
      const groups=Array.isArray(root?.data?.tables)?root.data.tables:[];
      const homeIdNow=Number(cur?.home?.id),awayIdNow=Number(cur?.away?.id);
      const matches=groups.filter(g=>{
        const rows=g?.table?.all||[];
        const ids=rows.map(x=>Number(x.id));
        return ids.includes(homeIdNow)&&ids.includes(awayIdNow);
      });
      const grp=matches.length===1?matches[0]:null;
      const nationsGroupName=grp?.leagueName||null;
      const formMap=root?.teamForm||{};
      const table=(grp?.table?.all||[]).map(x=>({
        rank:Number(x.idx||0),team:x.name||"",teamId:Number(x.id),played:Number(x.played||0),
        points:Number(x.pts||0),gd:Number(x.goalConDiff||0),scores:x.scoresStr||"",
        form:(Array.isArray(formMap?.[String(x.id)])?formMap[String(x.id)]:[]).map(z=>z?.resultString).filter(Boolean).slice(-5)
      }));
  return {table,nationsGroupName};
}
