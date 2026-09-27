// First applicable rule wins. null means not applicable; an empty intent asks
// the orchestrator for the conservative context fallback without trying later rules.
export const FORMULA_C_INTENTS=["Must Win","Want Win","Hope Win","Don't Lose","Equalize"];
export function mandatoryRule({hard,gd,target}){
  if(hard&&gd<target)return {intent:'Must Win',reasons:['赛前硬性拿结果条件尚未满足']};
  return null;
}
export function trailingRule({gd,live,pre,available,minute,equalizeExec,evidenceConflict}){
  if(!(gd<0))return null;
  const goal=live.equalizeGoal===true||['Want Win','Hope Win',"Don't Lose",'Equalize'].includes(pre);
  if(goal)return {intent:'Equalize',reasons:['落后且赛前目标要求至少追平；短时低节奏不取消目标']};
  if(available&&minute>=45&&equalizeExec&&!evidenceConflict)return {intent:'Equalize',reasons:['落后、比赛阶段及有效进攻证据共同支持追平']};
  return {intent:null,reasons:[]};
}
export function prematchRule({pre,gd,strength,oppStrength,tactics}){
  if(!['Want Win','Hope Win',"Don't Lose"].includes(pre))return null;
  if(pre==='Want Win'&&gd===0&&strength!==null&&oppStrength!==null&&strength+2<=oppStrength&&tactics.redCards>0)
    return {intent:'Hope Win',reasons:['实力与阵容共同限制争胜能力']};
  return {intent:pre,reasons:[]};
}
export function satisfiedHardRule({hard,gd,target}){
  if(hard&&gd>=target)return {intent:'Want Win',reasons:['已达到硬性比分目标，保留赛前争胜目标']};
  return null;
}
export function observedRule({available,gd,minute,hopeExec,evidenceConflict}){
  if(!available)return null;
  if(gd===0&&minute>=85)return {intent:"Don't Lose",reasons:['末段平局且无已验证争胜目标，保留当前结果']};
  if(gd===0&&minute>=45&&hopeExec&&!evidenceConflict)return {intent:'Hope Win',reasons:[]};
  if(gd>0&&hopeExec&&!evidenceConflict)return {intent:'Hope Win',reasons:[]};
  return {intent:null,reasons:[]};
}
export function contextFallbackRule({gd,minute}){
  return {intent:gd<0?'Equalize':gd===0&&minute>=85?"Don't Lose":'Hope Win',
    reasons:['目标资料有限；按当前比分与比赛阶段回退，不能把低执行强度当作目标消失']};
}
