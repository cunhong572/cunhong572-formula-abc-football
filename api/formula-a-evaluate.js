import { stateFromForm, normalizeForm } from "lib/formula-a/form.js";
import { dateGap } from "lib/formula-a/fatigue-days.js";
import {requireAuth} from "lib/auth.js";
export const access="public";
export const methods=["POST"];
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  const b=req.body||{};
  const form=normalizeForm(b.form);
  res.json({days:dateGap(b.previousDate,b.matchDate),formText:form.length?form.join(" / "):"—",state:stateFromForm(form)});
}