import { inRecentWindow } from "lib/formula-c/rolling-window.js";
function number(v){return v==null?null:Number.isFinite(Number(v))?Number(v):null;}
function clamp(v,n){return Math.max(-n,Math.min(n,v));}
function formationAttack(value){
  const groups=String(value||'').split('-').map(Number);
  return groups.length>=3&&groups.every(Number.isFinite)?groups[groups.length-1]:null;
}
export function liveTactics(live={},minute=live.minute){
  const source=Array.isArray(live.substitutionEvents)?live.substitutionEvents:live.lastSubstitution?[live.lastSubstitution]:[];
  const substitutions=source.filter(s=>inRecentWindow(s.minute,minute));
  let attacking=0,defensive=0,balanced=0,substitutionWeight=0;
  for(const s of substitutions){
    const impact=number(s.playerImpact);
    const direction=impact?clamp(impact,3):s.type==='Attacking Sub'?2:s.type==='Defensive Sub'?-2:0;
    if(direction>0)attacking++;else if(direction<0)defensive++;else balanced++;
    substitutionWeight+=direction;
  }
  const cards=(live.cardEvents||[]).filter(s=>inRecentWindow(s.minute,minute));
  const recentRed=cards.filter(s=>s.color==='red').length,recentYellow=cards.filter(s=>s.color==='yellow').length;
  const changes=(live.formationChanges|| (live.formationChange?[live.formationChange]:[])).filter(s=>inRecentWindow(s.minute,minute));
  let formationWeight=0,committedWeight=0;
  for(const c of changes){
    const before=formationAttack(c.from),after=formationAttack(c.to);
    if(before!==null&&after!==null)formationWeight+=clamp(after-before,2);
    const previous=number(c.attackingPlayersBefore),current=number(c.attackingPlayersAfter);
    if(previous!==null&&current!==null)committedWeight+=clamp(current-previous,2);
  }
  const redCards=number(live.redCards)??0;
  // A historical red card persists as lineup state, not a recent event.
  const tacticalBoost=clamp(substitutionWeight,3)+clamp(formationWeight+committedWeight,3)-redCards*2-recentYellow*.25;
  return {attacking,defensive,balanced,recentSub:substitutions.length>0,substitutionWeight,
    recentRed,recentYellow,formationWeight,committedWeight,tacticalBoost,
    redCards,yellowCardBurden:number(live.yellowCards)??0,
    recentEventWeight:clamp(substitutionWeight,3)+clamp(formationWeight+committedWeight,3)-recentRed*2-recentYellow*.25};
}
