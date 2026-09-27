const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {load,parser,clock}=require('../formula-d/harness.cjs');
const timeline=load('lib/formula-d-worker/timeline.js',['captureTimeline','checkpointFor']).subject;
const kickoff='2030-01-02T12:00:00.000Z',targetAt='2030-01-02T01:00:00.000Z';
const at=Date.parse(targetAt),k=Date.parse(kickoff);
const target={id:1,home:'Alpha City',away:'Beta Town',kickoff};
const item={...target,line:'1/1.5',odds:1.89};

async function scenario({pages={'early':['multiple']},anchor=targetAt,now=()=>at,targets=[target],retryAttempt=0,extra=[],onRead=()=>{}}={}) {
  const visits=[],reads=[];let current;
  const result=await timeline.captureTimeline({targets,targetAt:anchor,now,retryAttempt,
    navigate:async source=>{visits.push(source);current=source;return true;},
    read:async wanted=>{
      reads.push(current);onRead(current);
      const queue=pages[current]||['missing'];
      const name=queue.length>1?queue.shift():queue[0];
      return typeof name==='object'?name:parser(name)(wanted);
    },entries:async()=>extra.map(label=>({label}))});
  return {result,visits,reads};
}
test('fast Early success uses real FIRST HALF parser, nearest Over and no fallback',async()=>{
  const {result,visits}=await scenario();assert.deepEqual(visits,['early']);
  assert.equal(result.items[0].odds,1.89);assert.equal(result.items[0].captureStatus,'captured_exact');
});
test('candidates=0 immediately enters fallback and reloads Early',async()=>{
  const {result,visits}=await scenario({pages:{early:['missing','mixed']}});
  assert.deepEqual(visits,['early','early']);assert.equal(result.items[0].captureStatus,'captured_fallback');
  assert.equal(result.items[0].odds,1.95); // FULL TIME's nearer price is excluded
});
for(const diagnostic of ['team row not unique (2)','page list empty','FIRST HALF O/U column missing'])
  test(diagnostic+' immediately switches to full recovery',async()=>{
    const {result,visits}=await scenario({pages:{early:[{items:[],diagnostic},'normal']}});
    assert.deepEqual(visits,['early','early']);assert.equal(result.items.length,1);
  });
test('01:00 miss recovered at 01:01:20 retains 01:00 targetAt',async()=>{
  let now=at;const {result}=await scenario({pages:{early:['missing','normal']},now:()=>now,onRead:()=>{now+=40000;}});
  assert.equal(now,at+80000);assert.equal(result.items[0].targetAt,targetAt);
});
test('Favorites-only fixture follows exact fallback source order',async()=>{
  const {result,visits}=await scenario({pages:{favorites:['normal']}});
  assert.deepEqual(visits,['early','early','date:01/02','today','favorites']);
  assert.equal(result.items[0].captureSource,'favorites');
});
test('date-only fixture is found before Today',async()=>{
  const {result,visits}=await scenario({pages:{'date:01/02':['normal']}});
  assert.deepEqual(visits,['early','early','date:01/02']);assert.equal(result.items.length,1);
});
test('other football entry is used after Favorites and duplicate entries are skipped',async()=>{
  const {result,visits}=await scenario({pages:{'entry:Soccer':['normal']},extra:['early','Today','My Favorites','Soccer','Soccer']});
  assert.equal(visits.at(-1),'entry:Soccer');assert.equal(visits.filter(x=>x==='entry:Soccer').length,1);
  assert.equal(result.items[0].captureStatus,'captured_fallback');
});
test('exhausted sources emit failed_source_not_found with original anchor',async()=>{
  const {result}=await scenario({pages:{}});assert.equal(result.items.length,0);
  assert.equal(result.captureStates[0].status,'failed_source_not_found');assert.equal(result.captureStates[0].targetAt,targetAt);
});
test('deferred retry fast success is captured_retry',async()=>{
  assert.equal((await scenario({retryAttempt:1})).result.items[0].captureStatus,'captured_retry');
});
test('a successful fixture is never reparsed or replaced while another falls back',async()=>{
  const other={...target,id:2,home:'Gamma',away:'Delta'};
  let n=0;const wanted=[];
  const result=await timeline.captureTimeline({targets:[target,other],targetAt,now:()=>at,
    navigate:async()=>true,entries:async()=>[],read:async ts=>{
      wanted.push(Array.from(ts,x=>x.id));n++;
      return n===1?{items:[item],diagnostic:'candidates=0'}:{items:[{...item,odds:2.5},{...item,id:2}]};
    }});
  assert.deepEqual(wanted,[[1,2],[2]]);assert.equal(result.items.find(x=>x.id===1).odds,1.89);
});
for(const [remaining,expected] of [[300001,0],[300000,1],[299999,1],[1,1],[0,0],[-1,0]])
  test('T-5 capture gate at '+remaining+'ms to kickoff',async()=>{
    const {result,visits}=await scenario({anchor:new Date(k-300000).toISOString(),now:()=>k-remaining});
    assert.equal(result.items.length,expected);if(!expected)assert.equal(visits.length,0);
  });
