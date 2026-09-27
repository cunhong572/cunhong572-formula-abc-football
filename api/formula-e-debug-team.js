import { debugTeamSearch } from "lib/formula-e-cloud.js";

export const access = "scheduler";
export const methods = ["POST"];

export default async function(req,res){
  const home=String(req.body?.home||"").trim();
  const away=String(req.body?.away||"").trim();
  if(!home||!away)return res.status(400).json({error:"home and away required"});
  const result=await debugTeamSearch({home,away});
  return res.json(result);
}