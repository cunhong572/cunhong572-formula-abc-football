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
import { trackedFetch } from "lib/tracked-fetch.js";
export const access="public";
export const methods=["POST"];

const BASE="https://www.fotmob.com/api/data";
const SPORTSDB="https://www.thesportsdb.com/api/v1/json/3";
async function getJson(path){
  const r=await trackedFetch(BASE+path,{timeout_ms:12000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
  if(!r.ok) throw new Error("FotMob HTTP "+r.status);
  return await r.json();
}
async function getExternalJson(url){
  const r=await trackedFetch(url,{timeout_ms:8000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
  if(!r.ok) throw new Error("External team lookup HTTP "+r.status);
  return await r.json();
}
function norm(s){
  return String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
}
function iso(v){return String(v||"").slice(0,10)}
const TEAM_ALIASES={
  "atlmadrid":"Atletico Madrid","atleticomadrid":"Atletico Madrid","atleticodemadrid":"Atletico Madrid","athleticomadrid":"Atletico Madrid",
  "realmadridcf":"Real Madrid","realmadrid":"Real Madrid","barca":"Barcelona","fcbarcelona":"Barcelona",
  "villarrealcf":"Villarreal","villarreal":"Villarreal","levanteud":"Levante","levante":"Levante",
  "manutd":"Manchester United","manunited":"Manchester United","manchesterutd":"Manchester United",
  "mancity":"Manchester City","manchestercityfc":"Manchester City",
  "spurs":"Tottenham Hotspur","tottenham":"Tottenham Hotspur","tottenhamhotspur":"Tottenham Hotspur",
  "newcastle":"Newcastle United","newcastleutd":"Newcastle United",
  "westham":"West Ham United","westhamutd":"West Ham United",
  "wolves":"Wolverhampton Wanderers","wolverhampton":"Wolverhampton Wanderers",
  "nottmforest":"Nottingham Forest","nottingham":"Nottingham Forest",
  "psg":"Paris Saint-Germain","parissg":"Paris Saint-Germain","parissaintgermain":"Paris Saint-Germain",
  "parissaintgermainfc":"Paris Saint-Germain",
  "om":"Marseille","ol":"Lyon","lyon":"Olympique Lyonnais","marseille":"Olympique Marseille",
  "olympiquedemarseille":"Olympique Marseille","olympiquemarseille":"Olympique Marseille",
  "bayern":"Bayern Munich","bayernmunchen":"Bayern Munich","bayernmunich":"Bayern Munich",
  "dortmund":"Borussia Dortmund","bvb":"Borussia Dortmund",
  "leverkusen":"Bayer Leverkusen","bayer04":"Bayer Leverkusen","bayer04leverkusen":"Bayer Leverkusen",
  "rbleipzig":"RB Leipzig","leipzig":"RB Leipzig",
  "schalke":"Schalke 04","schalke04":"Schalke 04",
  "elversberg":"SV Elversberg","svelversberg":"SV Elversberg","eldersburg":"SV Elversberg",
  "paderborn":"SC Paderborn 07","scpaderborn07":"SC Paderborn 07",
  "hoffenheim":"TSG Hoffenheim","tsg1899hoffenheim":"TSG Hoffenheim","tsghoffenheim":"TSG Hoffenheim",
  "gladbach":"Borussia Mönchengladbach","monchengladbach":"Borussia Mönchengladbach","mgladbach":"Borussia Mönchengladbach","borussiamgladbach":"Borussia Mönchengladbach",
  "eintrachtfrankfurt":"Eintracht Frankfurt","scfreiburg":"Freiburg",
  "fckoln":"FC Köln","koln":"FC Köln","cologne":"FC Köln",
  "parisfc":"Paris FC","rcstrasbourg":"Strasbourg","strasbourg":"Strasbourg",
  "hullcity":"Hull City","ipswichtown":"Ipswich Town",
  "inter":"Inter","intermilan":"Inter","internazionale":"Inter",
  "acmilan":"AC Milan","milan":"AC Milan","juve":"Juventus",
  "roma":"Roma","asroma":"Roma","napoli":"Napoli",
  "sporting":"Sporting CP","sportinglisbon":"Sporting CP",
  "benfica":"Benfica","fcporto":"Porto","porto":"Porto",
  "psv":"PSV Eindhoven","psveindhoven":"PSV Eindhoven",
  "shakhtar":"Shakhtar Donetsk","shakhtardonetsk":"Shakhtar Donetsk",
  "fener":"Fenerbahce","fenerbahce":"Fenerbahce","galatasaray":"Galatasaray",
  "slaviaprague":"Slavia Prague","slaviapraha":"Slavia Prague",
  "bodoglimt":"Bodø/Glimt"
};
function canonicalName(name){
  return TEAM_ALIASES[norm(name)]||String(name||"").trim();
}
function isSeniorTeamSuggestion(x){
  const s=String(x?.name||"");
  return x?.type==="team"&&!/\b(?:women|ladies|u\s?[-]?\s?(?:17|18|19|20|21|23)|reserves?|academy|youth)\b/i.test(s);
}
function searchTeam(list,name){
  const target=canonicalName(name),n=norm(target);
  const all=(Array.isArray(list)?list:[]).flatMap(x=>x.suggestions||[]).filter(isSeniorTeamSuggestion);
  return all.find(x=>norm(x.name)===n)||
    all.find(x=>{const xn=norm(x.name);return n.length>=5&&(xn.includes(n)||n.includes(xn))})||
    null;
}
async function fotmobResolve(name){
  const canonical=canonicalName(name);
  const queries=[canonical];
  if(norm(canonical)!==norm(name))queries.push(name);
  for(const q of queries){
    try{
      const data=await getJson("/search/suggest?hits=20&lang=en&term="+encodeURIComponent(q));
      const hit=searchTeam(data,q)||searchTeam(data,canonical);
      if(hit?.id)return {hit,canonical,source:norm(canonical)===norm(name)?"FotMob":"Alias + FotMob"};
    }catch(e){}
  }
  return null;
}
async function sportsDbFallback(name){
  try{
    const canonical=canonicalName(name);
    const d=await getExternalJson(SPORTSDB+"/searchteams.php?t="+encodeURIComponent(canonical));
    const teams=Array.isArray(d?.teams)?d.teams:[];
    const senior=teams.find(t=>!/Women|Ladies|U\d+|Youth|Reserve/i.test(String(t?.strTeam||"")))||teams[0];
    const candidate=senior?.strTeam||senior?.strTeamAlternate?.split(",")?.[0]?.trim();
    if(!candidate)return null;
    const data=await getJson("/search/suggest?hits=20&lang=en&term="+encodeURIComponent(candidate));
    const hit=searchTeam(data,candidate);
    return hit?.id?{hit,canonical:candidate,source:"TheSportsDB + FotMob"}:null;
  }catch(e){return null;}
}
async function resolveTeam(name){
  return await fotmobResolve(name)||await sportsDbFallback(name);
}
function fixtures(t){return t?.fixtures?.allFixtures?.fixtures||[]}
async function externalFutureRows(teamName,currentDate){
  try{
    const q=encodeURIComponent(String(teamName||"").trim());
    const sr=await trackedFetch("https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t="+q,{timeout_ms:8000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
    if(!sr.ok)return [];
    const sd=await sr.json();
    const teams=Array.isArray(sd?.teams)?sd.teams:[];
    const team=teams.find(t=>norm(t?.strTeam)===norm(teamName))||teams[0];
    if(!team?.idTeam)return [];
    const er=await trackedFetch("https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id="+encodeURIComponent(team.idTeam),{timeout_ms:8000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
    if(!er.ok)return [];
    const ed=await er.json();
    const events=Array.isArray(ed?.events)?ed.events:[];
    return events.map(e=>{
      const home=String(e?.strHomeTeam||"").trim(),away=String(e?.strAwayTeam||"").trim();
      const date=String(e?.dateEvent||e?.strTimestamp||"").slice(0,10);
      const isHome=norm(home)===norm(teamName)||norm(home)===norm(team?.strTeam);
      const opp=isHome?away:home;
      const league=String(e?.strLeague||e?.strLeagueAlternate||"").trim();
      return {
        date,
        utcTime:e?.strTimestamp||((date||currentDate)+"T12:00:00Z"),
        competition:league||"Club Friendlies",
        leagueId:0,
        ha:isHome?"H":"A",
        opponent:opp,
        display:(home||teamName)+" vs "+(away||opp),
        external:true
      };
    }).filter(x=>x.date&&x.date>currentDate&&x.opponent);
  }catch(e){return []}
}
function mergeFutureRows(primary,extra){
  const out=[...(primary||[])];
  const key=x=>String(x?.date||"")+"|"+norm(x?.opponent||"");
  const seen=new Set(out.map(key));
  for(const x of extra||[]){
    const k=key(x);
    if(!seen.has(k)){seen.add(k);out.push(x)}
  }
  return out.sort((a,b)=>new Date(a?.utcTime||a?.date||0)-new Date(b?.utcTime||b?.date||0));
}
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
      getJson("/teams?id="+hh.id+"&ccode3=USA"),
      getJson("/teams?id="+ah.id+"&ccode3=USA")
    ]);
    const hid=Number(hh.id),aid=Number(ah.id),now=Date.now()-6*3600*1000;
    const cand=fixtures(ht).filter(f=>{
      const ids=[Number(f?.home?.id),Number(f?.away?.id)],ts=new Date(f?.status?.utcTime||0).getTime();
      return ids.includes(hid)&&ids.includes(aid)&&ts>=now&&!f?.status?.cancelled;
    }).sort((a,b)=>new Date(a.status.utcTime)-new Date(b.status.utcTime));
    const cur=(resolved?.fixture&&!resolved.fixture?.status?.cancelled&&new Date(resolved.fixture?.status?.utcTime||0).getTime()>=now?resolved.fixture:null)||
      cand.find(f=>Number(f?.home?.id)===hid&&Number(f?.away?.id)===aid)||cand[0];
    if(!cur)return res.status(404).json({error:"No upcoming match found."});
    const currentDate=iso(cur.status.utcTime),leagueId=Number(cur?.tournament?.leagueId||0),competition=cur?.tournament?.name||"";
    const league=leagueId?await getJson("/leagues?id="+leagueId+"&ccode3=USA"):null;
    const earlyNationsFlag=isNationsLeague(competition);
    let nationsGroupName=null;
    let table=[];
    if(earlyNationsFlag){
      ({table,nationsGroupName}=nationsStandings(league,leagueId,cur));
    }else{
      table=tableRows(league,leagueId);
    }

    function side(teamObj,teamId){
      const all=fixtures(teamObj).filter(f=>!f?.status?.cancelled).sort((a,b)=>new Date(a.status.utcTime)-new Date(b.status.utcTime));
      const ts=new Date(cur.status.utcTime).getTime();
      const past=all.filter(f=>new Date(f.status.utcTime).getTime()<ts&&f.status.finished);
      const fut=all.filter(f=>new Date(f.status.utcTime).getTime()>ts&&!f.status.finished);
      const competitionRank=table.find(x=>x.teamId===Number(teamId))?.rank??null;
      const rank=competitionRank;
      const rankSource=competitionRank!=null?competition:"Unverified";
      const nationsCurrent=isNationsLeague(competition);
      const next3=(nationsCurrent
        ? nationsFuture(fut,leagueId)
        : fut.slice(0,3)
      ).map(f=>rowFixture(f,teamId));
      const compFixtures=all.filter(f=>Number(f?.tournament?.leagueId||0)===leagueId).map(f=>rowFixture(f,teamId));
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
