import { cloudScan } from "lib/formula-e-cloud.js";
import { critical, queueRetry, queueRolloverMinute } from "lib/formula-d-odds/retry-policy.js";
export const access = "scheduler";
export const methods = ["POST"];

async function run(kind,matchId,targetAt,retryAttempt){
  return await cloudScan({reason:kind,matchId,targetAt,retryAttempt});
}
export default async function(req,res){
  const kind=String(req.body?.kind||"one-shot");
  const matchId=req.body?.matchId||null;
  let targetAt=req.body?.targetAt||null;
  const retryAttempt=Number(req.body?.retryAttempt||0);
  const continuousRetry=req.body?.continuousRetry===true;
  let firstError=null;

  try{
    const first=await run(kind,matchId,targetAt,retryAttempt);
    targetAt=first?.targetAt||targetAt;
    if(first?.pausedForPriority)return res.status(202).json(first);
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