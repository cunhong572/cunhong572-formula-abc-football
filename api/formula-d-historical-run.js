import { db } from "hatchable";
import {requireAuth} from "lib/auth.js";
import {runHistoricalScan} from "lib/formula-d-historical.js";
export const access="public";
export const methods=["POST"];
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  const state=(await db.query("SELECT manual_enabled FROM formula_d_historical_scan_state WHERE id=1")).rows?.[0];
  if(!state?.manual_enabled)return res.status(409).json({error:"Start historical scanning first."});
  try{return res.json({ok:true,...await runHistoricalScan(3,18)});}
  catch(e){console.error("historical-run",String(e?.stack||e));return res.status(500).json({error:"Historical scan failed."});}
}