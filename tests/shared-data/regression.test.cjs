const {test}=require('node:test');const assert=require('node:assert/strict');
const {load}=require('../formula-d/harness.cjs');
const {createCache}=load('lib/shared-data/cache.js',['createCache']).subject;
test('cache expires exactly at TTL and reloads',async()=>{let now=0,calls=0;const c=createCache(()=>now),fetch=async()=>({version:++calls});assert.equal((await c.get('standings',fetch,{ttlMs:30})).version,1);now=29;assert.equal((await c.get('standings',fetch,{ttlMs:30})).version,1);now=30;assert.equal((await c.get('standings',fetch,{ttlMs:30})).version,2);});
test('concurrent readers share one request but not mutable objects',async()=>{let calls=0;const c=createCache();const fetch=async()=>({rows:[++calls]});const [a,b]=await Promise.all([c.get('x',fetch,{ttlMs:100}),c.get('x',fetch,{ttlMs:100})]);a.rows[0]=99;assert.equal(b.rows[0],1);assert.equal((await c.get('x',fetch,{ttlMs:100})).rows[0],1);assert.equal(calls,1);});
test('failed loads are retried, not cached',async()=>{const c=createCache();await assert.rejects(c.get('x',async()=>{throw Error('offline')},{ttlMs:100}));assert.equal(await c.get('x',async()=>5,{ttlMs:100}),5);});
test('explicit refresh bypasses unexpired data',async()=>{const c=createCache();await c.get('x',async()=>1,{ttlMs:1000});assert.equal(await c.get('x',async()=>2,{ttlMs:1000,forceRefresh:true}),2);});
test('invalidation prevents old in-flight result repopulating cache',async()=>{const c=createCache();let release;const first=c.get('x',()=>new Promise(r=>release=r),{ttlMs:1000});await Promise.resolve();c.invalidate();assert.equal(await c.get('x',async()=>2,{ttlMs:1000}),2);release(1);await first;assert.equal(await c.get('x',async()=>3,{ttlMs:1000}),2);});

const liveIdentity=load('api/formula-d-live.js',['teamMatch']).subject;
const identity=load('lib/shared-data/team-resolver.js',['sameTeam','sameTeamCategory','similarity']).subject;
for(const other of ['England Women','England W','England 女足','England U21','England U23','England U19'])test('team identity isolates '+other,()=>{assert.equal(identity.sameTeam('England',other),false);assert.equal(identity.similarity('England',other),0);assert.equal(liveIdentity.teamMatch('England',other),false);});
test('club affixes normalize without removing women or youth identity',()=>{assert.equal(identity.sameTeam('FC Example','Example AFC'),true);assert.equal(liveIdentity.teamMatch('FC Example','Example AFC'),true);assert.equal(identity.sameTeam('Example Women','Example W'),true);assert.equal(identity.sameTeam('Example U21','Example U23'),false);});
test('similar senior names are not treated as identical',()=>assert.equal(identity.sameTeam('Manchester City','Manchester United'),false));

const competition=load('lib/shared-data/competition-resolver.js',['resolveCompetition','selectStandingsRoot']).subject;
for(const [name,kind] of [['UEFA Europa League','europa-league'],['UEFA Conference League','conference-league'],['UEFA Champions League','champions-league'],['UEFA Nations League A','nations-league']])test('current fixture resolves '+name,()=>assert.equal(competition.resolveCompetition({tournament:{leagueId:10,name}}).competition.kind,kind));
test('conflicting competition ids return explicit diagnostic',()=>assert.equal(competition.resolveCompetition({leagueId:20,tournament:{leagueId:10}}).diagnostic.code,'COMPETITION_AMBIGUOUS'));
test('no competition id is not inferred from an unrelated first table',()=>assert.equal(competition.resolveCompetition({}).diagnostic.code,'COMPETITION_MISSING'));
test('unlabelled singleton requires a bound competition request',()=>{const payload={table:[{data:{table:{all:[]}}}]};assert.equal(competition.selectStandingsRoot(payload,10).root,null);assert.ok(competition.selectStandingsRoot(payload,10,{boundLeagueId:10}).root);});

