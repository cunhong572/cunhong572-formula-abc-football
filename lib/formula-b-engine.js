import { buildMatchContext } from "lib/shared-data/match-context-provider.js";
import { allFixtures, fetchTeamData, filterSchedule } from "lib/shared-data/schedule-provider.js";
import { selectCurrentFixture } from "lib/shared-data/fixture-normalizer.js";
import { getProviderJson } from "lib/shared-data/cache.js";
import { rowFixture, formScore, analyzeSuppliedData } from "lib/formula-b/worksheet-model.js";
import { classifyIntent } from "lib/formula-b/intent-engine.js";
import { competitionNeed } from "lib/formula-b/intent-rules.js";
import { expectedLeagueGames, incompleteEuropeanSchedule, missingEuropeanTable, attachEuropeanSchedule } from "lib/formula-b/european-league-phase.js";
import { nationsFuture, nationsStandings } from "lib/formula-b/nations-league.js";
import { isUCL, isUEL, isUECL, isNationsLeague } from "lib/formula-b/competition-context.js";
import { tableRows } from "lib/formula-b/standings-context.js";
import { fatigueFromPast, futureMark } from "lib/formula-b/fatigue.js";
import { strengthTier, tierLabel } from "lib/formula-b/strength-tiers.js";
import {requireAuth} from "lib/auth.js";
import {getFormulaABCWeights} from "lib/formula-abc-config.js";
import {resolveTeamPair} from "lib/team-resolver.js";
export const access="public";
export const methods=["POST"];

function iso(v){return String(v||"").slice(0,10)}
function fixtures(t){return allFixtures(t);}

