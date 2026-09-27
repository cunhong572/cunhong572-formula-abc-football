import { strengthTier } from "lib/formula-b/strength-tiers.js";
import { scheduleOpportunity } from "lib/formula-b/schedule-pressure.js";
import { nationsNeed, nationsAbility, nationsIntent } from "lib/formula-b/nations-league.js";
import { europeanNeed } from "lib/formula-b/european-league-phase.js";
export function competitionNeed(side,ctx){
  const row=(ctx.table||[]).find(x=>x.teamId===side.teamId);
  if(!row)return {score:50,mustWin:false,reason:"积分数学需求无法完整验证"};
  if(ctx.isNationsLeague)return nationsNeed(side,ctx,row);
  const europeanResult=europeanNeed(side,ctx,row);
  if(europeanResult)return europeanResult;
  // 国内联赛在无法严格证明冠军/保级数学必要时，不制造 Must Win。
  return {score:55,mustWin:false,reason:"国内联赛存在常规拿分需求，但未形成可验证的数学 Must Win"};
}
// Domestic ability includes venue. Nations League classification evaluates
// the strength-based capability first, before applying venue/schedule context.
export function winAbility(side,opp){
  if(!side.tier||!opp.tier)return null;
  const gap=side.tier-opp.tier;
  return Math.max(10,Math.min(90,50+gap*18+(side.isHome?8:-4)));
}
export function weightedSupport(side,opp,ctx,weights={}){
  const need=competitionNeed(side,ctx);
  const w=(k,d)=>Number.isFinite(Number(weights?.[k]))?Number(weights[k])/100:d;
  const factors=[
    {key:"CompetitionNeed",weight:w("CompetitionNeed",.20),value:need.score},
    {key:"WinAbility",weight:w("WinAbility",.17),value:winAbility(side,opp)},
    {key:"LineupInjuryRotation",weight:w("LineupInjuryRotation",.15),value:null},
    {key:"FutureSchedule",weight:w("FutureSchedule",.10),value:scheduleOpportunity(side)},
    {key:"MarketOdds",weight:w("MarketOdds",.09),value:null},
    {key:"CurrentForm",weight:w("CurrentForm",.08),value:side.formScore},
    {key:"CoachIntent",weight:w("CoachIntent",.07),value:null},
    {key:"HomeAway",weight:w("HomeAway",.05),value:side.isHome?65:45},
    // Fatigue/density is deliberately excluded from intent scoring for ALL matches.
    // It may be used only to describe likely first-half/second-half effort timing.
    {key:"H2HStyle",weight:w("H2HStyle",.04),value:null}
  ];
  let sw=0,sv=0;
  factors.forEach(f=>{if(f.value!=null){sw+=f.weight;sv+=f.weight*f.value;}});
  const normalized=sw?sv/sw:null;
  return {score:normalized==null?null:Math.round(normalized),coverage:Math.round(sw*100),factors,need};
}
export function inputRule(side,opp,ctx,support){
  const t=side.tier,ot=opp.tier;
  if(!t||!ot){
    return {intent:"---",reason:"实力分级或关键资料无法验证，按主规则不得编造",...support};
  }

  if(!ctx.competition||!ctx.leagueId||ctx.insufficientData||
    !(ctx.isDomesticLeague||ctx.isNationsLeague||ctx.isUEL||ctx.isUECL||ctx.isUCL)||
    !(ctx.table||[]).some(row=>row.teamId===side.teamId))
    return {intent:"---",reason:"本场赛事、积分榜或赛制资料不足，不能仅凭实力推断意图",...support};

}

export function mandatoryRule(side,opp,ctx,support){
  const t=side.tier,ot=opp.tier;
  const ability=ctx.isNationsLeague?nationsAbility(side,opp):winAbility(side,opp);
  if(support.need.mustWin)
    return {intent:ability>=50?"Must Win":"Hope Win",reason:support.need.reason+
      (ability>=50?"；同时具备现实争胜能力":"；能力不足，只能保留最低争胜意图"),...support};

}

