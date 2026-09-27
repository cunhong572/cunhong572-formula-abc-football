const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,fixture,plain,e,provider,detail,evaluate,evidence,blocked}=require('./harness.cjs');

test('characterization: trailing 0-1 with current strong execution is Equalize',()=>{
 const r=evaluate(evidence({preMatchIntent:'Hope Win'}),0,1);assert.equal(r.intent,'Equalize');assert.equal(r.diagnostics.equalizeExec,true);
});
test('locked: quiet trailing side retains Equalize as a low-confidence context goal',()=>{
 const r=evaluate(fixture.quiet,0,1,40);assert.equal(r.intent,'Equalize');assert.equal(r.realtimeEvidence,'limited');assert.equal(r.diagnostics.contextFallback,true);
});
test('locked: poor xG limits evidence without erasing the Equalize goal',()=>{
 const r=evaluate(evidence({recent5XgFor:0.01,recent10XgFor:0.02}),0,1);assert.equal(r.diagnostics.evidenceConflict,true);assert.equal(r.intent,'Equalize');assert.equal(r.realtimeEvidence,'limited');
});
test('characterization: tempo alone cannot create Must Win',()=>assert.notEqual(evaluate(evidence()).intent,'Must Win'));
test('characterization: prematch Must Win plus draw and execution returns Must Win',()=>assert.equal(evaluate(evidence({preMatchIntent:'Must Win'}),0,0,88).intent,'Must Win'));
test('characterization: same draw at 60 and 88 can differ',()=>assert.notEqual(evaluate(fixture.quiet,0,0,60).intent,evaluate(fixture.quiet,0,0,88).intent));
test('locked: strength alone cannot upgrade the conservative fallback',()=>{
 for(const [strengthTier,opponentStrengthTier] of [[4,1],[1,4]])assert.equal(evaluate({strengthTier,opponentStrengthTier}).intent,evaluate({}).intent);
});
test('characterization: Formula B strength config can supply tiers without another table',()=>{
 const canonicalTeam=load('lib/team-resolver.js',['canonicalTeam'],{trackedFetch:blocked}).subject.canonicalTeam;
 const {strengthTier}=load('lib/formula-b/strength-tiers.js',['strengthTier'],{canonicalTeam}).subject;
 const r=evaluate(evidence({strengthTier:strengthTier('Italy'),opponentStrengthTier:strengthTier('Spain')}));
 assert.ok(r.reasons.some(x=>x.includes('3 vs 4')));assert.equal(strengthTier('Croatia'),3);
});
test('characterization: rolling shots exclude earlier-than-five-minute data and other team',()=>{
 const r=provider().shotData(detail(),1,2,60);assert.equal(r.home.recent5Shots,3);assert.equal(r.away.recent5Shots,1);assert.ok(Math.abs(r.home.recent5Xg-0.6)<1e-9);
});
test('characterization: rolling window advances and expires minute 55',()=>{
 const p=provider();assert.equal(p.shotData(detail(),1,2,60).home.recent5Shots,3);assert.equal(p.shotData(detail(),1,2,61).home.recent5Shots,2);
});
test('characterization: current and previous five-minute buckets do not overlap',()=>{
 const r=provider().shotData(detail(),1,2,60).home;assert.equal(r.previous5Shots,1);assert.equal(r.recent10Shots,r.recent5Shots+r.previous5Shots);
});
test('characterization: missing shotmap produces zero observations',()=>assert.equal(provider().shotData({},1,2,60).home.recent5Shots,0));
test('characterization: SS AS proxy respond to shots and xG',()=>{
 const q=e.computeFormulaDMetrics(fixture.quiet),s=e.computeFormulaDMetrics(fixture.strong);assert.ok(s.SS>q.SS);assert.ok(s.AS>q.AS);
});
test('characterization: normalized progression/attack inputs compute official SS AS',()=>{
 const r=e.computeFormulaDMetrics({possession:50,metricsNormalized:fixture.normalized});assert.equal(r.mode,'official');assert.ok(Math.abs(r.SS-60)<1e-9);assert.ok(Math.abs(r.AS-60)<1e-9);
});
test('characterization: normalized dangerous progression changes PI and SS',()=>{
 const a=e.computeFormulaDMetrics({possession:50,metricsNormalized:fixture.normalized});
 const b=e.computeFormulaDMetrics({possession:50,metricsNormalized:{...fixture.normalized,darHighNorm:90}});assert.ok(b.PI>a.PI);assert.ok(b.SS>a.SS);
});
test('characterization: official GTI combines transition intensity and speed',()=>{
 assert.equal(e.computeGTI({mode:'official',SS:60},{mode:'official',SS:60},{trNorm:60,ciiNorm:60}).GTI,60);
});
test('characterization: GTI proxy responds to match shots',()=>{
 const q={mode:'proxy',SS:40};assert.ok(e.computeGTI(q,q,{recent5TotalShots:4}).GTI>e.computeGTI(q,q,{recent5TotalShots:0}).GTI);
});
test('characterization: GTI is not itself an intent output',()=>assert.equal(e.computeGTI({SS:90},{SS:90},{recent5TotalShots:8}).intent,undefined));
test('characterization: red card lowers dynamic metrics and tactical boost',()=>{
 const a=evaluate(evidence()),b=evaluate(evidence({redCards:1}));assert.ok(b.metrics.SS<a.metrics.SS);assert.equal(b.diagnostics.tacticalBoost,-2);
});
for(const [type,impact] of [['Attacking Sub',2],['Defensive Sub',-2]])test('characterization: recent '+type+' affects evidence',()=>{
 const r=evaluate(evidence({lastSubstitution:{minute:58,type}}));assert.equal(r.diagnostics.tacticalBoost,impact);
});
test('characterization: key player impact is clamped to three',()=>assert.equal(evaluate(evidence({lastSubstitution:{minute:58,playerImpact:20}})).diagnostics.tacticalBoost,3));
test('characterization: substitution tactical boost expires after five minutes',()=>{
 assert.equal(evaluate(evidence({lastSubstitution:{minute:55,type:'Attacking Sub'}})).diagnostics.recentSub,true);
 assert.equal(evaluate(evidence({lastSubstitution:{minute:54.999,type:'Attacking Sub'}})).diagnostics.tacticalBoost,0);
});
test('characterization: event parser separates teams and classifies attacking substitution',()=>{
 const p=provider();assert.equal(p.eventCounts(detail(),1,0).attackingSubs,1);assert.equal(p.eventCounts(detail(),2,1).red,1);assert.equal(p.eventCounts(detail(),1,0).red,0);
});
test('characterization: prematch tiers come from existing compatible pre-match API',async()=>{
 let calls=0;
 const p=provider({trackedFetch:async(url,options)=>{calls++;assert.ok(url.endsWith('/api/formula-c'));assert.deepEqual(JSON.parse(options.body),{home:'Synthetic Home',away:'Synthetic Away'});return {ok:true,json:async()=>({match:{competition:'Synthetic League'},home:{tier:3,intent:'Hope Win'},away:{tier:4,intent:'Want Win'}})};}});
 const r=await p.getPreMatchContext({},'Synthetic Home','Synthetic Away');assert.equal(r.homeTier,3);assert.equal(r.awayTier,4);assert.equal(calls,1);
});
test('characterization: learning snapshot retains prematch and live evidence without writing DB',()=>{
 const {rowFor}=load('lib/formula-d-learning.js',['rowFor']).subject;
 const r=rowFor({matchId:'synthetic',minute:60},'Home','Away','home',{intent:'Equalize',metrics:{preMatchIntent:'Hope Win',strengthTier:3,recent5ShotsFor:2},formulaDMetrics:{mode:'proxy',SS:65,AS:75}},0,1,{GTI:66},1);
 assert.equal(r.preMatchIntent,'Hope Win');assert.equal(r.recent5Shots,2);assert.equal(r.gti,66);
});


async function manualRoute(body){
 const handler=require('./harness.cjs').manualHandler();
 let status=200,result;await handler({body},{status(n){status=n;return this;},json(v){result=v;}});return {status,result};
}
test('characterization: historical manual live route preserves output envelope',async()=>{
 const {status,result}=await manualRoute({minute:60,homeGoals:0,awayGoals:1,homeLive:evidence(),awayLive:fixture.quiet});
 assert.equal(status,200);assert.equal(result.homeIntent,'Equalize');assert.equal(result.homeAnalysis.context.minute,60);assert.equal(typeof result.gti.GTI,'number');
});
test('characterization: manual live route rejects invalid clock',async()=>{
 assert.equal((await manualRoute({minute:'invalid',homeGoals:0,awayGoals:0})).status,400);
});
test('characterization: SS AS remain metrics rather than category strings',()=>{
 const r=evaluate(evidence());assert.equal(typeof r.metrics.SS,'number');assert.equal(typeof r.metrics.AS,'number');assert.equal(typeof r.intent,'string');
});

