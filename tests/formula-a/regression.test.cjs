const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { api, automatic, frontend } = require('./harness.cjs');
const { table, team } = require('./fixtures.cjs');
const golden = require('./v263-baseline.json');
const autoBindings = { requireAuth: async () => ({}), resolveTeamPair() { throw new Error('No live lookup'); }, trackedFetch() { throw new Error('No network'); } };
const helpers = names => api('api/auto-fill.js', names, autoBindings);
const plain = value => JSON.parse(JSON.stringify(value));
const result = automatic();
const output = result.then(({ data }) => frontend(data).exportWorkbook());

test('offline auto-fill response retains the complete pre-refactor API contract', async () => {
  assert.deepEqual((await result).data, golden.api);
});
test('ranking consumes the latest table fetched at request time', async () => {
  const { calls } = await result;
  assert.ok(calls.some(url => url.endsWith('/teams?id=5&ccode3=USA')));
  assert.ok(calls.some(url => url.endsWith('/teams?id=6&ccode3=USA')));
  const { tableFromTeam } = helpers(['tableFromTeam']);
  assert.deepEqual(plain(tableFromTeam(team(5), 10)), table);
});
test('standing rows preserve supplied official rank/order without homemade tiebreaks', () => {
  const { standingRows } = helpers(['standingRows']);
  const supplied = table.map((x, i) => ({ ...x, idx: 20 - i, pts: i === 0 ? 999 : x.pts }));
  assert.deepEqual(plain(standingRows(supplied, 5)).map(x => x.rank), [19, 18, 17, 16, 15, 14, 13]);
});
test('focus has three above and three below', async () => {
  const { data } = await result;
  assert.deepEqual(data.home.ranking.map(x => x.rank), [2, 3, 4, 5, 6, 7, 8]);
  assert.equal(data.home.ranking[3].focus, true);
});
for (const focus of [1, 10]) {
  test('ranking edge ' + focus + ' keeps focus in the fourth worksheet row', () => {
    const { standingRows } = helpers(['standingRows']);
    const front = frontend({}); front.context.__rows = standingRows(table, focus);
    const rows = front.call('centeredRanking(__rows)');
    assert.equal(rows.length, 7); assert.equal(rows[3].teamId, focus);
    assert.equal(rows[focus === 1 ? 0 : 6], null);
  });
}
test('averages round goals for/against to exactly two decimals', () => {
  const { avgFromTable } = helpers(['avgFromTable']);
  assert.deepEqual(plain(avgFromTable([{ id: 5, played: 3, scoresStr: '10-2' }], 5)),
    { gf: '3.33', ga: '0.67', raw: { gf: 10, ga: 2, played: 3 } });
});
test('missing average sample remains blank', () => {
  const { avgFromTable } = helpers(['avgFromTable']);
  assert.equal(avgFromTable([{ id: 5, played: 0 }], 5).gf, '');
  assert.equal(avgFromTable([], 5).ga, '');
});
for (const [a, b, expected] of [
  ['2030-09-01', '2030-09-05', 3], ['2030-09-01', '2030-09-02', 0],
  ['2030-09-01', '2030-09-01', ''], ['2030-09-02', '2030-09-01', ''],
  ['', '2030-09-01', ''], ['2028-02-28', '2028-03-01', 1],
]) {
  test('Days calendar difference minus one: ' + a + ' to ' + b, () => {
    const { dateGap } = api('api/formula-a-evaluate.js', ['dateGap'], { requireAuth: async () => ({}) });
    const front = frontend({});
    assert.equal(front.call('daysBetween(' + JSON.stringify(a) + ',' + JSON.stringify(b) + ')'), expected);
    assert.equal(dateGap(a, b), expected === '' ? '—' : String(expected));
  });
}
test('schedule is previous three, current, next two in chronological order', async () => {
  const { data } = await result; const front = frontend(data);
  const rows = plain(front.call('exactSchedule("home")'));
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map(x => x.date), ['2030-09-06', '2030-09-07', '2030-09-08', '2030-09-10', '2030-09-11', '2030-09-12']);
  assert.deepEqual(rows.map(x => x.days), [0, 0, 0, 1, 0, 0]);
});
test('schedules include friendlies and cups, and exclude cancelled fixtures', async () => {
  const { data } = await result;
  assert.equal(data.home.previous[1].competition, 'Friendly');
  assert.deepEqual(data.home.next.map(x => x.competition), ['Cup', 'Friendly']);
  assert.ok(data.home.previous.every(x => x.date !== '2030-09-09'));
});
test('Form is capped at five even when more same-competition fixtures exist', async () => {
  assert.deepEqual((await result).data.home.form, ['W', 'W', 'W', 'W', 'W']);
});
test('Form excludes losses in other competitions and ignores older sixth/seventh results', async () => {
  const { data } = await automatic(value => {
    const fixtures = value.fixtures.allFixtures.fixtures;
    for (const index of [0, 1, 6]) { fixtures[index].home.score = 0; fixtures[index].away.score = 9; }
    return value;
  });
  assert.deepEqual(data.home.form, ['W', 'W', 'W', 'W', 'W']);
});
test('Form uses fewer than five when only one same-competition game exists', async () => {
  const { data } = await automatic(value => {
    value.fixtures.allFixtures.fixtures.forEach((f, i) => { if (i < 6) f.tournament.leagueId = 99; });
    return value;
  });
  assert.deepEqual(data.home.form, ['W']);
});
test('kickoff date converts UTC across midnight into verified New York zone', () => {
  const { dateInTimeZone } = api('lib/formula-a/fatigue-days.js', ['dateInTimeZone']);
  assert.equal(dateInTimeZone('2030-09-10T01:00:00Z', 'America/New_York'), '2030-09-09');
});
test('table selection uses match competition even when it is not first', () => {
  const { tableFromTeam } = helpers(['tableFromTeam']);
  assert.equal(tableFromTeam({ table: [{ leagueId: 20, data: { table: { all: [{ id: 'first' }] } } },
    { leagueId: 10, data: { table: { all: [{ id: 'match' }] } } }] }, 10)[0].id, 'match');
});
test('evaluate filters invalid Form values and caps at five', async () => {
  const { handler } = api('api/formula-a-evaluate.js', ['handler'], { requireAuth: async () => ({}) });
  let data; await handler({ body: { form: ['W', 'X', 'D', 'L', 'W', 'D', 'L'] } }, { json(v) { data = v; } });
  assert.equal(data.formText, 'W / D / L / W / D');
});
for (const [gf, ga, played, expected] of [[20, 10, 10, '进攻'], [14, 10, 10, '微攻'], [10, 15, 10, '微守'], [10, 8, 10, '防守'], [0, 0, 0, '']]) {
  test('coach style ' + expected + ' from goal averages', () => {
    assert.equal(helpers(['classifyStyle']).classifyStyle(gf, ga, played), expected);
  });
}
test('style selectors offer only the four locked categories plus empty', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  for (const id of ['homeStyle', 'awayStyle']) {
    const select = html.match(new RegExp('<select id="' + id + '">([^]*?)</select>'))[1];
    assert.deepEqual([...select.matchAll(/<option>(.*?)<\/option>/g)].map(m => m[1]), ['', '进攻', '微攻', '微守', '防守']);
  }
});
for (const [address, name] of [['A16', 'Team 5'], ['A50', 'Team 6']]) {
  test(address + ' fixed focus row is yellow in the actual exported XLSX', async () => {
    const { sheet, styles } = await output;
    const cell = sheet.querySelector('c[r="' + address + '"]');
    assert.equal(cell.textContent, name);
    const xf = styles.querySelector('cellXfs').children[Number(cell.getAttribute('s'))];
    const fill = styles.querySelector('fills').children[Number(xf.getAttribute('fillId'))];
    assert.equal(fill.querySelector('fgColor').getAttribute('rgb'), 'FFFFFF00');
  });
}
test('export key cells retain current layout and two-decimal text', async () => {
  const { sheet } = await output;
  for (const [address, expected] of Object.entries({ A2: 'Team 5 (5)', C2: 'Team 6 (6)', B16: '5', B50: '6',
    B30: '1.43', B31: '1.00', B64: '1.43', B65: '1.00', C34: 'WWWWW', C68: 'WWWWW', B35: '微攻', B69: '微攻',
    D26: 'Team 5 vs Team 6', D60: 'Team 5 vs Team 6', H26: '1', H60: '1' }))
    assert.equal(sheet.querySelector('c[r="' + address + '"]').textContent, expected, address);
});
test('all exported ZIP entries retain baseline data/layout/style except authorized print metadata', async () => {
  const { zip } = await output;
  const hashes = {};
  for (const [name, entry] of Object.entries(zip.files)) if (!entry.dir) {
    let bytes = await entry.async('nodebuffer');
    if (name === 'xl/worksheets/sheet1.xml') {
      const xml = bytes.toString().replace(/<sheetPr\b[^>]*>[^]*?<\/sheetPr>/, '')
        .replace(/<pageSetup\b[^>]*>[^]*?<\/pageSetup>/, '');
      bytes = Buffer.from(xml);
    }
    hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  assert.deepEqual(hashes, golden.zipEntries);
});
test('one-sheet template explicitly prints on one page in original portrait orientation', async () => {
  const { sheet, zip } = await output;
  assert.equal(Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length, 1);
  const page = sheet.querySelector('pageSetup');
  assert.equal(page.getAttribute('fitToWidth'), '1');
  assert.equal(page.getAttribute('fitToHeight'), '1');
  assert.equal(page.getAttribute('orientation'), 'portrait');
  assert.equal(sheet.querySelector('pageSetUpPr').getAttribute('fitToPage'), '1');
});

for (const [value, zone, expected] of [
  ['2030-09-10T23:30:00Z', 'Asia/Tokyo', '2030-09-11'],
  ['2026-03-08T04:59:59Z', 'America/New_York', '2026-03-07'],
  ['2026-03-08T07:00:00Z', 'America/New_York', '2026-03-08'],
  ['2026-11-01T06:30:00Z', 'America/New_York', '2026-11-01'],
  ['2030-09-10T00:30:00+09:00', undefined, '2030-09-10'],
  ['2030-09-10', undefined, '2030-09-10'],
]) {
  test('local kickoff date: ' + value + ' in ' + zone, () => {
    const { dateInTimeZone } = api('lib/formula-a/fatigue-days.js', ['dateInTimeZone']);
    assert.equal(dateInTimeZone(value, zone), expected);
  });
}
test('known competition zone supplies missing fixture zone, venue zone takes precedence', () => {
  const { fixtureDate, knownCompetitionTimeZones } = api('lib/formula-a/fatigue-days.js', ['fixtureDate', 'knownCompetitionTimeZones']);
  const map = knownCompetitionTimeZones([{ tournament: { leagueId: 10, timeZone: 'Asia/Tokyo' } }]);
  const f = { status: { utcTime: '2030-09-10T23:30:00Z' }, tournament: { leagueId: 10 } };
  assert.equal(fixtureDate(f, map), '2030-09-11');
  assert.equal(fixtureDate({ ...f, venue: { timeZone: 'America/New_York' } }, map), '2030-09-10');
});
test('ambiguous league time zones never infer a date for an unlabelled UTC kickoff', () => {
  const { fixtureDate, knownCompetitionTimeZones } = api('lib/formula-a/fatigue-days.js', ['fixtureDate', 'knownCompetitionTimeZones']);
  const zones = knownCompetitionTimeZones(['Asia/Tokyo', 'America/New_York'].map(timeZone => ({ tournament: { leagueId: 10, timeZone } })));
  assert.throws(() => fixtureDate({ status: { utcTime: '2030-09-10T23:30:00Z' }, tournament: { leagueId: 10 } }, zones),
    error => error.code === 'FIXTURE_TIMEZONE_UNRESOLVED');
});
test('invalid or absent kickoff zones return typed diagnostics', () => {
  const { dateInTimeZone } = api('lib/formula-a/fatigue-days.js', ['dateInTimeZone']);
  assert.throws(() => dateInTimeZone('2030-09-10T01:00:00Z'), error => error.code === 'FIXTURE_TIMEZONE_UNRESOLVED');
  assert.throws(() => dateInTimeZone('2030-09-10T01:00:00Z', 'Invalid/Zone'), error => error.code === 'FIXTURE_TIMEZONE_INVALID');
  assert.throws(() => dateInTimeZone('2030-09-10T01:00:00', 'Asia/Tokyo'), error => error.code === 'FIXTURE_DATE_INVALID');
});
test('API schedule and worksheet Days use converted dates across UTC midnight', async () => {
  const { data } = await automatic(value => {
    value.fixtures.allFixtures.fixtures.forEach(f => { f.tournament.timeZone = 'America/New_York'; }); return value;
  }, match => { match.status.utcTime = '2030-09-10T01:00:00Z'; match.tournament.timeZone = 'America/New_York'; return match; });
  assert.equal(data.match.date, '2030-09-09');
  assert.equal(data.home.previous.at(-1).date, '2030-09-08');
  const rows = frontend(data).call('exactSchedule("home")');
  assert.equal(rows[3].days, 0);
});
test('auto-fill reports unknown timezone rather than silently exporting a UTC date', async () => {
  await assert.rejects(automatic(value => {
    value.fixtures.allFixtures.fixtures.forEach(f => { delete f.tournament.timeZone; }); return value;
  }, match => { delete match.tournament.timeZone; return match; }), /FIXTURE_TIMEZONE_UNRESOLVED/);
});
for (const [name, tables, code] of [
  ['missing league', [{ data: { leagueId: 20, table: { all: table } } }], 'STANDINGS_NOT_FOUND'],
  ['unlabelled table', [{ data: { table: { all: table } } }], 'STANDINGS_NOT_FOUND'],
  ['duplicate league', [1, 2].map(() => ({ data: { leagueId: 10, table: { all: table } } })), 'STANDINGS_AMBIGUOUS'],
]) {
  test('API explicit standings diagnostic for ' + name, async () => {
    await assert.rejects(automatic(value => { value.table = tables; return value; }), new RegExp(code));
  });
}
test('API standings and averages use the match table, not a different first league', async () => {
  const { data } = await automatic(value => {
    value.table.unshift({ data: { leagueId: 20, table: { all: table.map(x => ({ ...x, scoresStr: '99-99', idx: 99 })) } } });
    return value;
  });
  assert.equal(data.home.ranking[3].rank, 5);
  assert.equal(data.home.averages.gf, '1.43');
});
test('explicit existing landscape orientation survives single-page setup', async () => {
  const { data } = await result;
  const template = await frontend(data).template();
  const xml = await template.file('xl/worksheets/sheet1.xml').async('string');
  template.file('xl/worksheets/sheet1.xml', xml.replace('</x:worksheet>', '<x:pageSetup orientation="landscape" fitToWidth="2" fitToHeight="3" /></x:worksheet>'));
  const exported = await frontend(data, await template.generateAsync({ type: 'base64' })).exportWorkbook();
  const page = exported.sheet.querySelector('pageSetup');
  assert.equal(page.getAttribute('orientation'), 'landscape');
  assert.equal(page.getAttribute('fitToWidth'), '1'); assert.equal(page.getAttribute('fitToHeight'), '1');
});
test('generated browser module matches its shared production source', () => {
  const { build } = require('../../scripts/build-formula-a.cjs');
  assert.equal(fs.readFileSync('public/formula-a-modules.js', 'utf8').replaceAll('\r\n', '\n'), build().replaceAll('\r\n', '\n'));
});
