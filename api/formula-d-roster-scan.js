import { db } from "hatchable";
import { refreshTeamRoster } from "lib/player-intelligence.js";
import { trackedFetch } from "lib/tracked-fetch.js";
export const access="scheduler";
export const schedule="20 * * * *";

const BASE="https://www.fotmob.com/api/data";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function getJson(path){
  const r=await trackedFetch(BASE+path,{timeout_ms:12000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
  if(!r.ok)throw new Error("FotMob roster scan HTTP "+r.status);
  return await r.json();
}
function code(x){return String(x?.ccode||x?.countryCode||x?.country?.code||"").toUpperCase()}
function targetLeague(x){
  const name=String(x?.name||"").trim(),c=code(x);
  if(/^(UEFA )?Champions League$/i.test(name))return true;
  if(/^(UEFA )?Europa League$/i.test(name))return true;
  if(/^(UEFA )?(Europa )?Conference League$/i.test(name))return true;
  if(/^Premier League$/i.test(name))return !c||["ENG","GBR","ENGLAND"].includes(c);
  if(/^(LaLiga|La Liga)( EA Sports)?$/i.test(name))return !c||["ESP","SPAIN"].includes(c);
  if(/^Serie A$/i.test(name))return !c||["ITA","ITALY"].includes(c);
  if(/^Bundesliga$/i.test(name))return !c||["GER","DEU","GERMANY"].includes(c);
  if(/^Ligue 1( McDonald'?s)?$/i.test(name))return !c||["FRA","FRANCE"].includes(c);
  return false;
}
function leagueEntries(all){
  const out=[];
  const walk=(node,country="")=>{
    if(!node)return;
    if(Array.isArray(node)){node.forEach(x=>walk(x,country));return;}
    if(typeof node!=="object")return;
    const nextCountry=node?.name&&Array.isArray(node?.leagues)?node.name:country;
    if(node?.id&&node?.name&&targetLeague({...node,ccode:node.ccode||node.countryCode||country}))out.push(node);
    Object.values(node).forEach(v=>walk(v,nextCountry));
  };
  walk(all);
  const seen=new Set();
  return out.filter(x=>{const k=String(x.id);if(seen.has(k))return false;seen.add(k);return true});
}
function tableTeams(data){
  const candidates=[
    data?.table?.[0]?.data?.table?.all,
    data?.table?.[0]?.data?.table,
    data?.table?.all,
    data?.details?.table?.all
  ];
  for(const c of candidates){
    if(Array.isArray(c))return c.map(x=>({id:x.id||x.teamId,name:x.name||x.teamName})).filter(x=>x.id&&x.name);
  }
  const out=new Map(),seen=new Set();
  const walk=(node,key="")=>{
    if(!node||typeof node!=="object")return;
    if(seen.has(node))return;seen.add(node);
    if(Array.isArray(node)){node.forEach(x=>walk(x,key));return;}
    const id=node?.id||node?.teamId,name=node?.name||node?.teamName;
    if(id&&name&&/table|team/i.test(key)&&!/player/i.test(key))out.set(String(id),{id,name});
    for(const [k,v] of Object.entries(node))walk(v,k);
  };
  walk(data,"league");
  return [...out.values()];
}
export default async function(req,res){
  try{
    const all=await getJson("/allLeagues?locale=en&country=USA");
    const leagues=leagueEntries(all);
    const teams=new Map();
    for(const l of leagues){
      try{
        const d=await getJson("/leagues?id="+encodeURIComponent(l.id)+"&ccode3=USA");
        for(const t of tableTeams(d))teams.set(String(t.id),t);
      }catch(e){}
    }
    const existing=(await db.query("SELECT team_id,MAX(roster_updated_at) AS updated FROM formula_d_players GROUP BY team_id")).rows||[];
    const fresh=new Map(existing.map(x=>[String(x.team_id),new Date(x.updated).getTime()]));
    const queue=[...teams.values()].filter(t=>!fresh.get(String(t.id))||Date.now()-fresh.get(String(t.id))>14*86400000);
    const batch=queue.slice(0,8);
    let players=0,values=0;
    for(const t of batch){
      try{const r=await refreshTeamRoster(t.id,t.name,{marketLimit:8});players+=r.players||0;values+=r.values||0;}catch(e){console.error("roster team",t.id,String(e?.message||e));}
      await pause(1200);
    }
    const counts=(await db.query("SELECT COUNT(*)::int players,COUNT(market_value_eur)::int values,COUNT(DISTINCT team_id)::int teams FROM formula_d_players")).rows?.[0]||{};
    await db.query("UPDATE formula_d_roster_scan_state SET teams_scanned=$1,players_known=$2,values_known=$3,status=$4,updated_at=NOW() WHERE id=1",
      [counts.teams||0,counts.players||0,counts.values||0,(counts.teams||0)>=teams.size&&teams.size>0?"refreshing":"running"]);
    return res.json({ok:true,targetTeams:teams.size,batchTeams:batch.length,playersAdded:players,valuesAdded:values,known:counts});
  }catch(e){
    console.error("formula-d-roster-scan",String(e?.stack||e));
    return res.status(500).json({error:"Roster scan failed.",detail:String(e?.message||e)});
  }
}