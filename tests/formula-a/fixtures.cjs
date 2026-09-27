const table = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1, idx: i + 1, name: 'Team ' + (i + 1), pts: 30 - i,
  played: 7, goalConDiff: 3, scoresStr: '10-7',
}));
function fixture(id, day, teamId, { league = 10, finished = true, opponent = 80, cancelled = false } = {}) {
  return { id, home: { id: teamId, name: 'Team ' + teamId, score: 2 },
    away: { id: opponent, name: 'Team ' + opponent, score: 1 },
    tournament: { leagueId: league, timeZone: 'UTC', name: league === 10 ? 'League' : league === 99 ? 'Friendly' : 'Cup' },
    status: { utcTime: '2030-09-' + String(day).padStart(2, '0') + 'T18:00:00Z', finished, cancelled, scoreStr: '2 - 1' } };
}
const current = fixture(500, 10, 5, { opponent: 6, finished: false });
function team(id) {
  return { details: { latestSeason: '2030' }, table: [{ data: { leagueId: 10, table: { all: table } } }],
    fixtures: { allFixtures: { fixtures: [
      ...Array.from({ length: 8 }, (_, i) => fixture(id * 100 + i, i + 1, id, { league: i === 6 ? 99 : 10 })),
      current, fixture(id * 100 + 20, 11, id, { league: 20, finished: false }),
      fixture(id * 100 + 21, 12, id, { league: 99, finished: false }),
      fixture(id * 100 + 22, 13, id, { finished: false }),
      fixture(id * 100 + 23, 9, id, { cancelled: true }),
    ] } } };
}
module.exports = { table, fixture, current, team };
