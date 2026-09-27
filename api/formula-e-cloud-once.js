import { cloudScan } from "lib/formula-e-cloud.js";
import { scheduler, db } from "hatchable";
export const access = "scheduler";
export const methods = ["POST"];

function critical(kind){
  return ["timeline","hourly-chain","t60","t5","initial","manual","rollover-confirm"].includes(String(kind||""));
}
async function run(kind,matchId,targetAt){
  return await cloudScan({reason:kind,matchId,targetAt});
}
async function retryStillAllowed({kind,matchId,targetAt}){
  const targetMs=Date.parse(String(targetAt||""));
  if(!Number.isFinite(targetMs))return true;
  if(kind!=="timeline")return true;
  let windowMs=10*60*1000;
  if(matchId){
    const row=(await db.query("SELECT kickoff_at FROM formula_e_matches WHERE id=$1",[Number(matchId)])).rows?.[0];
    const kickoffMs=Date.parse(String(row?.kickoff_at||""));
    if(Number.isFinite(kickoffMs) && Math.abs(targetMs-(kickoffMs-5*60000))<=60000){
      windowMs=60*1000;
    }
  }
  return Date.now()<=targetMs+windowMs;
}
async function formalCheckpointProtected(){
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

function retryLimit(kind){
  const k=String(kind||"");
  if(k==="timeline")return 6;
  if(k==="rollover-confirm")return 3;
  if(k==="initial"||k==="manual")return 3;
  if(k==="hourly-chain"||k==="t60"||k==="t5")return 4;
  return 2;
}
async function queueRetry({kind,matchId,targetAt,retryAttempt=0}){
  if(retryAttempt>=retryLimit(kind)){
    console.warn("formula-e retry stopped: attempt limit",JSON.stringify({kind,matchId,retryAttempt,limit:retryLimit(kind)}));
    return false;
  }
  if(!(await retryStillAllowed({kind,matchId,targetAt})))return false;

  // During a formal checkpoint protection window, non-timeline/manual retry
  // chains must yield so they cannot crowd out T-12...T-1/T-5.
  if(kind!=="timeline" && await formalCheckpointProtected()){
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
async function queueRolloverMinute(matchId){
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

export default async function(req,res){
  const kind=String(req.body?.kind||"one-shot");
  const matchId=req.body?.matchId||null;
  const targetAt=req.body?.targetAt||null;
  const retryAttempt=Number(req.body?.retryAttempt||0);
  const continuousRetry=req.body?.continuousRetry===true;
  let firstError=null;

  try{
    const first=await run(kind,matchId,targetAt);
    const firstFound=Number(first?.found||0);
    const firstExpected=Number(first?.expected??firstFound);
    const rolloverPending=(first?.pendingRolloverIds||[]).map(Number).filter(Number.isFinite);
    if(rolloverPending.length){
      for(const id of rolloverPending)await queueRolloverMinute(id);
      return res.status(202).json({...first,rolloverCheckQueued:true});
    }
    if(!critical(kind)||firstFound>=firstExpected)return res.json(first);

    const missing=(first?.missingMatchIds||[]).map(Number).filter(Number.isFinite);
    console.warn("formula-e incomplete capture; retry chain continues",JSON.stringify({kind,found:firstFound,expected:firstExpected,missingMatchIds:missing,retryAttempt}));

    // Keep official timeline retries as ONE batch scan. All target fixtures live
    // on the same 3573217 odds page, so reopening a fresh browser per missing
    // fixture creates needless races, browser-farm contention and random misses.
    // Re-scan the whole batch in one page/session; snapshot writes are idempotent,
    // so already-saved fixtures remain untouched.
    if(kind==="timeline" && !matchId){
      const queued=await queueRetry({kind,matchId:null,targetAt,retryAttempt});
      if(!queued)return res.json({...first,retryQueued:false,retryWindowExpired:true,missingMatchIds:missing});
      return res.status(202).json({...first,retryQueued:true,retryAttempt:retryAttempt+1,missingMatchIds:missing,batchRetry:true});
    }

    if(continuousRetry || matchId){
      const queued=await queueRetry({kind,matchId:matchId||null,targetAt,retryAttempt});
      if(!queued)return res.json({...first,retryQueued:false,retryWindowExpired:true});
      return res.status(202).json({...first,retryQueued:true,retryAttempt:retryAttempt+1});
    }

    // Do not fan out one deferred task per missing fixture. All tracked
    // fixtures live on the same source page, so one batch re-scan is both
    // cheaper and more reliable than N concurrent browser sessions.
    const queued=await queueRetry({kind,matchId:null,targetAt,retryAttempt});
    return queued
      ?res.status(202).json({...first,retryQueued:true,retryAttempt:retryAttempt+1,missingMatchIds:missing,batchRetry:true})
      :res.json({...first,retryQueued:false,retryWindowExpired:true,missingMatchIds:missing});
  }catch(e){
    firstError=e;
    console.error("formula-e cloud once attempt failed",String(e?.stack||e));
    if(critical(kind)){
      const queued=await queueRetry({kind,matchId,targetAt,retryAttempt});
      return res.status(queued?202:200).json({
        ok:false,
        error:String(e?.message||e),
        firstError:firstError?String(firstError?.message||firstError):null,
        retryQueued:queued,
        retryAttempt:queued?retryAttempt+1:retryAttempt,
        retryStopped:!queued
      });
    }
    throw e;
  }
}