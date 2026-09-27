export function captureTargets(kickoffMs){
  const out=[];
  for(let h=12;h>=2;h--)out.push({kind:`t${h}h`,at:kickoffMs-h*60*60000});
  out.push({kind:"last_1hr",at:kickoffMs-60*60000});
  out.push({kind:"last_5min",at:kickoffMs-5*60000});
  return out;
}
export function targetToleranceMs(kind){
  // Hourly checkpoints use a one-way +10 minute backfill window.
  // Last 5min retries retain a one-minute scheduling tolerance.
  return kind==="last_5min" ? 60*1000 : 10*60*1000;
}
export function inTargetWindow(ms,target){
  if(target.kind==="last_5min")return ms>=target.at && ms<target.at+5*60*1000;
  return ms>=target.at && ms<=target.at+10*60*1000;
}
export function canWriteSnapshot(sampleMs,writeMs,target){
  // An old retry anchor must never authorize an early write or a T-5 write
  // after kickoff. Keep millisecond precision; no rounded scheduler time.
  if(writeMs<target.at)return false;
  if(target.kind==="last_5min" && writeMs>=target.at+5*60*1000)return false;
  return inTargetWindow(sampleMs,target);
}
export function evidenceStage(kind){
  if(kind==="last_1hr")return "T-1";
  if(kind==="last_5min")return "T-5min";
  const m=String(kind||"").match(/^t(\d+)h$/);
  return m?"T-"+m[1]:String(kind||"");
}

