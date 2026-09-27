(()=>{
const $=id=>document.getElementById(id);
let creds={username:"",password:""};
async function call(action,extra={}){
  const r=await fetch("/api/admin-access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    adminUsername:creds.username,adminPassword:creds.password,action,...extra
  })});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||"操作失败");
  return j;
}
const weightGroups={
  window:["w5","w10"],
  PT:["ri","psl"],
  PI:["dar","tg"],
  SS:["rsi","pt","pi","tct","ia"],
  AS:["scr","bpr","ri","tcr","ia"],
  GTI:["tr","cii","ss"]
};
function fillWeights(cfg={}){
  document.querySelectorAll(".d-weight").forEach(input=>{
    const g=input.dataset.group,k=input.dataset.key;
    input.value=cfg?.[g]?.[k]??0;
  });
  updateWeightSums();
}
function readWeights(){
  const out={};
  for(const [g,keys] of Object.entries(weightGroups)){
    out[g]={};
    for(const k of keys){
      const el=document.querySelector('.d-weight[data-group="'+g+'"][data-key="'+k+'"]');
      out[g][k]=Number(el?.value||0);
    }
  }
  return out;
}
function updateWeightSums(){
  let ok=true;
  for(const [g,keys] of Object.entries(weightGroups)){
    const sum=keys.reduce((s,k)=>{
      const el=document.querySelector('.d-weight[data-group="'+g+'"][data-key="'+k+'"]');
      return s+Number(el?.value||0);
    },0);
    const badge=$("sum_"+g);
    if(badge){
      badge.textContent=sum+"%";
      badge.classList.toggle("bad",Math.abs(sum-100)>.001);
    }
    if(Math.abs(sum-100)>.001)ok=false;
  }
  return ok;
}
async function refreshWeights(){
  const j=await call("formula_d_weights_get");
  fillWeights(j.weights?.config||{});
  $("weightMsg").textContent=j.weights?.isDefault?"当前使用锁定默认配重。":"当前使用自定义配重。";
}
const cWeightKeys=["CompetitionNeed","WinAbility","LineupInjuryRotation","FutureSchedule","MarketOdds","CurrentForm","CoachIntent","HomeAway","FatigueDensity","H2HStyle"];
function fillCWeights(cfg={}){
  document.querySelectorAll(".c-weight").forEach(input=>{input.value=cfg?.[input.dataset.key]??0;});
  updateCWeightSum();
}
function readCWeights(){
  const out={};
  for(const k of cWeightKeys){
    const el=document.querySelector('.c-weight[data-key="'+k+'"]');
    out[k]=Number(el?.value||0);
  }
  return out;
}
function updateCWeightSum(){
  const sum=cWeightKeys.reduce((s,k)=>{
    const el=document.querySelector('.c-weight[data-key="'+k+'"]');
    return s+Number(el?.value||0);
  },0);
  const badge=$("sum_C");
  if(badge){badge.textContent=sum+"%";badge.classList.toggle("bad",Math.abs(sum-100)>.001);}
  return Math.abs(sum-100)<=.001;
}
async function refreshABCWeights(){
  const j=await call("formula_abc_weights_get");
  fillCWeights(j.weights?.C?.config||{});
  $("cWeightMsg").textContent=j.weights?.C?.isDefault?"公式B(分析意图)当前使用锁定默认配重。":"公式B(分析意图)当前使用自定义配重。";
}
async function refresh(){
  const j=await call("status");
  $("sharedUsername").value=j.status.sharedUsername||"";
  $("maxSessions").value=j.status.maxSessions||2;
  $("activeSessions").textContent=j.status.activeSessions||0;
  $("passwordVersion").textContent=j.status.passwordVersion||1;
  await refreshABCWeights();
  await refreshWeights();
}
$("adminLogin").onclick=async()=>{
  creds={username:$("adminUsername").value.trim(),password:$("adminPassword").value};
  $("adminMsg").textContent="正在验证…";
  try{
    await refresh();
    $("adminControls").hidden=false;
    $("adminMsg").textContent="管理员验证成功";
  }catch(e){$("adminMsg").textContent=e.message;}
};
$("saveAccess").onclick=async()=>{
  $("adminActionMsg").textContent="正在保存…";
  try{
    const j=await call("update",{
      sharedUsername:$("sharedUsername").value.trim(),
      newPassword:$("newPassword").value,
      maxSessions:Number($("maxSessions").value||2)
    });
    $("newPassword").value="";
    $("activeSessions").textContent=j.status.activeSessions||0;
    $("passwordVersion").textContent=j.status.passwordVersion||1;
    $("adminActionMsg").textContent="已保存。若修改了共享密码，旧登录已全部失效。";
  }catch(e){$("adminActionMsg").textContent=e.message;}
};
$("clearSessions").onclick=async()=>{
  $("adminActionMsg").textContent="正在清除登录设备…";
  try{
    const j=await call("update",{
      sharedUsername:$("sharedUsername").value.trim(),
      maxSessions:Number($("maxSessions").value||2),
      clearSessions:true
    });
    $("activeSessions").textContent=j.status.activeSessions||0;
    $("adminActionMsg").textContent="所有共享设备已退出。";
  }catch(e){$("adminActionMsg").textContent=e.message;}
};
document.querySelectorAll(".c-weight").forEach(x=>x.addEventListener("input",updateCWeightSum));
$("saveCWeights").onclick=async()=>{
  $("cWeightMsg").textContent="正在保存公式B(分析意图)配重…";
  if(!updateCWeightSum()){
    $("cWeightMsg").textContent="无法保存：公式B(分析意图)权重总和必须等于 100%。";
    return;
  }
  try{
    const j=await call("formula_c_weights_update",{weights:readCWeights()});
    fillCWeights(j.weights?.C?.config||{});
    $("cWeightMsg").textContent="公式B(分析意图)配重已保存，后续赛前意图分析将使用新权重。";
  }catch(e){$("cWeightMsg").textContent=e.message;}
};
$("resetCWeights").onclick=async()=>{
  $("cWeightMsg").textContent="正在恢复公式B(分析意图)默认配重…";
  try{
    const j=await call("formula_c_weights_reset");
    fillCWeights(j.weights?.C?.config||{});
    $("cWeightMsg").textContent="已恢复公式B(分析意图)锁定默认配重。";
  }catch(e){$("cWeightMsg").textContent=e.message;}
};

