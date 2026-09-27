import { normTeam, sameTeamCategory } from "lib/shared-data/team-resolver.js";
import { buildMatchContext } from "lib/shared-data/match-context-provider.js";
import { allFixtures, fetchTeamData } from "lib/shared-data/schedule-provider.js";
import { selectCurrentFixture } from "lib/shared-data/fixture-normalizer.js";
import { fixtureRow } from "lib/shared-data/fixture-normalizer.js";
import { getTeamStandings } from "lib/shared-data/standings-provider.js";
import { scoreResult, competitionForm } from "lib/formula-a/form.js";
import { dateInTimeZone, fixtureDate, knownCompetitionTimeZones } from "lib/shared-data/timezone.js";
import { parseGoals, tableFromTeam, standingRows, avgFromTable } from "lib/formula-a/standings.js";
import { classifyStyle } from "lib/formula-a/coach-style.js";
import {requireAuth} from "lib/auth.js";
import {resolveTeamPair} from "lib/team-resolver.js";
import { trackedFetch } from "lib/tracked-fetch.js";
export const access = "public";
export const methods = ["POST"];

const SPORTSDB="https://www.thesportsdb.com/api/v1/json/3";


async function getExternalJson(url){
  const r=await trackedFetch(url,{timeout_ms:8000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
  if(!r.ok) throw new Error("External team lookup HTTP "+r.status);
  return await r.json();
}
function norm(s){return normTeam(s);}

function eventTimestamp(e){
  const raw=e?.strTimestamp||((e?.dateEvent||"")+(e?.strTime?("T"+e.strTime):"T12:00:00Z"));
  const ts=new Date(raw).getTime();
  return Number.isFinite(ts)?ts:null;
}
async function supplementalFutureRows(teamName,matchTs){
  try{
    const search=await getExternalJson(SPORTSDB+"/searchteams.php?t="+encodeURIComponent(teamName));
    const teams=(Array.isArray(search?.teams)?search.teams:[]).filter(t=>sameTeamCategory(t?.strTeam,teamName));
    const target=teams.find(t=>norm(t?.strTeam)===norm(teamName))||
      teams.find(t=>norm(t?.strTeam).includes(norm(teamName))||norm(teamName).includes(norm(t?.strTeam)))||
      teams.find(t=>!/Women|Ladies|U\d+|Youth|Reserve/i.test(String(t?.strTeam||"")));
    if(!target?.idTeam)return [];
    const next=await getExternalJson(SPORTSDB+"/eventsnext.php?id="+encodeURIComponent(target.idTeam));
    const events=Array.isArray(next?.events)?next.events:[];
    return events.map(e=>{
      const ts=eventTimestamp(e);
      if(ts==null||ts<=matchTs)return null;
      const home=e?.strHomeTeam||"",away=e?.strAwayTeam||"";
      const isHome=norm(home)===norm(teamName)||norm(home)===norm(target.strTeam);
      const isAway=norm(away)===norm(teamName)||norm(away)===norm(target.strTeam);
      if(!isHome&&!isAway)return null;
      return {
        date:dateInTimeZone(e?.strTimestamp||e?.dateEvent||new Date(ts).toISOString(),e?.timeZone||e?.timezone||e?.strTimezone),
        utcTime:new Date(ts).toISOString(),
        competition:e?.strLeague||e?.strLeagueAlternate||"Club Friendlies",
        opponent:isHome?away:home,
        ha:isHome?"H":"A",
        result:"",
        fixtureId:e?.idEvent?("sportsdb-"+e.idEvent):null,
        status:"NS",
        display:home+" vs "+away,
        source:"TheSportsDB"
      };
    }).filter(Boolean);
  }catch(e){
    if(e?.code?.startsWith("FIXTURE_"))throw e;
    return [];
  }
}
function dedupeFutureRows(rows){
  const out=[];
  for(const x of rows.sort((a,b)=>new Date(a.utcTime||a.date)-new Date(b.utcTime||b.date))){
    const dup=out.find(y=>{
      if(y.date!==x.date)return false;
      const a=norm(y.opponent),b=norm(x.opponent);
      return a===b||(a.length>=5&&b.length>=5&&(a.includes(b)||b.includes(a)));
    });
    if(!dup)out.push(x);
    else if(dup.source==="TheSportsDB"&&x.source!=="TheSportsDB"){
      const i=out.indexOf(dup);out[i]=x;
    }
  }
  return out;
}
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  try{
    const body=req.body||{};
    const homeInput=String(body.home||"").trim();
    const awayInput=String(body.away||"").trim();
    if(!homeInput||!awayInput) return res.status(400).json({error:"Only Home and Away team names are required."});

    const resolved=await resolveTeamPair(homeInput,awayInput);
    const hHit=resolved?.home, aHit=resolved?.away;
    if(!hHit?.id||!aHit?.id){
      return res.status(404).json({
        error:"Could not identify one or both teams.",
        recognition:{homeInput,awayInput,reason:resolved?.reason||"unresolved",candidates:resolved?.candidates||null}
      });
    }

    const [hTeam,aTeam]=await Promise.all([
      fetchTeamData(hHit.id),
      fetchTeamData(aHit.id)
    ]);

    const hid=Number(hHit.id),aid=Number(aHit.id);
    const now=Date.now()-6*3600*1000;
    const current=selectCurrentFixture(allFixtures(hTeam),resolved?.fixture,hid,aid,now);
    if(!current)return res.status(404).json({error:"No upcoming scheduled match between these two teams was found."});

    const actualHomeId=Number(current.home.id),actualAwayId=Number(current.away.id);
    const homeObj=actualHomeId===hid?hTeam:aTeam;
    const awayObj=actualAwayId===aid?aTeam:hTeam;
    const matchTs=new Date(current.status.utcTime).getTime();
    const currentLeagueId=Number(current?.tournament?.leagueId||0);
    const sharedContext=buildMatchContext({fixture:current,homeTeam:homeObj,awayTeam:awayObj,fields:[]});
    const competitionTimeZones=sharedContext.competitionTimeZones;

    async function side(teamObj,teamId,teamName){
      const {past,future}=Number(teamId)===actualHomeId?sharedContext.schedule.home:sharedContext.schedule.away;
      const recent4=past.slice(-4);
      const previous=recent4.slice(-3).map(f=>fixtureRow(f,teamId,competitionTimeZones));
      const fotmobFuture=future.map(f=>({...fixtureRow(f,teamId,competitionTimeZones),utcTime:f?.status?.utcTime||"",source:"FotMob"}));
      const supplemental=await supplementalFutureRows(teamName,matchTs);
      const mergedFuture=dedupeFutureRows([...fotmobFuture,...supplemental]);
      const next=mergedFuture.slice(0,2);
      const form=competitionForm(past,currentLeagueId,teamId);
      const table=getTeamStandings(teamObj,currentLeagueId);
      const avg=avgFromTable(table,teamId);
      return {
        teamId,previous,next,previousGapBaseDate:recent4.length>3?fixtureDate(recent4[0],competitionTimeZones):"",
        ranking:standingRows(table,teamId),
        averages:{gf:avg.gf,ga:avg.ga},
        form,
        coachStyle:avg.raw?classifyStyle(avg.raw.gf,avg.raw.ga,avg.raw.played):"",
        scheduleSources:[...new Set(next.map(x=>x.source||"FotMob"))]
      };
    }

    const [homeData,awayData]=await Promise.all([
      side(homeObj,actualHomeId,current.home.name),
      side(awayObj,actualAwayId,current.away.name)
    ]);
    const checks={
      exactMatch:true,
      previous3Home:homeData.previous.length===3,
      previous3Away:awayData.previous.length===3,
      next2Home:homeData.next.length===2,
      next2Away:awayData.next.length===2,
      standingsHome:homeData.ranking.some(x=>x.focus),
      standingsAway:awayData.ranking.some(x=>x.focus),
      averagesHome:!!homeData.averages.gf,
      averagesAway:!!awayData.averages.gf
    };

    res.json({
      source:"FotMob",
      recognition:{
        home:{input:homeInput,matched:hHit.name,teamId:hHit.id},
        away:{input:awayInput,matched:aHit.name,teamId:aHit.id},
        confidence:resolved?.confidence||0,
        method:resolved?.reason||"name-only"
      },
      match:{
        fixtureId:current.id,
        date:fixtureDate(current,competitionTimeZones),
        competition:current?.tournament?.name||"",
        leagueId:currentLeagueId,
        season:homeObj?.details?.latestSeason||"",
        home:current.home.name,
        away:current.away.name,
        kickoff:current.status.utcTime
      },
      home:{name:current.home.name,...homeData},
      away:{name:current.away.name,...awayData},
      checks,
      complete:Object.values(checks).every(Boolean),
      warnings:[
        homeData.previous.length<3||awayData.previous.length<3?"One team has fewer than 3 prior first-team matches available.":null,
        homeData.next.length<2||awayData.next.length<2?"One team has fewer than 2 scheduled future matches available.":null
      ].filter(Boolean)
    });
  }catch(err){
    if(err?.code?.startsWith("FIXTURE_")||err?.code?.startsWith("STANDINGS_"))
      return res.status(422).json({error:err.message,code:err.code});
    console.error("formula-a FotMob lookup failed",String(err?.stack||err));
    res.status(502).json({error:"Automatic football data lookup failed.",detail:String(err?.message||err)});
  }
}