const tz=load('lib/shared-data/timezone.js',['kickoffContext']).subject;
test('UTC crossing midnight keeps actual New York kickoff date',()=>{const r=tz.kickoffContext({status:{utcTime:'2030-07-02T01:30:00Z'},tournament:{leagueId:10,timeZone:'America/New_York'}});assert.equal(r.date,'2030-07-01');});
test('unknown timezone is diagnosed rather than slicing UTC date',()=>assert.equal(tz.kickoffContext({status:{utcTime:'2030-07-02T01:30:00Z'}}).diagnostic.code,'FIXTURE_TIMEZONE_UNRESOLVED'));
test('explicit kickoff offset preserves supplied local date',()=>assert.equal(tz.kickoffContext({status:{utcTime:'2030-07-01T21:30:00-04:00'}}).date,'2030-07-01'));

const standings=load('lib/shared-data/standings-provider.js',['getStandings']).subject;
const row=(id,rank,points=9)=>({id,idx:rank,pts:points,played:3,name:'Synthetic Team'});
test('same team standings cannot cross competition boundaries',()=>{const payload={table:[{leagueId:20,data:{table:{all:[row(1,9)]}}},{leagueId:10,data:{table:{all:[row(1,2,12)]}}}]};const r=standings.getStandings(payload,{leagueId:10,sourceKind:'team'});assert.equal(r.rows[0].rank,2);assert.equal(r.rows[0].points,12);});
test('missing standings has explicit diagnostic and empty rows',()=>{const r=standings.getStandings({table:[]},{leagueId:10});assert.equal(r.diagnostic.code,'STANDINGS_NOT_FOUND');assert.equal(r.rows.length,0);});
test('duplicate matching standings are rejected',()=>{const t={leagueId:10,data:{table:{all:[row(1,2)]}}};assert.equal(standings.getStandings({table:[t,t]},{leagueId:10}).diagnostic.code,'STANDINGS_AMBIGUOUS');});
test('Nations group and league level are retained with current team points',()=>{const payload={table:[{data:{tables:[{leagueName:'League A Group 2',table:{all:[row(1,1,10),row(2,2,7)]}},{leagueName:'League B Group 1',table:{all:[row(3,1),row(4,2)]}}]}}]};const r=standings.getStandings(payload,{leagueId:10,competitionName:'UEFA Nations League',fixture:{home:{id:1},away:{id:2}}});assert.equal(r.group,'League A Group 2');assert.equal(r.leagueLevel,'A');assert.equal(r.rows[1].points,7);});
for(const competitionName of ['Domestic League','UEFA Champions League','UEFA Europa League','UEFA Conference League'])test('unified standings interface: '+competitionName,()=>{const r=standings.getStandings({table:[{data:{table:{all:[row(1,2)]}}}]},{leagueId:10,competitionName});assert.equal(r.rows[0].rank,2);assert.equal(r.diagnostic,null);});

const fixtures=load('lib/shared-data/fixture-normalizer.js',['normalizeFixture','selectCurrentFixture']).subject;
test('fixture normalization retains identity and local kickoff without mutating source',()=>{const f={id:7,home:{id:1},away:{id:2},tournament:{leagueId:10,timeZone:'America/New_York'},status:{utcTime:'2030-07-02T01:30:00Z',finished:true}};const r=fixtures.normalizeFixture(f);assert.equal(r.id,7);assert.equal(r.kickoff.date,'2030-07-01');assert.equal(r.finished,true);assert.equal(f.status.utcTime,'2030-07-02T01:30:00Z');});
test('fixture pairing requires both teams on the same match',()=>{const make=(id,away)=>({id,home:{id:1},away:{id:away},status:{utcTime:'2030-07-01T12:00:00Z'}});assert.equal(fixtures.selectCurrentFixture([make(3,9),make(4,2)],null,1,2,0).id,4);});

