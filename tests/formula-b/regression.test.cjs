const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { engine, side, context, next, routeB, intentRoute } = require('./harness.cjs');
const e = engine();
const classify = (s, o, c = context()) => e.classifyIntent(s, o, c);

for (const name of ['Spain', 'England', 'France', 'Portugal', 'Belgium', 'Norway', 'Germany', 'Netherlands'])
  test('locked Elite: ' + name, () => assert.equal(e.strengthTier(name), 4));
for (const name of ['Italy', 'Croatia', 'Switzerland', 'Denmark', 'Austria', 'Serbia', 'Türkiye', 'Sweden', 'Ukraine', 'Czechia'])
  test('locked Good: ' + name, () => assert.equal(e.strengthTier(name), 3));
test('Italy must never be promoted to Elite', () => assert.notEqual(e.strengthTier('Italy'), 4));

const pressured = next(['Spain', 'Italy', 'Denmark']);
for (const [label, s, o, expected] of [
  ['home against one tier lower', side(3, { next3: pressured }), side(2), 'Want Win'],
  ['away against one tier lower', side(3, { isHome: false, next3: pressured }), side(2), 'Hope Win'],
  ['capable side avoids loss to Elite under pressure', side(3, { next3: pressured }), side(4), "Don't Lose"],
  ['same-tier without independent evidence', side(3), side(3), '---'],
  ['missing strength data', side(null), side(3), '---'],
  ['two-tier capability deficit cannot be rescued by pressure', side(2, { next3: pressured }), side(4), '---'],
]) test(label, () => assert.equal(classify(s, o).intent, expected));
test('away versus opponent one tier higher never exceeds Hope Win by default', () => {
  assert.ok(['Hope Win', "Don't Lose", '---'].includes(classify(side(2, { isHome: false }), side(3)).intent));
});
test('same-league next-three pressure excludes cup/friendly entries', () => {
  const result = classify(side(3, { next3: [...next(['Spain']), ...next(['Italy', 'Denmark'], 99)] }), side(2));
  assert.equal(result.schedulePressure.eligibleSameLeagueGames, 1);
  assert.equal(result.schedulePressure.excludedCrossCompetitionGames, 2);
});
test('fourth future match cannot trigger domestic next-three pressure', () => {
  const result = classify(side(3, { next3: [...next(['Armenia', 'Latvia', 'Malta']), ...next(['Spain'])] }), side(2));
  assert.equal(result.schedulePressure, undefined);
});
test('Good versus Good before Elite/Good remains Hope Win: Good is not stronger', () => {
  assert.equal(classify(side(3, { next3: next(['Spain', 'Italy']) }), side(3)).intent, 'Hope Win');
});
test('unverified competition format must yield ---', () => {
  assert.equal(classify(side(4), side(2), context({ table: [], leagueId: 0, competition: '', isDomesticLeague: false })).intent, '---');
});
test('strength four-tier advantage alone cannot override intent evidence', () => {
  assert.equal(classify(side(4, { formScore: null, next3: [] }), side(2)).intent, '---');
});
test('away win odds above 4.00 need uncertainty handling rather than automatic Want Win', () => {
  // No current production odds input contract exists. These explicit evidence
  // fields deliberately expose that the engine ignores verified market data.
  const result = classify(side(4, { isHome: false, winOdds: 4.10, marketOdds: { away: 4.10, verified: true } }), side(2));
  assert.ok(['Hope Win', '---'].includes(result.intent), 'Market evidence is not consumed: ' + result.intent);
});
function nationsContext() {
  return context({ isNationsLeague: true, competition: 'UEFA Nations League A', table: [
    { teamId: 4, rank: 1, points: 12, played: 5 }, { teamId: 3, rank: 2, points: 10, played: 5 },
    { teamId: 2, rank: 3, points: 6, played: 5 }, { teamId: 1, rank: 4, points: 4, played: 5 },
  ] });
}
test('Nations League required points with realistic ability can be Must Win', () => {
  assert.equal(classify(side(3), side(2), nationsContext()).intent, 'Must Win');
});
test('Nations League required points but insufficient capability stays Hope Win, not Must Win', () => {
  assert.equal(classify(side(1), side(4), nationsContext()).intent, 'Hope Win');
});
test('Nations League mathematical need does not bypass missing ability information', () => {
  assert.equal(classify(side(null), side(4), nationsContext()).intent, '---');
});
test('Nations League strength priority avoids domestic away-one-tier venue ceiling', () => {
  const ctx = context({ isNationsLeague: true, competition: 'UEFA Nations League A' });
  const home = classify(side(3, { next3: pressured }), side(2), ctx);
  const away = classify(side(3, { isHome: false, next3: pressured }), side(2), ctx);
  assert.equal(away.intent, home.intent);
});
test('Nations League future six includes only that competition', async () => {
  const { body } = await intentRoute({ competition: 'UEFA Nations League A', games: 9, tableSize: 4 });
  assert.equal(body.home.next3.length, 6);
  assert.ok(body.home.next3.every(f => f.leagueId === 10 && !f.competition.includes('Friendly')));
});
test('Nations League response includes group rank, points, League and Group identity', async () => {
  const { body } = await intentRoute({ competition: 'UEFA Nations League A', games: 9, tableSize: 4 });
  assert.equal(body.nationsLeague.leagueLevel, 'A'); assert.equal(body.nationsLeague.groupName, 'Group 2');
  assert.equal(body.home.rank, 1); assert.equal(body.competitionTable[0].points, 12);
});
test('Nations League League identity is retained when only group metadata contains it', async () => {
  const { body } = await intentRoute({ competition: 'UEFA Nations League', games: 9, tableSize: 4, groupName: 'League A Group 2' });
  assert.equal(body.nationsLeague.leagueLevel, 'A');
});
for (const [competition, count] of [['UEFA Europa League', 8], ['UEFA Conference League', 6]]) {
  test(competition + ' full phase schedule and 36-team total standings', async () => {
    const { body, calls } = await intentRoute({ competition, games: count });
    assert.equal(body.home.europeSchedule.length, count); assert.equal(body.away.europeSchedule.length, count);
    assert.equal(body.european.expectedGames, count); assert.equal(body.competitionTable.length, 36);
    assert.ok(body.home.europeSchedule.every(f => f.leagueId === 10));
    assert.ok(calls.some(url => url.includes('/leagues?id=10&')));
    assert.equal(body.home.rankSource, competition); assert.equal(body.home.rank, 1);
  });
  test(competition + ' incomplete phase schedule must not appear complete without diagnostic', async () => {
    const { body } = await intentRoute({ competition, games: 3 });
    assert.ok(body.home.europeSchedule.length === count || body.error || body.warnings?.length || body.qa?.incompleteSchedule,
      'Only ' + body.home.europeSchedule.length + ' games returned with no incomplete-schedule diagnostic');
  });
}
test('missing competition rank must not silently use a domestic league rank', async () => {
  const { body } = await intentRoute({ missingRank: true });
  assert.equal(body.home.rank, null, 'Current engine falls back to domestic rank ' + body.home.rank);
});