export function marketRule(side,opp,ctx,support){
  const t=side.tier,ot=opp.tier;
  const winOdds=Number(side.winOdds??(side.isHome?side.marketOdds?.home:side.marketOdds?.away));
  if(!side.isHome&&Number.isFinite(winOdds)&&winOdds>=4)
    return {intent:"---",reason:"客胜赔率达到4.00且没有必须拿3分的硬条件，信息不足不判Want Win",...support};

}

export function nationsRule(side,opp,ctx,support){
  const t=side.tier,ot=opp.tier;
  const ability=ctx.isNationsLeague?nationsAbility(side,opp):winAbility(side,opp);
  const nationsResult=nationsIntent(side,opp,ctx,support,ability);
  if(nationsResult)return nationsResult;


}

export function schedulePressureRule(side,opp,ctx,support){
  const t=side.tier,ot=opp.tier;
  // Remaining non-mandatory cases can use the common supporting evidence.

  // Formula C V22 locked: SAME-LEAGUE Next-3 schedule pressure rule.
  // This hard rule is only for domestic-league matches and only same-league
  // fixtures inside the team's next 3 may be COUNTED.
  // Cross-competition fixtures (Europe/cups/friendlies) are excluded from the
  // counts; they may still be considered elsewhere only as next-match importance.
  //
  // Trigger when ANY condition is true among eligible same-league fixtures:
  // 1) at least 2 opponents are higher tier than this team;
  // 2) at least 1 opponent is Elite (优);
  // 3) at least 2 opponents are the same tier as this team.
  const currentLeagueId=Number(ctx.leagueId||0);
  const currentIsDomesticLeague=!!ctx.isDomesticLeague;
  const scheduleLookahead=ctx.isNationsLeague?6:3;
  const scheduleLabel=ctx.isNationsLeague?"欧国联下6场":"同联赛下3场";
  const rawNext3=(side.next3||[]).slice(0,scheduleLookahead);
  const sameLeagueNext3=currentIsDomesticLeague
    ? rawNext3.filter(x=>currentLeagueId&&Number(x.leagueId||0)===currentLeagueId)
    : [];
  const next3Tiers=sameLeagueNext3.map(x=>strengthTier(x.opponent));
  const higherCount=next3Tiers.filter(x=>x!=null&&x>t).length;
  const eliteCount=next3Tiers.filter(x=>x===4).length;
  const sameCount=next3Tiers.filter(x=>x===t).length;
  const next3PressureTriggered=(higherCount>=2)||(eliteCount>=1)||(sameCount>=2);

  // Formula C V29 decision hierarchy: every intent rule is an auxiliary signal,
  // not an absolute command. If stronger verified combined evidence conflicts with
  // this schedule-pressure signal, the stronger evidence takes priority.
  // Stronger evidence includes near-mathematical competition need, extreme
  // capability mismatch, or an extreme fatigue+density conflict.
  const verifiedAbility=winAbility(side,opp);
  const higherPriorityOverride=(support.need.score>=85)||
    (verifiedAbility!=null&&(verifiedAbility<=30||verifiedAbility>=80));

  if(next3PressureTriggered&&!higherPriorityOverride){
    const pressureMeta={
      higherCount,eliteCount,sameCount,next3Tiers,
      eligibleSameLeagueGames:sameLeagueNext3.length,
      excludedCrossCompetitionGames:rawNext3.length-sameLeagueNext3.length
    };
    if(ot===4){
      // Formula C V27 capability gate: intention must be realistically executable.
      // If an Elite opponent is 2+ strength tiers above this team, schedule pressure
      // alone cannot force Don't Lose. Default to --- unless a future special-case
      // rule explicitly overrides this capability gate.
      if(ot-t>=2){
        return {
          intent:"---",
          reason:`${scheduleLabel}虽触发赛程压力，但本场优等级对手比本队高至少2个实力等级；按能力门槛，不能仅因主观不想输就判 Don't Lose，因此为 ---`,
          schedulePressure:pressureMeta,
          capabilityGate:true,
          ...support
        };
      }
      return {
        intent:"Don't Lose",
        reason:`${scheduleLabel}触发赛程压力规则；本场对手为优等级，且实力差距未超过能力门槛，因此判为 Don't Lose`,
        schedulePressure:pressureMeta,
        capabilityGate:true,
        ...support
      };
    }
    if(ot===t){
      const nextTwoEligible=sameLeagueNext3.slice(0,2).map(x=>strengthTier(x.opponent));
      if(nextTwoEligible.length===2&&nextTwoEligible.every(x=>x>t)&&
        nextTwoEligible.includes(4)&&nextTwoEligible.includes(3))
        return {intent:"Want Win",reason:"当前同档；后两场同联赛分别为Elite和Good且均更强，形成争胜机会窗口",schedulePressure:pressureMeta,...support};
      return {
        intent:"Hope Win",
        reason:"本场双方同等级；后续同联赛赛程压力只作为辅助证据，不能单独把同级对手比赛由 Hope Win 提升为 Want Win，因此保持 Hope Win，除非其他独立强证据达到 Want Win 门槛",
        schedulePressure:{...pressureMeta,nextTwoEligible},
        ...support
      };
    }
    if(ot<t){
      // Formula C V23: schedule-pressure rule must also respect venue.
      // Home vs lower-tier opponent => Want Win.
      // Away vs lower-tier opponent => default ceiling Hope Win unless another
      // independent hard override is verified elsewhere.
      const currentGap=t-ot;
      if(side.isHome||currentGap>=2){
        return {
          intent:"Want Win",
          reason:side.isHome
            ?`${scheduleLabel}触发赛程压力规则；本场主场且对手比本队低等级，因此判为 Want Win`
            :`${scheduleLabel}触发赛程压力规则；虽然本队客场，但实力至少高出当前对手2个等级，因此可判 Want Win`,
          schedulePressure:pressureMeta,
          ...support
        };
      }
      return {
        intent:"Hope Win",
        reason:`${scheduleLabel}触发赛程压力规则；本队客场且仅高当前对手1个实力等级，因此按主客场修正规则最高先判 Hope Win`,
        schedulePressure:pressureMeta,
        ...support
      };
    }
    // If current opponent is higher tier but not Elite, no automatic output;
    // continue through the rest of Formula C.
  }


}

