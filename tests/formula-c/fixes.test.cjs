const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,e,plain,fixture,evaluate,evidence,provider,detail,blocked,manualHandler}=require('./harness.cjs');
const {matchMinute,inRecentWindow,liveTactics}=load('lib/formula-c-live-evidence.js',['matchMinute','inRecentWindow','liveTactics']).subject;
for(const [clock,expected] of [['45+1',46],['45+3',48],['90+5',95],["90+5'",95],['60.5',60.5]])test('clock normalizes '+clock,()=>assert.equal(matchMinute(clock),expected));
for(const [clock,expected] of [[55,true],[60,true],[54.999,false],[60.001,false]])test('inclusive five-minute boundary '+clock,()=>assert.equal(inRecentWindow(clock,60),expected));
for(const minute of [48,51,53.001])test('stoppage shot rolls at '+minute,()=>{
 const r=provider().shotData(detail([{teamId:1,timeStr:'45+3',expectedGoals:.2}],[]),1,2,minute);
 assert.equal(r.home.recent5Shots,minute<=53?1:0);
});
test('five-minute GTI uses five-minute shots only',()=>{
 const m={mode:'proxy',SS:40};assert.equal(e.computeGTI(m,m,{recent5TotalShots:2,recent10TotalShots:99}).GTI,e.computeGTI(m,m,{recent5TotalShots:2,recent10TotalShots:0}).GTI);
 assert.ok(e.computeGTI(m,m,{recent5TotalShots:2}).GTI>e.computeGTI(m,m,{recent5TotalShots:0}).GTI);
});
test('ten-minute and previous-window history cannot change the final current decision',()=>{
 const a=evaluate(evidence({preMatchIntent:'Hope Win'}),0,1);
 const b=evaluate(evidence({preMatchIntent:'Hope Win',recent10ShotsFor:99,recent10XgFor:9,previous10ShotsFor:99}),0,1);
 assert.equal(a.intent,b.intent);assert.equal(a.confidence,b.confidence);assert.equal(a.metrics.SS,b.metrics.SS);
});
test('past possession and box totals cannot inflate rolling proxy',()=>{
 const a=e.computeFormulaDMetrics(fixture.quiet),b=e.computeFormulaDMetrics({...fixture.quiet,possession:99,boxTouches:1000});assert.equal(a.SS,b.SS);assert.equal(a.AS,b.AS);
});
for(const minute of [54.999,60.001])test('stale/future tactical events excluded: '+minute,()=>{
 const t=liveTactics({substitutionEvents:[{minute,type:'Attacking Sub'}],cardEvents:[{minute,color:'yellow'},{minute,color:'red'}],formationChange:{minute,from:'4-4-2',to:'3-3-4',attackingPlayersBefore:2,attackingPlayersAfter:4}},60);
 assert.equal(t.recentEventWeight,0);assert.equal(t.recentSub,false);assert.equal(t.recentYellow,0);assert.equal(t.formationWeight,0);
});
test('red recent evidence outweighs a single yellow',()=>{
 assert.ok(Math.abs(liveTactics({cardEvents:[{minute:59,color:'red'}]},60).recentEventWeight)>Math.abs(liveTactics({cardEvents:[{minute:59,color:'yellow'}]},60).recentEventWeight));
});
test('single yellow cannot mechanically change final category',()=>{
 const a=evaluate(evidence({preMatchIntent:'Want Win'})),b=evaluate(evidence({preMatchIntent:'Want Win',cardEvents:[{minute:59,color:'yellow'}]}));assert.equal(a.intent,b.intent);assert.notEqual(a.diagnostics.evidenceWeight,b.diagnostics.evidenceWeight);
});
test('balanced substitution is represented without a directional boost',()=>{
 const t=liveTactics({substitutionEvents:[{minute:'45+3',type:'Balanced/Role Change'}]},50);assert.equal(t.balanced,1);assert.equal(t.substitutionWeight,0);
});
test('formation and committed players can reduce evidence weight',()=>{
 const a=evaluate(evidence({preMatchIntent:'Want Win'})),b=evaluate(evidence({preMatchIntent:'Want Win',formationChange:{minute:59,from:'3-3-4',to:'5-4-1',attackingPlayersBefore:4,attackingPlayersAfter:1}}));assert.ok(b.diagnostics.evidenceWeight<a.diagnostics.evidenceWeight);assert.equal(b.intent,a.intent);
});
test('red-card lineup state survives while its dynamic event expires',()=>{
 const t=liveTactics({redCards:1,cardEvents:[{minute:10,color:'red'}]},60);assert.equal(t.recentRed,0);assert.equal(t.recentEventWeight,0);assert.equal(t.redCards,1);
});
test('quiet execution cannot erase explicit Equalize target',()=>assert.equal(evaluate({...fixture.quiet,preMatchIntent:'Hope Win'},0,1,88).intent,'Equalize'));
test('Must Win fallback remains constant-confidence at 60 and 88',()=>{
 const a=evaluate({preMatchIntent:'Must Win'},0,0,60),b=evaluate({preMatchIntent:'Must Win'},0,0,88);assert.equal(a.intent,'Must Win');assert.equal(b.intent,'Must Win');assert.equal(a.confidence,b.confidence);assert.equal(b.realtimeEvidence,'unavailable');
});
test('explicit missing feed is unavailable even if empty aggregates are supplied',()=>assert.equal(evaluate({...fixture.quiet,realtimeEvidenceAvailable:false}).realtimeEvidence,'unavailable'));
test('stale stamped aggregates cannot inflate SS or enable live conclusions',()=>{
 const r=evaluate(evidence({evidenceMinute:40,preMatchIntent:'Must Win'}),0,0,88);assert.equal(r.realtimeEvidence,'unavailable');assert.equal(r.intent,'Must Win');assert.ok(r.metrics.SS<60);
});
test('verified hard need may require additional goal margin',()=>{
 const r=evaluate({...fixture.quiet,hardCondition:{verified:true,mustWin:true,requiredGoalDifference:2}},1,0,88);assert.equal(r.intent,'Must Win');
});
test('unverified hard condition cannot manufacture Must Win',()=>assert.notEqual(evaluate(evidence({hardCondition:{verified:false,mustWin:true}})).intent,'Must Win'));
test('provider excludes future cards and substitutions using normalized clocks',()=>{
 const r=provider().eventCounts(detail([],[{teamId:1,type:'RedCard',minute:'90+5'},{teamId:1,type:'Substitution',minute:'90+5'}]),1,0,94);assert.equal(r.red,0);assert.equal(r.subs,0);
});
test('provider delivers timestamped yellow and formation evidence to evaluation',()=>{
 const p=provider(),d=detail([],[{teamId:1,type:'YellowCard',minute:'45+3'},{teamId:1,type:'FormationChange',minute:'45+3',from:'4-4-2',to:'3-3-4'}]);
 const events=p.eventCounts(d,1,0,50),shots=p.shotData(d,1,2,50).home,live=p.sideMetrics([],shots,events,0);
 const r=evaluate(live,0,0,50);assert.equal(r.diagnostics.recentYellow,1);assert.equal(r.diagnostics.formationWeight,2);
});
test('manual API accepts stoppage clock without changing envelope',async()=>{
 let result,status=200;await manualHandler()({body:{minute:'90+5',homeGoals:0,awayGoals:0,homeLive:{preMatchIntent:'Must Win'}}},{status(n){status=n;return this;},json(v){result=v;}});assert.equal(status,200);assert.equal(result.homeAnalysis.context.minute,95);assert.equal(result.homeIntent,'Must Win');
});

