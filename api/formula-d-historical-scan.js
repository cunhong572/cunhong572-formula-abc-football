import { db, scheduler } from "hatchable";
import {runHistoricalScan} from "lib/formula-d-historical.js";
import {getDailyUsage,isDailyUsageCapError} from "lib/formula-usage.js";

export const access="scheduler";
export const methods=["POST"];

const NEXT_BATCH_MS=10*60*1000;
const TASK_NAME="formula-d-historical-manual-continuous";

export default async function(req,res){
  const lock=(await db.query(
    "UPDATE formula_d_historical_scan_state SET scan_in_progress=true,status='running',updated_at=NOW() WHERE id=1 AND manual_enabled=true AND scan_in_progress=false RETURNING cursor_date,end_date"
  )).rows?.[0];
  if(!lock)return res.json({ok:true,skipped:true,reason:"Historical scan is stopped or another batch is already running."});

  let result;
  let dailyCap=false;
  try{
    result=await runHistoricalScan(5,24);
    const current=(await db.query("SELECT manual_enabled,cursor_date,end_date FROM formula_d_historical_scan_state WHERE id=1")).rows?.[0]||{};
    const mainComplete=String(current.cursor_date||"")>String(current.end_date||"");
    const complete=result?.scope==="nations"?Boolean(result?.complete):(Boolean(result?.complete)&&mainComplete);
    if(current.manual_enabled&&!complete){
      await scheduler.at(new Date(Date.now()+NEXT_BATCH_MS),"/api/formula-d-historical-scan",{name:TASK_NAME});
    }
    return res.json({ok:true,...result,continuous:Boolean(current.manual_enabled&&!complete),nextBatchMinutes:current.manual_enabled&&!complete?10:null});
  }catch(e){
    if(isDailyUsageCapError(e)){
      dailyCap=true;
      const usage=await getDailyUsage();
      await scheduler.at(new Date(Date.now()+60*60*1000),"/api/formula-d-historical-scan",{name:TASK_NAME});
      return res.json({ok:true,paused:true,reason:"daily_mb_cap",usage,nextRetryMinutes:60});
    }
    console.error("historical-scan",String(e?.stack||e));
    return res.status(500).json({error:"Historical scan failed.",detail:String(e?.message||e)});
  }finally{
    const overallComplete=Boolean(result?.scope==="nations"&&result?.complete);
    await db.query(
      "UPDATE formula_d_historical_scan_state SET scan_in_progress=false,status=CASE WHEN $1 THEN 'complete' WHEN $2 THEN 'daily_cap' WHEN manual_enabled THEN 'running' ELSE 'stopped' END,updated_at=NOW() WHERE id=1",
      [overallComplete,dailyCap]
    );
  }
}