import { requireAuth } from "lib/auth.js";
import { getDailyUsage,TOTAL_USAGE_CATEGORY,SCAN_USAGE_CATEGORY } from "lib/formula-usage.js";

export const access="public";
export const methods=["GET"];

export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  try{
    const [total,scan]=await Promise.all([
      getDailyUsage(TOTAL_USAGE_CATEGORY),
      getDailyUsage(SCAN_USAGE_CATEGORY)
    ]);
    return res.json({ok:true,total,scan});
  }catch(e){
    console.error("usage-today",String(e?.stack||e));
    return res.status(500).json({error:"Usage meter unavailable."});
  }
}