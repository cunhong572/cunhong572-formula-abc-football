import { db } from "hatchable";

export const FORMULA_D_WEIGHT_DEFAULTS={
  window:{w5:60,w10:40},
  PT:{ri:55,psl:45},
  PI:{dar:50,tg:50},
  SS:{rsi:50,pt:20,pi:18,tct:8,ia:4},
  AS:{scr:35,bpr:25,ri:20,tcr:12,ia:8},
  GTI:{tr:30,cii:30,ss:40}
};

const GROUPS={
  window:["w5","w10"],
  PT:["ri","psl"],
  PI:["dar","tg"],
  SS:["rsi","pt","pi","tct","ia"],
  AS:["scr","bpr","ri","tcr","ia"],
  GTI:["tr","cii","ss"]
};

function clone(x){return JSON.parse(JSON.stringify(x));}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}

export function normalizeFormulaDWeights(input={}){
  const out=clone(FORMULA_D_WEIGHT_DEFAULTS);
  for(const [group,keys] of Object.entries(GROUPS)){
    const src=input?.[group]||{};
    for(const key of keys){
      const v=num(src[key]);
      if(v!==null)out[group][key]=Math.max(0,Math.min(100,v));
    }
  }
  return out;
}

export function validateFormulaDWeights(input={}){
  const cfg=normalizeFormulaDWeights(input);
  for(const [group,keys] of Object.entries(GROUPS)){
    const sum=keys.reduce((s,k)=>s+Number(cfg[group][k]||0),0);
    if(Math.abs(sum-100)>0.001)throw new Error(group+" 权重总和必须等于 100%，当前为 "+sum+"%");
  }
  return cfg;
}

export async function getFormulaDWeights(){
  try{
    const r=await db.query("SELECT config_json,updated_at FROM formula_d_weight_config WHERE singleton_key=$1 LIMIT 1",["main"]);
    const row=r.rows?.[0];
    if(!row)return {config:clone(FORMULA_D_WEIGHT_DEFAULTS),updatedAt:null,isDefault:true};
    return {config:validateFormulaDWeights(row.config_json||{}),updatedAt:row.updated_at||null,isDefault:false};
  }catch(e){
    return {config:clone(FORMULA_D_WEIGHT_DEFAULTS),updatedAt:null,isDefault:true};
  }
}

export async function saveFormulaDWeights(input){
  const cfg=validateFormulaDWeights(input);
  await db.query(`
    INSERT INTO formula_d_weight_config(singleton_key,config_json,updated_at)
    VALUES ($1,$2::jsonb,NOW())
    ON CONFLICT(singleton_key) DO UPDATE SET config_json=EXCLUDED.config_json,updated_at=NOW()
  `,["main",JSON.stringify(cfg)]);
  return getFormulaDWeights();
}

export async function resetFormulaDWeights(){
  await db.query("DELETE FROM formula_d_weight_config WHERE singleton_key=$1",["main"]);
  return getFormulaDWeights();
}