import {requireAuth} from "lib/auth.js";
import {backtestMatch} from "lib/formula-d-learning.js";
export const access="public";
export const methods=["POST"];
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  const matchId=String(req.body?.matchId||"");
  if(!matchId)return res.status(400).json({error:"matchId required"});
  try{await backtestMatch(matchId);return res.json({ok:true,matchId});}
  catch(e){console.error("formula-d-learning-backtest",String(e?.stack||e));return res.status(500).json({error:"Backtest failed."});}
}