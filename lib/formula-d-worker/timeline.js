import { captureTargets, canWriteSnapshot } from "lib/formula-d-odds/time-window.js";

export function checkpointFor(target, targetAt) {
  const anchor=Date.parse(String(targetAt||''));
  return captureTargets(Date.parse(target.kickoff)).find(cp=>cp.at===anchor)||null;
}
export function sourceDates(targets) {
  return [...new Set(targets.map(t=>{
    const date=new Date(t.kickoff);
    if(!Number.isFinite(date.getTime()))return '';
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit'}).formatToParts(date);
    return parts.find(p=>p.type==='month').value+'/'+parts.find(p=>p.type==='day').value;
  }).filter(Boolean))];
}
export function captureStatus({fallback=false,retryAttempt=0}={}) {
  return fallback?'captured_fallback':retryAttempt>0?'captured_retry':'captured_exact';
}

// Navigation and extraction are injected browser boundaries. Each read is a
// fresh extract() of only missing fixtures; a confirmed value never gets replaced.
export async function captureTimeline({targets,targetAt,retryAttempt=0,navigate,read,entries,
  checkpoint=async()=>{},now=()=>Date.now()}) {
  const items=new Map(),attempts=[],diagnostics=[];
  const active=()=>targets.filter(t=>!items.has(Number(t.id))).filter(t=>{
    const cp=checkpointFor(t,targetAt);
    return cp&&canWriteSnapshot(cp.at,now(),cp)&&now()<Date.parse(t.kickoff);
  });
  const visit=async(source,fallback)=>{
    await checkpoint();
    const missing=active();
    if(!missing.length)return false;
    let probe;
    try {
      const ready=await navigate(source);
      await checkpoint();
      if(!ready)probe={items:[],diagnostic:'page list empty or source not ready'};
      else probe=await read(active(),{fast:!fallback});
    } catch(error) {
      if(error?.code==='WORKER_YIELD')throw error;
      probe={items:[],diagnostic:String(error?.message||error)};
    }
    await checkpoint();
    for(const item of probe.items||[]) {
      const target=active().find(t=>Number(t.id)===Number(item.id));
      // Rollover still needs the existing independent confirmation workflow.
      if(!target||item.rollover)continue;
      items.set(Number(item.id),{...item,targetAt,captureStatus:captureStatus({fallback,retryAttempt}),captureSource:source});
    }
    const detail=probe.diagnostic||'';
    attempts.push({source,fallback,found:(probe.items||[]).length,detail});
    if(detail)diagnostics.push(detail);
    return /candidates=0|team row not unique|empty|FIRST HALF.*(?:missing|not found)/i.test(detail);
  };
  const base=['early',...sourceDates(targets).map(d=>'date:'+d),'today'];
  for(const source of base) {
    if(!active().length)break;
    if(await visit(source,false))break; // immediately switch to full recovery
  }
  if(active().length) {
    for(const source of [...base,'favorites']) {
      if(!active().length)break;
      await visit(source,true);
    }
    if(active().length) {
      const seen=new Set();
      for(const entry of await entries()) {
        const label=String(entry.label||'').trim();
        if(!label||seen.has(label.toLowerCase())||/^(early|today|today's|todays|my favou?rites?|favou?rites?|\d{1,2}\/\d{1,2})$/i.test(label))continue;
        seen.add(label.toLowerCase());
        if(!active().length)break;
        await visit('entry:'+label,true);
      }
    }
  }
  return {items:[...items.values()],diagnostic:diagnostics.join('; '),attempts,
    captureStates:targets.map(t=>({id:Number(t.id),targetAt,
      status:items.get(Number(t.id))?.captureStatus||'failed_source_not_found'}))};
}
