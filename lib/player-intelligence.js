import { db } from "hatchable";
import { trackedFetch } from "lib/tracked-fetch.js";

const BASE="https://www.fotmob.com/api/data";
const liveProfileCache=new Map();
async function getJson(path){
  const r=await trackedFetch(BASE+path,{timeout_ms:12000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
  if(!r.ok)throw new Error("FotMob player data HTTP "+r.status);
  return await r.json();
}
function s(v){return String(v??"").trim()}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function norm(v){return s(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"")}

export function roleFromPosition(raw){
  const full=s(raw).toUpperCase();
  const p=full.split(",")[0].trim()||full;
  if(/GK|GOAL/.test(p))return {group:"Goalkeeper",role:"Goalkeeper"};
  if(/LWB|RWB|WING.?BACK/.test(p))return {group:"Defensive",role:"Balanced"};
  if(/CB|CENTRE.?BACK|CENTER.?BACK|LB|RB|FULL.?BACK|DEF|BACK/.test(p))return {group:"Defensive",role:"Defensive"};
  if(/DM|CDM|DEFENSIVE MID/.test(p))return {group:"Midfield",role:"Defensive"};
  if(/AM|CAM|ATTACKING MID|LW|RW|WING|LM|RM/.test(p))return {group:"Attacking",role:"Attacking"};
  if(/FW|FWD|ST|CF|STRIKER|FORWARD|ATT/.test(p))return {group:"Attacking",role:"Attacking"};
  if(/CM|CENTRAL MID|MF|MIDFIELD/.test(p))return {group:"Midfield",role:"Balanced"};
  return {group:"Unknown",role:"Balanced"};
}

function extractSquad(teamData){
  const out=new Map();
  const squad=teamData?.squad;
  const sections=Array.isArray(squad)?squad:(Array.isArray(squad?.squad)?squad.squad:[]);
  for(const sec of sections){
    const inherited=s(sec?.position||sec?.title||sec?.name||sec?.role);
    const members=Array.isArray(sec?.members)?sec.members:(Array.isArray(sec?.players)?sec.players:[]);
    for(const p of members){
      const id=s(p?.id||p?.playerId||p?.player?.id);
      const name=s(p?.name||p?.playerName||p?.player?.name||p?.localizedName||p?.shortName);
      if(!id||!name||/coach|manager/i.test(inherited))continue;
      const pos=s(
        p?.positionIdsDesc||
        p?.positionDescription?.primaryPosition?.label||
        p?.position?.short||
        p?.position?.name||
        p?.role?.fallback||
        p?.role?.key||
        p?.position||
        inherited
      );
      const rr=roleFromPosition(pos);
      const mv=n(p?.transferValue);
      out.set(id,{
        playerId:id,playerName:name,positionCode:pos,positionGroup:rr.group,roleClass:rr.role,
        marketValueEur:mv&&mv>0?Math.round(mv):null,
        marketValueText:mv&&mv>0?("€"+Math.round(mv).toLocaleString("en-US")):""
      });
    }
  }
  if(out.size)return [...out.values()];

  const seen=new Set();
  const walk=(node,parentKey="",inherited="")=>{
    if(!node||typeof node!=="object")return;
    if(seen.has(node))return;seen.add(node);
    if(Array.isArray(node)){node.forEach(x=>walk(x,parentKey,inherited));return;}
    const nextInherited=s(node?.position?.short||node?.position?.name||node?.position||node?.role||inherited);
    const id=s(node?.id||node?.playerId),name=s(node?.name||node?.playerName);
    const looksPlayer=id&&name&&/squad|member|player/i.test(parentKey)&&!/coach|manager/i.test(nextInherited);
    if(looksPlayer){
      const rr=roleFromPosition(nextInherited);
      out.set(id,{playerId:id,playerName:name,positionCode:nextInherited,positionGroup:rr.group,roleClass:rr.role});
    }
    for(const [k,v] of Object.entries(node))walk(v,k,nextInherited);
  };
  walk(teamData,"team","");
  return [...out.values()];
}

function findMarketValue(obj){
  const direct=Array.isArray(obj?.marketValues?.values)?obj.marketValues.values:[];
  if(direct.length){
    const latest=[...direct].filter(x=>n(x?.value)>0).sort((a,b)=>new Date(b?.date||0)-new Date(a?.date||0))[0];
    if(latest)return {eur:Math.round(Number(latest.value)),text:"€"+Math.round(Number(latest.value)).toLocaleString("en-US")};
  }
  let best=null;const seen=new Set();
  const walk=(node,key="")=>{
    if(node==null)return;
    if(typeof node==="object"){
      if(seen.has(node))return;seen.add(node);
      if(Array.isArray(node)){node.forEach(x=>walk(x,key));return;}
      for(const [k,v] of Object.entries(node))walk(v,k);
      return;
    }
    if(!/market.?value/i.test(key))return;
    if(typeof node==="number"&&node>0){
      if(!best||node>best.eur)best={eur:Math.round(node),text:"€"+Math.round(node).toLocaleString("en-US")};
    }else if(typeof node==="string"){
      const txt=node.trim();
      const m=txt.replace(/,/g,"").match(/(?:€|EUR\s*)?([\d.]+)\s*([KMB])?/i);
      if(m){
        let val=Number(m[1]),mult=1;
        if((m[2]||"").toUpperCase()==="K")mult=1e3;
        if((m[2]||"").toUpperCase()==="M")mult=1e6;
        if((m[2]||"").toUpperCase()==="B")mult=1e9;
        val*=mult;
        if(val>0&&(!best||val>best.eur))best={eur:Math.round(val),text:txt};
      }
    }
  };
  walk(obj);
  return best;
}

export async function refreshTeamRoster(teamId,teamName,{marketLimit=6}={}){
  if(!teamId)return {players:0,values:0};
  const data=await getJson("/teams?id="+encodeURIComponent(teamId)+"&ccode3=USA");
  const name=s(data?.details?.name||data?.name||teamName);
  const players=extractSquad(data);
  if(!players.length)return {players:0,values:0,teamName:name};
  const vals=[],ph=[];let p=1;
  for(const x of players){
    ph.push("(" + Array(12).fill(0).map(()=>"$"+(p++)).join(",") + ")");
    vals.push(
      x.playerId,x.playerName,String(teamId),name,x.positionCode,x.positionGroup,x.roleClass,
      x.marketValueEur,x.marketValueText,"FotMob",new Date().toISOString(),x.marketValueEur?new Date().toISOString():null
    );
  }
  await db.query(`
    INSERT INTO formula_d_players(player_id,player_name,team_id,team_name,position_code,position_group,role_class,market_value_eur,market_value_text,source,roster_updated_at,value_updated_at)
    VALUES ${ph.join(",")}
    ON CONFLICT(player_id) DO UPDATE SET
      player_name=EXCLUDED.player_name,team_id=EXCLUDED.team_id,team_name=EXCLUDED.team_name,
      position_code=EXCLUDED.position_code,position_group=EXCLUDED.position_group,role_class=EXCLUDED.role_class,
      market_value_eur=COALESCE(EXCLUDED.market_value_eur,formula_d_players.market_value_eur),
      market_value_text=COALESCE(NULLIF(EXCLUDED.market_value_text,''),formula_d_players.market_value_text),
      value_updated_at=CASE WHEN EXCLUDED.market_value_eur IS NOT NULL THEN NOW() ELSE formula_d_players.value_updated_at END,
      source=EXCLUDED.source,roster_updated_at=NOW()
  `,vals);

  const need=marketLimit>0?(await db.query(`
    SELECT player_id FROM formula_d_players
    WHERE team_id=$1 AND market_value_eur IS NULL
    ORDER BY value_updated_at NULLS FIRST LIMIT $2
  `,[String(teamId),marketLimit])).rows||[]:[];
  let values=0;
  for(const row of need){
    try{
      const pd=await getJson("/playerData?id="+encodeURIComponent(row.player_id)+"&includeMarketValues=true");
      const mv=findMarketValue(pd);
      await db.query("UPDATE formula_d_players SET market_value_eur=$2,market_value_text=$3,value_updated_at=NOW() WHERE player_id=$1",
        [String(row.player_id),mv?.eur||null,mv?.text||null]);
      if(mv?.eur)values++;
    }catch(e){}
  }
  return {players:players.length,values,teamName:name};
}

export async function getPlayerKnowledge(teamId,players=[]){
  if(!players.length)return new Map();
  const ids=[...new Set(players.map(x=>s(x?.playerId||x?.id)).filter(Boolean))];
  const names=[...new Set(players.map(x=>s(x?.player||x?.name)).filter(Boolean))];
  const rows=[];
  if(ids.length){
    const q=await db.query("SELECT * FROM formula_d_players WHERE player_id=ANY($1::text[])",[ids]);
    rows.push(...(q.rows||[]));
  }
  if(names.length){
    const q=await db.query("SELECT * FROM formula_d_players WHERE team_id=$1",[String(teamId)]);
    const wanted=new Set(names.map(norm));
    rows.push(...(q.rows||[]).filter(r=>wanted.has(norm(r.player_name))));
  }
  const m=new Map();
  for(const r of rows){
    m.set("id:"+r.player_id,r);
    m.set("name:"+norm(r.player_name),r);
  }
  return m;
}

export function enrichPlayer(p,map){
  if(!p)return null;
  const hit=map.get("id:"+s(p.playerId||p.id))||map.get("name:"+norm(p.player||p.name));
  if(!hit)return p;
  return {...p,playerId:hit.player_id,player:hit.player_name,position:hit.position_code||p.position,
    positionGroup:hit.position_group||p.positionGroup,roleClass:hit.role_class||"Balanced",
    marketValueEur:hit.market_value_eur==null?null:Number(hit.market_value_eur),marketValueText:hit.market_value_text||""};
}

export async function getDirectPlayerKnowledge(p){
  if(!p)return null;
  const id=s(p.playerId||p.id);
  if(!id||!/^[0-9]+$/.test(id))return null;
  const hit=liveProfileCache.get(id);
  if(hit&&Date.now()-hit.ts<6*3600000)return hit.value;
  try{
    const pd=await getJson("/playerData?id="+encodeURIComponent(id)+"&includeMarketValues=true");
    const name=s(pd?.name||pd?.playerName||pd?.player?.name||p.player||p.name);
    const pos=s(
      pd?.positionIdsDesc||
      pd?.positionDescription?.primaryPosition?.label||
      pd?.position?.short||
      pd?.position?.name||
      pd?.role?.fallback||
      pd?.role?.key||
      pd?.position||
      p.position
    );
    const rr=roleFromPosition(pos);
    const mv=findMarketValue(pd);
    const value={
      ...p,
      playerId:id,
      player:name||s(p.player||p.name),
      position:pos||p.position||"?",
      positionGroup:rr.group!=="Unknown"?rr.group:(p.positionGroup||"Unknown"),
      roleClass:rr.role,
      marketValueEur:mv?.eur??p.marketValueEur??null,
      marketValueText:mv?.text??p.marketValueText??"",
      intelligenceSource:"FotMob playerData"
    };
    liveProfileCache.set(id,{ts:Date.now(),value});
    return value;
  }catch(e){
    liveProfileCache.set(id,{ts:Date.now(),value:null});
    return null;
  }
}

export function substitutionImpact(on,off){
  const w={Attacking:2,Balanced:0,Defensive:-2,Goalkeeper:-2};
  const a=w[on?.roleClass]??0,b=w[off?.roleClass]??0;
  let impact=a-b;
  const onV=n(on?.marketValueEur),offV=n(off?.marketValueEur);
  if(onV&&offV){
    if(onV>=offV*1.8)impact+=0.5;
    else if(offV>=onV*1.8)impact-=0.5;
  }
  return Math.max(-3,Math.min(3,impact));
}