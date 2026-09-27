import { db, scheduler } from "hatchable";
import { taskPriority, reservedPriority, taskExpired } from "lib/formula-d-worker/priority.js";

export async function withWorkerLease(options,run) {
  const {reason='scheduled',matchId=null,targetAt=null,retryAttempt=0,targets=[],resume=true}=options;
  const priority=taskPriority(options),key=JSON.stringify([reason,matchId,targetAt]);
  const owner=Date.now()+':'+Math.random()+':'+Math.random();
  const expired=()=>({ok:true,expired:true,targetAt,found:0,saved:0,retryQueued:false});
  if(taskExpired(options))return expired();
  const defer=async()=>{
    if(taskExpired(options))return expired();
    if(resume)await scheduler.at(new Date(Date.now()+15000),'/api/formula-e-cloud-once',{
      name:'formula-d-wait-'+encodeURIComponent(key),payload:{kind:reason,matchId,targetAt,retryAttempt}
    });
    return {ok:true,pausedForPriority:true,retryQueued:resume,targetAt,found:0,saved:0};
  };
  await db.query(`INSERT INTO formula_e_worker_requests(task_key,priority,expires_at)
    VALUES($1,$2,clock_timestamp()+interval '2 minutes') ON CONFLICT(task_key)
    DO UPDATE SET priority=EXCLUDED.priority,expires_at=EXCLUDED.expires_at`,[key,priority]);
  if(reservedPriority(targets)>priority)return defer();
  const claim=await db.query(`INSERT INTO formula_e_browser_lease(singleton_key,owner,priority,expires_at)
    SELECT 'odds',$1,$2,clock_timestamp()+interval '2 minutes'
    WHERE NOT EXISTS(SELECT 1 FROM formula_e_worker_requests WHERE priority>$2 AND expires_at>clock_timestamp())
    ON CONFLICT(singleton_key) DO UPDATE SET owner=EXCLUDED.owner,priority=EXCLUDED.priority,expires_at=EXCLUDED.expires_at
    WHERE formula_e_browser_lease.expires_at<=clock_timestamp()
    RETURNING owner`,[owner,priority]);
  if(!claim.rows?.length)return defer();
  let yielded=false,heartbeatBusy=false,interrupt;
  const interrupted=new Promise(resolve=>{interrupt=resolve;});
  const yieldError=()=>{const error=new Error('Formula D browser yielded to higher priority or lost lease');error.code='WORKER_YIELD';return error;};
  const renew=async()=>{
    const r=await db.query(`UPDATE formula_e_browser_lease SET expires_at=clock_timestamp()+interval '2 minutes'
      WHERE singleton_key='odds' AND owner=$1 AND expires_at>clock_timestamp()
      RETURNING owner`,[owner]);
    if(!r.rows?.length)yielded=true;
    const pending=await db.query('SELECT task_key FROM formula_e_worker_requests WHERE priority>$1 AND expires_at>clock_timestamp() LIMIT 1',[priority]);
    if(pending.rows?.length)yielded=true;
    if(reservedPriority(targets)>priority)yielded=true;
    if(yielded)interrupt();
  };
  const checkpoint=async()=>{
    await renew();
    if(yielded)throw yieldError();
  };
  checkpoint.owner=owner;
  checkpoint.wait=async ms=>{
    let timeout;
    try {await Promise.race([
      new Promise(resolve=>{timeout=setTimeout(resolve,ms);}),
      interrupted.then(()=>{throw yieldError();})
    ]);}finally{clearTimeout(timeout);}
    await checkpoint();
  };
  const timer=setInterval(async()=>{
    if(heartbeatBusy)return;heartbeatBusy=true;
    try{await renew();}catch(_){yielded=true;interrupt();}finally{heartbeatBusy=false;}
  },10000);
  try {
    await checkpoint();
    return await run(checkpoint);
  } catch(error) {
    if(error?.code==='WORKER_YIELD')return await defer();
    throw error;
  } finally {
    clearInterval(timer);
    await db.query("DELETE FROM formula_e_browser_lease WHERE singleton_key='odds' AND owner=$1",[owner]);
    await db.query('DELETE FROM formula_e_worker_requests WHERE task_key=$1 OR expires_at<=clock_timestamp()',[key]);
  }
}
