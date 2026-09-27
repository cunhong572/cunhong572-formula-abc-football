const { load } = require('../formula-d/harness.cjs');
const blocked = () => { throw new Error('Live network/database access forbidden'); };
const canonicalTeam = load('lib/team-resolver.js', ['canonicalTeam'], { trackedFetch: blocked }).subject.canonicalTeam;
function engine() {
  return load('api/formula-c.js', ['classifyIntent', 'strengthTier', 'competitionNeed', 'fatigueFromPast', 'futureMark'], {
    requireAuth: async () => ({}), canonicalTeam, resolveTeamPair: blocked,
    trackedFetch: blocked, getFormulaABCWeights: async () => ({ C: { config: {} } }),
  }).subject;
}
function side(tier = 3, overrides = {}) {
  return { teamId: 1, name: 'Italy', tier, isHome: true, next3: [], fatigue: '不累', density: '❌', formScore: null, ...overrides };
}
function context(overrides = {}) {
  return { leagueId: 10, competition: 'Synthetic League', isDomesticLeague: true,
    table: [{ teamId: 1, rank: 2, points: 10, played: 2 }, { teamId: 2, rank: 1, points: 14, played: 2 }], ...overrides };
}
function next(opponents, leagueId = 10) { return opponents.map(opponent => ({ opponent, leagueId })); }
async function routeB(data) {
  const { handler } = load('api/formula-b.js', ['handler'], { requireAuth: async () => ({}) }).subject;
  let body, status = 200;
  await handler({ body: { data } }, { status(n) { status = n; return this; }, json(v) { body = v; } });
  return { status, body };
}
function rawFixture(id, index, leagueId, name, finished = false) {
  return { id, home: { id: 1, name: 'England', score: 2 }, away: { id: 2, name: 'Italy', score: 1 },
    tournament: { leagueId, name }, status: { utcTime: new Date(Date.UTC(2030, 8, 10 + index, 18)).toISOString(), finished } };
}
async function intentRoute({ competition = 'UEFA Europa League', games = 8, tableSize = 36,
  missingRank = false, groupName = 'Group 2', route = 'api/formula-c.js', marketOdds } = {}) {
  const nations = competition.includes('Nations');
  const current = rawFixture(100, 0, 10, competition);
  const rows = Array.from({ length: tableSize }, (_, i) => ({
    id: missingRank && i === 0 ? 999 : i + 1, name: i === 0 ? 'England' : i === 1 ? 'Italy' : 'Synthetic ' + i,
    idx: i + 1, pts: 12 - Math.min(i, 10), played: 2, goalConDiff: 1, scoresStr: '3-2',
  }));
  const schedule = Array.from({ length: games }, (_, i) => rawFixture(100 + i, i, 10, competition));
  const mixed = nations ? schedule.flatMap((f, i) => [f, rawFixture(300 + i, i + 0.5, 99, 'Friendly')]) : schedule;
  const team = id => ({ fixtures: { allFixtures: { fixtures: mixed } }, table: [{ data: { table: { all: [{ id, name: id === 1 ? 'England' : 'Italy', idx: 9, pts: 20 }] } } }] });
  const league = { table: [{ data: nations ? { tables: [{ leagueName: groupName, table: { all: rows } }] } : { table: { all: rows } } }] };
  const calls = [];
  const { handler } = load(route, ['handler'], {
    requireAuth: async () => ({}), canonicalTeam,
    resolveTeamPair: async () => ({ home: { id: 1 }, away: { id: 2 }, fixture: current }),
    trackedFetch: async url => { calls.push(url); return { ok: true, json: async () =>
      url.includes('/leagues?') ? league : team(Number(new URL(url).searchParams.get('id'))) }; },
    getFormulaABCWeights: async () => ({ C: { config: {} } }),
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2030-09-10T12:00:00Z'])); }
      static now() { return Date.parse('2030-09-10T12:00:00Z'); } },
  }).subject;
  let body, status = 200;
  await handler({ body: { home: 'England', away: 'Italy', marketOdds } }, { status(n) { status = n; return this; }, json(v) { body = v; } });
  if (status !== 200) throw new Error(JSON.stringify(body));
  return { body, calls };
}
module.exports = { engine, side, context, next, routeB, intentRoute };
