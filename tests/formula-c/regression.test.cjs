const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,plain,e,provider,detail,evaluate,evidence}=require('./harness.cjs');
const intents=['Must Win','Want Win','Hope Win',"Don't Lose",'Equalize'];

test('locked: advertised final categories are the five Formula C intents',()=>{
 // The final output has exactly five categories, including missing-data fallback.
 assert.deepEqual(plain(e.FORMULA_D_INTENTS).sort(),[...intents].sort());
});
test('locked: strong leading execution cannot emit Win Big outside the five categories',()=>{
 const r=evaluate(evidence({preMatchIntent:'Want Win'}),1,0,80);assert.ok(intents.includes(r.intent),r.intent);
});
test('locked: quiet trailing execution cannot emit Give Up outside the five categories',()=>{
 const r=evaluate({...fixture.quiet,preMatchIntent:'Hope Win'},0,1,80);assert.ok(intents.includes(r.intent),r.intent);
});
test('locked: late leader is not mechanically Dont Lose from quiet attack alone',()=>{
 const r=evaluate({...fixture.quiet,preMatchIntent:'Want Win'},1,0,88);assert.notEqual(r.intent,"Don't Lose");
});
test('locked: missing live data falls back to mandatory prematch need at late draw',()=>{
 const r=evaluate({preMatchIntent:'Must Win',strengthTier:3,opponentStrengthTier:3},0,0,88);
 assert.equal(r.intent,'Must Win');
});
test('locked: absent observations cannot gain live confidence solely as the clock advances',()=>{
 const base={preMatchIntent:'Hope Win',strengthTier:3,opponentStrengthTier:3};
 assert.ok(evaluate(base,0,0,88).confidence<=evaluate(base,0,0,60).confidence,'No additional observed evidence at 88 minutes');
});
test('locked: shot evidence excludes events later than current match clock',()=>{
 const d=detail([{teamId:1,min:60.5,expectedGoals:0.8}],[]);assert.equal(provider().shotData(d,1,2,60).home.recent5Shots,0);
});
test('locked: stoppage-time shots use actual event time instead of base 45',()=>{
 const d=detail([{teamId:1,timeStr:'45+3',expectedGoals:0.2}],[]);assert.equal(provider().shotData(d,1,2,51).home.recent5Shots,1);
});
test('locked: unchanged last-five-minute inputs cannot absorb older ten-minute tempo',()=>{
 const a=e.computeFormulaDMetrics(fixture.quiet);
 const b=e.computeFormulaDMetrics({...fixture.quiet,recent10ShotsFor:10,recent10XgFor:1});
 assert.equal(b.SS,a.SS);assert.equal(b.AS,a.AS);
});
test('locked: stale substitution does not remain in rolling tempo through aggregate count',()=>{
 const base={...fixture.quiet,lastSubstitution:{minute:10,type:'Attacking Sub'}};
 assert.equal(evaluate({...base,attackingSubsFor:1}).metrics.SS,evaluate(base).metrics.SS);
});
test('locked: yellow-card evidence is preserved by the provider event parser',()=>{
 assert.equal(provider().eventCounts(detail(),1,0).yellow,1);
});
test('locked: dynamic formation and committed-player change has an evidence effect',()=>{
 // Prospective evidence input: the old implementation exposes no formation-change
 // contract. This red test documents the missing capability, not a wire-format bug.
 const a=evaluate(evidence());
 const b=evaluate(evidence({formationChange:{minute:58,from:'4-4-2',to:'3-3-4',attackingPlayersBefore:2,attackingPlayersAfter:4}}));
 assert.notDeepEqual(plain(b.diagnostics),plain(a.diagnostics));
});
test('locked: yellow cards can affect dynamic evidence',()=>{
 // Like formationChange, yellowCards is a required prospective input. No weight
 // or final intent category is prescribed here, only an observable evidence effect.
 const a=evaluate(evidence()),b=evaluate(evidence({yellowCards:4}));
 assert.ok(JSON.stringify(a.metrics)!==JSON.stringify(b.metrics)||JSON.stringify(a.diagnostics)!==JSON.stringify(b.diagnostics));
});
