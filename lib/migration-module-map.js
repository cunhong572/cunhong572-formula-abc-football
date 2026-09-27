// Migration-only architecture map. No runtime imports.
export const MODULE_MAP = {
  baseline: 262,
  formulaA: {
    api: ["api/formula-a-evaluate.js","api/auto-fill.js"],
    frontend: ["public/app.js","public/batch-ab.js"],
    shared: ["lib/formula-abc-config.js","lib/team-resolver.js"],
    target: "modules/formula-a"
  },
  formulaB: {
    api: ["api/formula-b.js"],
    frontend: ["public/bcd.js","public/batch-ab.js"],
    shared: ["lib/formula-abc-config.js","lib/team-resolver.js"],
    target: "modules/formula-b"
  },
  formulaC: {
    api: ["api/formula-c.js"],
    frontend: ["public/bcd.js"],
    shared: ["lib/formula-abc-config.js","lib/team-resolver.js"],
    target: "modules/formula-c"
  },
  formulaDLiveIntent: {
    api: [
      "api/formula-d.js","api/formula-d-live.js",
      "api/formula-d-learning-summary.js","api/formula-d-learning-backtest.js",
      "api/formula-d-learning-finalize.js","api/formula-d-historical-scan.js",
      "api/formula-d-historical-run.js","api/formula-d-historical-summary.js",
      "api/formula-d-historical-control.js","api/formula-d-roster-scan.js",
      "api/formula-d-player-summary.js"
    ],
    libs: [
      "lib/formula-d-engine.js","lib/formula-d-learning.js",
      "lib/formula-d-historical.js","lib/formula-d-config.js",
      "lib/player-intelligence.js"
    ],
    target: "modules/formula-c-live-intent"
  },
  formulaDOdds: {
    legacyCodeName: "formula-e",
    api: [
      "api/formula-e.js","api/formula-e-cloud-hourly.js",
      "api/formula-e-cloud-once.js","api/formula-e-cloud-run.js",
      "api/formula-e-cloud-status.js","api/formula-e-debug-team.js",
      "api/formula-e-debug-nav.js"
    ],
    libs: ["lib/formula-e-cloud.js"],
    frontend: ["public/formula-e.js"],
    target: "modules/formula-d-odds",
    plannedParts: ["scanner","match-matcher","market-parser","odds-selector","scheduler","retry","audit","export"]
  },
  shared: {
    auth: ["lib/auth.js","api/login.js","api/logout.js","api/session.js","api/admin-access.js"],
    usage: ["lib/formula-usage.js","lib/tracked-fetch.js","api/usage-today.js"],
    i18n: ["api/i18n-translate.js","public/i18n.js"]
  }
};