import { getProviderJson } from "lib/shared-data/cache.js";
import { trackedFetch } from "lib/tracked-fetch.js";
const BASE="https://www.fotmob.com/api/data";
const SPORTSDB="https://www.thesportsdb.com/api/v1/json/3";

async function getJson(path){return getProviderJson(path);}
async function getExternalJson(url){
  const r=await trackedFetch(url,{timeout_ms:8000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
  if(!r.ok)throw new Error("External team lookup HTTP "+r.status);
  return await r.json();
}
export function normTeam(s){
  return String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
}
const ALIASES={
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
  "psg":"Paris Saint-Germain","parissg":"Paris Saint-Germain","parissaintgermain":"Paris Saint-Germain","parissaintgermainfc":"Paris Saint-Germain",
  "om":"Marseille","ol":"Lyon","lyon":"Olympique Lyonnais","marseille":"Olympique Marseille","olympiquedemarseille":"Olympique Marseille","olympiquemarseille":"Olympique Marseille",
  "bayern":"Bayern Munich","bayernmunchen":"Bayern Munich","bayernmunich":"Bayern Munich",
  "dortmund":"Borussia Dortmund","bvb":"Borussia Dortmund",
  "leverkusen":"Bayer Leverkusen","bayer04":"Bayer Leverkusen","bayer04leverkusen":"Bayer Leverkusen",
  "rbleipzig":"RB Leipzig","leipzig":"RB Leipzig","schalke":"Schalke 04","schalke04":"Schalke 04",
  "elversberg":"SV Elversberg","svelversberg":"SV Elversberg","eldersburg":"SV Elversberg",
  "paderborn":"SC Paderborn 07","scpaderborn07":"SC Paderborn 07",
  "hoffenheim":"TSG Hoffenheim","tsg1899hoffenheim":"TSG Hoffenheim","tsghoffenheim":"TSG Hoffenheim",
  "gladbach":"Borussia Mönchengladbach","monchengladbach":"Borussia Mönchengladbach","mgladbach":"Borussia Mönchengladbach","borussiamgladbach":"Borussia Mönchengladbach",
  "eintrachtfrankfurt":"Eintracht Frankfurt","scfreiburg":"Freiburg","fckoln":"FC Köln","koln":"FC Köln","cologne":"FC Köln",
  "parisfc":"Paris FC","rcstrasbourg":"Strasbourg","strasbourg":"Strasbourg","hullcity":"Hull City","ipswichtown":"Ipswich Town",
  "inter":"Inter","intermilan":"Inter","internazionale":"Inter","acmilan":"AC Milan","milan":"AC Milan","juve":"Juventus",
  "roma":"Roma","asroma":"Roma","napoli":"Napoli","sporting":"Sporting CP","sportinglisbon":"Sporting CP",
  "benfica":"Benfica","fcporto":"Porto","porto":"Porto","psv":"PSV Eindhoven","psveindhoven":"PSV Eindhoven",
  "shakhtar":"Shakhtar Donetsk","shakhtardonetsk":"Shakhtar Donetsk","fener":"Fenerbahce","fenerbahce":"Fenerbahce",
  "slaviaprague":"Slavia Prague","slaviapraha":"Slavia Prague","bodoglimt":"Bodø/Glimt",
  "afcbournemouth":"Bournemouth","bournemouthafc":"Bournemouth","bournemouth":"Bournemouth",
  "leeds":"Leeds United","leedsutd":"Leeds United","leedsunited":"Leeds United","leedsunitedfc":"Leeds United",
  "crystalpalace":"Crystal Palace","sunderlandafc":"Sunderland","sunderland":"Sunderland",
  "frosinonecalcio":"Frosinone","frosinone":"Frosinone","como1907":"Como","como":"Como",
  "atleticodemadrid":"Atletico Madrid","atleticomadridcf":"Atletico Madrid",
  "fulhamfc":"Fulham","fulham":"Fulham","manchesterunitedfc":"Manchester United",
  "juventusfc":"Juventus","atalantabc":"Atalanta","atalanta":"Atalanta",
  "villarrealclubdefutbol":"Villarreal","levanteuniondeportiva":"Levante",
  "scpaderborn":"SC Paderborn 07","paderborn07":"SC Paderborn 07",
  "tsg1899hoffenheim":"TSG Hoffenheim","tsghoffenheim":"TSG Hoffenheim",
  "acmilan1899":"AC Milan","uslecce":"Lecce","lecce":"Lecce",
  "olympiquedemarseille":"Olympique Marseille","olympiquemarseille":"Olympique Marseille",
  "parissaintgermain":"Paris Saint-Germain","parissaintgermainfc":"Paris Saint-Germain"
};
export function canonicalTeam(name){return ALIASES[normTeam(name)]||String(name||"").trim();}

function isSenior(x){
  const s=String(x?.name||"");
  return x?.type==="team"&&!/\b(?:women|ladies|u\s?[-]?\s?(?:17|18|19|20|21|23)|reserves?|academy|youth)\b/i.test(s);
}
function lev(a,b){
  a=normTeam(a);b=normTeam(b);
  const m=a.length,n=b.length,d=Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++)d[i][0]=i;
  for(let j=0;j<=n;j++)d[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return d[m][n];
}
function similarity(a,b){
  if(!sameTeamCategory(a,b))return 0;
  const x=normTeam(a),y=normTeam(b);
  if(!x||!y)return 0;
  if(x===y)return 100;
  if((x.includes(y)||y.includes(x))&&Math.min(x.length,y.length)>=5)return 92;
  const max=Math.max(x.length,y.length);
  const edit=max?1-lev(x,y)/max:0;
  return Math.round(edit*100);
}
async function searchCandidates(name){
  const canonical=canonicalTeam(name);
  const qs=[canonical];
  if(normTeam(canonical)!==normTeam(name))qs.push(name);
  const all=new Map();
  for(const q of qs){
    try{
      const data=await getJson("/search/suggest?hits=30&lang=en&term="+encodeURIComponent(q));
      const suggestions=(Array.isArray(data)?data:[]).flatMap(x=>x.suggestions||[]).filter(x=>x?.type==="team"&&sameTeamCategory(x.name,name)&&(teamCategory(name).age!=="senior"||teamCategory(name).gender!=="men"||isSenior(x)));
      for(const s of suggestions){
        const sc=Math.max(similarity(s.name,q),similarity(s.name,canonical),similarity(s.name,name));
        const prev=all.get(String(s.id));
        if(!prev||sc>prev.score)all.set(String(s.id),{...s,score:sc});
      }
    }catch(e){}
  }
  if(all.size<2){
    try{
      const d=await getExternalJson(SPORTSDB+"/searchteams.php?t="+encodeURIComponent(canonical));
      const teams=Array.isArray(d?.teams)?d.teams:[];
      for(const t of teams.slice(0,5)){
        const candidate=t?.strTeam||t?.strTeamAlternate?.split(",")?.[0]?.trim();
        if(!candidate)continue;
        const data=await getJson("/search/suggest?hits=20&lang=en&term="+encodeURIComponent(candidate));
        const suggestions=(Array.isArray(data)?data:[]).flatMap(x=>x.suggestions||[]).filter(x=>x?.type==="team"&&sameTeamCategory(x.name,name)&&(teamCategory(name).age!=="senior"||teamCategory(name).gender!=="men"||isSenior(x)));
        for(const s of suggestions){
          const sc=Math.max(similarity(s.name,candidate),similarity(s.name,canonical));
          const prev=all.get(String(s.id));
          if(!prev||sc>prev.score)all.set(String(s.id),{...s,score:sc});
        }
      }
    }catch(e){}
  }
  return [...all.values()].sort((a,b)=>b.score-a.score).slice(0,5);
}
function fixtureList(t){return t?.fixtures?.allFixtures?.fixtures||[]}
function pairingScore(homeCand,awayCand,homeObj){
  const fs=fixtureList(homeObj);
  let best=null;
  for(const f of fs){
    const ids=[Number(f?.home?.id),Number(f?.away?.id)];
    if(ids.includes(Number(homeCand.id))&&ids.includes(Number(awayCand.id))){
      const ts=new Date(f?.status?.utcTime||0).getTime();
      const delta=Math.abs(ts-Date.now())/86400000;
      const score=delta<=180?130:delta<=365?110:90;
      if(!best||score>best.score)best={score,fixture:f};
    }
  }
  return best;
}
export async function resolveTeamPair(homeInput,awayInput){
  const [hc,ac]=await Promise.all([searchCandidates(homeInput),searchCandidates(awayInput)]);
  if(!hc.length||!ac.length)return {home:null,away:null,fixture:null,confidence:0,reason:"candidate-missing"};
  const topH=hc.slice(0,3),topA=ac.slice(0,3);
  const hObjs=await Promise.all(topH.map(async c=>{try{return [c,await getJson("/teams?id="+encodeURIComponent(c.id)+"&ccode3=USA")]}catch(e){return [c,null]}}));
  let best=null;
  for(const [h,hObj] of hObjs){
    if(!hObj)continue;
    for(const a of topA){
      const pair=pairingScore(h,a,hObj);
      const total=h.score+a.score+(pair?.score||0);
      if(!best||total>best.total)best={home:h,away:a,homeObj:hObj,fixture:pair?.fixture||null,total};
    }
  }
  if(!best){
    best={home:topH[0],away:topA[0],fixture:null,total:topH[0].score+topA[0].score};
  }
  if(best.fixture){
    const actualHomeId=Number(best.fixture?.home?.id),actualAwayId=Number(best.fixture?.away?.id);
    if(actualHomeId===Number(best.away.id)&&actualAwayId===Number(best.home.id)){
      const tmp=best.home;best.home=best.away;best.away=tmp;
    }
  }
  return {
    home:best.home,away:best.away,fixture:best.fixture,
    confidence:Math.min(100,Math.round(best.total/3.3)),
    reason:best.fixture?"opponent+schedule-confirmed":"name-only",
    candidates:{home:hc.slice(0,3).map(x=>({id:x.id,name:x.name,score:x.score})),away:ac.slice(0,3).map(x=>({id:x.id,name:x.name,score:x.score}))}
  };
}
export function teamCategory(name){
  const text=String(name||'').normalize('NFKD').toLowerCase();
  const age=text.match(/\bu\s*[-]?\s*(\d{2})\b/)?.[1]||text.match(/(\d{2})岁/)?.[1];
  return {gender:/\b(women|woman|ladies|female|w)\b|女足|女子/.test(text)?'women':'men',age:age?'u'+age:'senior'};
}
export function sameTeamCategory(a,b){const x=teamCategory(a),y=teamCategory(b);return x.gender===y.gender&&x.age===y.age;}
export function teamIdentity(name){
  const category=teamCategory(name);
  const base=canonicalTeam(String(name||'').replace(/\b(women|woman|ladies|female|w|u\s*-?\s*\d{2})\b|女足|女子/gi,' ').trim());
  const normalized=base.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(fc|afc|cf|sc|club)\b/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'');
  return {...category,name:normalized,key:category.gender+':'+category.age+':'+normalized};
}
export function sameTeam(a,b){return !!teamIdentity(a).name&&teamIdentity(a).key===teamIdentity(b).key;}
