import { n } from "lib/formula-c/tempo-metrics.js";
import { inRecentWindow } from "lib/formula-c/rolling-window.js";
import { liveTactics } from "lib/formula-c/lineup-state.js";

export function collectLiveEvidence(live,minute,metrics){
  const ss=n(metrics.SS)??0,as=n(metrics.AS)??0;
  const r5s=n(live.recent5ShotsFor)??0,r5x=n(live.recent5XgFor)??0;
  const wantExec=ss>=60&&as>=85&&r5x>=.30,hopeExec=ss>=45&&as>=55&&r5x>=.12;
  const equalizeExec=ss>=50&&as>=70&&r5x>=.20;
  const lowQualityVolume=r5s>=3&&r5x<.08,speedThreatConflict=ss>=62&&as<=46;
  const evidenceConflict=lowQualityVolume||speedThreatConflict;
  const tactics=liveTactics(live,minute);
  const hasObserved=[live.recent5ShotsFor,live.recent5XgFor].some(v=>n(v)!==null)||metrics.mode==='official';
  const fresh=live.evidenceMinute==null||inRecentWindow(live.evidenceMinute,minute);
  const available=live.realtimeEvidenceAvailable!==false&&hasObserved&&fresh;
  return {ss,as,wantExec,hopeExec,equalizeExec,lowQualityVolume,speedThreatConflict,evidenceConflict,tactics,available};
}

export function describeEvidence(intent,reasons,contextFallback,live,evidence){
  const {ss,as,wantExec,hopeExec,equalizeExec,lowQualityVolume,speedThreatConflict,evidenceConflict,tactics,available}=evidence;
  const evidenceStatus=available?(evidenceConflict||contextFallback?'limited':'available'):'unavailable';
  const evidenceWeight=Math.max(.25,Math.min(1.5,1+tactics.tacticalBoost*.05));
  const confidence=!available?40:contextFallback?42:evidenceConflict?50:Math.min(85,Math.round(65+Math.min(10,Math.abs(tactics.recentEventWeight))));
  return {intent,confidence,reasons,realtimeEvidence:evidenceStatus,
    diagnostics:{evidenceConflict,lowQualityVolume,speedThreatConflict,...tactics,evidenceWeight,contextFallback,
      playerImpact:n(live.lastSubstitution?.playerImpact)??0,wantExec,hopeExec,equalizeExec,
      dontLoseExec:false,strongDontLose:false,realtimeEvidence:evidenceStatus}};
}

export function prepareLiveEvidence(live,minute){
  live={...live,minute};
  if(live.evidenceMinute!=null&&!inRecentWindow(live.evidenceMinute,minute)){
    live={...live,realtimeEvidenceAvailable:false,recent5ShotsFor:undefined,recent5XgFor:undefined,
      recent5Possession:undefined,recent5BoxTouches:undefined,metricsNormalized:undefined,normalized:undefined};
  }
  return live;
}