test('fallback crossing kickoff discards the late T-5 result',async()=>{
  let now=k-1;
  const {result}=await scenario({anchor:new Date(k-300000).toISOString(),now:()=>now,onRead:()=>now=k});
  assert.equal(result.items.length,0);
});
for(const [remaining,expected] of [[3600001,0],[3600000,1]])
  test('T-1 precise boundary '+remaining,async()=>assert.equal((await scenario({anchor:new Date(k-3600000).toISOString(),now:()=>k-remaining})).result.items.length,expected));

// An atomic store double models the DB conflict contract. Separately assert
// the production statement and migration enforce the same key and fencing.
function memoryStore(now=()=>at) {
  const rows=new Map(),sqls=[];
  const db={query:async(sql,p)=>{
    sqls.push(sql);
    if(sql.startsWith('INSERT INTO formula_e_odds_snapshots')){
      assert.match(sql,/ON CONFLICT \(match_id,target_at,sample_kind\)/);
      assert.match(sql,/capture_status IN \('partial','failed','failed_source_not_found'\)/);
      assert.match(sql,/clock_timestamp\(\)<\$7::timestamptz/);
      const key=[p[0],p[4],p[1]].join('|'),old=rows.get(key);
      if(now()<Date.parse(p[4])||now()>=Date.parse(p[6]))return {rows:[]};
      if(old&&!['partial','failed','failed_source_not_found'].includes(old.capture_status))return {rows:[]};
      const value={id:p[0],kind:p[1],line:p[2],odds:p[3],targetAt:p[4],capture_status:p[5]};rows.set(key,value);return {rows:[value]};
    }
    if(sql.startsWith('SELECT capture_status'))return {rows:[rows.get([p[0],p[1],p[2]].join('|'))].filter(Boolean)};
    throw Error('Unexpected SQL: '+sql);
  }};
  class Clock extends Date {static now(){return now();}}
  return {rows,sqls,save:load('lib/formula-d-worker/snapshot-store.js',['saveFormalSnapshot'],{db,Date:Clock}).subject.saveFormalSnapshot};
}
test('concurrent fallback writes create one slot; first complete odds cannot be overwritten',async()=>{
  const store=memoryStore(()=>at+80000),cp=timeline.checkpointFor(target,targetAt);
  await Promise.all([store.save({...item,captureStatus:'captured_fallback'},cp),store.save({...item,line:'1.5',odds:2.1},cp)]);
  assert.equal(store.rows.size,1);const row=[...store.rows.values()][0];
  assert.equal(row.targetAt,targetAt);assert.equal(row.odds,1.89);assert.equal(row.capture_status,'captured_fallback');
});
for(const status of ['partial','failed','failed_source_not_found'])test(status+' slot can be repaired once',async()=>{
  const store=memoryStore(),cp=timeline.checkpointFor(target,targetAt);
  store.rows.set([1,targetAt,cp.kind].join('|'),{capture_status:status,odds:0});
  await store.save({...item,captureStatus:'captured_retry'},cp);await store.save({...item,odds:2.7},cp);
  assert.equal([...store.rows.values()][0].odds,1.89);assert.equal(store.rows.size,1);
});
for(const remaining of [300001,0,-1])test('snapshot store rejects T-5 write at '+remaining+'ms',async()=>{
  const store=memoryStore(()=>k-remaining);
  assert.equal((await store.save(item,{kind:'last_5min',at:k-300000})).saved,false);assert.equal(store.sqls.length,0);
});
test('migration has canonical unique target key and preserves historical rows',()=>{
  const sql=fs.readFileSync('migrations/0057_formula_d_timeline_worker.sql','utf8');
  assert.match(sql,/ON formula_e_odds_snapshots\(match_id,target_at,sample_kind\)/);
  assert.doesNotMatch(sql,/DELETE FROM formula_e_odds_snapshots/i);
});

