import {requireAuth} from "lib/auth.js";
export const access="public";
export const methods=["POST"];
function days(a,b){
  if(!a||!b)return null;
  return Math.max(0,Math.round((new Date(b+"T12:00:00Z")-new Date(a+"T12:00:00Z"))/86400000)-1);
}
function fatigue(side,matchDate){
  const prev=(side.previous||[]).slice(-1)[0];
  if(!prev)return "—";
  const d=days(prev.date,matchDate);
  return d==null?"—":(d<=3?"累":"不累");
}
function density(side,matchDate){
  const n=(side.next||[]).slice(0,2);
  if(!n.length)return "—";
  let prev=matchDate,tight=0;
  n.forEach(x=>{const d=days(prev,x.date);if(d!=null&&d<=3)tight++;prev=x.date;});
  return tight>=2?"☑️×2":tight===1?"☑️":"❌";
}
function rank(side){return (side.ranking||[]).find(x=>x.focus)?.rank??"—";}
function fullFixture(x,team){
  if(!x)return "";
  if(x.display)return x.display.replace(/\s*-\s*/g," vs ");
  return x.ha==="A"?(x.opponent+" vs "+team):(team+" vs "+x.opponent);
}
function out(side,matchDate){
  return {
    name:side.name,rank:rank(side),fatigue:fatigue(side,matchDate),density:density(side,matchDate),
    form:(side.form||[]).join(""),
    next3:(side.next||[]).slice(0,3).map(x=>({date:x.date,competition:x.competition||"",display:fullFixture(x,side.name)}))
  };
}
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  const b=req.body||{},data=b.data||{};
  if(!data.match||!data.home||!data.away)return res.status(400).json({error:"Formula B input missing."});
  res.json({engineVersion:"Formula B SERVER LOCKED",match:data.match,home:out(data.home,data.match.date),away:out(data.away,data.match.date)});
}