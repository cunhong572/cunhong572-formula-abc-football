export const access = "scheduler";
export const methods = ["POST"];

// Legacy fixed-hour endpoint intentionally does NOT touch 3573217 anymore.
// Formula D is driven only by:
// 1) the one initial discovery/lock scan when a batch is added; and
// 2) kickoff-anchored T-12...T-1/T-5min timeline jobs.
export default async function(req,res){
  res.json({
    ok:true,
    skipped:true,
    reason:"Formula D uses kickoff-anchored on-demand scans only."
  });
}