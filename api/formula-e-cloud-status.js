import { cloudStatus } from "lib/formula-e-cloud.js";
import { requireAuth } from "lib/auth.js";
export const access = "public";
export const methods = ["GET"];
export default async function(req,res){
  const user=await requireAuth(req,res); if(!user)return;
  try{res.json({ok:true,cloud:await cloudStatus()});}
  catch(e){res.status(500).json({error:String(e?.message||e)});}
}