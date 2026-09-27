(()=>{
const TOKEN_KEY="formula_site_session";
const rawFetch=window.fetch.bind(window);
window.fetch=(input,init={})=>{
  const url=typeof input==="string"?input:(input?.url||"");
  if(url.startsWith("/api/")&&!url.startsWith("/api/login")&&!url.startsWith("/api/admin-access")){
    const token=localStorage.getItem(TOKEN_KEY);
    const headers=new Headers(init.headers||{});
    if(token)headers.set("Authorization","Bearer "+token);
    init={...init,headers};
  }
  return rawFetch(input,init);
};
function gateHtml(){
  return '<div id="loginGate" class="login-gate"><div class="login-card">'+
  '<div class="eyebrow">PRIVATE FOOTBALL WORKSPACE</div><h1>Football Analyzer</h1>'+
  '<p>请输入共享账号和密码</p>'+
  '<label>账号<input id="loginUsername" autocomplete="username" placeholder="Username"></label>'+
  '<label>密码<input id="loginPassword" type="password" autocomplete="current-password" placeholder="Password"></label>'+
  '<button id="loginBtn" class="primary">登录</button><div id="loginMsg"></div>'+
  '</div></div>';
}
async function verify(){
  const t=localStorage.getItem(TOKEN_KEY);if(!t)return false;
  try{const r=await fetch("/api/session");if(!r.ok)throw 0;return true;}catch(e){localStorage.removeItem(TOKEN_KEY);return false;}
}
function addLogout(){
  if(document.getElementById("authLogout"))return;
  const b=document.createElement("button");
  b.id="authLogout";b.className="auth-logout";b.textContent="退出登录";
  b.onclick=async()=>{
    try{await fetch("/api/logout",{method:"POST"});}catch(e){}
    localStorage.removeItem(TOKEN_KEY);location.reload();
  };
  document.body.appendChild(b);
}
async function init(){
  document.body.insertAdjacentHTML("afterbegin",gateHtml());
  const gate=document.getElementById("loginGate");
  if(await verify()){
    gate.remove();document.body.classList.add("auth-ok");addLogout();
    window.dispatchEvent(new CustomEvent("formula-auth-ready"));
    return;
  }
  document.body.classList.add("auth-needed");
  document.getElementById("loginBtn").onclick=async()=>{
    const username=document.getElementById("loginUsername").value.trim();
    const password=document.getElementById("loginPassword").value;
    const msg=document.getElementById("loginMsg"),btn=document.getElementById("loginBtn");
    btn.disabled=true;msg.textContent="正在验证…";
    try{
      const r=await rawFetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"登录失败");
      localStorage.setItem(TOKEN_KEY,j.token);
      gate.remove();document.body.classList.remove("auth-needed");document.body.classList.add("auth-ok");addLogout();
      window.dispatchEvent(new CustomEvent("formula-auth-ready"));
    }catch(e){msg.textContent=e.message||"登录失败";}
    finally{btn.disabled=false;}
  };
  document.getElementById("loginPassword").addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("loginBtn").click();});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();