document.querySelectorAll(".d-weight").forEach(x=>x.addEventListener("input",updateWeightSums));
$("saveDWeights").onclick=async()=>{
  $("weightMsg").textContent="正在保存公式C(分析实时意图)配重…";
  if(!updateWeightSums()){
    $("weightMsg").textContent="无法保存：每一组权重总和都必须等于 100%。";
    return;
  }
  try{
    const j=await call("formula_d_weights_update",{weights:readWeights()});
    fillWeights(j.weights?.config||{});
    $("weightMsg").textContent="公式C(分析实时意图)配重已保存，实时分析将立即使用新权重。";
  }catch(e){$("weightMsg").textContent=e.message;}
};
$("resetDWeights").onclick=async()=>{
  $("weightMsg").textContent="正在恢复默认值…";
  try{
    const j=await call("formula_d_weights_reset");
    fillWeights(j.weights?.config||{});
    $("weightMsg").textContent="已恢复公式C(分析实时意图)锁定默认配重。";
  }catch(e){$("weightMsg").textContent=e.message;}
};

$("changeAdminPassword").onclick=async()=>{
  const p=$("newAdminPassword").value;
  $("adminActionMsg").textContent="正在修改管理员密码…";
  try{
    await call("change_admin_password",{newAdminPassword:p});
    creds.password=p;
    $("adminPassword").value=p;
    $("newAdminPassword").value="";
    $("adminActionMsg").textContent="管理员密码已修改。";
  }catch(e){$("adminActionMsg").textContent=e.message;}
};
})();