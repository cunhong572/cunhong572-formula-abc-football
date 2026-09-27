import { mandatoryRule, trailingRule, prematchRule, satisfiedHardRule, observedRule, contextFallbackRule } from "lib/formula-c/intent-rules.js";
import { collectLiveEvidence, describeEvidence, prepareLiveEvidence } from "lib/formula-c/live-evidence.js";
import { matchContext } from "lib/formula-c/match-context.js";
import { scoreTimeState } from "lib/formula-c/score-time-state.js";
import { computeFormulaDMetrics, tempoLevel, attackLevel, dynamicThresholds } from "lib/formula-c/tempo-metrics.js";
export function classify(scoreFor,scoreAgainst,minute,live,metrics,cfg={}){
  const gd=Number(scoreFor)-Number(scoreAgainst);
  const {pre,strength,oppStrength,hard,target}=matchContext(live);
  const evidence=collectLiveEvidence(live,minute,metrics);
  const {ss,as,available}=evidence;
  const reasons=['最近5分钟动态证据；赛前目标 × 比分 × 时间 × 实力 × 阵容综合判断'];
  if(pre)reasons.push('赛前意图 '+pre);
  if(strength!==null&&oppStrength!==null)reasons.push('实力等级 '+strength+' vs '+oppStrength);
  if(!available)reasons.push('realtime evidence unavailable / limited；使用比赛上下文 fallback');
  else reasons.push('Speed Score '+Math.round(ss)+' / Attack Score '+Math.round(as));
  const state={gd,minute,live,pre,strength,oppStrength,hard,target,...evidence};
  let decision=null;
  for(const rule of [mandatoryRule,trailingRule,prematchRule,satisfiedHardRule,observedRule]){
    decision=rule(state);
    if(decision!==null)break;
  }
  const contextFallback=decision===null||decision.intent===null;
  if(contextFallback)decision=contextFallbackRule(state);
  const intent=decision.intent;
  reasons.push(...decision.reasons);
  return describeEvidence(intent,reasons,contextFallback,live,evidence);
}
export function evaluateLiveIntent(scoreFor,scoreAgainst,minute,rank,otherRank,live={},cfg={}){
  const state=scoreTimeState(scoreFor,scoreAgainst,minute),m=state.minute;
  live=prepareLiveEvidence(live,m);
  const metrics=computeFormulaDMetrics(live,cfg),c=classify(scoreFor,scoreAgainst,m,live,metrics,cfg);
  const tempoClass=tempoLevel(metrics.SS,m),attackClass=attackLevel(metrics.AS,m),thresholds=dynamicThresholds(m);
  metrics.tempoLevel=tempoClass;
  metrics.attackLevel=attackClass;
  metrics.dynamicThresholds=thresholds;
  return {...c,metrics,signals:{tempo:metrics.SS,attack:metrics.AS,tempoLevel:tempoClass,attackLevel:attackClass,dynamicThresholds:thresholds,dataMode:metrics.mode,quadrant:metrics.quadrant,momentum:metrics.momentum},context:state};
}
