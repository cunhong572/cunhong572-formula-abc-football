const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, parser, clock } = require('./harness.cjs');
const kickoff = '2030-01-02T12:00:00.000Z';
const target = { id: 1, home: 'Alpha City', away: 'Beta Town', kickoff };
const cloud = (names, bindings) => load('lib/formula-e-cloud.js', names, bindings);

for (const [decimal, split, expected] of [['decimal', 'split', '1/1.5'], ['decimal-175', 'split-175', '1.5/2']]) {
  test(decimal + ' and split notation produce equivalent markets', async () => {
    const a = (await parser(decimal)([target])).items;
    const b = (await parser(split)([target])).items;
    assert.equal(a.length, 1); assert.equal(b.length, 1);
    assert.equal(a[0].line, expected); assert.equal(b[0].line, expected);
    assert.equal(a[0].odds, b[0].odds);
  });
}
test('normal first-half market reads Over, not the closer Under price', async () => {
  const result = await parser('normal')([target]);
  assert.equal(result.items.length, 1); assert.equal(result.items[0].odds, 1.95);
});
test('multiple lines choose Over nearest 1.88', async () => {
  const result = await parser('multiple')([target]);
  assert.equal(result.items[0].line, '1/1.5'); assert.equal(result.items[0].odds, 1.89);
});
for (const [name, line, odds] of [['tie', '1', 1.86], ['tie-reversed', '1.5', 1.90]]) {
  test(name + ': equal distance retains first visual row', async () => {
    const result = await parser(name)([target]);
    assert.equal(result.items[0].line, line); assert.equal(result.items[0].odds, odds);
  });
}
test('first-half parser excludes Full Time and adjacent fixture markets', async () => {
  const result = await parser('mixed')([target]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].line, '1/1.5'); assert.equal(result.items[0].odds, 1.95);
});
test('exact team pair wins over a similar team name', async () => {
  const result = await parser('similar')([target]);
  assert.equal(result.items[0].line, '1.5'); assert.equal(result.items[0].odds, 1.95);
});
for (const name of ['missing', 'cross-fixture']) {
  test(name + ': never combine similar names or teams from separate fixtures', async () => {
    const result = await parser(name)([target]);
    assert.equal(result.items.length, 0); assert.match(result.diagnostic, /team row not unique/);
  });
}
test('strict requirement: women teams must not substitute for the missing senior fixture', async () => {
  const result = await parser('women-only')([target]);
  assert.equal(result.items.length, 0, 'Current suffix normalization can conflate women and senior teams');
});
for (const name of ['england-women', 'switzerland-women', 'gender-w', 'gender-chinese', 'age-u21', 'age-u23', 'age-u19']) {
  test(name + ': gender/age identity cannot match the senior fixture', async () => {
    const result = await parser(name)([{ ...target, home: 'England', away: 'Switzerland' }]);
    assert.equal(result.items.length, 0);
  });
}
for (const name of ['club-affixes', 'club-afc', 'club-cf-sc']) {
  test(name + ': ordinary club prefixes/suffixes still match', async () => {
    const result = await parser(name)([{ ...target, home: 'England', away: 'Switzerland' }]);
    assert.equal(result.items.length, 1); assert.equal(result.items[0].odds, 1.95);
  });
}
test('explicit women fixture continues matching its own identity', async () => {
  const result = await parser('england-women')([{ ...target, home: 'England Women', away: 'Switzerland' }]);
  assert.equal(result.items.length, 1);
});

