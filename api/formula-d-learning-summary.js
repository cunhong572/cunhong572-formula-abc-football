import {requireAuth} from "lib/auth.js";
import {learningSummary} from "lib/formula-d-learning.js";
export const access="public";
export const methods=["GET"];
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  try{return res.json(await learningSummary());}
  catch(e){console.error("formula-d-learning-summary",String(e?.stack||e));return res.status(500).json({error:"Learning summary failed."});}
}