const nav=()=>load('lib/formula-d-worker/navigation.js',['waitForOddsReady','switchAndWait']);
test('navigation waits for changed, complete and stable DOM before reading',async()=>{
  const module=nav();let now=0,calls=0;
  const old={token:'old',signature:'old',rows:2,ready:true};
  module.stub('oddsPageState',async()=>{calls++;return calls<3?[old]:[{token:null,signature:'new',rows:2,ready:calls>3}];});
  assert.equal(await module.subject.waitForOddsReady({},[old],'old',{now:()=>now,sleep:async ms=>now+=ms}),true);
  assert.ok(calls>=5);
});
test('unchanged stale DOM times out instead of pretending navigation succeeded',async()=>{
  const module=nav();let now=0;const old={token:'old',signature:'old',rows:2,ready:true};
  module.stub('oddsPageState',async()=>[old]);
  assert.equal(await module.subject.waitForOddsReady({},[old],'old',{timeoutMs:600,now:()=>now,sleep:async ms=>now+=ms}),false);
});
test('confirmed empty page returns failure for immediate fallback',async()=>{
  const module=nav();module.stub('oddsPageState',async()=>[{token:null,signature:'empty',rows:0,ready:true,empty:true}]);
  assert.equal(await module.subject.waitForOddsReady({},[],'old'),false);
});
test('failed click is never followed by extraction/readiness polling',async()=>{
  const module=nav();let waits=0;module.stub('oddsPageState',async()=>[]);module.stub('waitForOddsReady',async()=>{waits++;return true;});
  assert.equal(await module.subject.switchAndWait({},async()=>false),false);assert.equal(waits,0);
});

const priority=load('lib/formula-d-worker/priority.js',['taskPriority','reservedPriority']).subject;
test('priority is T-5 > T-1 > timeline > manual > other',()=>{
  const values=[k-300000,k-3600000,at].map(time=>priority.taskPriority({reason:'timeline',targets:[target],targetAt:new Date(time).toISOString()}));
  values.push(priority.taskPriority({reason:'manual'}),priority.taskPriority({reason:'initial'}));
  assert.deepEqual(values,[100,80,60,20,10]);
});
test('priority uses only fixtures belonging to the original target slot',()=>{
  const other={...target,kickoff:new Date(at+300000).toISOString()};
  assert.equal(priority.taskPriority({reason:'timeline',targets:[target,other],targetAt}),100);
  assert.equal(priority.taskPriority({reason:'timeline',targets:[target,other],targetAt:new Date(at+1).toISOString()}),60);
});

