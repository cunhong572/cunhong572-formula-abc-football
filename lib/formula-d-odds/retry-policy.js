import { captureTargets } from "lib/formula-d-odds/time-window.js";
import { scheduler, db } from "hatchable";

export function critical(kind){
  return ["timeline","hourly-chain","t60","t5","initial","manual","rollover-confirm"].includes(String(kind||""));
}
export async function retryStillAllowed({kind,matchId,targetAt}){
  const targetMs=Date.parse(String(targetAt||""));
  if(!Number.isFinite(targetMs))return true;
  if(!['timeline','t60','t5'].includes(kind))return true;
  const rows=(await db.query('SELECT id,kickoff_at FROM formula_e_matches WHERE kickoff_at IS NOT NULL'+(matchId?' AND id=$1':''),matchId?[Number(matchId)]:[])).rows||[];
  const matching=rows.flatMap(row=>captureTargets(Date.parse(row.kickoff_at)).filter(cp=>cp.at===targetMs));
  const now=Date.now();
  return matching.some(cp=>now<(cp.kind==='last_5min'?cp.at+5*60000:cp.at+10*60000));
}
export async function formalCheckpointProtected(){
  const rows=(await db.query("SELECT kickoff_at FROM formula_e_matches WHERE kickoff_at IS NOT NULL AND status='active'")).rows||[];
  const now=Date.now();
  for(const row of rows){
    const k=Date.parse(String(row.kickoff_at||""));
    if(!Number.isFinite(k))continue;
    const targets=[];
    for(let h=12;h>=1;h--)targets.push(k-h*60*60000);
    targets.push(k-5*60000);
    for(const at of targets){
      // Reserve browser capacity from ten minutes before through ten minutes
      // after every official T checkpoint. Timeline retries remain allowed.
      // During this window ALL other Formula D work must yield to data capture.
      if(now>=at-10*60000 && now<=at+10*60000)return true;
    }
  }
  return false;
}

export function retryLimit(kind){
  const k=String(kind||"");
  if(k==="timeline")return 6;
  if(k==="rollover-confirm")return 3;
  if(k==="initial"||k==="manual")return 3;
  if(k==="hourly-chain"||k==="t60"||k==="t5")return 4;
  return 2;
}
export async function queueRetry({kind,matchId,targetAt,retryAttempt=0}){
  if(retryAttempt>=retryLimit(kind)){
    console.warn("formula-e retry stopped: attempt limit",JSON.stringify({kind,matchId,retryAttempt,limit:retryLimit(kind)}));
    return false;
  }
  if(!(await retryStillAllowed({kind,matchId,targetAt})))return false;

  // During a formal checkpoint protection window, non-timeline/manual retry
  // chains must yield so they cannot crowd out T-12...T-1/T-5.
  if(!["timeline","t60","t5"].includes(kind) && await formalCheckpointProtected()){
    console.warn("formula-e retry suppressed: formal checkpoint priority",JSON.stringify({kind,matchId,retryAttempt}));
    return false;
  }

  // Keep exactly ONE retry task per kind/fixture. Batch scans always reuse
  // the same named task, preventing a deferred-task flood when several
  // fixtures are missing at the same checkpoint.
  const retryName=`formula-e-retry-${kind}-${matchId||"batch"}`;
  try{
    await scheduler.at(new Date(Date.now()+15000),"/api/formula-e-cloud-once",{
      name:retryName,
      payload:{kind,matchId,targetAt,retryAttempt:retryAttempt+1,continuousRetry:true}
    });
    return true;
  }catch(e){
    console.error("formula-e retry scheduler rejected",JSON.stringify({kind,matchId,retryAttempt,error:String(e?.message||e)}));
    return false;
  }
}
export async function queueRolloverMinute(matchId){
  // Keep exactly ONE pending rollover confirmation task per fixture.
  // A minute-specific task name created a task flood and could crowd out
  // formal T-12...T-1/T-5 captures.
  if(await formalCheckpointProtected()){
    console.warn("formula-e rollover confirmation deferred: formal checkpoint priority",JSON.stringify({matchId}));
    return false;
  }
  const now=Date.now();
  const nextMinute=Math.floor(now/60000)*60000+60000+1500;
  await scheduler.at(new Date(nextMinute),"/api/formula-e-cloud-once",{
    name:`formula-e-rollover-confirm-${matchId}`,
    payload:{kind:"rollover-confirm",matchId,continuousRetry:false}
  });
  return true;
}

