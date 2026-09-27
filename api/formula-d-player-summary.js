import { db } from "hatchable";
import { requireAuth } from "lib/auth.js";
export const access="public";
export const methods=["GET"];
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  try{
    const c=(await db.query(`SELECT COUNT(*)::int players,COUNT(DISTINCT team_id)::int teams,COUNT(market_value_eur)::int values,
      COUNT(*) FILTER(WHERE role_class='Attacking')::int attacking,
      COUNT(*) FILTER(WHERE role_class='Defensive')::int defensive,
      COUNT(*) FILTER(WHERE role_class='Balanced')::int balanced
      FROM formula_d_players`)).rows?.[0]||{};
    const st=(await db.query("SELECT * FROM formula_d_roster_scan_state WHERE id=1")).rows?.[0]||{};
    return res.json({counts:c,state:st});
  }catch(e){return res.status(500).json({error:"Player registry summary failed."});}
}