function leaseHarness({busy=false,higher=false}={}) {
  const tasks=[],queries=[],cancelled=[];let owner=null,high=higher,interval;
  const module=load('lib/formula-d-worker/lease.js',['withWorkerLease'],{
    Date:clock(at),setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{},
    setTimeout:()=>99,clearTimeout:id=>cancelled.push(id),
    scheduler:{at:async(...args)=>tasks.push(args)},db:{query:async(sql,p)=>{
      queries.push(sql);
      if(sql.startsWith('INSERT INTO formula_e_browser_lease')){if(busy)return {rows:[]};owner=p[0];return {rows:[{owner}]};}
      if(sql.startsWith('UPDATE formula_e_browser_lease'))return {rows:owner?[{owner}]:[]};
      if(sql.startsWith('SELECT task_key'))return {rows:high?[{task_key:'high'}]:[]};
      return {rows:[]};
    }}
  });
  return {...module.subject,tasks,queries,cancelled,preempt:()=>high=true,lose:()=>owner=null,heartbeat:()=>interval()};
}
test('busy browser defers task with same targetAt and retry count, no browser opened',async()=>{
  const h=leaseHarness({busy:true});let ran=false;
  const r=await h.withWorkerLease({reason:'timeline',targetAt,retryAttempt:2},async()=>ran=true);
  assert.equal(r.pausedForPriority,true);assert.equal(ran,false);
  assert.equal(h.tasks[0][2].payload.targetAt,targetAt);assert.equal(h.tasks[0][2].payload.retryAttempt,2);
});
test('higher priority arrival yields at checkpoint and releases owned lease',async()=>{
  const h=leaseHarness();let after=false;
  const r=await h.withWorkerLease({reason:'manual'},async check=>{h.preempt();await check();after=true;});
  assert.equal(after,false);assert.equal(r.pausedForPriority,true);
  assert.ok(h.queries.some(sql=>sql.includes("DELETE FROM formula_e_browser_lease WHERE singleton_key='odds' AND owner=$1")));
});
test('expired/lost lease fences running worker before more operations',async()=>{
  const h=leaseHarness();const r=await h.withWorkerLease({reason:'timeline',targetAt},async check=>{h.lose();await check();throw Error('should not run');});
  assert.equal(r.pausedForPriority,true);
});
test('worker failure releases lease, permitting later recovery',async()=>{
  const h=leaseHarness();await assert.rejects(h.withWorkerLease({reason:'timeline',targetAt},async()=>{throw Error('browser failed');}),/browser failed/);
  assert.ok(h.queries.some(sql=>sql.startsWith('DELETE FROM formula_e_browser_lease')));
});
test('T-5 expired batch retry stops without another task',async()=>{
  const {subject}=load('lib/formula-d-odds/retry-policy.js',['queueRetry'],{Date:clock(k),db:{query:async()=>({rows:[{id:1,kickoff_at:kickoff}]})}});
  assert.equal(await subject.queueRetry({kind:'timeline',targetAt:new Date(k-300000).toISOString()}),false);
});
test('cloud-once forwards retryAttempt and retains returned anchor for the next batch',async()=>{
  const requests=[],queued=[];const {subject}=load('api/formula-e-cloud-once.js',['handler'],{
    cloudScan:async args=>{requests.push(args);return {found:0,expected:1,targetAt};},
    queueRetry:async args=>{queued.push(args);return true;}
  });
  const res={status(){return this;},json(x){return x;}};
  await subject.handler({body:{kind:'timeline',targetAt,retryAttempt:2}},res);
  assert.equal(requests[0].retryAttempt,2);assert.equal(queued[0].targetAt,targetAt);
});

