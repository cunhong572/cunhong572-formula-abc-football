import {requireAuth} from "lib/auth.js";
import {evaluateLiveIntent,computeGTI,FORMULA_D_INTENTS} from "lib/formula-d-engine.js";
import {saveFormulaDSnapshot} from "lib/formula-d-learning.js";
import {refreshTeamRoster,getPlayerKnowledge,enrichPlayer,getDirectPlayerKnowledge,substitutionImpact} from "lib/player-intelligence.js";
import {getFormulaDWeights} from "lib/formula-d-config.js";
import { trackedFetch } from "lib/tracked-fetch.js";
export const access="public";
export const methods=["POST"];

const BASE="https://www.fotmob.com/api/data";
const SELF="https://formula-a-football.hatchable.site";
const preMatchCache=new Map();
const rosterTouchCache=new Map();
const liveResultCache=new Map();
async function getJson(path){
  const r=await trackedFetch(BASE+path,{timeout_ms:12000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
  if(!r.ok)throw new Error("Live provider HTTP "+r.status);
  return await r.json();
}
async function getPreMatchContext(req,home,away){
  const key=norm(home)+"|"+norm(away);
  const hit=preMatchCache.get(key);
  if(hit&&Date.now()-hit.ts<10*60*1000)return hit.value;
  try{
    const h=req?.headers||{};
    const cookie=h.cookie||h.Cookie||"";
    const authorization=(typeof h.get==="function"?h.get("authorization"):h.authorization)||"";
    const r=await trackedFetch(SELF+"/api/formula-c",{
      method:"POST",
      timeout_ms:12000,
      headers:{
        "content-type":"application/json",
        ...(cookie?{cookie}:{}),
        ...(authorization?{authorization}:{})
      },
      body:JSON.stringify({home,away})
    });
    if(!r.ok){
      preMatchCache.set(key,{ts:Date.now(),value:null});
      return null;
    }
    const j=await r.json();
    const value={
      competition:j?.match?.competition||"",
      homeIntent:j?.home?.intent||"",
      awayIntent:j?.away?.intent||"",
      homeTier:j?.home?.tier??null,
      awayTier:j?.away?.tier??null,
      homeRank:j?.home?.rank??null,
      awayRank:j?.away?.rank??null,
      source:"Formula C"
    };
    preMatchCache.set(key,{ts:Date.now(),value});
    return value;
  }catch(e){return null;}
}
function norm(s){return String(s||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g,"")}
function teamMatch(a,b){
  const x=norm(a),y=norm(b);
  return x===y||x.includes(y)||y.includes(x);
}
function localDateParts(offsetDays=0){
  const now=new Date(Date.now()+offsetDays*86400000);
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const get=t=>parts.find(x=>x.type===t)?.value||"";
  return get("year")+get("month")+get("day");
}
function flattenMatches(d){
  const leagues=Array.isArray(d?.leagues)?d.leagues:[];
  return leagues.flatMap(l=>(l.matches||[]).map(m=>({...m,_league:l.name||m?.tournament?.name||""})));
}
function scorePair(m,detail){
  const s=detail?.header?.status?.scoreStr||m?.status?.scoreStr||"";
  const mm=String(s).match(/(\d+)\s*-\s*(\d+)/);
  if(mm)return [Number(mm[1]),Number(mm[2])];
  const hs=Number(m?.home?.score),as=Number(m?.away?.score);
  return [Number.isFinite(hs)?hs:0,Number.isFinite(as)?as:0];
}
function parseMinute(detail,m){
  const candidates=[
    detail?.header?.status?.liveTime?.short,
    detail?.header?.status?.liveTime?.long,
    detail?.header?.status?.reason?.short,
    detail?.header?.status?.reason?.long,
    m?.status?.liveTime?.short,
    m?.status?.liveTime?.long
  ];
  for(const v of candidates){
    const mm=String(v||"").match(/(\d{1,3})/);
    if(mm)return Math.min(130,Number(mm[1]));
  }
  const start=detail?.general?.matchTimeUTC||m?.status?.utcTime;
  if(start){
    const elapsed=Math.floor((Date.now()-new Date(start).getTime())/60000);
    if(elapsed>=0&&elapsed<=130)return Math.max(1,elapsed);
  }
  return 1;
}
function statPairs(detail){
  const all=detail?.content?.stats?.Periods?.All?.stats||detail?.content?.stats?.periods?.all?.stats||[];
  const out={};
  for(const group of Array.isArray(all)?all:[]){
    for(const s of Array.isArray(group?.stats)?group.stats:[]){
      const title=String(s?.title||"").trim().toLowerCase();
      const vals=Array.isArray(s?.stats)?s.stats:[];
      if(vals.length>=2)out[title]=vals;
    }
  }
  return out;
}
function val(stats,names,idx){
  for(const n of names){
    const k=Object.keys(stats).find(x=>x===n||x.includes(n));
    if(k){
      const raw=stats[k]?.[idx];
      const m=String(raw??"").replace("%","").match(/-?\d+(\.\d+)?/);
      if(m)return Number(m[0]);
    }
  }
  return null;
}
function shotData(detail,homeId,awayId,minute){
  const shots=detail?.content?.shotmap?.shots||[];
  const recent5Start=Math.max(0,minute-5);
  const prev5Start=Math.max(0,minute-10);
  const recent10Start=Math.max(0,minute-10);
  const prev10Start=Math.max(0,minute-20);
  const make=id=>{
    const teamShots=(Array.isArray(shots)?shots:[]).filter(s=>Number(s?.teamId)===Number(id));
    const withMinute=teamShots.map(s=>({
      ...s,
      _m:Number(s?.min??s?.minute??String(s?.timeStr||"").match(/\d+/)?.[0])
    })).filter(s=>Number.isFinite(s._m));
    const recent5=withMinute.filter(s=>s._m>=recent5Start&&s._m<=minute+1);
    const previous5=withMinute.filter(s=>s._m>=prev5Start&&s._m<recent5Start);
    const recent10=withMinute.filter(s=>s._m>=recent10Start&&s._m<=minute+1);
    const previous10=withMinute.filter(s=>s._m>=prev10Start&&s._m<recent10Start);
    return {
      totalXg:teamShots.reduce((z,s)=>z+num(s?.expectedGoals),0),
      recent5Shots:recent5.length,
      recent5Xg:recent5.reduce((z,s)=>z+num(s?.expectedGoals),0),
      previous5Shots:previous5.length,
      previous5Xg:previous5.reduce((z,s)=>z+num(s?.expectedGoals),0),
      recent10Shots:recent10.length,
      recent10Xg:recent10.reduce((z,s)=>z+num(s?.expectedGoals),0),
      previous10Shots:previous10.length,
      previous10Xg:previous10.reduce((z,s)=>z+num(s?.expectedGoals),0)
    };
  };
  return {home:make(homeId),away:make(awayId)};
}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function eventArray(detail){
  const out=[];
  const push=a=>{if(Array.isArray(a))for(const x of a)out.push(x)};
  push(detail?.header?.events);
  push(detail?.content?.matchFacts?.events?.events);
  push(detail?.content?.matchFacts?.events);
  push(detail?.content?.liveticker?.events);
  push(detail?.content?.liveTicker?.events);
  return out;
}
function positionInfo(p){
  const raw=String(p?.position?.short||p?.position?.name||p?.position||p?.role||p?.positionId||"").toUpperCase().trim();
  if(!raw)return {code:"?",group:"Unknown"};
  if(/GK|GOAL/.test(raw))return {code:raw,group:"Goalkeeper"};
  if(/CB|LB|RB|LWB|RWB|DF|DEF|BACK/.test(raw))return {code:raw,group:"Defensive"};
  if(/DM|CDM|CM|MF|MID/.test(raw))return {code:raw,group:"Midfield"};
  if(/AM|CAM|LW|RW|LM|RM|FW|FWD|ST|CF|ATT|WING/.test(raw))return {code:raw,group:"Attacking"};
  return {code:raw,group:"Unknown"};
}
function playerName(p){
  return p?.name||p?.playerName||p?.player?.name||p?.localizedName||p?.shortName||"Unknown player";
}
function playerKey(p){
  return String(p?.id||p?.playerId||p?.player?.id||playerName(p));
}
function parseSubMinute(v){
  const m=Number(String(v??"").match(/\d+/)?.[0]);
  return Number.isFinite(m)?m:null;
}
function classifySub(on,off){
  const og=on?.positionGroup||"Unknown", fg=off?.positionGroup||"Unknown";
  if(og==="Attacking"&&(fg==="Defensive"||fg==="Midfield"||fg==="Goalkeeper"))return "Attacking Sub";
  if((og==="Defensive"||og==="Goalkeeper")&&(fg==="Attacking"||fg==="Midfield"))return "Defensive Sub";
  if(og==="Attacking"&&fg==="Attacking")return "Attacking-for-Attacking";
  if(og==="Defensive"&&fg==="Defensive")return "Defensive-for-Defensive";
  if(og==="Midfield"&&fg==="Midfield")return "Midfield-for-Midfield";
  if(og!=="Unknown"&&fg!=="Unknown")return "Balanced/Role Change";
  return "Type unknown";
}
function lineupPlayerMap(detail,teamIndex,teamId){
  const lineup=detail?.content?.lineup||{};
  const m=new Map(),seenNodes=new Set();
  const add=(p)=>{
    if(!p||typeof p!=="object")return;
    const name=playerName(p),pk=playerKey(p),pos=positionInfo(p);
    if(!name||name==="Unknown player")return;
    const value={player:name,playerId:pk,position:pos.code,positionGroup:pos.group};
    if(pk)m.set("id:"+String(pk),value);
    m.set("name:"+norm(name),value);
  };
  const scan=(node,depth=0)=>{
    if(!node||depth>7)return;
    if(Array.isArray(node)){node.forEach(x=>scan(x,depth+1));return;}
    if(typeof node!=="object"||seenNodes.has(node))return;
    seenNodes.add(node);add(node);Object.values(node).forEach(v=>scan(v,depth+1));
  };
  const lineups=Array.isArray(lineup?.lineups)?lineup.lineups:[];
  const byTeam=lineups.find(x=>Number(x?.teamId)===Number(teamId))||lineups[teamIndex]||null;
  [
    byTeam,
    lineup?.bench?.benchArr?.[teamIndex],lineup?.bench?.[teamIndex],lineup?.lineup?.[teamIndex],
    lineup?.teams?.[teamIndex],lineup?.homeTeam&&teamIndex===0?lineup.homeTeam:null,
    lineup?.awayTeam&&teamIndex===1?lineup.awayTeam:null
  ].forEach(x=>scan(x));
  return m;
}
function applyLineupKnowledge(p,map){
  if(!p)return null;
  const hit=map.get("id:"+String(p.playerId||p.id||""))||map.get("name:"+norm(p.player||p.name));
  if(!hit)return p;
  return {...p,
    playerId:hit.playerId||p.playerId,
    player:hit.player||p.player,
    position:(p.position&&p.position!=="?")?p.position:hit.position,
    positionGroup:(p.positionGroup&&p.positionGroup!=="Unknown")?p.positionGroup:hit.positionGroup,
    intelligenceSource:p.intelligenceSource||"Current match lineup"
  };
}
function lineupSubs(detail,teamIndex,teamId){
  const lineup=detail?.content?.lineup||{};
  const ons=[],offs=[],seenNodes=new Set();
  const capture=(p)=>{
    if(!p||typeof p!=="object")return;
    const pk=playerKey(p), name=playerName(p), pos=positionInfo(p);
    const onMin=parseSubMinute(p.timeSubbedOn??p.subbedOn??p.substitutionTime??p.minuteSubbedOn);
    const offMin=parseSubMinute(p.timeSubbedOff??p.subbedOff??p.minuteSubbedOff);
    if(onMin!==null)ons.push({minute:onMin,player:name,playerId:pk,position:pos.code,positionGroup:pos.group});
    if(offMin!==null)offs.push({minute:offMin,player:name,playerId:pk,position:pos.code,positionGroup:pos.group});
  };
  const scan=(node,depth=0)=>{
    if(!node||depth>7)return;
    if(Array.isArray(node)){node.forEach(x=>scan(x,depth+1));return;}
    if(typeof node!=="object")return;
    if(seenNodes.has(node))return;seenNodes.add(node);
    capture(node);
    Object.values(node).forEach(v=>scan(v,depth+1));
  };
  const lineups=Array.isArray(lineup?.lineups)?lineup.lineups:[];
  const byTeam=lineups.find(x=>Number(x?.teamId)===Number(teamId))||lineups[teamIndex]||null;
  const candidates=[
    byTeam,
    lineup?.bench?.benchArr?.[teamIndex],lineup?.bench?.[teamIndex],lineup?.lineup?.[teamIndex],
    lineup?.teams?.[teamIndex],lineup?.homeTeam&&teamIndex===0?lineup.homeTeam:null,
    lineup?.awayTeam&&teamIndex===1?lineup.awayTeam:null
  ];
  candidates.forEach(x=>scan(x));
  const minutes=[...new Set(ons.map(x=>x.minute))].sort((a,b)=>a-b);
  const paired=[];
  for(const minute of minutes){
    const inList=ons.filter(x=>x.minute===minute),outList=offs.filter(x=>x.minute===minute);
    const n=Math.max(inList.length,outList.length);
    for(let i=0;i<n;i++){
      const on=inList[i]||null,off=outList[i]||null;
      paired.push({minute,on,off,type:classifySub(on,off)});
    }
  }
  return paired;
}
function eventCounts(detail,teamId,teamIndex){
  const ev=eventArray(detail).filter(e=>{
    if(Number(e?.teamId)===Number(teamId))return true;
    if(typeof e?.isHome==="boolean")return e.isHome===(teamIndex===0);
    if(typeof e?.isHomeTeam==="boolean")return e.isHomeTeam===(teamIndex===0);
    return false;
  });
  let red=0;const subs=[];const seen=new Set();
  const addSub=(s)=>{
    const key=[s.minute,s.on?.player||"",s.off?.player||"",s.type||""].join("|");
    if(seen.has(key))return;seen.add(key);subs.push(s);
  };
  for(const e of ev){
    const t=String(e?.type||e?.eventType||e?.event||"").toLowerCase();
    const card=String(e?.card||e?.cardType||"").toLowerCase();
    if(t.includes("red")||card.includes("red"))red++;
    if(t.includes("sub")){
      const minute=parseSubMinute(e?.time??e?.minute??e?.min);
      const onRaw=e?.subOn||e?.playerIn||e?.onPlayer||e?.player?.subOn||null;
      const offRaw=e?.subOff||e?.playerOut||e?.offPlayer||e?.player?.subOff||null;
      const make=(p,fallback)=>{
        if(!p&&!fallback)return null;
        const obj=p||{name:fallback};
        const pos=positionInfo(obj);
        return {player:playerName(obj),position:pos.code,positionGroup:pos.group};
      };
      const fallbackOn=e?.playerName||e?.name||null;
      const on=make(onRaw,fallbackOn),off=make(offRaw,null);
      addSub({minute,on,off,type:classifySub(on,off)});
    }
  }
  for(const s of lineupSubs(detail,teamIndex,teamId))addSub(s);
  subs.sort((a,b)=>(a.minute??999)-(b.minute??999));
  return {
    red,subs:subs.length,subEvents:subs,lastSub:subs.length?subs[subs.length-1]:null,
    attackingSubs:subs.filter(x=>x.type==="Attacking Sub").length,
    defensiveSubs:subs.filter(x=>x.type==="Defensive Sub").length
  };
}
async function enrichEventsWithPlayers(events,teamId,teamName,detail,teamIndex){
  try{
    const k=String(teamId||"");
    const last=rosterTouchCache.get(k)||0;
    if(k&&Date.now()-last>6*3600000){
      rosterTouchCache.set(k,Date.now());
      try{await refreshTeamRoster(teamId,teamName,{marketLimit:0});}catch(e){}
    }
    const refs=(events?.subEvents||[]).flatMap(x=>[x.on,x.off]).filter(Boolean);
    if(!refs.length)return events;

    // Layer 1 + 2: playerId, then normalized player name from the registry.
    const km=await getPlayerKnowledge(teamId,refs);

    // Layer 3: positions from the current match lineup/bench payload.
    const lm=lineupPlayerMap(detail,teamIndex,teamId);
    const roleFromGroup=g=>g==="Attacking"?"Attacking":g==="Defensive"?"Defensive":g==="Goalkeeper"?"Goalkeeper":g==="Midfield"?"Balanced":null;

    const subs=[];
    for(const s of events.subEvents||[]){
      let on=applyLineupKnowledge(enrichPlayer(s.on,km),lm);
      let off=applyLineupKnowledge(enrichPlayer(s.off,km),lm);
      if(on&&!on.roleClass)on={...on,roleClass:roleFromGroup(on.positionGroup)};
      if(off&&!off.roleClass)off={...off,roleClass:roleFromGroup(off.positionGroup)};

      // Layer 4: direct FotMob player profile only for still-unresolved players.
      if(on&&(!on.roleClass||on.positionGroup==="Unknown"||!on.position||on.position==="?")){
        const x=await getDirectPlayerKnowledge(on);if(x)on={...on,...x};
      }
      if(off&&(!off.roleClass||off.positionGroup==="Unknown"||!off.position||off.position==="?")){
        const x=await getDirectPlayerKnowledge(off);if(x)off={...off,...x};
      }

      const impact=substitutionImpact(on,off);
      let type=classifySub(on,off);
      if(impact>=1)type="Attacking Sub";
      else if(impact<=-1)type="Defensive Sub";
      else if(on?.roleClass&&off?.roleClass)type="Balanced/Role Change";
      subs.push({...s,on,off,type,playerImpact:impact});
    }
    return {
      ...events,
      subEvents:subs,
      lastSub:subs.length?subs[subs.length-1]:events.lastSub,
      attackingSubs:subs.filter(x=>Number(x.playerImpact)>0).length,
      defensiveSubs:subs.filter(x=>Number(x.playerImpact)<0).length
    };
  }catch(e){return events;}
}
function sideMetrics(stats,shots,events,idx){
  const totalShots=val(stats,["total shots","shots"],idx);
  const shotsOnTarget=val(stats,["shots on target"],idx);
  const xgStat=val(stats,["expected goals (xg)","expected goals","xg"],idx);
  const possession=val(stats,["ball possession","possession"],idx);
  const corners=val(stats,["corners","corner kicks"],idx);
  const boxTouches=val(stats,["touches in opposition box","touches in opponent box"],idx);
  return {
    totalShots,shotsOnTarget,
    xg:xgStat??Number(shots.totalXg.toFixed(2)),
    possession,corners,boxTouches,
    redCards:events.red,substitutions:events.subs,
    substitutionEvents:events.subEvents||[],
    lastSubstitution:events.lastSub||null,
    recent5ShotsFor:shots.recent5Shots,
    recent5XgFor:Number(shots.recent5Xg.toFixed(2)),
    previous5ShotsFor:shots.previous5Shots,
    previous5XgFor:Number(shots.previous5Xg.toFixed(2)),
    recent10ShotsFor:shots.recent10Shots,
    recent10XgFor:Number(shots.recent10Xg.toFixed(2)),
    previous10ShotsFor:shots.previous10Shots,
    previous10XgFor:Number(shots.previous10Xg.toFixed(2)),
    recentBoxEntriesFor:0,
    attackingSubsFor:events.attackingSubs||0,
    defensiveSubsFor:events.defensiveSubs||0,
    stillAttacking:shots.recent5Shots>=2||shots.recent5Xg>=0.16||shots.recent10Shots>=4||shots.recent10Xg>=0.28,
    rhythmSlowing:(shots.recent5Shots<=1&&shots.recent5Xg<=0.06&&
      (shots.previous5Shots>=2||shots.previous5Xg>=0.10)&&
      ((shots.previous5Shots>0&&shots.recent5Shots<=Math.floor(shots.previous5Shots/2))||
       (shots.previous5Xg>=0.08&&shots.recent5Xg<=shots.previous5Xg*0.50)))
  };
}
function nonFirstTeamLeague(name){
  return /women|woman|female|ladies|femeni|femmin|femenin|u\s?[-]?\s?(?:17|18|19|20|21|23)|under\s?(?:17|18|19|20|21|23)|youth|academy|junior|reserve|reserves|development/i.test(String(name||""));
}
function nonFirstTeamName(name){
  const s=String(name||"");
  return /\b(?:women|ladies|u\s?[-]?\s?(?:17|18|19|20|21|23)|reserves?|reserve|academy|youth)\b/i.test(s)||/\b(?:ii|iii|b)\b$/i.test(s);
}
async function findMatch(home,away){
  const dates=[localDateParts(0),localDateParts(-1),localDateParts(1)];
  for(const date of dates){
    const d=await getJson("/matches?date="+date+"&ccode3=USA");
    const matches=flattenMatches(d).filter(m=>!nonFirstTeamLeague(m?._league)&&!nonFirstTeamName(m?.home?.name)&&!nonFirstTeamName(m?.away?.name));
    const hit=matches.find(m=>teamMatch(m?.home?.name,home)&&teamMatch(m?.away?.name,away))||
              matches.find(m=>teamMatch(m?.home?.name,away)&&teamMatch(m?.away?.name,home));
    if(hit)return hit;
  }
  return null;
}
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  try{
    const b=req.body||{},home=String(b.home||"").trim(),away=String(b.away||"").trim();
    if(!home||!away)return res.status(400).json({error:"Home and Away are required."});
    let m=null,detail=null;
    const explicitId=String(b.matchId||"").trim();
    if(explicitId){
      detail=await getJson("/matchDetails?matchId="+encodeURIComponent(explicitId));
      m={
        id:explicitId,
        _league:detail?.general?.leagueName||"",
        home:{id:detail?.general?.homeTeam?.id,name:detail?.general?.homeTeam?.name||home},
        away:{id:detail?.general?.awayTeam?.id,name:detail?.general?.awayTeam?.name||away},
        status:detail?.header?.status||{}
      };
    }else{
      m=await findMatch(home,away);
      if(!m)return res.status(404).json({error:"No match was found for these teams around today."});
      detail=await getJson("/matchDetails?matchId="+encodeURIComponent(m.id));
    }
    const started=!!(detail?.header?.status?.started??m?.status?.started);
    const finished=!!(detail?.header?.status?.finished??m?.status?.finished);
    if(!started)return res.status(409).json({error:"Match found, but it has not started yet.",matchId:m.id});
    let [hg,ag]=scorePair(m,detail),minute=parseMinute(detail,m);
    const boardMinute=Number(b.liveMinute);
    const boardHomeGoals=Number(b.liveHomeGoals);
    const boardAwayGoals=Number(b.liveAwayGoals);
    // The lightweight live board often receives minute/score changes before
    // matchDetails. Use the fresher board clock/score immediately so Formula C
    // does not wait for the slower detail feed just to recompute intent.
    if(Number.isFinite(boardMinute) && boardMinute>minute)minute=Math.min(130,boardMinute);
    if(Number.isFinite(boardHomeGoals) && Number.isFinite(boardAwayGoals) &&
       (boardHomeGoals!==hg || boardAwayGoals!==ag)){
      hg=boardHomeGoals; ag=boardAwayGoals;
    }
    const stats=statPairs(detail);
    const homeId=detail?.general?.homeTeam?.id??m?.home?.id;
    const awayId=detail?.general?.awayTeam?.id??m?.away?.id;
    const homeName=detail?.general?.homeTeam?.name||m?.home?.name||home;
    const awayName=detail?.general?.awayTeam?.name||m?.away?.name||away;
    const shots=shotData(detail,homeId,awayId,minute);
    let he=eventCounts(detail,homeId,0),ae=eventCounts(detail,awayId,1);
    [he,ae]=await Promise.all([
      enrichEventsWithPlayers(he,homeId,homeName,detail,0),
      enrichEventsWithPlayers(ae,awayId,awayName,detail,1)
    ]);
    const hm=sideMetrics(stats,shots.home,he,0),am=sideMetrics(stats,shots.away,ae,1);
    const weightState=await getFormulaDWeights();
    const weights=weightState.config;
    const liveSignature=JSON.stringify({
      weights,
      hg,ag,minute,
      h:[hm.totalShots,hm.shotsOnTarget,hm.xg,hm.possession,hm.corners,hm.redCards,hm.substitutions,hm.recent5ShotsFor,hm.recent5XgFor,hm.recent10ShotsFor,hm.recent10XgFor,hm.lastSubstitution?.minute,hm.lastSubstitution?.on?.player,hm.lastSubstitution?.off?.player],
      a:[am.totalShots,am.shotsOnTarget,am.xg,am.possession,am.corners,am.redCards,am.substitutions,am.recent5ShotsFor,am.recent5XgFor,am.recent10ShotsFor,am.recent10XgFor,am.lastSubstitution?.minute,am.lastSubstitution?.on?.player,am.lastSubstitution?.off?.player]
    });
    const cacheKey=String(m.id||explicitId||homeName+"|"+awayName);
    const cached=liveResultCache.get(cacheKey);
    if(cached&&cached.signature===liveSignature&&Date.now()-cached.ts<90000){
      return res.json({...cached.payload,reusedUnchangedData:true});
    }
    const pre=await getPreMatchContext(req,homeName,awayName);
    if(pre){
      hm.preMatchIntent=pre.homeIntent||"";
      hm.strengthTier=pre.homeTier;
      hm.opponentStrengthTier=pre.awayTier;
      hm.preMatchRank=pre.homeRank;
      hm.opponentPreMatchRank=pre.awayRank;
      am.preMatchIntent=pre.awayIntent||"";
      am.strengthTier=pre.awayTier;
      am.opponentStrengthTier=pre.homeTier;
      am.preMatchRank=pre.awayRank;
      am.opponentPreMatchRank=pre.homeRank;
    }
    const hr=pre?.homeRank??b.homeRank,ar=pre?.awayRank??b.awayRank;
    const homeAnalysis=evaluateLiveIntent(hg,ag,minute,hr,ar,hm,weights);
    const awayAnalysis=evaluateLiveIntent(ag,hg,minute,ar,hr,am,weights);
    const gti=computeGTI(homeAnalysis.metrics,awayAnalysis.metrics,{recent10TotalShots:(hm.recent10ShotsFor||0)+(am.recent10ShotsFor||0)},weights);
    const matchPayload={matchId:m.id,competition:m._league||detail?.general?.leagueName||"",home:homeName,away:awayName,homeGoals:hg,awayGoals:ag,minute,started,finished,lastUpdated:new Date().toISOString()};
    try{
      await saveFormulaDSnapshot(matchPayload,{...homeAnalysis,metrics:hm,formulaDMetrics:homeAnalysis.metrics},{...awayAnalysis,metrics:am,formulaDMetrics:awayAnalysis.metrics},gti,{homeId,awayId});
    }catch(le){console.error("formula-d-learning-save",String(le?.message||le));}
    const payload={
      engineVersion:"Formula C Live v6 · BACKTEST INTENT THRESHOLDS · DYNAMIC TEMPO/ATTACK · SS/AS/xG5 · PREMATCH CONTEXT",
      provider:"FotMob live match details",
      preMatchContext:pre||null,
      intents:FORMULA_D_INTENTS,
      gti,
      match:matchPayload,
      home:{intent:homeAnalysis.intent,confidence:homeAnalysis.confidence,reasons:homeAnalysis.reasons,signals:homeAnalysis.signals,formulaDMetrics:homeAnalysis.metrics,metrics:hm},
      away:{intent:awayAnalysis.intent,confidence:awayAnalysis.confidence,reasons:awayAnalysis.reasons,signals:awayAnalysis.signals,formulaDMetrics:awayAnalysis.metrics,metrics:am},
      reusedUnchangedData:false,
      weightConfig:{config:weights,updatedAt:weightState.updatedAt,isDefault:weightState.isDefault}
    };
    liveResultCache.set(cacheKey,{signature:liveSignature,ts:Date.now(),payload});
    res.json(payload);
  }catch(e){
    console.error("formula-d-live",String(e?.stack||e));
    res.status(502).json({error:"Live data lookup failed.",detail:String(e?.message||e)});
  }
}