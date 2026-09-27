import {requireAuth} from "lib/auth.js";
export const access="public";
export const methods=["POST"];
function dateGap(lastDate,matchDate){
  if(!lastDate||!matchDate)return "—";
  const a=new Date(lastDate+"T12:00:00Z"),b=new Date(matchDate+"T12:00:00Z");
  const d=Math.round((b-a)/86400000)-1;
  return d>=0?String(d):"—";
}
function stateFromForm(arr){
  if(!Array.isArray(arr)||!arr.length)return "—";
  const pts=arr.reduce((s,r)=>s+(r==="W"?3:r==="D"?1:0),0);
  const ppg=pts/arr.length;
  if(arr.length>=5&&ppg>=2.7)return "很好";
  if(ppg>=2)return "好";
  if(ppg>=1)return "一般";
  if(ppg>=0.4)return "差";
  return "很差";
}
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  const b=req.body||{};
  const form=(b.form||[]).filter(x=>["W","D","L"].includes(x)).slice(0,5);
  res.json({days:dateGap(b.previousDate,b.matchDate),formText:form.length?form.join(" / "):"—",state:stateFromForm(form)});
}