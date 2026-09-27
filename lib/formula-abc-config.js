import { db } from "hatchable";

export const FORMULA_C_WEIGHT_DEFAULTS={
  CompetitionNeed:20,
  WinAbility:17,
  LineupInjuryRotation:15,
  FutureSchedule:10,
  MarketOdds:9,
  CurrentForm:8,
  CoachIntent:7,
  HomeAway:5,
  FatigueDensity:5,
  H2HStyle:4
};

function clone(x){return JSON.parse(JSON.stringify(x));}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}

export function validateFormulaCWeights(input={}){
  const out=clone(FORMULA_C_WEIGHT_DEFAULTS);
  for(const k of Object.keys(out)){
    const v=num(input?.[k]);
    if(v!==null)out[k]=Math.max(0,Math.min(100,v));
  }
  const sum=Object.values(out).reduce((a,b)=>a+Number(b||0),0);
  if(Math.abs(sum-100)>0.001)throw new Error("Formula C 权重总和必须等于 100%，当前为 "+sum+"%");
  return out;
}

export async function getFormulaABCWeights(){
  let c={config:clone(FORMULA_C_WEIGHT_DEFAULTS),updatedAt:null,isDefault:true};
  try{
    const r=await db.query("SELECT config_json,updated_at FROM formula_abc_weight_config WHERE formula_key=$1 LIMIT 1",["C"]);
    const row=r.rows?.[0];
    if(row)c={config:validateFormulaCWeights(row.config_json||{}),updatedAt:row.updated_at||null,isDefault:false};
  }catch(e){}
  return {
    A:{hasWeights:false,note:"Formula A 当前为数据/规则型公式，没有综合加权评分；排名、Days、Form、教练风格、前3/后2赛程等继续按锁定规则执行。"},
    B:{hasWeights:false,note:"Formula B 当前为规则型公式，没有综合加权评分；疲劳、密度、排名、Form、Next3 等继续按锁定规则执行。"},
    C:{hasWeights:true,...c}
  };
}

export async function saveFormulaCWeights(input){
  const cfg=validateFormulaCWeights(input);
  await db.query(`
    INSERT INTO formula_abc_weight_config(formula_key,config_json,updated_at)
    VALUES ($1,$2::jsonb,NOW())
    ON CONFLICT(formula_key) DO UPDATE SET config_json=EXCLUDED.config_json,updated_at=NOW()
  `,["C",JSON.stringify(cfg)]);
  return getFormulaABCWeights();
}

export async function resetFormulaCWeights(){
  await db.query("DELETE FROM formula_abc_weight_config WHERE formula_key=$1",["C"]);
  return getFormulaABCWeights();
}