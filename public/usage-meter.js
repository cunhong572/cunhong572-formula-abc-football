(()=>{
const el=()=>document.getElementById("dailyMbUsage");
const isEn=()=>window.FormulaLang?.get?.()==="en";
async function refresh(){
  const node=el();if(!node)return;
  try{
    const r=await fetch("/api/usage-today",{cache:"no-store"});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||"usage");
    const totalBytes=Number(j.total?.bytes||0);
    const totalMb=totalBytes/1024/1024;
    const totalText=totalMb<1
      ? ((totalBytes/1024).toFixed(totalBytes<10240?1:0)+" KB")
      : (totalMb.toFixed(totalMb<10?2:1)+" MB");
    const scan=Number(j.scan?.mb||0).toFixed(1);
    const left=Number(j.scan?.remainingMb||0).toFixed(1);
    node.textContent=isEn()?("Site today "+totalText):("全站今日 "+totalText);
    node.title=isEn()
      ?("Whole-site outbound data today: "+totalText+". Historical learning/backtest: "+scan+" / 300 MB, "+left+" MB left.")
      :("整个网页版今日外部数据用量："+totalText+"。学习/回测："+scan+" / 300 MB，剩余 "+left+" MB。");
    node.classList.toggle("near-cap",Number(j.scan?.percent)>=85);
    node.classList.toggle("at-cap",Boolean(j.scan?.capReached));
  }catch(e){
    node.textContent=isEn()?"Site today -- MB":"全站今日 -- MB";
  }
}
function mount(){
  const sw=document.querySelector(".lang-switch");
  if(!sw||el())return;
  const span=document.createElement("span");
  span.id="dailyMbUsage";span.className="daily-mb-usage";span.textContent="全站今日 -- MB";
  sw.appendChild(span);
  refresh();
}
document.addEventListener("DOMContentLoaded",()=>{setTimeout(mount,0);setInterval(refresh,60000);});
window.addEventListener("formula-language-change",refresh);
window.FormulaUsageMeter={refresh,mount};
})();