export function standardIntentRule(side,opp,ctx,support){
  const t=side.tier,ot=opp.tier;
  const n1=side.next3[0],n2=side.next3[1];
  const n1Tier=n1?strengthTier(n1.opponent):null,n2Tier=n2?strengthTier(n2.opponent):null;
  const dontLoseGate=(n1Tier===4)||(
    n1Tier!=null&&n2Tier!=null&&n1Tier>=t+2&&n2Tier>=t+2
  );
  const strengthGapAgainst=ot-t;
  const baseDontLose=(ot>=t+1)&&(support.need.score<85)&&(winAbility(side,opp)!=null&&winAbility(side,opp)<=45);
  if(baseDontLose&&dontLoseGate){
    if(strengthGapAgainst>=2){
      return {intent:"---",reason:"存在避免失利动机，但对手实力高出至少2个等级；按公式C能力门槛，不把主观 Don’t Lose 直接当作可执行意图，故为 ---",capabilityGate:true,...support};
    }
    return {intent:"Don't Lose",reason:"常规因素偏向避免失利，且实力差距仍在可执行范围内并通过公式C Don't Lose 赛程硬门槛",capabilityGate:true,...support};
  }

  const gap=t-ot;
  // Global capability gate outranks auxiliary intent signals.
  // If this team is at least 2 strength tiers below the current opponent,
  // do not promote it to Hope Win / Don't Lose merely from schedule or motivation.
  // A future explicit special-case rule may override this when the user defines one.
  if(gap<=-2){
    return {intent:"---",reason:"本场实力至少低于对手2个等级；按公式C能力门槛，更强的现实实力差距优先于单一赛程/意图辅助规则，因此为 ---",capabilityGate:true,...support};
  }
  const nextTwo=(side.next3||[]).slice(0,2).map(x=>strengthTier(x.opponent));
  const nextTwoSameOrStronger=nextTwo.length===2&&nextTwo.every(x=>x!=null&&x>=t);
  const eliteHomeVsGood=side.isHome&&t===4&&ot===3;
  let wantSupport=0,hopeSupport=0;
  if(eliteHomeVsGood)wantSupport++;
  if(side.isHome&&Math.abs(gap)<=1&&nextTwoSameOrStronger)hopeSupport++;
  if(gap>0)hopeSupport++;
  if(support.need.score>=75)hopeSupport++;
  if(scheduleOpportunity(side)!=null&&scheduleOpportunity(side)>=68)hopeSupport++;

  const realistic=winAbility(side,opp)!=null&&winAbility(side,opp)>=58;
  const conditionsOK=true;

  // Fatigue/density never lowers or blocks the intent category; it is only
  // a first-half/second-half effort-timing reference for all Formula B matches.

  // V35 fix: home advantage is only an auxiliary factor. It must never create
  // a win intention by itself. This prevents a systematic "all home teams =
  // Hope Win" bias. A directional win preference now needs an independent
  // reason such as competition need, verified strength edge, schedule window,
  // or another strong factor.
  const independentWinSignal=
    support.need.score>=65||
    gap>0||
    (scheduleOpportunity(side)!=null&&scheduleOpportunity(side)>=68)||
    (side.formScore!=null&&side.formScore>=67);
  const clearWinMotivation=independentWinSignal||hopeSupport>0;
  const strongEvidence=(support.score!=null&&support.score>=66&&support.coverage>=50)||wantSupport>0;

  // Formula C V24:
  // A team that is 2+ strength tiers above the opponent has enough structural
  // superiority to reach Want Win even away, unless a strong negative condition
  // blocks it. This is intentionally different from the away +1-tier ceiling.
  if(gap>=2&&realistic&&(support.need.score>=65||side.formScore>=67)){
    return {intent:"Want Win",reason:"本队实力至少高出对手2个等级；不受客场+1级最高Hope Win限制。一般疲劳/赛程密度不单独把这种明显实力优势降到Hope Win，因此判为Want Win",...support};
  }

  if(clearWinMotivation&&realistic&&conditionsOK&&strongEvidence&&
    (support.need.score>=65||side.formScore>=67||(side.next3||[]).length>0)){
    return {intent:"Want Win",reason:eliteHomeVsGood?"主场Elite对Good为Want Win辅助支持，且无硬冲突/强负面":"胜利动机、实际赢球能力与比赛条件同时达到Want Win门槛",...support};
  }

  // A lower-tier away side cannot become Hope Win merely because its future
  // schedule is difficult. It needs a separate hard competitive reason.
  if(gap<0&&!side.isHome&&support.need.score<75){
    return {intent:"---",reason:"本队客场且实力低于当前对手；后续赛程压力本身不足以升级为Hope Win，且没有独立硬性条件",...support};
  }

  // Locked rule: same-tier / broadly even teams with no independent strong
  // evidence must stay "---". Venue alone cannot promote them to Hope Win.
  if(gap===0&&!independentWinSignal&&support.need.score<65){
    return {intent:"---",reason:"双方实力同级/接近，且没有独立强证据支持明确赢球意图；按锁定规则不能仅因主场优势判 Hope Win",...support};
  }

  const winPreference=clearWinMotivation||gap>0;
  if(gap>0&&side.formScore==null&&!(side.next3||[]).length&&support.need.score<65)
    return {intent:"---",reason:"实力优势仅为辅助，缺乏独立拿分或赛程证据",...support};
  const sufficientSupport=(support.score!=null&&support.score>=56)||hopeSupport>0;
  if(winPreference&&sufficientSupport){
    return {intent:"Hope Win",reason:"存在独立的赢球偏好证据，但证据不足以通过Want Win全部门槛",...support};
  }

  if(Math.abs(gap)<=1){
    return {intent:"---",reason:"双方实力接近且没有足够的方向性证据",...support};
  }
  return {intent:"---",reason:"证据冲突或不足，按公式C不强行填意图",...support};
}

