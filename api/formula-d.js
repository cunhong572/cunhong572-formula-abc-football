import {requireAuth} from "lib/auth.js";
import {evaluateLiveIntent,computeGTI,FORMULA_D_INTENTS} from "lib/formula-d-engine.js";
import {getFormulaDWeights} from "lib/formula-d-config.js";
export const access="public"; export const methods=["POST"];
export default async function(req,res){
 const user=await requireAuth(req,res);if(!user)return;
 const b=req.body||{},minute=Number(b.minute),hg=Number(b.homeGoals),ag=Number(b.awayGoals);
 if(!Number.isFinite(minute)||!Number.isFinite(hg)||!Number.isFinite(ag))return res.status(400).json({error:"Invalid live match input."});
 const weightState=await getFormulaDWeights(),weights=weightState.config;
 const ha=evaluateLiveIntent(hg,ag,minute,b.homeRank,b.awayRank,b.homeLive||{},weights);
 const aa=evaluateLiveIntent(ag,hg,minute,b.awayRank,b.homeRank,b.awayLive||{},weights);
 const gti=computeGTI(ha.metrics,aa.metrics,b.matchMetrics||{},weights);
 res.json({engineVersion:"Formula D v2 · PT/PI/RSI/SS/AS/GTI",intents:FORMULA_D_INTENTS,gti,homeIntent:ha.intent,awayIntent:aa.intent,homeAnalysis:ha,awayAnalysis:aa,weightConfig:weightState});
}