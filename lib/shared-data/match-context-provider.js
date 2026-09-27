import { resolveCompetition } from "lib/shared-data/competition-resolver.js";
import { kickoffContext, knownCompetitionTimeZones } from "lib/shared-data/timezone.js";
import { allFixtures, partitionSchedule } from "lib/shared-data/schedule-provider.js";
import { getStandings } from "lib/shared-data/standings-provider.js";
import { fixtureStrength } from "lib/shared-data/strength-provider.js";
import { createCache, invalidateMatchData, SCHEDULE_TTL_MS } from "lib/shared-data/cache.js";
import { daysBetween } from "lib/formula-a/fatigue-days.js";
import { trackedFetch } from "lib/tracked-fetch.js";
export function buildMatchContext({fixture,homeTeam,awayTeam,standingsPayload=null,qualification=null,fields=['standings','strength','fatigue']}={}){
  const resolved=resolveCompetition(fixture),diagnostics=resolved.diagnostic?[resolved.diagnostic]:[];
  const zones=knownCompetitionTimeZones([...allFixtures(homeTeam),...allFixtures(awayTeam),fixture]);
  const kickoff=kickoffContext(fixture,zones);
  if(kickoff.diagnostic)diagnostics.push(kickoff.diagnostic);
  const schedule={home:partitionSchedule(homeTeam,fixture?.status?.utcTime),away:partitionSchedule(awayTeam,fixture?.status?.utcTime)};
  const leagueId=resolved.competition?.id;
  let standings=null;
  if(fields.includes('standings')){
    const options={leagueId,competitionName:resolved.competition?.name||'',fixture};
    standings=standingsPayload?{competition:getStandings(standingsPayload,options)}:{home:getStandings(homeTeam,{...options,sourceKind:'team'}),away:getStandings(awayTeam,{...options,sourceKind:'team'})};
    for(const value of Object.values(standings))if(value.diagnostic)diagnostics.push(value.diagnostic);
  }
  const fatigueFor=part=>{
    const last=part.past.at(-1),previous=part.past.at(-2);
    const lastDate=last?kickoffContext(last,zones).date:null,previousDate=previous?kickoffContext(previous,zones).date:null;
    return {lastKickoff:last?.status?.utcTime||null,previousKickoff:previous?.status?.utcTime||null,
      daysSincePrevious:lastDate&&kickoff.date?daysBetween(lastDate,kickoff.date):null,
      previousGapDays:previousDate&&lastDate?daysBetween(previousDate,lastDate):null};
  };
  return {competition:resolved.competition,home:fixture?.home||null,away:fixture?.away||null,kickoff,standings,schedule,
    strength:fields.includes('strength')?fixtureStrength(fixture):null,
    fatigue:fields.includes('fatigue')?{home:fatigueFor(schedule.home),away:fatigueFor(schedule.away)}:null,
    qualification:qualification||{verified:false,diagnostic:'QUALIFICATION_CONTEXT_NOT_PROVIDED'},competitionTimeZones:zones,diagnostics};
}
const preMatchCache=createCache();
export async function fetchPreMatchContext(req,home,away,{forceRefresh=false}={}){
  const h=req?.headers||{},cookie=h.cookie||h.Cookie||'',authorization=(typeof h.get==='function'?h.get('authorization'):h.authorization)||'';
  // Authentication is scoped in memory only; never persist or log this key.
  const key=JSON.stringify([home,away,cookie,authorization]);
  try{return await preMatchCache.get(key,async()=>{
    const r=await trackedFetch('https://formula-a-football.hatchable.site/api/formula-c',{method:'POST',timeout_ms:12000,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(authorization?{authorization}:{})},body:JSON.stringify({home,away})});
    if(!r.ok)throw Error('Prematch context unavailable');
    const j=await r.json();return {competition:j?.match?.competition||'',homeIntent:j?.home?.intent||'',awayIntent:j?.away?.intent||'',homeTier:j?.home?.tier??null,awayTier:j?.away?.tier??null,homeRank:j?.home?.rank??null,awayRank:j?.away?.rank??null,source:'Formula C'};
  },{ttlMs:SCHEDULE_TTL_MS,forceRefresh});}catch(_){return null;}
}
export function refreshAfterFinishedMatch(teamIds,leagueId){invalidateMatchData(teamIds,leagueId);preMatchCache.invalidate();}