export async function prematchHandler(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  try{
    const body=req.body||{},homeInput=String(body.home||"").trim(),awayInput=String(body.away||"").trim();
    if(!homeInput||!awayInput)return res.status(400).json({error:"Home and Away are required."});
    const resolved=await resolveTeamPair(homeInput,awayInput);
    const hh=resolved?.home,ah=resolved?.away;
    if(!hh?.id||!ah?.id)return res.status(404).json({
      error:"Could not identify one or both teams.",
      recognition:{homeInput,awayInput,reason:resolved?.reason||"unresolved",candidates:resolved?.candidates||null}
    });
    const [ht,at]=await Promise.all([
      fetchTeamData(hh.id),
      fetchTeamData(ah.id)
    ]);
    const hid=Number(hh.id),aid=Number(ah.id),now=Date.now()-6*3600*1000;
    const cur=selectCurrentFixture(fixtures(ht),resolved?.fixture,hid,aid,now);
    if(!cur)return res.status(404).json({error:"No upcoming match found."});
    const currentDate=iso(cur.status.utcTime),leagueId=Number(cur?.tournament?.leagueId||0),competition=cur?.tournament?.name||"";
    const league=leagueId?await getProviderJson("/leagues?id="+leagueId+"&ccode3=USA"):null;
    const earlyNationsFlag=isNationsLeague(competition);
    let nationsGroupName=null;
    let table=[];
    if(earlyNationsFlag){
      ({table,nationsGroupName}=nationsStandings(league,leagueId,cur));
    }else{
      table=tableRows(league,leagueId);
    }

    const sharedContext=buildMatchContext({fixture:cur,homeTeam:Number(cur.home.id)===hid?ht:at,awayTeam:Number(cur.away.id)===aid?at:ht,fields:[]});
    function side(teamObj,teamId){
      const {all,past,future:fut}=Number(teamId)===Number(cur.home.id)?sharedContext.schedule.home:sharedContext.schedule.away;
      const competitionRank=table.find(x=>x.teamId===Number(teamId))?.rank??null;
      const rank=competitionRank;
      const rankSource=competitionRank!=null?competition:"Unverified";
      const nationsCurrent=isNationsLeague(competition);
      const next3=(nationsCurrent
        ? nationsFuture(fut,leagueId)
        : fut.slice(0,3)
      ).map(f=>rowFixture(f,teamId));
      const compFixtures=filterSchedule(all,{leagueId}).map(f=>rowFixture(f,teamId));
      const fScore=formScore(past,teamId);
      const name=Number(cur.home.id)===Number(teamId)?cur.home.name:cur.away.name;
      const tier=strengthTier(name);
      return {
        name,teamId:Number(teamId),rank,rankSource,isHome:Number(cur.home.id)===Number(teamId),
        tier,tierLabel:tierLabel(tier),
        fatigue:fatigueFromPast(past,currentDate),density:futureMark(next3,currentDate),
        next3,competitionSchedule:compFixtures,
        form:fScore.form,formScore:fScore.score,
        marketOdds:body.marketOdds||null,
        winOdds:body.marketOdds?.[Number(cur.home.id)===Number(teamId)?"home":"away"]??null
      };
    }
    const homeId=Number(cur.home.id),awayId=Number(cur.away.id);
    const homeObj=homeId===hid?ht:at,awayObj=awayId===aid?at:ht;
    const home=side(homeObj,homeId),away=side(awayObj,awayId);
    const uclFlag=isUCL(competition),uelFlag=isUEL(competition),ueclFlag=isUECL(competition),nationsFlag=earlyNationsFlag;
    const domesticLeagueName=!uclFlag&&!uelFlag&&!ueclFlag&&!nationsFlag&&!/(cup|copa|pokal|coupe|trophy|super cup|supercup|friendly|friendlies)/i.test(competition||"");
    // Nations League keeps its dedicated ability/points order and next SIX
    // competition fixtures. Domestic leagues retain their Next-3 window.
    const expected=expectedLeagueGames(uelFlag,ueclFlag,uclFlag);
    const incompleteSchedule=incompleteEuropeanSchedule([home,away],expected);
    const missingStandings=[home,away].some(s=>s.rank==null)||(missingEuropeanTable(uelFlag,ueclFlag,table));
    const level=String(competition+" "+(nationsGroupName||"")).match(/(?:Nations\s+League|League)\s+([A-D])\b/i)?.[1]||null;
    const warnings=[];
    if(incompleteSchedule)warnings.push(`INCOMPLETE_SCHEDULE: expected ${expected} current-competition fixtures per team.`);
    if(missingStandings)warnings.push("INSUFFICIENT_STANDINGS: current-competition rank/table missing or ambiguous; no domestic fallback.");
    if(nationsFlag&&(!level||!nationsGroupName))warnings.push("INSUFFICIENT_NATIONS_CONTEXT: League/Group is unverified.");
    const euroCtx={competition,table,leagueId,isUCL:uclFlag,isUEL:uelFlag,isUECL:ueclFlag,isNationsLeague:nationsFlag,isDomesticLeague:domesticLeagueName||nationsFlag,
      leagueLevel:level,groupName:nationsGroupName,insufficientData:warnings.length>0,
      pointsRequirements:body.competitionContext?.pointsRequirements};
    const abcWeightState=await getFormulaABCWeights();
    const cWeights=abcWeightState.C?.config||{};
    const hIntent=classifyIntent(home,away,euroCtx,cWeights),aIntent=classifyIntent(away,home,euroCtx,cWeights);
    home.intent=hIntent.intent;home.intentReason=hIntent.reason;
    home.intentScore=warnings.length?null:hIntent.score;home.dataCoverage=warnings.length?0:hIntent.coverage;
    home.factorBreakdown=hIntent.factors;
    away.intent=aIntent.intent;away.intentReason=aIntent.reason;
    away.intentScore=warnings.length?null:aIntent.score;away.dataCoverage=warnings.length?0:aIntent.coverage;
    away.factorBreakdown=aIntent.factors;

    const uel=uelFlag,uecl=ueclFlag,ucl=uclFlag;
    const expectedGames=expectedLeagueGames(uel,uecl,ucl);
    attachEuropeanSchedule(home,away,expectedGames);

    res.json({
      source:"FotMob (current provider fallback; official table has priority when available)",
      engineVersion:"Formula B Master Rules V45 LOCKED · Fatigue timing only for all matches",
      decisionPolicy:"All intent rules are auxiliary considerations. Final intent is decided by combined evidence, and stronger verified factors override any single auxiliary rule.",
      analyzedAt:new Date().toISOString(),
      match:{home:cur.home.name,away:cur.away.name,homeTeamId:homeId,awayTeamId:awayId,fixtureId:cur.id,date:currentDate,competition,leagueId,identityKey:String(homeId)+"|"+String(awayId)+"|"+String(cur.id||currentDate)},
      home,away,
      competitionTable:table,
      warnings,
      european:{isUCL:ucl,isUEL:uel,isUECL:uecl,expectedGames},
      nationsLeague:{
        isNationsLeague:nationsFlag,
        leagueLevel:level,
        groupName:nationsGroupName,
        strengthTierPolicy:"国家队实力为辅助；欧国联按现实能力、拿分价值、主客场、后续赛程顺序分析"
      },
      weightConfig:abcWeightState.C,
      qa:{
        incompleteSchedule,insufficientData:warnings.length>0,
        rankSourceHome:home.rankSource,
        rankSourceAway:away.rankSource,
        allTimes:"ET / America/New_York on display",
        unverifiedFactors:["Starting lineup / rotation / injuries","Market odds / movement","Coach comments","H2H / tactical matchup"],
        note:"Unverified factors are not invented and are excluded from the normalized supportive score."
      }
    });
  }catch(e){
    console.error("formula-c error",String(e?.stack||e));
    res.status(502).json({error:"Formula C lookup failed.",detail:String(e?.message||e)});
  }
}

export { strengthTier };

export { fatigueFromPast };

export { futureMark };

export { competitionNeed };

export { classifyIntent };

export { analyzeSuppliedData };
