import { strengthInputs } from "lib/shared-data/strength-provider.js";
import { n } from "lib/formula-c/tempo-metrics.js";

// Strength tiers are shared inputs from Formula B, never a second strength table.
export function matchContext(live={}){
  const pre=String(live.preMatchIntent||'').replace('Don’t Lose',"Don't Lose");
  const {strength,oppStrength}=strengthInputs(live);
  const hard=pre==='Must Win'||(live.hardCondition?.verified===true&&live.hardCondition?.mustWin===true);
  const target=n(live.hardCondition?.requiredGoalDifference)??1;
  return {pre,strength,oppStrength,hard,target};
}
