import {requireAuth} from "lib/auth.js";
import {resolveTeamPair} from "lib/team-resolver.js";
import { trackedFetch } from "lib/tracked-fetch.js";
export const access = "public";
export const methods = ["POST"];

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
function isoDate(v){return String(v||"").slice(0,10)}

const TEAM_ALIASES={
  "atlmadrid":"Atletico Madrid","atleticomadrid":"Atletico Madrid","athleticomadrid":"Atletico Madrid",
  "realmadridcf":"Real Madrid","realmadrid":"Real Madrid","barca":"Barcelona","fcbarcelona":"Barcelona",
  "manutd":"Manchester United","manunited":"Manchester United","manchesterutd":"Manchester United",
  "mancity":"Manchester City","manchestercityfc":"Manchester City",
  "spurs":"Tottenham Hotspur","tottenham":"Tottenham Hotspur","tottenhamhotspur":"Tottenham Hotspur",
  "newcastle":"Newcastle United","newcastleutd":"Newcastle United",
  "westham":"West Ham United","westhamutd":"West Ham United",
  "wolves":"Wolverhampton Wanderers","wolverhampton":"Wolverhampton Wanderers",
  "nottmforest":"Nottingham Forest","nottingham":"Nottingham Forest",
  "psg":"Paris Saint-Germain","parissg":"Paris Saint-Germain","parissaintgermain":"Paris Saint-Germain",
  "om":"Marseille","ol":"Lyon","lyon":"Olympique Lyonnais","marseille":"Olympique Marseille",
  "bayern":"Bayern Munich","bayernmunchen":"Bayern Munich","bayernmunich":"Bayern Munich",
  "dortmund":"Borussia Dortmund","bvb":"Borussia Dortmund",
  "leverkusen":"Bayer Leverkusen","bayer04":"Bayer Leverkusen","bayer04leverkusen":"Bayer Leverkusen",
  "gladbach":"Borussia Mönchengladbach","monchengladbach":"Borussia Mönchengladbach",
  "koln":"FC Köln","cologne":"FC Köln","fckoln":"FC Köln",
  "inter":"Inter","intermilan":"Inter","internazionale":"Inter",
  "acmilan":"AC Milan","milan":"AC Milan","juve":"Juventus",
  "roma":"Roma","asroma":"Roma","napoli":"Napoli",
  "sporting":"Sporting CP","sportinglisbon":"Sporting CP",
  "benfica":"Benfica","fcporto":"Porto","porto":"Porto",
  "psv":"PSV Eindhoven","psveindhoven":"PSV Eindhoven",
  "shakhtar":"Shakhtar Donetsk","shakhtardonetsk":"Shakhtar Donetsk",
  "fener":"Fenerbahce","fenerbahce":"Fenerbahce","galatasaray":"Galatasaray",
  "slaviaprague":"Slavia Prague","slaviapraha":"Slavia Prague",
  "bodoglimt":"Bodø/Glimt","bodoglimt":"Bodø/Glimt"
};
function canonicalTeamInput(name){
  const key=norm(name);
  return TEAM_ALIASES[key]||String(name||"").trim();
}
function isSeniorTeamSuggestion(x){
  const s=String(x?.name||"");
  return x?.type==="team"&&!/\b(?:women|ladies|u\s?[-]?\s?(?:17|18|19|20|21|23)|reserves?|academy|youth)\b/i.test(s);
}
function teamSearch(list,name){
  const n=norm(name);
  const suggestions=(Array.isArray(list)?list:[]).flatMap(x=>x.suggestions||[]).filter(isSeniorTeamSuggestion);
  const exact=suggestions.find(x=>norm(x.name)===n);
  if(exact)return exact;
  const contains=suggestions.find(x=>{
    const xn=norm(x.name);
    return n.length>=5&&(xn.includes(n)||n.includes(xn));
  });
  return contains||null;
}
async function fotmobResolve(name){
  const canonical=canonicalTeamInput(name);
  const queries=[canonical];
  if(norm(canonical)!==norm(name))queries.push(name);
  for(const q of queries){
    try{
      const data=await getJson("/search/suggest?hits=20&lang=en&term="+encodeURIComponent(q));
      const hit=teamSearch(data,q)||teamSearch(data,canonical);
      if(hit?.id)return {hit,canonical,source:norm(canonical)===norm(name)?"FotMob":"Alias + FotMob"};
    }catch(e){}
  }
  return null;
}
async function sportsDbFallback(name){
  try{
    const canonical=canonicalTeamInput(name);
    const d=await getExternalJson(SPORTSDB+"/searchteams.php?t="+encodeURIComponent(canonical));
    const teams=Array.isArray(d?.teams)?d.teams:[];
    const senior=teams.find(t=>!/Women|Ladies|U\d+|Youth|Reserve/i.test(String(t?.strTeam||"")))||teams[0];
    const candidate=senior?.strTeam||senior?.strTeamAlternate?.split(",")?.[0]?.trim();
    if(!candidate)return null;
    const data=await getJson("/search/suggest?hits=20&lang=en&term="+encodeURIComponent(candidate));
    const hit=teamSearch(data,candidate);
    return hit?.id?{hit,canonical:candidate,source:"TheSportsDB + FotMob"}:null;
  }catch(e){return null;}
}
async function resolveTeam(name){
  return await fotmobResolve(name)||await sportsDbFallback(name);
}
function scoreResult(f,teamId){
  const hs=Number(f?.home?.score), as=Number(f?.away?.score);
  if(!Number.isFinite(hs)||!Number.isFinite(as))return "";
  const isHome=Number(f?.home?.id)===Number(teamId);
  const gf=isHome?hs:as, ga=isHome?as:hs;
  return gf>ga?"W":gf<ga?"L":"D";
}
function fixtureRow(f,teamId){
  const h=f?.home?.name||"", a=f?.away?.name||"";
  const done=!!f?.status?.finished && !f?.status?.cancelled;
  const score=done && f?.status?.scoreStr ? f.status.scoreStr.replace(/\s+/g,"") : "";
  return {
    date:isoDate(f?.status?.utcTime),
    competition:f?.tournament?.name||"",
    opponent:Number(f?.home?.id)===Number(teamId)?a:h,
    ha:Number(f?.home?.id)===Number(teamId)?"H":"A",
    result:done?scoreResult(f,teamId):"",
    fixtureId:f?.id||null,
    status:done?"FT":"NS",
    display:done&&score?(h+" "+score+" "+a):(h+"-"+a)
  };
}
function parseGoals(scoresStr){
  const m=String(scoresStr||"").match(/(\d+)\s*-\s*(\d+)/);
  return m?{gf:Number(m[1]),ga:Number(m[2])}:{gf:0,ga:0};
}
function classifyStyle(gf,ga,played){
  if(!played)return "";
  const gfp=gf/played,gap=ga/played;
  if(gfp>=1.85 || (gfp>=1.55&&gfp-gap>=0.55)) return "进攻";
  if(gfp>=1.35 || (gfp-gap>=0.20&&gfp>=1.15)) return "微攻";
  if(gap<=1.00&&gfp<1.35) return "防守";
  return "微守";
}
function tableFromTeam(t){
  return t?.table?.[0]?.data?.table?.all||[];
}
function allFixtures(t){
  return t?.fixtures?.allFixtures?.fixtures||[];
}
function eventTimestamp(e){
  const raw=e?.strTimestamp||((e?.dateEvent||"")+(e?.strTime?("T"+e.strTime):"T12:00:00Z"));
  const ts=new Date(raw).getTime();
  return Number.isFinite(ts)?ts:null;
}
async function supplementalFutureRows(teamName,matchTs){
  try{
    const search=await getExternalJson(SPORTSDB+"/searchteams.php?t="+encodeURIComponent(teamName));
    const teams=Array.isArray(search?.teams)?search.teams:[];
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
        date:isoDate(e?.dateEvent||new Date(ts).toISOString()),
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
function standingRows(table,teamId){
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
function avgFromTable(table,teamId){
  const x=table.find(r=>Number(r.id)===Number(teamId));
  if(!x||!x.played)return {gf:"",ga:"",raw:null};
  const g=parseGoals(x.scoresStr);
  return {gf:(g.gf/Number(x.played)).toFixed(2),ga:(g.ga/Number(x.played)).toFixed(2),raw:{...g,played:Number(x.played)}};
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
      getJson("/teams?id="+encodeURIComponent(hHit.id)+"&ccode3=USA"),
      getJson("/teams?id="+encodeURIComponent(aHit.id)+"&ccode3=USA")
    ]);

    const hid=Number(hHit.id),aid=Number(aHit.id);
    const now=Date.now()-6*3600*1000;
    const candidates=allFixtures(hTeam).filter(f=>{
      const ids=[Number(f?.home?.id),Number(f?.away?.id)];
      const ts=new Date(f?.status?.utcTime||0).getTime();
      return ids.includes(hid)&&ids.includes(aid)&&ts>=now&&!f?.status?.cancelled;
    }).sort((x,y)=>new Date(x.status.utcTime)-new Date(y.status.utcTime));
    let current=(resolved?.fixture&&!resolved.fixture?.status?.cancelled&&new Date(resolved.fixture?.status?.utcTime||0).getTime()>=now?resolved.fixture:null)||
      candidates.find(f=>Number(f?.home?.id)===hid&&Number(f?.away?.id)===aid)||candidates[0]||null;
    if(!current)return res.status(404).json({error:"No upcoming scheduled match between these two teams was found."});

    const actualHomeId=Number(current.home.id),actualAwayId=Number(current.away.id);
    const homeObj=actualHomeId===hid?hTeam:aTeam;
    const awayObj=actualAwayId===aid?aTeam:hTeam;
    const matchTs=new Date(current.status.utcTime).getTime();
    const currentLeagueId=Number(current?.tournament?.leagueId||0);

    async function side(teamObj,teamId,teamName){
      const fixtures=allFixtures(teamObj).filter(f=>!f?.status?.cancelled).sort((x,y)=>new Date(x.status.utcTime)-new Date(y.status.utcTime));
      const past=fixtures.filter(f=>new Date(f.status.utcTime).getTime()<matchTs&&f.status.finished);
      const future=fixtures.filter(f=>new Date(f.status.utcTime).getTime()>matchTs&&!f.status.finished);
      const recent4=past.slice(-4);
      const previous=recent4.slice(-3).map(f=>fixtureRow(f,teamId));
      const fotmobFuture=future.map(f=>({...fixtureRow(f,teamId),utcTime:f?.status?.utcTime||"",source:"FotMob"}));
      const supplemental=await supplementalFutureRows(teamName,matchTs);
      const mergedFuture=dedupeFutureRows([...fotmobFuture,...supplemental]);
      const next=mergedFuture.slice(0,2);
      const form=past.filter(f=>Number(f?.tournament?.leagueId||0)===currentLeagueId).slice(-5).map(f=>scoreResult(f,teamId)).filter(Boolean);
      const table=tableFromTeam(teamObj);
      const avg=avgFromTable(table,teamId);
      return {
        teamId,previous,next,previousGapBaseDate:recent4.length>3?isoDate(recent4[0].status.utcTime):"",
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
        date:isoDate(current.status.utcTime),
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
    console.error("formula-a FotMob lookup failed",String(err?.stack||err));
    res.status(502).json({error:"Automatic football data lookup failed.",detail:String(err?.message||err)});
  }
}