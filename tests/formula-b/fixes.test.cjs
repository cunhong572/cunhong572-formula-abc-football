const {test}=require('node:test');
const assert=require('node:assert/strict');
const {engine,side,context,next,intentRoute,routeB}=require('./harness.cjs');
const e=engine();
test('strict opportunity window: Middle versus Middle before same-league Elite/Good',()=>{
  assert.equal(e.classifyIntent(side(2,{next3:next(['Spain','Italy'])}),side(2),context()).intent,'Want Win');
});

test('Middle opportunity window also accepts same-league Good/Elite in reverse order',()=>{
  assert.equal(e.classifyIntent(side(2,{next3:next(['Italy','Spain'])}),side(2),context()).intent,'Want Win');
});

test('Good versus Good cannot use Elite/Good as an opportunity window in either order',()=>{
  for(const opponents of [['Spain','Italy'],['Italy','Spain']]){
    const result=e.classifyIntent(side(3,{next3:next(opponents)}),side(3),context());
    assert.notEqual(result.intent,'Want Win',opponents.join('/'));
  }
});
test('cross-competition Elite/Good cannot trigger the opportunity window',()=>{
  const result=e.classifyIntent(side(2,{next3:next(['Spain','Italy'],99)}),side(2),context());
  assert.notEqual(result.intent,'Want Win');
});
for(const isHome of [true,false])test('Nations mandatory points with inadequate ability, venue '+isHome,()=>{
  const ctx=context({isNationsLeague:true,pointsRequirements:{1:{verified:true,requiredPoints:1,consequence:'relegation'}}});
  assert.equal(e.classifyIntent(side(1,{isHome}),side(4),ctx).intent,'Hope Win');
});
test('unverified required-points claim cannot force Must Win',()=>{
  const ctx=context({isNationsLeague:true,pointsRequirements:{1:{verified:false,requiredPoints:3,consequence:'elimination'}}});
  assert.notEqual(e.classifyIntent(side(3),side(2),ctx).intent,'Must Win');
});
for(const odds of [4,4.01,5])test('away odds '+odds+' guard',()=>{
  assert.equal(e.classifyIntent(side(4,{isHome:false,winOdds:odds,formScore:100}),side(2),context()).intent,'---');
});
test('verified Nations hard condition can proceed despite away odds above four',()=>{
  const ctx=context({isNationsLeague:true,pointsRequirements:{1:{verified:true,requiredPoints:3,consequence:'elimination'}}});
  assert.equal(e.classifyIntent(side(3,{isHome:false,winOdds:4.5}),side(2),ctx).intent,'Must Win');
});
test('formal Formula B name input reaches the same pre-match engine as legacy route',async()=>{
  const b=(await intentRoute({route:'api/formula-b.js'})).body;
  const c=(await intentRoute()).body;
  assert.equal(b.home.intent,c.home.intent);
  assert.equal(b.away.intent,c.away.intent);
  assert.equal(b.home.rankSource,c.home.rankSource);
  assert.equal(typeof b.home.form,'string');
  assert.deepEqual(JSON.parse(JSON.stringify(b.home.formResults)),JSON.parse(JSON.stringify(c.home.form)));
  assert.equal(b.home.europeSchedule.length,8);
});
test('missing European data has no high-confidence intent',async()=>{
  const {body}=await intentRoute({route:'api/formula-b.js',games:3,missingRank:true});
  assert.equal(body.home.intent,'---');assert.equal(body.home.intentScore,null);
  assert.equal(body.home.dataCoverage,0);assert.equal(body.home.rank,null);
  assert.ok(body.warnings.length);assert.equal(body.qa.insufficientData,true);
});
test('legacy supplied data keeps render fields and diagnoses unverified context',async()=>{
  const {body}=await routeB({match:{date:'2030-09-10',competition:'UEFA Nations League A'},
    home:{name:'England',form:['W','D'],previous:[],next:[]},away:{name:'Italy',previous:[],next:[]}});
  assert.equal(body.home.form,'WD');assert.equal(body.home.name,'England');
  assert.equal(body.home.intent,'---');assert.equal(body.home.dataCoverage,0);
  assert.ok(body.warnings.length);
});