test('formal cloud path reaches Favorites, persists original slot and audits captured_fallback',async()=>{
  let now=at,source='';const writes=[],audits=[],views=[];
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const module=load('lib/formula-e-cloud.js',['cloudScan'],{
    Date:Clock,browser:{session:async cb=>cb({setViewport:async()=>{}})},
    db:{query:async(sql,p)=>{
      if(sql.startsWith('SELECT selected_line'))return {rows:[{selected_line:'1/1.5',current_odds:1.88}]};
      if(sql.startsWith('INSERT INTO formula_e_odds_snapshots')){writes.push(p);return {rows:[{id:1,capture_status:p[5]}]};}
      if(sql.startsWith('SELECT capture_status'))return {rows:writes.filter(w=>w[0]===p[0]&&w[4]===p[1]&&w[1]===p[2]).map(w=>({capture_status:w[5]}))};
      if(sql.startsWith('INSERT INTO formula_e_scan_audit'))audits.push(p);
      return {rows:[]};
    }}
  });
  module.stub('targets',async()=>[{...target,lockedLine:'1/1.5'}]);
  module.stub('creds',()=>({username:'synthetic',password:'synthetic-only'}));
  module.stub('learnedPreferredMode',async()=> 'early');module.stub('login',async()=>{});
  module.stub('discoverOddsPage',async()=> 'offline');
  module.stub('forceOddsMode',async(page,label)=>{source=label;views.push(label);now+=16000;return true;});
  module.stub('openOddsEntry',async(page,label)=>{source='date:'+label;views.push(source);now+=16000;return true;});
  module.stub('openMyFavorites',async()=>{source='favorites';views.push(source);now+=16000;return true;});
  module.stub('extract',async(page,ts)=>parser(source==='favorites'?'multiple':'missing')(ts));
  module.stub('scheduleNextTimeline',async()=>{});module.stub('setState',async()=>{});
  const result=await module.subject.cloudScan({reason:'timeline',targetAt});
  assert.equal(now,at+80000);assert.equal(result.saved,1);assert.equal(result.targetAt,targetAt);
  assert.deepEqual(views,['early','early','date:01/02','today','favorites']);
  assert.equal(writes.length,1);assert.equal(writes[0][1],'t11h');assert.equal(writes[0][4],targetAt);
  assert.equal(audits[0][4],'success');assert.equal(audits[0][5],'SUCCESS');
  assert.equal(audits[0][10],targetAt);assert.equal(audits[0][11],'captured_fallback');
});
test('failure to persist after T-5 deadline is not reported as a captured slot',async()=>{
  const module=load('lib/formula-e-cloud.js',['cloudScan'],{Date:clock(k-1),browser:{session:async()=>({items:[item]})}});
  module.stub('targets',async()=>[target]);module.stub('creds',()=>({username:'synthetic',password:'synthetic-only'}));
  module.stub('learnedPreferredMode',async()=> 'early');module.stub('setState',async()=>{});module.stub('writeScanAudit',async()=>{});
  module.stub('saveItems',async()=>({saved:0,pendingRolloverIds:[],formalOutcomes:[]}));
  const result=await module.subject.cloudScan({reason:'timeline',targetAt:new Date(k-300000).toISOString()});
  assert.equal(result.found,0);assert.equal(result.saved,0);assert.equal(result.captureStates[0].status,'failed_source_not_found');
});
test('T-5 expired priority deferral does not schedule an endless wait chain',async()=>{
  let calls=0;
  const {subject}=load('lib/formula-d-worker/lease.js',['withWorkerLease'],{
    Date:clock(k),scheduler:{at:async()=>calls++}
  });
  const result=await subject.withWorkerLease({reason:'timeline',targets:[target],targetAt:new Date(k-300000).toISOString()},async()=>{throw Error('must not start');});
  assert.equal(result.expired,true);assert.equal(calls,0);
});
test('T-1 snapshot write also rejects an early anchor at millisecond precision',async()=>{
  const store=memoryStore(()=>k-3600001);
  assert.equal((await store.save(item,{kind:'last_1hr',at:k-3600000})).saved,false);assert.equal(store.sqls.length,0);
});
test('explicit t5 and t60 jobs have same high-priority ordering as timeline slots',()=>{
  assert.equal(priority.taskPriority({reason:'t5'}),100);assert.equal(priority.taskPriority({reason:'t60'}),80);
});
test('admission and renewal SQL use expiry and owner fencing, never steal an active browser',async()=>{
  const h=leaseHarness();await h.withWorkerLease({reason:'timeline',targetAt},async()=>{});
  const claim=h.queries.find(sql=>sql.startsWith('INSERT INTO formula_e_browser_lease'));
  assert.match(claim,/WHERE formula_e_browser_lease.expires_at<=clock_timestamp\(\)/);
  assert.match(claim,/priority>\$2/);
  assert.match(h.queries.find(sql=>sql.startsWith('UPDATE formula_e_browser_lease')),/owner=\$1 AND expires_at>clock_timestamp\(\)/);
});
test('higher priority interrupts prewarm wait instead of holding browser until target',async()=>{
  const h=leaseHarness();let started;const began=new Promise(resolve=>started=resolve);
  const task=h.withWorkerLease({reason:'timeline',targetAt},async check=>{started();await check.wait(300000);throw Error('must yield');});
  await began;h.preempt();await h.heartbeat();const result=await task;
  assert.equal(result.pausedForPriority,true);assert.deepEqual(h.cancelled,[99]);
});
test('manual work defers before opening browser during a higher formal reservation',async()=>{
  const h=leaseHarness();const fixture={...target,kickoff:new Date(at+300000).toISOString()};
  const result=await h.withWorkerLease({reason:'manual',targets:[fixture]},async()=>{throw Error('must not run');});
  assert.equal(result.pausedForPriority,true);
  assert.equal(h.queries.some(sql=>sql.startsWith('INSERT INTO formula_e_browser_lease')),false);
});
