import { formatFormulaBResult } from "lib/formula-b/worksheet-model.js";
import {requireAuth} from "lib/auth.js";
import { prematchHandler, analyzeSuppliedData } from "lib/formula-b-engine.js";
export const access="public";
export const methods=["POST"];
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  const body=req.body||{},data=body.data;
  if(data&&(!data.match||!data.home||!data.away))return res.status(400).json({error:"Formula B input missing."});
  if(!data&&(!body.home||!body.away))return res.status(400).json({error:"Formula B input missing."});
  const send=result=>res.json(formatFormulaBResult(result));
  if(!data||(data.match.fixtureId&&data.match.leagueId)){
    const proxy={status(code){res.status(code);return this;},json(result){return result.home&&result.away?send(result):res.json(result);}};
    return prematchHandler({...req,body:{...body,home:data?.home?.name||body.home,away:data?.away?.name||body.away}},proxy);
  }
  return send(analyzeSuppliedData(data));
}
