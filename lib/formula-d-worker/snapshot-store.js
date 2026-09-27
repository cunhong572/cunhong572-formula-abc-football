import { db } from "hatchable";
import { canWriteSnapshot } from "lib/formula-d-odds/time-window.js";

export async function saveFormalSnapshot({id,line,odds,kickoff,captureStatus='captured_exact'},target,{owner=null}={}) {
  const now=Date.now(),kickoffMs=Date.parse(kickoff);
  if(!canWriteSnapshot(target.at,now,target)||now>=kickoffMs)return {saved:false,status:null};
  // The unique index, conditional update and database-time gates are the
  // authority across concurrent processes, not a SELECT-then-INSERT check.
  const result=await db.query(`INSERT INTO formula_e_odds_snapshots
    (match_id,sample_kind,selected_line,odds,target_at,capture_status,observed_at)
    SELECT $1,$2,$3,$4,$5::timestamptz,$6,clock_timestamp()
    WHERE clock_timestamp()>=$5::timestamptz AND clock_timestamp()<$7::timestamptz
      AND ($8::text IS NULL OR EXISTS(SELECT 1 FROM formula_e_browser_lease
        WHERE singleton_key='odds' AND owner=$8 AND expires_at>clock_timestamp()))
    ON CONFLICT (match_id,target_at,sample_kind) WHERE target_at IS NOT NULL
    DO UPDATE SET selected_line=EXCLUDED.selected_line,odds=EXCLUDED.odds,
      capture_status=EXCLUDED.capture_status,observed_at=EXCLUDED.observed_at
    WHERE formula_e_odds_snapshots.capture_status IN ('partial','failed','failed_source_not_found')
      AND clock_timestamp()>=$5::timestamptz AND clock_timestamp()<$7::timestamptz
      AND ($8::text IS NULL OR EXISTS(SELECT 1 FROM formula_e_browser_lease
        WHERE singleton_key='odds' AND owner=$8 AND expires_at>clock_timestamp()))
    RETURNING id,capture_status`,[id,target.kind,line,odds,new Date(target.at).toISOString(),captureStatus,kickoff,owner]);
  if(result.rows?.length)return {saved:true,status:result.rows[0].capture_status||captureStatus};
  const existing=await db.query('SELECT capture_status FROM formula_e_odds_snapshots WHERE match_id=$1 AND target_at=$2::timestamptz AND sample_kind=$3',[id,new Date(target.at).toISOString(),target.kind]);
  const status=existing.rows?.[0]?.capture_status;
  return {saved:/^captured_(exact|retry|fallback)$/.test(status||''),status:status||null};
}
