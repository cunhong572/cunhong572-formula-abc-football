import { db, scheduler } from "hatchable";
import { requireAuth } from "lib/auth.js";
import { trackedFetch } from "lib/tracked-fetch.js";

export const access = "public";
export const methods = ["GET","POST","DELETE"];

function norm(value){
  return String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
}
function keyFor(home,away){return norm(home)+"__"+norm(away);}
function toNum(value){if(value===null||value===undefined||String(value).trim()==="")return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function lineValue(value){
  const parts=String(value||"").trim().split("/").map(Number);
  if(!parts.length||parts.some(x=>!Number.isFinite(x)))return NaN;
  return parts.reduce((a,b)=>a+b,0)/parts.length;
}
function sameLine(a,b){
  const av=lineValue(a),bv=lineValue(b);
  if(Number.isFinite(av)&&Number.isFinite(bv))return Math.abs(av-bv)<1e-9;
  return String(a||"").trim()===String(b||"").trim();
}
function etDate(offsetDays=0){
  const d=new Date(Date.now()+offsetDays*86400000);
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const get=t=>parts.find(x=>x.type===t)?.value||"";
  return get("year")+get("month")+get("day");
}
function teamEq(a,b){
  const x=norm(a),y=norm(b);
  return x===y||(x.length>=5&&y.includes(x))||(y.length>=5&&x.includes(y));
}
async function resolveKickoff(home,away){
  for(const off of [-1,0,1,2]){
    try{
      const r=await trackedFetch("https://www.fotmob.com/api/data/matches?date="+etDate(off)+"&ccode3=USA",{
        timeout_ms:8000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}
      });
      if(!r.ok)continue;
      const j=await r.json();
      for(const l of Array.isArray(j?.leagues)?j.leagues:[]){
        for(const m of Array.isArray(l?.matches)?l.matches:[]){
          if(teamEq(m?.home?.name,home)&&teamEq(m?.away?.name,away)){
            const raw=m?.status?.utcTime||m?.time||null;
            if(raw&&Number.isFinite(Date.parse(raw)))return new Date(raw).toISOString();
          }
        }
      }
    }catch(_){}
  }
  return null;
}
function view(row){
  return {
    id:Number(row.id), home:row.input_home, away:row.input_away,
    kickoff:row.kickoff_at, line:row.track_line||row.selected_line, current:toNum(row.track_current),
    status:row.status, source:row.source_name, detail:row.source_detail,
    hourly:(row.hourly||[]).map(toNum).filter(v=>v!==null),
    oneHour:toNum(row.one_hour), fiveMinutes:toNum(row.five_minutes),
    segmentIndex:Number(row.segment_index||0), continuation:Number(row.segment_index||0)>0
  };
}
async function list(){
  const r=await db.query(`
    WITH line_rows AS (
      SELECT s.match_id,s.selected_line AS track_line,MIN(s.created_at) AS first_seen
      FROM formula_e_odds_snapshots s
      WHERE s.selected_line IS NOT NULL
      GROUP BY s.match_id,s.selected_line
      UNION ALL
      SELECT m.id,m.selected_line,m.created_at
      FROM formula_e_matches m
      WHERE m.selected_line IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM formula_e_odds_snapshots s
          WHERE s.match_id=m.id AND s.selected_line=m.selected_line
        )
    ),
    ordered AS (
      SELECT match_id,track_line,
        ROW_NUMBER() OVER(PARTITION BY match_id ORDER BY first_seen,track_line)-1 AS segment_index
      FROM line_rows
    )
    SELECT m.*,o.track_line,o.segment_index,
      COALESCE(
        (SELECT s.odds FROM formula_e_odds_snapshots s WHERE s.match_id=m.id AND s.selected_line=o.track_line AND s.sample_kind='baseline' ORDER BY s.created_at LIMIT 1),
        CASE WHEN o.track_line=m.selected_line THEN m.current_odds END
      ) AS track_current,
      COALESCE((
        SELECT json_agg(s.odds ORDER BY CASE s.sample_kind
          WHEN 't11h' THEN 1 WHEN 't10h' THEN 2 WHEN 't9h' THEN 3
          WHEN 't8h' THEN 4 WHEN 't7h' THEN 5 WHEN 't6h' THEN 6
          WHEN 't5h' THEN 7 WHEN 't4h' THEN 8 WHEN 't3h' THEN 9
          WHEN 't2h' THEN 10 ELSE 99 END)
        FROM formula_e_odds_snapshots s
        WHERE s.match_id=m.id AND s.selected_line=o.track_line
          AND s.sample_kind ~ '^t(11|10|9|8|7|6|5|4|3|2)h$'
      ),'[]'::json) AS hourly,
      (SELECT s.odds FROM formula_e_odds_snapshots s WHERE s.match_id=m.id AND s.selected_line=o.track_line AND s.sample_kind='last_1hr' ORDER BY s.created_at LIMIT 1) AS one_hour,
      (SELECT s.odds FROM formula_e_odds_snapshots s WHERE s.match_id=m.id AND s.selected_line=o.track_line AND s.sample_kind='last_5min' ORDER BY s.created_at LIMIT 1) AS five_minutes
    FROM formula_e_matches m
    LEFT JOIN ordered o ON o.match_id=m.id
    ORDER BY m.id ASC,COALESCE(o.segment_index,0) ASC
  `);
  return r.rows.map(view);
}
function parseLine(line){
  const raw=String(line||"").trim();
  const p=raw.split(/\s+(?:vs\.?|v)\s+/i);
  let home="",away="";
  if(p.length>=2){
    home=p[0].trim();
    away=p.slice(1).join(" vs ").trim();
  }else{
    const pair=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(pair.length!==2)return null;
    [home,away]=pair;
  }
  // "Draw" is a 1X2 betting option, never a football team.
  if(/^draw$/i.test(home)||/^draw$/i.test(away))return null;
  return {home,away};
}
export default async function(req,res){
  const user=await requireAuth(req,res); if(!user)return;
  try{
    const body=req.body||{};
    if(body.action==="connector_config") return res.json({
      firstHalfOuCellIndex:6,
      selectionRule:"Scan the entire multi-row FIRST HALF O/U group for the fixture. Keep following the locked line anywhere in that group. Only when the locked line is absent from the whole group may a verified continuation row be opened using the currently offered Over closest to 1.88.",
      updatedAt:"2026-09-26"
    });
    if(req.method==="GET"||body.action==="list") return res.json({matches:await list(),sourceReady:false});
    if(req.method==="DELETE"||body.action==="delete"){
      const id=Number(body.id); if(!Number.isInteger(id))return res.status(400).json({error:"Invalid match id."});
      await db.query("DELETE FROM formula_e_matches WHERE id=$1",[id]);
      return res.json({ok:true,matches:await list()});
    }
    if(body.action==="add"){
      const raw=Array.isArray(body.fixtures)?body.fixtures:[];
      const parsed=raw.map(parseLine).filter(Boolean).slice(0,20);
      if(!parsed.length)return res.status(400).json({error:"Enter at least one fixture as Home vs Away."});
      // Formula E tracks one current batch. A new pasted list replaces the
      // previous batch instead of silently accumulating old fixtures.
      await db.query("DELETE FROM formula_e_matches");
      for(const item of parsed){
        const kickoff=await resolveKickoff(item.home,item.away);
        await db.query(`
          INSERT INTO formula_e_matches(input_home,input_away,normalized_key,kickoff_at,status,source_detail)
          VALUES($1,$2,$3,$4::timestamptz,'pending_source',
            CASE WHEN $4::timestamptz IS NOT NULL
              THEN 'Kickoff resolved independently; waiting for authorised odds-source connection.'
              ELSE 'Waiting for authorised odds-source connection.'
            END)
          ON CONFLICT(normalized_key) DO NOTHING
        `,[item.home,item.away,keyFor(item.home,item.away),kickoff]);
      }
      try{
        await scheduler.at(new Date(),"/api/formula-e-cloud-once",{
          name:"formula-e-cloud-initial",
          payload:{kind:"initial"}
        });
      }catch(e){
        console.error("formula-e initial cloud schedule",String(e?.message||e));
      }
      return res.json({ok:true,matches:await list()});
    }
    if(body.action==="ingest"){
      const items=Array.isArray(body.items)?body.items.slice(0,50):[];
      let accepted=0;
      const nowMs=Date.now();
      const hourKey=new Date(nowMs).toISOString().slice(0,13);
      for(const item of items){
        const id=Number(item?.id), odds=Number(item?.odds);
        if(!Number.isInteger(id)||!Number.isFinite(odds)||odds<=1||odds>20)continue;
        const line=String(item?.line||"").trim().slice(0,20)||null;
        const kickoffRaw=String(item?.kickoff||"").trim();
        const kickoffMs=kickoffRaw?Date.parse(kickoffRaw):NaN;
        const kickoff=Number.isFinite(kickoffMs)?kickoffRaw:null;
        // A valid Formula E sample must have its exact first-half O/U line
        // and a confirmed kickoff. Never let an empty scan erase kickoff.
        if(!line||!kickoff)continue;

        // Do not write new odds after the scheduled kickoff. A one-minute
        // tolerance avoids clock-skew right on the boundary.
        const minutesToKickoff=(kickoffMs-nowMs)/60000;
        if(minutesToKickoff < -1)continue;

        const prior=await db.query("SELECT sample_kind FROM formula_e_odds_snapshots WHERE match_id=$1 AND selected_line=$2",[id,line]);
        const kinds=new Set((prior.rows||[]).map(r=>String(r.sample_kind||"")));

        const baseline=await db.query("SELECT selected_line,current_odds FROM formula_e_matches WHERE id=$1",[id]);
        const lockedLine=String(baseline.rows?.[0]?.selected_line||"").trim();
        const lockedOdds=toNum(baseline.rows?.[0]?.current_odds);
        const inT12Window=Math.abs(minutesToKickoff-12*60)<=3;
        const within12Hours=minutesToKickoff<=12*60 && minutesToKickoff>0;
        const rollover=Boolean(item?.rollover===true && item?.rolloverVerified===true && lockedLine && !sameLine(line,lockedLine));

        // A connector may change an already locked line ONLY when it explicitly
        // verified the old line is absent from the fixture's entire multi-row
        // FIRST HALF O/U group. Ordinary mismatches remain blocked.
        if(lockedLine && !sameLine(line,lockedLine) && !rollover)continue;

        // Preserve the old locked line before switching, even if an early build
        // somehow missed creating its baseline snapshot.
        if(rollover && lockedLine && lockedOdds){
          await db.query(
            "INSERT INTO formula_e_odds_snapshots(match_id,sample_kind,selected_line,odds,observed_at) VALUES($1,'baseline',$2,$3,now()) ON CONFLICT DO NOTHING",
            [id,lockedLine,lockedOdds]
          );
        }

        // If added within 12 hours of kickoff, lock immediately using the same
        // closest-to-1.88 baseline rule; if added earlier, wait until T-12.
        const baselineNow=within12Hours;
        const updated=await db.query(`UPDATE formula_e_matches
          SET kickoff_at=COALESCE($1::timestamptz,kickoff_at),
              selected_line=CASE
                WHEN $7 THEN $2
                WHEN $5 AND selected_line IS NULL THEN $2
                ELSE selected_line
              END,
              current_odds=CASE
                WHEN $7 THEN $3
                WHEN $5 AND current_odds IS NULL THEN $3
                ELSE current_odds
              END,
              status='active',
              source_detail=CASE
                WHEN $7 THEN 'Locked line disappeared; connector continued on a new closest-to-1.88 line.'
                WHEN $6 THEN 'T-12 baseline captured and locked.'
                WHEN $5 THEN 'Within 12h: immediate baseline captured and locked.'
                ELSE source_detail
              END,
              updated_at=now()
          WHERE id=$4 RETURNING id`,[kickoff,line,odds,id,baselineNow,inT12Window,rollover]);
        if(!updated.rows?.length)continue;
        if(baselineNow || rollover){
          await db.query(
            "INSERT INTO formula_e_odds_snapshots(match_id,sample_kind,selected_line,odds,observed_at) VALUES($1,'baseline',$2,$3,now()) ON CONFLICT DO NOTHING",
            [id,line,odds]
          );
        }

        const targets=[];
        for(let h=12;h>=2;h--)targets.push({kind:'t'+h+'h',minutes:h*60});
        targets.push({kind:'last_1hr',minutes:60},{kind:'last_5min',minutes:5});
        for(const target of targets){
          if(kinds.has(target.kind))continue;
          const toleranceMinutes=target.kind==="last_5min"?1:3;
          if(Math.abs(minutesToKickoff-target.minutes)<=toleranceMinutes){
            await db.query(`INSERT INTO formula_e_odds_snapshots(match_id,sample_kind,selected_line,odds)
              VALUES($1,$2,$3,$4)
              ON CONFLICT DO NOTHING`,[id,target.kind,line,odds]);
          }
        }
        accepted++;
      }
      return res.json({ok:true,accepted,matches:await list()});
    }
    return res.status(400).json({error:"Unsupported Formula E action."});
  }catch(err){
    console.error("formula-e error",String(err?.stack||err));
    res.status(500).json({error:"Formula E operation failed.",detail:String(err?.message||err)});
  }
}