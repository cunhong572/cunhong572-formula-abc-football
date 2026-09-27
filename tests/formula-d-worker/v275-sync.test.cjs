const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {load}=require('../formula-d/harness.cjs');

const kickoff='2030-01-02T12:00:00.000Z',k=Date.parse(kickoff);
const targetAt=new Date(k-3600000).toISOString();
function persistence({now=k-3600000,stored=kickoff,source='2030-01-02T20:00:00.000Z',drop=0,existing=null,expire=false}={}){
  let ms=now,attempts=0;const rows=new Map(),updates=[];
  class Clock extends Date{constructor(...args){super(...(args.length?args:[ms]));}static now(){return ms;}}
  if(existing)rows.set('1|'+targetAt+'|last_1hr',existing);
  const module=load('lib/formula-e-cloud.js',['saveItems'],{Date:Clock,db:{query:async(sql,p)=>{
    if(sql.startsWith('SELECT selected_line'))return {rows:[{selected_line:'1',current_odds:1.88,kickoff_at:stored}]};
    if(sql.startsWith('INSERT INTO formula_e_odds_snapshots')){
      attempts++;if(expire)ms=k;
      if(ms<Date.parse(p[4])||ms>=Date.parse(p[6]))return {rows:[]};
      const key=[p[0],p[4],p[1]].join('|'),old=rows.get(key);
      if(old&&!['partial','failed','failed_source_not_found'].includes(old.capture_status))return {rows:[]};
      const row={id:1,line:p[2],odds:p[3],capture_status:p[5]};
      if(attempts>drop)rows.set(key,row);
      // Model a write result that must still be independently verified.
      return {rows:[row]};
    }
    if(sql.startsWith('SELECT capture_status'))return {rows:[rows.get(p.join('|'))].filter(Boolean)};
    if(sql.includes('SET kickoff_at='))updates.push(p[0]);
    return {rows:[]};
  }}});
  module.stub('scheduleNextTimeline',async()=>{});
  return {rows,updates,get attempts(){return attempts;},run:(anchor=targetAt)=>module.subject.saveItems([{id:1,line:'1',odds:1.88,kickoff:source}],{targetAt:anchor})};
}
test('V275 database kickoff selects the canonical slot despite source timezone drift',async()=>{
  const h=persistence();const result=await h.run();
  assert.equal(result.formalOutcomes[0].saved,true);
  assert.ok(h.rows.has('1|'+targetAt+'|last_1hr'));
  assert.deepEqual(h.updates,[kickoff]);
});
test('V275 valid canonical kickoff works even if source kickoff cannot be parsed',async()=>{
  const h=persistence({source:'not-a-date'});assert.equal((await h.run()).formalOutcomes[0].saved,true);
});
test('V275 missing canonical kickoff retains source fallback',async()=>{
  const h=persistence({stored:null,source:kickoff});assert.equal((await h.run()).formalOutcomes[0].saved,true);
});
test('V275 missing snapshot is repaired and reread before success',async()=>{
  const h=persistence({drop:1});assert.equal((await h.run()).formalOutcomes[0].saved,true);
  assert.equal(h.attempts,2);assert.equal(h.rows.size,1);
});
test('V275 persist failure cannot be reported as successful capture',async()=>{
  const h=persistence({drop:Infinity});await assert.rejects(h.run(),/FORMULA_D_SNAPSHOT_PERSIST_FAILED/);
  assert.equal(h.rows.size,0);assert.equal(h.attempts,2);
});
test('V275 verification preserves an existing successful slot across three runs',async()=>{
  const old={capture_status:'captured_fallback',odds:1.91,line:'1'};
  const h=persistence({existing:old});for(let i=0;i<3;i++)assert.equal((await h.run()).formalOutcomes[0].saved,true);
  assert.equal(h.rows.size,1);assert.equal(h.rows.values().next().value,old);
});
for(const [remaining,allowed] of [[300001,false],[300000,true],[0,false]]){
  test('V275 canonical T-5 repair gate at '+remaining+'ms',async()=>{
    const h=persistence({now:k-remaining,drop:1});const result=await h.run(new Date(k-300000).toISOString());
    assert.equal(result.formalOutcomes.some(x=>x.saved),allowed);
    assert.equal(h.rows.size,allowed?1:0);
  });
}
test('V275 repair crossing kickoff never backfills T-5',async()=>{
  const h=persistence({now:k-1,expire:true});const result=await h.run(new Date(k-300000).toISOString());
  assert.equal(result.formalOutcomes[0].saved,false);assert.equal(h.rows.size,0);
});
test('V275 failed audit without fixture detail uses NOT_FOUND, never SUCCESS',async()=>{
  const writes=[];const {subject}=load('lib/formula-d-odds/audit.js',['writeScanAudit'],{db:{query:async(sql,p)=>{if(sql.startsWith('INSERT'))writes.push(p);return {rows:[]};}}});
  await subject.writeScanAudit({reason:'timeline',targets:[{id:1,home:'Alpha',away:'Beta'}],items:[],diagnostic:'Another fixture: problem'});
  assert.equal(writes[0][4],'failed');assert.equal(writes[0][5],'NOT_FOUND');
});
test('V274 status bar retains only latest timeline batch, excluding old failures and manual scans',async()=>{
  const source=fs.readFileSync('public/formula-e.js','utf8');
  const code=source.slice(source.indexOf('async function cloudStatus(){'),source.indexOf('async function cloudRun(){'));
  const element={};const context=vm.createContext({$:()=>element,auth:()=>'',fetch:async()=>({ok:true,json:async()=>({cloud:{last_status:'ok',recent_audits:[
    {reason:'timeline',created_at:'2030-01-02T11:00:00Z',status:'success',home:'Alpha',away:'Beta',selected_line:'1',odds:1.88},
    {reason:'timeline',created_at:'2030-01-02T10:00:00Z',status:'failed',home:'Old',away:'Failure'},
    {reason:'manual',created_at:'2030-01-02T11:01:00Z',status:'failed',home:'Manual',away:'Failure'}
  ]}})})});
  await vm.runInContext(code+'\ncloudStatus()',context);
  assert.match(element.textContent,/1场成功/);assert.match(element.textContent,/Alpha vs Beta/);
  assert.doesNotMatch(element.textContent,/Old|Manual|最近失败/);
});
