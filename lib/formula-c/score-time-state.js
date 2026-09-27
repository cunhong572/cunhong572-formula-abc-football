import { matchMinute } from "lib/formula-c/rolling-window.js";

export function scoreTimeState(scoreFor,scoreAgainst,minute){
  return {goalDifference:Number(scoreFor)-Number(scoreAgainst),minute:matchMinute(minute)};
}