const schedule=load('lib/shared-data/schedule-provider.js',['scheduleView']).subject;
const games=Array.from({length:12},(_,i)=>({id:i,home:{id:1},away:{id:2},tournament:{leagueId:i%2?20:10},status:{utcTime:new Date(Date.UTC(2030,6,i+1,12)).toISOString(),finished:i<4}}));
test('A shared schedule keeps all competitions in previous3 current next2',()=>{const r=schedule.scheduleView(games,{kickoff:games[4].status.utcTime,currentFixture:games[4]});assert.deepEqual(Array.from(r.previous,x=>x.id),[1,2,3]);assert.equal(r.current.id,4);assert.deepEqual(Array.from(r.next,x=>x.id),[5,6]);});
test('Nations future window filters competition before taking six',()=>{const r=schedule.scheduleView(games,{kickoff:'2030-06-01T00:00:00Z',mode:'nations',leagueId:10});assert.ok(r.every(f=>f.tournament.leagueId===10));assert.equal(r.length,4);});
for(const expectedGames of [8,6])test('European complete schedule view retains '+expectedGames+' games',()=>{const data=games.map(f=>({...f,tournament:{leagueId:10}}));assert.equal(schedule.scheduleView(data,{kickoff:games[4].status.utcTime,mode:'europe',leagueId:10,expectedGames}).length,expectedGames);});
test('B domestic next3 keeps cross-competition games for rule-layer exclusion',()=>{assert.deepEqual(Array.from(schedule.scheduleView(games,{kickoff:games[4].status.utcTime,mode:'domestic'}),x=>x.id),[5,6,7]);});

const strength=load('lib/shared-data/strength-provider.js',['strengthTier','strengthInputs']).subject;
for(const name of ['Italy','Croatia'])test('single shared strength table keeps '+name+' Good',()=>assert.equal(strength.strengthTier(name),3));
test('C reads B supplied strength tiers without rebuilding a table',()=>{assert.equal(strength.strengthInputs({strengthTier:3,opponentStrengthTier:4}).strength,3);assert.equal(strength.strengthInputs({}).strength,null);});

const context=load('lib/shared-data/match-context-provider.js',['buildMatchContext']).subject;
test('unified context exposes competition teams kickoff standings schedule strength fatigue and qualification',()=>{const fixture={id:1,home:{id:1,name:'Italy'},away:{id:2,name:'Spain'},tournament:{leagueId:10,timeZone:'America/New_York',name:'UEFA Europa League'},status:{utcTime:'2030-07-02T01:30:00Z'}};const team={table:[{leagueId:10,data:{table:{all:[row(1,3),row(2,1)]}}}],fixtures:{allFixtures:{fixtures:[]}}};const r=context.buildMatchContext({fixture,homeTeam:team,awayTeam:team});assert.equal(r.competition.id,10);assert.equal(r.kickoff.date,'2030-07-01');assert.equal(r.strength.home,3);assert.equal(r.strength.away,4);assert.equal(r.standings.home.rows[0].rank,3);assert.equal(r.schedule.home.past.length,0);assert.equal(r.fatigue.home.lastKickoff,null);assert.equal(r.qualification.verified,false);});
test('C pre-match context is short-lived and refreshed after fixture completion',async()=>{let calls=0,now=0;const module=load('lib/shared-data/match-context-provider.js',['fetchPreMatchContext','refreshAfterFinishedMatch'],{trackedFetch:async()=>({ok:true,json:async()=>({home:{rank:++calls},away:{}})}),Date:class extends Date{static now(){return now;}}}).subject;assert.equal((await module.fetchPreMatchContext({},'Home','Away')).homeRank,1);assert.equal((await module.fetchPreMatchContext({},'Home','Away')).homeRank,1);now=15000;assert.equal((await module.fetchPreMatchContext({},'Home','Away')).homeRank,2);module.refreshAfterFinishedMatch([1,2],10);assert.equal((await module.fetchPreMatchContext({},'Home','Away')).homeRank,3);});
test('prematch cache does not cross authentication scopes',async()=>{let calls=0;const module=load('lib/shared-data/match-context-provider.js',['fetchPreMatchContext'],{trackedFetch:async()=>({ok:true,json:async()=>({home:{rank:++calls}})})}).subject;const a=await module.fetchPreMatchContext({headers:{authorization:'synthetic-a'}},'Home','Away'),b=await module.fetchPreMatchContext({headers:{authorization:'synthetic-b'}},'Home','Away');assert.equal(a.homeRank,1);assert.equal(b.homeRank,2);});

