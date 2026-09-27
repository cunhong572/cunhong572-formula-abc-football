import { checkpointFor } from "lib/formula-d-worker/timeline.js";
import { captureTargets } from "lib/formula-d-odds/time-window.js";

export function taskPriority({reason='scheduled',targets=[],targetAt=null}={}) {
  if(reason==='t5')return 100;
  if(reason==='t60')return 80;
  if(reason==='timeline') {
    const kinds=targets.map(t=>checkpointFor(t,targetAt)?.kind);
    return kinds.includes('last_5min')?100:kinds.includes('last_1hr')?80:60;
  }
  return reason==='manual'?20:10;
}
export function reservedPriority(targets,now=Date.now()) {
  let priority=0;
  for(const t of targets)for(const cp of captureTargets(Date.parse(t.kickoff))) {
    if(now<cp.at-90000||now>cp.at+10*60000||now>=Date.parse(t.kickoff))continue;
    priority=Math.max(priority,cp.kind==='last_5min'?100:cp.kind==='last_1hr'?80:60);
  }
  return priority;
}

export function taskExpired({reason,targetAt,targets=[]},now=Date.now()) {
  if(!['timeline','t60','t5'].includes(reason)||!targetAt)return false;
  const anchor=Date.parse(targetAt);
  if(!Number.isFinite(anchor))return true;
  const due=targets.map(t=>checkpointFor(t,targetAt)).filter(Boolean);
  const deadlines=due.map(cp=>cp.at+(cp.kind==='last_5min'?5:10)*60000);
  return now>=Math.max(...(deadlines.length?deadlines:[anchor+(reason==='t5'?5:10)*60000]));
}