const limits = { timeline: 6, 'rollover-confirm': 3, initial: 3, manual: 3, 'hourly-chain': 4, t60: 4, t5: 4, 'one-shot': 2 };
for (const [kind, limit] of Object.entries(limits)) {
  test('retry limit and exhaustion: ' + kind, async () => {
    const calls = [];
    const { subject } = load('lib/formula-d-odds/retry-policy.js', ['retryLimit', 'queueRetry'], {
      db: { query: async () => ({ rows: [] }) }, scheduler: { at: async (...args) => calls.push(args) },
    });
    assert.equal(subject.retryLimit(kind), limit);
    assert.equal(await subject.queueRetry({ kind, retryAttempt: limit - 1 }), true);
    assert.equal(await subject.queueRetry({ kind, retryAttempt: limit }), false);
    assert.equal(calls.length, 1); assert.equal(calls[0][2].payload.retryAttempt, limit);
  });
}
for (const kind of ['timeline', 'manual']) {
  test(kind + ': several missing fixtures enqueue one named batch per attempt', async () => {
    const calls = [];
    const { subject } = load('api/formula-e-cloud-once.js', ['handler'], {
      cloudScan: async () => ({ found: 2, expected: 5, missingMatchIds: [3, 4, 5] }),
      db: { query: async () => ({ rows: [] }) }, scheduler: { at: async (...args) => calls.push(args) },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      let body;
      const res = { status() { return this; }, json(value) { body = value; return value; } };
      await subject.handler({ body: { kind, retryAttempt: attempt } }, res);
      assert.equal(calls.length, attempt + 1); assert.equal(body.batchRetry, true);
      assert.equal(calls[attempt][2].payload.matchId, null);
    }
    assert.equal(new Set(calls.map(c => c[2].name)).size, 1);
    assert.equal(calls[0][2].name, 'formula-e-retry-' + kind + '-batch');
  });
}

const at = Date.parse(kickoff);
for (const [offset, expected] of [[-1, false], [0, true], [600000, true], [600001, false]]) {
  test('T-1hr window offset ' + offset, () => {
    const { subject } = cloud(['captureTargets', 'inTargetWindow']);
    const checkpoint = subject.captureTargets(at).find(t => t.kind === 'last_1hr');
    assert.equal(checkpoint.at, at - 3600000);
    assert.equal(subject.inTargetWindow(checkpoint.at + offset, checkpoint), expected);
  });
}
test('T-5min window is one-way and ends strictly before kickoff', () => {
  const { subject } = cloud(['captureTargets', 'inTargetWindow']);
  const checkpoint = subject.captureTargets(at).find(t => t.kind === 'last_5min');
  assert.equal(checkpoint.at, at - 300000);
  for (const [offset, expected] of [[-60001, false], [-60000, false], [0, true], [60000, true], [60001, true], [299999, true], [300000, false]])
    assert.equal(subject.inTargetWindow(checkpoint.at + offset, checkpoint), expected);
});

for (const [kind, remaining, expected] of [
  ['last_5min', 300001, false], ['last_5min', 300000, true], ['last_5min', 299999, true],
  ['last_5min', 1, true], ['last_5min', 0, false], ['last_5min', -1, false],
  ['last_1hr', 3600001, false], ['last_1hr', 3600000, true], ['last_1hr', 3599999, true],
]) {
  test(kind + ' actual snapshot write with ' + remaining + 'ms until kickoff', async () => {
    const writes = [];
    const checkpoint = at - (kind === 'last_5min' ? 300000 : 3600000);
    const module = cloud(['saveItems'], { Date: clock(at - remaining), db: { query: async (sql, params) => {
      if (sql.startsWith('INSERT INTO formula_e_odds_snapshots')) writes.push(params);
      if (sql.startsWith('SELECT capture_status')) return { rows: writes.filter(p => p[0] === params[0] && p[4] === params[1] && p[1] === params[2]).map(p => ({ capture_status: p[5] })) };
      return { rows: sql.startsWith('SELECT selected_line') ? [{ selected_line: '1', current_odds: 1.88 }] : [] };
    } } });
    module.stub('scheduleNextTimeline', async () => {});
    await module.subject.saveItems([{ id: 1, line: '1', odds: 1.88, kickoff }],
      { targetAt: new Date(checkpoint).toISOString() });
    assert.equal(writes.some(params => params[1] === kind), expected);
  });
}
test('write gate rejects future anchor and post-kickoff T-5 backfill', () => {
  const { subject } = cloud(['canWriteSnapshot']);
  const checkpoint = { kind: 'last_5min', at: at - 300000 };
  assert.equal(subject.canWriteSnapshot(checkpoint.at, checkpoint.at - 1, checkpoint), false);
  assert.equal(subject.canWriteSnapshot(checkpoint.at, at, checkpoint), false);
  assert.equal(subject.canWriteSnapshot(checkpoint.at, at + 1, checkpoint), false);
});
test('strict requirement: T-5min must not be eligible before checkpoint', () => {
  const { subject } = cloud(['inTargetWindow']);
  assert.equal(subject.inTargetWindow(at - 300001, { kind: 'last_5min', at: at - 300000 }), false,
    'V263 permits an early sample within its symmetric one-minute tolerance');
});

test('strict requirement: saveItems must not write a T-5min snapshot 30 seconds early', async () => {
  const writes = [];
  const module = cloud(['saveItems'], { Date: clock(at - 330000), db: { query: async (sql, params) => {
    if (sql.startsWith('INSERT INTO formula_e_odds_snapshots')) writes.push({ sql, params });
    return { rows: sql.startsWith('SELECT selected_line') ? [{ selected_line: '1', current_odds: 1.88 }] : [] };
  } } });
  module.stub('scheduleNextTimeline', async () => {});
  await module.subject.saveItems([{ id: 1, line: '1', odds: 1.88, kickoff }],
    { targetAt: new Date(at - 300000).toISOString() });
  assert.equal(writes.filter(w => w.params[1] === 'last_5min').length, 0,
    'V263 writes an early last_5min sample despite a future targetAt');
});

test('timeline prewarm waits until T-5min before first extraction', async () => {
  let now = at - 600000;
  const checkpoint = at - 300000;
  const reads = [], waits = [];
  class VirtualDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const module = cloud(['cloudScan'], { Date: VirtualDate,
    setTimeout(callback, ms) { waits.push(ms); now += ms; callback(); },
    browser: { session: async callback => callback({ setViewport: async () => {} }) },
  });
  module.stub('targets', async () => [target]);
  module.stub('creds', () => ({ username: 'synthetic-test', password: 'synthetic-test-only' }));
  module.stub('learnedPreferredMode', async () => 'early');
  module.stub('login', async () => {});
  module.stub('discoverOddsPage', async () => 'offline-fixture');
  module.stub('forceOddsMode', async () => true);
  module.stub('extract', async () => { reads.push(now); return { items: [{ id: 1, line: '1', odds: 1.88, kickoff }] }; });
  module.stub('snapshotStructure', async () => ({}));
  module.stub('recordStructure', async () => {});
  module.stub('saveItems', async () => ({ saved: 1, pendingRolloverIds: [] }));
  module.stub('setState', async () => {});
  module.stub('writeScanAudit', async () => {});
  await module.subject.cloudScan({ reason: 'timeline', targetAt: new Date(checkpoint).toISOString() });
  assert.equal(waits[0], 300000); assert.equal(reads.length, 1);
  assert.ok(reads[0] >= checkpoint);
});

for (const [found, expected] of [[5, 'ok'], [4, 'partial'], [0, 'match_failed']]) {
  test(found + '/5 cloudScan status is ' + expected, async () => {
    const states = [];
    const items = Array.from({ length: found }, (_, i) => ({ id: i + 1, line: '1', odds: 1.88, kickoff }));
    // Exercise the real orchestration and status computation. Browser/session,
    // persistence and setup dependencies are replaced only in this VM context.
    const module = cloud(['cloudScan'], { Date: clock(at - 3600000), browser: { session: async () => ({ items }) } });
    module.stub('targets', async () => Array.from({ length: 5 }, (_, i) => ({ ...target, id: i + 1 })));
    module.stub('creds', () => ({ username: 'synthetic-test', password: 'synthetic-test-only' }));
    module.stub('learnedPreferredMode', async () => 'early');
    module.stub('saveItems', async () => ({ saved: found, pendingRolloverIds: [] }));
    module.stub('setState', async state => states.push(state));
    module.stub('writeScanAudit', async () => {});
    const result = await module.subject.cloudScan({ reason: 'timeline' });
    assert.equal(result.found, found); assert.equal(result.expected, 5);
    assert.equal(states.at(-1).last_status, expected);
    assert.equal(result.missingMatchIds.length, 5 - found);
  });
}
const diagnostics = {
  TEAM_MATCH: 'team row not unique', FIRST_HALF_OU: 'FIRST HALF O/U column missing',
  FIXTURE_ROW: 'fixture container not found', MARKET_PARSE: 'market missing',
  ODDS_PARSE: 'price unresolved', KICKOFF: 'kickoff missing', LINE_LOCK: 'rollover blocked',
};
for (const [stage, detail] of Object.entries(diagnostics)) {
  test('per-fixture audit classifies ' + stage + ' without leaking neighbor diagnostic', async () => {
    const inserts = [];
    const { subject } = cloud(['writeScanAudit'], { db: { query: async (sql, params) => {
      if (sql.startsWith('INSERT')) inserts.push(params); return { rows: [] };
    } } });
    const other = { ...target, id: 2, home: 'Gamma', away: 'Delta' };
    await subject.writeScanAudit({ reason: 'timeline', targets: [target, other],
      items: [{ ...other, line: '1', odds: 1.88 }],
      diagnostic: target.home + ' vs ' + target.away + ': ' + detail + '; Gamma vs Delta: unrelated warning' });
    assert.equal(inserts.length, 2);
    assert.equal(inserts[0][4], 'failed'); assert.equal(inserts[0][5], stage);
    assert.ok(!inserts[0][6].includes('Gamma'));
    assert.equal(inserts[1][4], 'success'); assert.equal(inserts[1][5], 'SUCCESS');
    assert.equal(inserts[1][6], null);
  });
}
