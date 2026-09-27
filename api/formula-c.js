import {requireAuth} from "lib/auth.js";
import {getFormulaABCWeights} from "lib/formula-abc-config.js";
import {resolveTeamPair,canonicalTeam} from "lib/team-resolver.js";
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
function rowFixture(f,teamId){
  const home=Number(f?.home?.id)===Number(teamId);
  return {
    date:iso(f?.status?.utcTime),
    utcTime:f?.status?.utcTime||"",
    competition:f?.tournament?.name||"",
    leagueId:Number(f?.tournament?.leagueId||0),
    ha:home?"H":"A",
    opponent:home?(f?.away?.name||""):(f?.home?.name||""),
    display:(f?.home?.name||"")+" vs "+(f?.away?.name||"")
  };
}
function daysBetween(a,b){
  if(!a||!b)return null;
  return Math.max(0,Math.round((new Date(b+"T12:00:00Z")-new Date(a+"T12:00:00Z"))/86400000)-1);
}
function tableRows(league){
  const raw=league?.table?.[0]?.data?.table?.all||[];
  return raw.map(x=>({
    rank:Number(x.idx||0),team:x.name||"",teamId:Number(x.id),played:Number(x.played||0),
    points:Number(x.pts||0),gd:Number(x.goalConDiff||0),scores:x.scoresStr||""
  }));
}
function fatigueFromPast(past,currentDate){
  const p=past.slice(-3);
  if(!p.length)return "—";
  const d1=daysBetween(iso(p[p.length-1].status.utcTime),currentDate);
  if(d1==null||d1>=4)return "不累";
  const d2=p.length>=2?daysBetween(iso(p[p.length-2].status.utcTime),iso(p[p.length-1].status.utcTime)):null;
  return d2!=null&&d2<=3?"很累":"累";
}
function futureMark(next,currentDate){
  const n=next.slice(0,2);
  if(!n.length)return "❌";
  let tight=0,prev=currentDate;
  for(const f of n){const d=daysBetween(prev,f.date);if(d!=null&&d<=3)tight++;prev=f.date;}
  return tight>=2?"☑️×2":tight===1?"☑️":"❌";
}
function strengthTier(name){
  const n=norm(canonicalTeam(name));

  // Formula B · UEFA Nations League senior men's national-team strength table.
  // This is an auxiliary consideration only; it must NOT decide intent by itself.
  // Final intent still combines competition need, standings/qualification context,
  // home/away, form, fatigue, lineup/injuries, future schedule, market evidence,
  // coach intent and other verified factors.
  const nationsTiers={
    4:["spain","england","france","portugal","belgium","norway","germany","netherlands","croatia"],
    3:["italy","switzerland","denmark","austria","serbia","turkiye","turkey","sweden","ukraine","czechia","czechrepublic","greece","wales","poland"],
    2:["scotland","hungary","romania","slovenia","northmacedonia","macedonia","georgia","republicofireland","ireland","kosovo","israel","bosniaherzegovina","bosniaandherzegovina","albania","finland","slovakia","iceland","montenegro","kazakhstan","bulgaria","northernireland"],
    1:["armenia","belarus","cyprus","latvia","faroeislands","moldova","estonia","luxembourg","azerbaijan","lithuania","malta","gibraltar","andorra","liechtenstein","sanmarino"]
  };
  for(const [t,arr] of Object.entries(nationsTiers)){if(arr.some(x=>norm(x)===n))return Number(t);}

  const tiers={
    4:[
      "arsenal","manchestercity","mancity","liverpool",
      "barcelona","realmadrid",
      "bayernmunchen","bayernmunich",
      "inter","internazionale","asroma","roma","juventus","como",
      "parissaintgermain","psg"
    ],
    3:[
      "chelsea","manchesterunited","manunited","astonvilla","tottenham","tottenhamhotspur","brentford","brighton","brightonhovealbion","newcastle","newcastleunited",
      "atleticomadrid","villarreal","realbetis",
      "borussiadortmund","bayerleverkusen","rbleipzig","vfb stuttgart","vfb stuttgart","hoffenheim",
      "napoli","acmilan","milan","atalanta","lazio",
      "lens","rclens","lille","lyon","olympiquelyonnais","monaco","asmonaco","marseille","olympiquedemarseille","rennes","staderennais","strasbourg","rcstrasbourg"
    ],
    2:[
      "everton","leedsunited","leeds","sunderland","crystalpalace","fulham","bournemouth","nottinghamforest","nottmforest","nottingham","hull","hullcity",
      "athleticclub","realsociedad","celtavigo","valencia","rayovallecano","alaves","getafe","osasuna","levante",
      "freiburg","scfreiburg","mainz05","mainz","eintrachtfrankfurt","augsburg","borussiamonchengladbach","monchengladbach","unionberlin",
      "bologna","fiorentina","sassuolo","udinese","torino","cagliari","genoa","parma","lecce",
      "parisfc","brest","lorient","toulouse","nice"
    ],
    1:[
      "ipswichtown","ipswich","coventrycity","coventry",
      "sevilla","deportivolacoruna","racingsantander","malaga","elche","espanyol",
      "werderbremen","fckoln","koln","hamburgersv","schalke04","svelversberg","scpaderborn07","paderborn",
      "monza","frosinone","venezia",
      "angers","lemans","troyes","lehavre","auxerre"
    ]
  };
  for(const [t,arr] of Object.entries(tiers)){if(arr.some(x=>norm(x)===n))return Number(t);}
  return null;
}
function tierLabel(t){return t===4?"优":t===3?"良":t===2?"中":t===1?"差":"—"}
function isUCL(name){return /champions league/i.test(name||"")&&!/women/i.test(name||"")}
function isUEL(name){return /europa league/i.test(name||"")&&!/conference/i.test(name||"")}
function isUECL(name){return /conference league/i.test(name||"")}
function isNationsLeague(name){return /(?:UEFA\s*)?Nations\s+League/i.test(name||"")&&!/(women|u\s?[-]?\s?(?:17|19|21)|youth)/i.test(name||"")}
function resultForTeam(f,teamId){
  if(!f?.status?.finished)return null;
  const hs=Number(f?.home?.score),as=Number(f?.away?.score);
  if(!Number.isFinite(hs)||!Number.isFinite(as))return null;
  const home=Number(f?.home?.id)===Number(teamId);
  const gf=home?hs:as,ga=home?as:hs;
  return gf>ga?"W":gf<ga?"L":"D";
}
function formScore(past,teamId){
  const arr=past.slice(-5).map(f=>resultForTeam(f,teamId)).filter(Boolean);
  if(!arr.length)return {form:[],score:null};
  const pts=arr.reduce((s,r)=>s+(r==="W"?3:r==="D"?1:0),0);
  return {form:arr,score:Math.round((pts/(arr.length*3))*100)};
}
function domesticTableRows(teamObj){
  const raw=teamObj?.table?.[0]?.data?.table?.all||[];
  return raw.map(x=>({
    rank:Number(x.idx||0),team:x.name||"",teamId:Number(x.id),played:Number(x.played||0),
    points:Number(x.pts||0),gd:Number(x.goalConDiff||0),scores:x.scoresStr||""
  }));
}
function scheduleOpportunity(side){
  const t=side.tier;if(!t)return null;
  const tiers=(side.next3||[]).slice(0,2).map(x=>strengthTier(x.opponent)).filter(x=>x!=null);
  if(!tiers.length)return 50;
  let v=50;
  for(const x of tiers){
    if(x>=t+2)v+=18;
    else if(x===t+1)v+=10;
    else if(x<=t-1)v-=5;
  }
  return Math.max(0,Math.min(100,v));
}
function fatigueScore(side){
  let v=side.fatigue==="不累"?70:side.fatigue==="累"?48:side.fatigue==="很累"?28:50;
  if(side.density==="☑️")v-=8;
  if(side.density==="☑️×2")v-=18;
  return Math.max(0,Math.min(100,v));
}
function competitionNeed(side,ctx){
  const row=(ctx.table||[]).find(x=>x.teamId===side.teamId);
  if(!row)return {score:50,mustWin:false,reason:"积分数学需求无法完整验证"};
  const rank=Number(row.rank||0),played=Number(row.played||0),points=Number(row.points||0);
  const euroTotal=ctx.isUEL?8:ctx.isUECL?6:ctx.isUCL?8:null;

  // UEFA Nations League does NOT use a separate intent algorithm anymore.
  // It only supplies the common Formula B engine with the correct league-table
  // context: 3 points for a win, 1 for a draw, 0 for a loss, plus remaining
  // group matches. The resulting need score is then combined with the SAME
  // strength/home-away/form/schedule/lineup/market rules used for the Big Five.
  if(ctx.isNationsLeague){
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
  // 国内联赛在无法严格证明冠军/保级数学必要时，不制造 Must Win。
  return {score:55,mustWin:false,reason:"国内联赛存在常规拿分需求，但未形成可验证的数学 Must Win"};
}
// UEFA Nations League uses the same Formula B intent rules as the Big Five leagues.
// Only the national-team strength tiers below are competition-specific.
function winAbility(side,opp){
  if(!side.tier||!opp.tier)return null;
  const gap=side.tier-opp.tier;
  return Math.max(10,Math.min(90,50+gap*18+(side.isHome?8:-4)));
}
function weightedSupport(side,opp,ctx,weights={}){
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
function classifyIntent(side,opp,ctx,weights={}){
  const t=side.tier,ot=opp.tier;
  const support=weightedSupport(side,opp,ctx,weights);
  if(support.need.mustWin){
    return {intent:"Must Win",reason:support.need.reason,...support};
  }
  if(!t||!ot){
    return {intent:"---",reason:"实力分级或关键资料无法验证，按主规则不得编造",...support};
  }

  // UEFA Nations League has no separate intent branch.
  // It continues through the same Formula B decision path used for the Big Five leagues.

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
  if(gap>=2&&realistic){
    return {intent:"Want Win",reason:"本队实力至少高出对手2个等级；不受客场+1级最高Hope Win限制。一般疲劳/赛程密度不单独把这种明显实力优势降到Hope Win，因此判为Want Win",...support};
  }

  if(clearWinMotivation&&realistic&&conditionsOK&&strongEvidence){
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
  const sufficientSupport=(support.score!=null&&support.score>=56)||hopeSupport>0;
  if(winPreference&&sufficientSupport){
    return {intent:"Hope Win",reason:"存在独立的赢球偏好证据，但证据不足以通过Want Win全部门槛",...support};
  }

  if(Math.abs(gap)<=1){
    return {intent:"---",reason:"双方实力接近且没有足够的方向性证据",...support};
  }
  return {intent:"---",reason:"证据冲突或不足，按公式C不强行填意图",...support};
}

export default async function(req,res){
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
      const root=league?.table?.[0]||{};
      const groups=Array.isArray(root?.data?.tables)?root.data.tables:[];
      const homeIdNow=Number(cur?.home?.id),awayIdNow=Number(cur?.away?.id);
      const grp=groups.find(g=>{
        const rows=g?.table?.all||[];
        const ids=rows.map(x=>Number(x.id));
        return ids.includes(homeIdNow)&&ids.includes(awayIdNow);
      })||groups.find(g=>(g?.table?.all||[]).some(x=>Number(x.id)===homeIdNow||Number(x.id)===awayIdNow));
      nationsGroupName=grp?.leagueName||null;
      const formMap=root?.teamForm||{};
      table=(grp?.table?.all||[]).map(x=>({
        rank:Number(x.idx||0),team:x.name||"",teamId:Number(x.id),played:Number(x.played||0),
        points:Number(x.pts||0),gd:Number(x.goalConDiff||0),scores:x.scoresStr||"",
        form:(Array.isArray(formMap?.[String(x.id)])?formMap[String(x.id)]:[]).map(z=>z?.resultString).filter(Boolean).slice(-5)
      }));
    }else{
      table=tableRows(league);
    }

    function side(teamObj,teamId){
      const all=fixtures(teamObj).filter(f=>!f?.status?.cancelled).sort((a,b)=>new Date(a.status.utcTime)-new Date(b.status.utcTime));
      const ts=new Date(cur.status.utcTime).getTime();
      const past=all.filter(f=>new Date(f.status.utcTime).getTime()<ts&&f.status.finished);
      const fut=all.filter(f=>new Date(f.status.utcTime).getTime()>ts&&!f.status.finished);
      const domesticTable=domesticTableRows(teamObj);
      const competitionRank=table.find(x=>x.teamId===Number(teamId))?.rank??null;
      const fallbackRank=domesticTable.find(x=>x.teamId===Number(teamId))?.rank??null;
      const rank=competitionRank??fallbackRank;
      const rankSource=competitionRank!=null?competition:(fallbackRank!=null?"Domestic League Fallback":"Unverified");
      const nationsCurrent=isNationsLeague(competition);
      const next3=(nationsCurrent
        ? fut.filter(f=>Number(f?.tournament?.leagueId||0)===leagueId).slice(0,6)
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
        form:fScore.form,formScore:fScore.score
      };
    }
    const homeId=Number(cur.home.id),awayId=Number(cur.away.id);
    const homeObj=homeId===hid?ht:at,awayObj=awayId===aid?at:ht;
    const home=side(homeObj,homeId),away=side(awayObj,awayId);
    const uclFlag=isUCL(competition),uelFlag=isUEL(competition),ueclFlag=isUECL(competition),nationsFlag=earlyNationsFlag;
    const domesticLeagueName=!uclFlag&&!uelFlag&&!ueclFlag&&!nationsFlag&&!/(cup|copa|pokal|coupe|trophy|super cup|supercup|friendly|friendlies)/i.test(competition||"");
    // Nations League follows Formula B's common intent framework, but its
    // future-schedule window is competition-specific: use the next SIX UEFA
    // Nations League fixtures only. Domestic leagues keep their locked Next-3 rule.
    const euroCtx={competition,table,leagueId,isUCL:uclFlag,isUEL:uelFlag,isUECL:ueclFlag,isNationsLeague:nationsFlag,isDomesticLeague:domesticLeagueName||nationsFlag};
    const abcWeightState=await getFormulaABCWeights();
    const cWeights=abcWeightState.C?.config||{};
    const hIntent=classifyIntent(home,away,euroCtx,cWeights),aIntent=classifyIntent(away,home,euroCtx,cWeights);
    home.intent=hIntent.intent;home.intentReason=hIntent.reason;
    home.intentScore=hIntent.score;home.dataCoverage=hIntent.coverage;
    home.factorBreakdown=hIntent.factors;
    away.intent=aIntent.intent;away.intentReason=aIntent.reason;
    away.intentScore=aIntent.score;away.dataCoverage=aIntent.coverage;
    away.factorBreakdown=aIntent.factors;

    const uel=uelFlag,uecl=ueclFlag,ucl=uclFlag;
    const expectedGames=uel?8:uecl?6:ucl?8:null;
    if(expectedGames){
      home.europeSchedule=(home.competitionSchedule||[]).slice(0,expectedGames);
      away.europeSchedule=(away.competitionSchedule||[]).slice(0,expectedGames);
    }

    res.json({
      source:"FotMob (current provider fallback; official table has priority when available)",
      engineVersion:"Formula B Master Rules V45 LOCKED · Fatigue timing only for all matches",
      decisionPolicy:"All intent rules are auxiliary considerations. Final intent is decided by combined evidence, and stronger verified factors override any single auxiliary rule.",
      analyzedAt:new Date().toISOString(),
      match:{home:cur.home.name,away:cur.away.name,homeTeamId:homeId,awayTeamId:awayId,fixtureId:cur.id,date:currentDate,competition,leagueId,identityKey:String(homeId)+"|"+String(awayId)+"|"+String(cur.id||currentDate)},
      home,away,
      competitionTable:table,
      european:{isUCL:ucl,isUEL:uel,isUECL:uecl,expectedGames},
      nationsLeague:{
        isNationsLeague:nationsFlag,
        leagueLevel:(String(competition||"").match(/Nations\s+League\s+([A-D])/i)?.[1]||null),
        groupName:nationsGroupName,
        strengthTierPolicy:"使用国家队差/中/良/优实力四档；意图完全按公式B五大联赛通用规则分析，不使用任何欧国联专用意图规则"
      },
      weightConfig:abcWeightState.C,
      qa:{
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