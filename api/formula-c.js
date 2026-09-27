// Compatibility entry for the historical Formula B Master Rules route.
// Product Formula C remains live intent; this legacy URL stays available.
import { prematchHandler, classifyIntent, strengthTier, competitionNeed, fatigueFromPast, futureMark } from "lib/formula-b-engine.js";
export const access="public";
export const methods=["POST"];
export default async function(req,res){return prematchHandler(req,res);}