for (const [dates, expected] of [[['2030-09-01'], '不累'], [['2030-09-08'], '累'], [['2030-09-06', '2030-09-08'], '很累']]) {
  test('fatigue ' + expected, () => assert.equal(e.fatigueFromPast(dates.map(date => ({ status: { utcTime: date + 'T12:00:00Z' } })), '2030-09-10'), expected));
}
for (const [dates, expected] of [[['2030-09-12', '2030-09-14'], '☑️×2'], [['2030-09-12', '2030-09-20'], '☑️'], [['2030-09-16', '2030-09-22'], '❌']])
  test('density ' + expected, () => assert.equal(e.futureMark(dates.map(date => ({ date })), '2030-09-10'), expected));
test('loose first interval cannot become ☑️ from a tight second interval alone', () => {
  assert.equal(e.futureMark([{ date: '2030-09-16' }, { date: '2030-09-18' }], '2030-09-10'), '❌');
});

const bData = { match: { date: '2030-09-10', competition: 'UEFA Nations League A' },
  home: { name: 'England', ranking: [{ focus: true, rank: 1 }], previous: [{ date: '2030-09-06' }, { date: '2030-09-08' }],
    next: Array.from({ length: 6 }, (_, i) => ({ date: '2030-09-' + (12 + i), competition: 'UEFA Nations League A', opponent: 'Italy', ha: 'H' })) },
  away: { name: 'Italy', previous: [], next: [] } };
test('real Formula B API route rejects missing input', async () => assert.equal((await routeB({})).status, 400));
test('real Formula B API exposes the requested intent-engine result', async () => {
  const { body } = await routeB(bData);
  assert.ok(['Must Win', 'Want Win', 'Hope Win', "Don't Lose", '---'].includes(body.home.intent), 'Formula B route has no intent field');
});
test('real Formula B API supports six Nations League future fixtures', async () => {
  assert.equal((await routeB(bData)).body.home.next3.length, 6);
});
test('real Formula B API retains very-tired two-short-gaps category', async () => {
  assert.equal((await routeB(bData)).body.home.fatigue, '很累');
});
test('UI batch still calls Formula B route; intent implementation is not silently substituted', () => {
  assert.match(fs.readFileSync('public/batch-ab.js', 'utf8'), /fetch\("\/api\/formula-b"/);
  assert.match(fs.readFileSync('api/formula-c.js', 'utf8'), /Formula B Master Rules/);
});
