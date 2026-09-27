import { scheduler } from "hatchable";
import { requireAuth } from "lib/auth.js";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const user=await requireAuth(req,res); if(!user)return;
  try{
    const task=await scheduler.at(new Date(),"/api/formula-e-cloud-once",{name:"formula-e-cloud-manual",payload:{kind:"manual"}});
    res.json({ok:true,queued:true,task});
  }catch(e){res.status(500).json({error:String(e?.message||e)});}
}