test('event collection accepts a stoppage clock and sorts normalized times',()=>{
 const d=detail([],[{teamId:1,type:'YellowCard',minute:'90+5'},{teamId:1,type:'YellowCard',minute:'90+1'},{teamId:1,type:'YellowCard',minute:'90+6'}]);
 const r=provider().eventCounts(d,1,0,'90+5');assert.deepEqual(plain(r.cardEvents.map(x=>x.minute)),[91,95]);
});

test('empty normalized object is not reliable live evidence',()=>{
 const r=evaluate({metricsNormalized:{},preMatchIntent:'Must Win'},0,0,88);assert.equal(r.realtimeEvidence,'unavailable');assert.equal(r.confidence,40);
});

const finalIntents=['Must Win','Want Win','Hope Win',"Don't Lose",'Equalize'];
for(const [label,eventMinute,included] of [['exact five minutes',55,true],['five minutes plus 1ms',55-1/60000,false],['future 1ms',60+1/60000,false]]){
 test('end-to-end rolling shot boundary: '+label,()=>{
  const p=provider();
  const metrics=shots=>p.sideMetrics([],p.shotData(detail(shots,[]),1,2,60).home,p.eventCounts(detail([],[]),1,0,60),0);
  const baseline=metrics([]),sample=metrics([{teamId:1,min:eventMinute,expectedGoals:.4}]);
  assert.equal(sample.recent5ShotsFor,included?1:0);
  const a=evaluate(baseline),b=evaluate(sample);
  const gti=x=>e.computeGTI(x.metrics,{mode:'proxy',SS:38},{recent5TotalShots:x===b?sample.recent5ShotsFor:0}).GTI;
  if(included){assert.ok(b.metrics.SS>a.metrics.SS);assert.ok(b.metrics.AS>a.metrics.AS);assert.ok(gti(b)>gti(a));}
  else{assert.equal(b.metrics.SS,a.metrics.SS);assert.equal(b.metrics.AS,a.metrics.AS);assert.equal(gti(b),gti(a));}
 });
 test('tactical millisecond boundary: '+label,()=>{
  const t=liveTactics({substitutionEvents:[{minute:eventMinute,type:'Attacking Sub'}],cardEvents:[{minute:eventMinute,color:'yellow'}],formationChange:{minute:eventMinute,from:'4-4-2',to:'3-3-4'}},60);
  assert.equal(t.recentSub,included);assert.equal(t.recentYellow,included?1:0);assert.equal(t.formationWeight,included?2:0);
 });
}
test('final intent domain remains exactly five across score/time/target/evidence combinations',()=>{
 const seen=new Set();
 for(const preMatchIntent of [...finalIntents,'---','Win Big','Give Up',undefined])
 for(const [forGoals,againstGoals] of [[0,1],[0,0],[1,0]])
 for(const minute of [40,60,88])
 for(const live of [{},fixture.quiet,fixture.strong]){
  const r=evaluate({...live,preMatchIntent},forGoals,againstGoals,minute);
  assert.ok(finalIntents.includes(r.intent),JSON.stringify({preMatchIntent,forGoals,againstGoals,minute,intent:r.intent}));
  seen.add(r.intent);
 }
 assert.deepEqual([...seen].sort(),[...finalIntents].sort());
});
test('unknown goal fallback always has a five-class result and unavailable evidence',()=>{
 for(const [forGoals,againstGoals,minute,expected] of [[0,1,60,'Equalize'],[0,0,60,'Hope Win'],[0,0,88,"Don't Lose"],[1,0,88,'Hope Win']]){
  const r=evaluate({},forGoals,againstGoals,minute);assert.equal(r.intent,expected);assert.equal(r.realtimeEvidence,'unavailable');assert.equal(r.confidence,40);
 }
});
test('provider API exposes separate evidence status with five-class fallback, including cached response',async()=>{
 const d={general:{homeTeam:{id:1,name:'Synthetic Home'},awayTeam:{id:2,name:'Synthetic Away'},leagueName:'Synthetic League'},header:{status:{started:true,finished:false,scoreStr:'0 - 0',liveTime:{short:'88'}}},content:{}};
 const {handler}=load('api/formula-d-live.js',['handler'],{
  requireAuth:async()=>({}),trackedFetch:async url=>{
   if(url.includes('/matchDetails?'))return {ok:true,json:async()=>d};
   if(url.endsWith('/api/formula-c'))return {ok:true,json:async()=>({home:{intent:'Must Win',tier:3},away:{intent:'Hope Win',tier:3}})};
   throw Error('Unexpected test request '+url);
  },getFormulaDWeights:async()=>({config:{}}),refreshTeamRoster:async()=>{},
  getPlayerKnowledge:blocked,enrichPlayer:blocked,getDirectPlayerKnowledge:blocked,substitutionImpact:blocked,saveFormulaDSnapshot:async()=>{}
 }).subject;
 let status=200,result;
 const req={body:{home:'Synthetic Home',away:'Synthetic Away',matchId:'synthetic-fixture'}};
 const res={status(n){status=n;return this;},json(v){result=v;}};
 await handler(req,res);assert.equal(status,200);assert.equal(result.home.intent,'Must Win');assert.equal(result.home.realtimeEvidence,'unavailable');assert.equal(result.away.realtimeEvidence,'unavailable');
 assert.deepEqual(plain(result.intents).sort(),[...finalIntents].sort());
 await handler(req,res);assert.equal(result.reusedUnchangedData,true);assert.equal(result.home.realtimeEvidence,'unavailable');
});
