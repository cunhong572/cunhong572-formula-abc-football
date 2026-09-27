import {requireAuth} from "lib/auth.js";
import { trackedFetch } from "lib/tracked-fetch.js";
export const access="public";
export const methods=["GET"];

const BASE="https://www.fotmob.com/api/data";
let boardCache={ts:0,value:null};

// Formula D Live Board scope:
// senior men's FIRST-TEAM matches only, and only in:
// EPL, La Liga, Serie A, Bundesliga, Ligue 1, UCL, UEL, UECL,
// plus UEFA Nations League senior men's national-team matches.
const NON_FIRST_TEAM=[
  /women|woman|female|ladies|femeni|femmin|femenin|damallsvenskan/i,
  /u\s?[-]?\s?(?:17|18|19|20|21|23)|under\s?(?:17|18|19|20|21|23)/i,
  /youth|academy|junior|reserve|reserves|development|premier league 2/i
];
function leagueCode(l){
  return String(l?.ccode||l?.countryCode||l?.country?.code||"").toUpperCase();
}
function isTargetLeague(l){
  const name=String(l?.name||"").trim();
  const code=leagueCode(l);
  if(/^(UEFA )?Champions League$/i.test(name))return true;
  if(/^(UEFA )?Europa League$/i.test(name))return true;
  if(/^(UEFA )?(Europa )?Conference League$/i.test(name))return true;
  if(/UEFA\s+Nations\s+League/i.test(name))return true;
  if(/^Premier League$/i.test(name))return !code||["ENG","GBR"].includes(code);
  if(/^(LaLiga|La Liga)( EA Sports)?$/i.test(name))return !code||code==="ESP";
  if(/^Serie A$/i.test(name))return !code||code==="ITA";
  if(/^Bundesliga$/i.test(name))return !code||["GER","DEU"].includes(code);
  if(/^Ligue 1( McDonald'?s)?$/i.test(name))return !code||code==="FRA";
  return false;
}
function isSeniorFirstTeamMatch(m){
  const names=[m?.home?.name,m?.away?.name].map(x=>String(x||""));
  return !names.some(s=>
    /\b(?:women|ladies|u\s?[-]?\s?(?:17|18|19|20|21|23)|reserves?|reserve|academy|youth)\b/i.test(s) ||
    /\b(?:ii|iii|b)\b$/i.test(s)
  );
}

async function getJson(path){
  const r=await trackedFetch(BASE+path,{timeout_ms:12000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
  if(!r.ok)throw new Error("Live provider HTTP "+r.status);
  return await r.json();
}
function etDate(){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const get=t=>parts.find(x=>x.type===t)?.value||"";
  return get("year")+get("month")+get("day");
}
function liveMinute(m){
  const vals=[m?.status?.liveTime?.short,m?.status?.liveTime?.long,m?.status?.reason?.short,m?.status?.reason?.long];
  for(const v of vals){const mm=String(v||"").match(/(\d{1,3})/);if(mm)return Number(mm[1]);}
  return null;
}
function score(m){
  const s=String(m?.status?.scoreStr||"");
  const mm=s.match(/(\d+)\s*-\s*(\d+)/);
  if(mm)return [Number(mm[1]),Number(mm[2])];
  return [Number(m?.home?.score)||0,Number(m?.away?.score)||0];
}
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  try{
    if(boardCache.value&&Date.now()-boardCache.ts<2000)return res.json(boardCache.value);
    const d=await getJson("/matches?date="+etDate()+"&ccode3=USA");
    const rows=[];
    for(const l of Array.isArray(d?.leagues)?d.leagues:[]){
      const league=l?.name||"";
      if(!isTargetLeague(l))continue;
      for(const m of Array.isArray(l?.matches)?l.matches:[]){
        if(!isSeniorFirstTeamMatch(m))continue;
        const started=!!m?.status?.started;
        const finished=!!m?.status?.finished;
        const [hg,ag]=score(m);
        rows.push({
          matchId:m?.id,
          competition:league,
          home:m?.home?.name||"",
          away:m?.away?.name||"",
          homeGoals:hg,awayGoals:ag,
          started,finished,
          minute:started&&!finished?liveMinute(m):null,
          utcTime:m?.status?.utcTime||m?.time||null
        });
      }
    }
    const live=rows.filter(x=>x.started&&!x.finished);
    const value={dateET:etDate(),live,total:rows.length,liveCount:live.length,provider:"FotMob"};
    boardCache={ts:Date.now(),value};
    res.json(value);
  }catch(e){
    console.error("live-board-today",String(e?.stack||e));
    res.status(502).json({error:"Today match list lookup failed.",detail:String(e?.message||e)});
  }
}