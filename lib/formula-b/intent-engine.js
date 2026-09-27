import { weightedSupport, inputRule, mandatoryRule, marketRule, nationsRule, schedulePressureRule, standardIntentRule } from "lib/formula-b/intent-rules.js";

// First matching rule wins; this order preserves the locked pre-match policy.
export function classifyIntent(side,opp,ctx,weights={}){
  const support=weightedSupport(side,opp,ctx,weights);
  for(const rule of [inputRule,mandatoryRule,marketRule,nationsRule,schedulePressureRule,standardIntentRule]){
    const result=rule(side,opp,ctx,support);
    if(result)return result;
  }
}

