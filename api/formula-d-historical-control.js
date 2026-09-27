import { db, scheduler } from "hatchable";
import { requireAuth } from "lib/auth.js";

export const access="public";
export const methods=["POST"];

export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  const enabled=req.body?.enabled===true;
  await db.query(
    "UPDATE formula_d_historical_scan_state SET manual_enabled=$1,status=CASE WHEN $1 THEN 'running' ELSE 'stopped' END,updated_at=NOW() WHERE id=1",
    [enabled]
  );
  if(enabled){
    try{
      await scheduler.now("/api/formula-d-historical-scan",{source:"manual-control"});
    }catch(e){
      await db.query("UPDATE formula_d_historical_scan_state SET manual_enabled=false,status='stopped',updated_at=NOW() WHERE id=1");
      throw e;
    }
  }
  const state=(await db.query("SELECT manual_enabled,status,cursor_date,end_date,scan_in_progress FROM formula_d_historical_scan_state WHERE id=1")).rows?.[0]||{};
  return res.json({ok:true,...state,continuous:enabled,batchIntervalMinutes:enabled?10:null});
}