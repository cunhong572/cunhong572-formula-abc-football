import { db } from "hatchable";
import { validOdds } from "lib/formula-d-odds/odds-selector.js";

export function auditStage(detail){
  const s=String(detail||"").toLowerCase();
  if(s.includes("team row not unique"))return "TEAM_MATCH";
  if(s.includes("first half o/u column missing"))return "FIRST_HALF_OU";
  if(s.includes("fixture container not found"))return "FIXTURE_ROW";
  if(s.includes("kickoff missing"))return "KICKOFF";
  if(s.includes("market missing"))return "MARKET_PARSE";
  if(s.includes("price unresolved"))return "ODDS_PARSE";
  if(s.includes("rollover blocked"))return "LINE_LOCK";
  return s?"UNKNOWN":"SUCCESS";
}
export function diagnosticFor(target,diagnostic){
  const prefix=`${target.home} vs ${target.away}:`;
  const parts=String(diagnostic||"").split(";").map(x=>x.trim()).filter(Boolean);
  return parts.filter(x=>x.startsWith(prefix)).join("; ").slice(0,1200);
}
export async function writeScanAudit({reason,targets,items,diagnostic,pendingRolloverIds=[]}){
  const byId=new Map((items||[]).map(x=>[Number(x.id),x]));
  const pending=new Set((pendingRolloverIds||[]).map(Number));
  for(const target of targets||[]){
    const item=byId.get(Number(target.id));
    const rawDetail=diagnosticFor(target,diagnostic);
    const status=item?(pending.has(Number(target.id))?"pending_rollover":"success"):"failed";
    const stage=item?(pending.has(Number(target.id))?"LINE_LOCK":"SUCCESS"):auditStage(rawDetail);
    const detail=status==="success"?null:rawDetail||null;
    await db.query(
      "INSERT INTO formula_e_scan_audit(match_id,home,away,reason,status,stage,detail,selected_line,odds,kickoff_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz)",
      [Number(target.id),target.home,target.away,String(reason||""),status,stage,detail,item?.line||null,validOdds(item?.odds),item?.kickoff||target.kickoff||null]
    );
  }
  await db.query("DELETE FROM formula_e_scan_audit WHERE id NOT IN (SELECT id FROM formula_e_scan_audit ORDER BY id DESC LIMIT 500)");
}

