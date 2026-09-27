// Historical live-intent exports retained; product Formula C owns the engine.
import { classify, evaluateLiveIntent } from "lib/formula-c/intent-engine.js";
import { computeFormulaDMetrics, computeGTI } from "lib/formula-c/tempo-metrics.js";
import { FORMULA_C_INTENTS } from "lib/formula-c/intent-rules.js";
export { classify, evaluateLiveIntent, computeFormulaDMetrics, computeGTI };
export const FORMULA_D_INTENTS=FORMULA_C_INTENTS;
