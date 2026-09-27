import {requireAuth} from "lib/auth.js";
import {historicalSummary} from "lib/formula-d-historical.js";
export const access="public";
export const methods=["GET"];
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  try{return res.json(await historicalSummary());}
  catch(e){console.error("historical-summary",String(e?.stack||e));return res.status(500).json({error:"Historical summary failed."});}
}