test('provider cache TTLs and completed-match invalidation refetch standings and schedules',async()=>{
 let now=0,calls=0;const p=load('lib/shared-data/cache.js',['getProviderJson','invalidateMatchData','STANDINGS_TTL_MS','SCHEDULE_TTL_MS'],{trackedFetch:async()=>({ok:true,json:async()=>({version:++calls})}),Date:class extends Date{static now(){return now;}}}).subject;
 assert.equal(p.STANDINGS_TTL_MS,30000);assert.equal(p.SCHEDULE_TTL_MS,15000);
 const team='/teams?id=1&ccode3=USA',league='/leagues?id=10&ccode3=USA';
 assert.equal((await p.getProviderJson(team)).version,1);assert.equal((await p.getProviderJson(league)).version,2);
 now=15000;assert.equal((await p.getProviderJson(team)).version,3);assert.equal((await p.getProviderJson(league)).version,2);
 now=30000;assert.equal((await p.getProviderJson(league)).version,4);
 p.invalidateMatchData([1,2],10);assert.equal((await p.getProviderJson(team)).version,5);assert.equal((await p.getProviderJson(league)).version,6);
});
test('cache is isolated per competition path',async()=>{const p=load('lib/shared-data/cache.js',['getProviderJson'],{trackedFetch:async url=>({ok:true,json:async()=>({url})})}).subject;assert.notEqual((await p.getProviderJson('/leagues?id=10&ccode3=USA')).url,(await p.getProviderJson('/leagues?id=20&ccode3=USA')).url);});

test('provider candidate resolution keeps senior women and U21 requests separate',async()=>{
 const candidates=[{id:1,type:'team',name:'England'},{id:2,type:'team',name:'England Women'},{id:3,type:'team',name:'England U21'}];
 const resolver=load('lib/shared-data/team-resolver.js',['searchCandidates'],{trackedFetch:async url=>({ok:true,json:async()=>url.includes('/search/suggest')?[{suggestions:candidates}]:{teams:[]}})}).subject;
 for(const [name,id] of [['England',1],['England Women',2],['England U21',3]]){const r=await resolver.searchCandidates(name);assert.equal(r.length,1);assert.equal(r[0].id,id);}
});
test('A supplemental provider cannot turn a senior query into a women fixture',async()=>{
 let eventRequests=0;const module=load('api/auto-fill.js',['supplementalFutureRows'],{requireAuth:async()=>({}),resolveTeamPair:async()=>({}),trackedFetch:async url=>{if(url.includes('/eventsnext'))eventRequests++;return {ok:true,json:async()=>({teams:[{idTeam:9,strTeam:'England Women'}]})};}}).subject;
 const result=await module.supplementalFutureRows('England',0);assert.equal(result.length,0);assert.equal(eventRequests,0);
});
test('Nations duplicate groups are diagnosed instead of selecting first',()=>{const group={leagueName:'League A Group 1',table:{all:[row(1,1),row(2,2)]}};const r=standings.getStandings({table:[{data:{tables:[group,group]}}]},{leagueId:10,competitionName:'UEFA Nations League',fixture:{home:{id:1},away:{id:2}}});assert.equal(r.diagnostic.code,'STANDINGS_GROUP_AMBIGUOUS');});
test('shared context preserves supplied qualification/relegation facts without inferring rules',()=>{const q={verified:true,requiredPoints:1,consequence:'relegation'};const r=context.buildMatchContext({fixture:{tournament:{leagueId:10},status:{utcTime:'2030-07-01T12:00:00+00:00'}},qualification:q,fields:[]});assert.equal(r.qualification,q);});
