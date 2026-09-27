import { db } from "hatchable";
import {backtestMatch} from "lib/formula-d-learning.js";
import { trackedFetch } from "lib/tracked-fetch.js";
export const access="scheduler";
export const schedule="15 * * * *";

const BASE="https://www.fotmob.com/api/data";
async function getJson(path){
  const r=await trackedFetch(BASE+path,{timeout_ms:12000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
  if(!r.ok)throw new Error("Live provider HTTP "+r.status);
  return await r.json();
}
function scorePair(detail){
  const s=detail?.header?.status?.scoreStr||"";
  const m=String(s).match(/(\d+)\s*-\s*(\d+)/);
  if(m)return [Number(m[1]),Number(m[2])];
  return [Number(detail?.header?.teams?.[0]?.score)||0,Number(detail?.header?.teams?.[1]?.score)||0];
}
export default async function(req,res){
  try{
    const q=await db.query(`
      SELECT DISTINCT s.match_id
      FROM formula_d_snapshots s
      LEFT JOIN formula_d_match_results r ON r.match_id=s.match_id
      WHERE s.observed_at > NOW()-INTERVAL '2 days'
        AND r.match_id IS NULL
      ORDER BY s.match_id
      LIMIT 80
    `);
    let finalized=0,checked=0;
    for(const row of q.rows||[]){
      checked++;
      try{
        const detail=await getJson("/matchDetails?matchId="+encodeURIComponent(row.match_id));
        const finished=!!detail?.header?.status?.finished;
        if(!finished)continue;
        const [hg,ag]=scorePair(detail);
        const home=detail?.general?.homeTeam?.name||"",away=detail?.general?.awayTeam?.name||"";
        const competition=detail?.general?.leagueName||"";
        await db.query(`
          INSERT INTO formula_d_match_results(match_id,competition,home_name,away_name,home_goals,away_goals,finished_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW())
          ON CONFLICT(match_id) DO UPDATE SET competition=EXCLUDED.competition,home_name=EXCLUDED.home_name,away_name=EXCLUDED.away_name,
            home_goals=EXCLUDED.home_goals,away_goals=EXCLUDED.away_goals,finished_at=EXCLUDED.finished_at,updated_at=NOW()
        `,[String(row.match_id),competition,home,away,hg,ag]);
        await backtestMatch(String(row.match_id));
        finalized++;
      }catch(e){console.error("learning finalize match",row.match_id,String(e?.message||e));}
    }
    return res.json({ok:true,checked,finalized});
  }catch(e){
    console.error("formula-d-learning-finalize",String(e?.stack||e));
    return res.status(500).json({error:"Learning finalizer failed."});
  }
}