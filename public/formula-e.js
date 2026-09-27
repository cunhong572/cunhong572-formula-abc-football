(()=> {
const $=id=>document.getElementById(id);
const auth=()=>localStorage.getItem("formula_site_session")||localStorage.getItem("formulaA_token")||"";
const headers=()=>({"Content-Type":"application/json","Authorization":"Bearer "+auth()});
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let rows=[];
function time(v){if(!v)return"—";return new Date(v).toLocaleString("en-US",{timeZone:"America/New_York",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});}
function odds(v){return v==null?"—":Number(v).toFixed(2);}
function status(row){return row.status==="pending_source"?"等待赔率站连接":esc(row.status||"—");}
function groupTone(group){
 const base=Number(group?.[0]?.current);
 const finalRow=[...(group||[])].reverse().find(r=>r.fiveMinutes!=null);
 const last5=Number(finalRow?.fiveMinutes);
 if(!Number.isFinite(base)||!Number.isFinite(last5))return "";
 const diff=last5-base;
 if(diff<=-0.099999)return "e-odds-drop";
 if(diff>=0.099999)return "e-odds-rise";
 return "";
}
function draw(){
 const board=$("eBoard"); if(!board)return;
 if(!rows.length){board.className="panel e-board empty-state";board.textContent="输入今天的比赛名称后，公式D(赔率动态)会自动建立赔率追踪列表。";return;}
 board.className="panel e-board";
 const grouped=[...rows.reduce((m,r)=>{if(!m.has(r.id))m.set(r.id,[]);m.get(r.id).push(r);return m;},new Map()).values()];
 const toneById=new Map(grouped.map(g=>[g[0].id,groupTone(g)]));
 board.innerHTML='<div class="e-table-wrap"><table class="e-table"><thead><tr><th>比赛</th><th>开赛时间</th><th>Odds 赔率</th><th>Odds movement 动态</th><th>Update 赔率动态</th><th>Last 1 hr</th><th>Last 5 min</th><th></th></tr></thead><tbody>'+
 rows.map(r=>'<tr class="'+[(r.continuation?'e-continuation':''),toneById.get(r.id)||''].filter(Boolean).join(' ')+'"><td>'+(r.continuation?'<span class="e-rollover">↳ 续接盘口</span>':'<strong>'+esc(r.home)+'</strong><br>'+esc(r.away))+'</td><td>'+(r.continuation?'':time(r.kickoff))+'</td><td>'+esc(r.line||"—")+'</td><td>'+odds(r.current)+'</td><td class="e-hourly">'+(r.hourly?.length?r.hourly.map(odds).join("  "):"—")+'</td><td>'+odds(r.oneHour)+'</td><td>'+odds(r.fiveMinutes)+'</td><td>'+(r.continuation?'':'<button class="e-delete" data-id="'+r.id+'">删除</button>')+'<small>'+status(r)+'</small></td></tr>').join("")+'</tbody></table></div>';
 board.querySelectorAll(".e-delete").forEach(b=>b.addEventListener("click",()=>remove(b.dataset.id)));
}
async function load(){
 const r=await fetch("/api/formula-e",{headers:{"Authorization":"Bearer "+auth()}});
 const j=await r.json().catch(()=>({})); if(!r.ok)throw new Error(j.error||"读取公式D(赔率动态)失败");
 rows=j.matches||[]; draw();
}
async function add(){
 const input=$("eFixtures"),statusEl=$("eStatus"),btn=$("eAdd");
 const lines=String(input.value||"").trim().split(/\r?\n\s*\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(!lines.length){statusEl.textContent="请每两行输入一场（主队换行客队，场次间空一行）；也支持 Home vs Away。";return;}
 btn.disabled=true;statusEl.textContent="正在建立赔率追踪列表…";
 try{
   const r=await fetch("/api/formula-e",{method:"POST",headers:headers(),body:JSON.stringify({action:"add",fixtures:lines})});
   const j=await r.json().catch(()=>({})); if(!r.ok)throw new Error(j.error||"添加失败");
   rows=j.matches||[];input.value="";draw();statusEl.textContent="已加入 "+rows.length+" 场。云端会自动抓取赔率；需要马上更新时可点击“立即云端同步”。";
 }catch(e){statusEl.textContent=e.message;}finally{btn.disabled=false;}
}
async function remove(id){
 try{const r=await fetch("/api/formula-e",{method:"DELETE",headers:headers(),body:JSON.stringify({action:"delete",id:Number(id)})});const j=await r.json();if(!r.ok)throw new Error(j.error||"删除失败");rows=j.matches||[];draw();}catch(e){$("eStatus").textContent=e.message;}
}
async function exportXlsx(){
 const statusEl=$("eStatus");
 if(!rows.length){statusEl.textContent="还没有追踪比赛。请先上传截图/输入球队 → 加入公式D赔率追踪。";return;}
 // Allow export even before T-12. The workbook should always be available
 // as a live tracking sheet; odds cells remain blank until their scheduled
 // capture points are reached.
 if(typeof ExcelJS==="undefined"){statusEl.textContent="Excel 组件未加载";return;}
 const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Formula D Odds");
 const thin={style:"thin",color:{argb:"FF000000"}};
 const border={top:thin,left:thin,bottom:thin,right:thin};
 const fill=(argb)=>({type:"pattern",pattern:"solid",fgColor:{argb}});
 const centered={vertical:"middle",horizontal:"center",wrapText:true};
 const kickoff=v=>v?new Date(v).toLocaleTimeString("en-US",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit",hour12:false}):"";
 const outOdds=v=>v==null?"":Number(v).toFixed(2);
 ws.columns=[{width:28},{width:14},{width:42},{width:18},{width:18}];
 ws.views=[{showGridLines:false}];
 // Formula D Excel must always be ordered by kickoff time from earliest to latest.
 // Matches with a verified kickoff come first; unknown kickoff times stay at the end
 // while preserving their original relative order.
 const groups=[...rows.reduce((m,r)=>{if(!m.has(r.id))m.set(r.id,[]);m.get(r.id).push(r);return m;},new Map()).values()]
   .sort((a,b)=>{
     const ta=a[0]?.kickoff?new Date(a[0].kickoff).getTime():Number.POSITIVE_INFINITY;
     const tb=b[0]?.kickoff?new Date(b[0].kickoff).getTime():Number.POSITIVE_INFINITY;
     return ta-tb;
   });
 groups.forEach((group,index)=>{
   const first=group[0];
   const tone=groupTone(group);
   const matchFill=tone==="e-odds-drop"?"FFFFFF00":tone==="e-odds-rise"?"FFD99694":null;
   const top=ws.addRow([first.home+"\n"+first.away,kickoff(first.kickoff),"","",""]);
   top.height=48;
   top.eachCell({includeEmpty:true},cell=>{cell.border=border;cell.alignment=centered;cell.fill=fill(matchFill||"FFDCE7BE");cell.font={name:"Arial",size:11,bold:false};});
   group.forEach((r,trackIndex)=>{
     const labels=ws.addRow([trackIndex===0?"Odds 赔率":"续接盘口",r.line||"","Update 赔率动态","Last 1 hr / 1小时","Last 5 min / 5分钟"]);
     const values=ws.addRow(["Odds movement 动态",outOdds(r.current),r.hourly?.map(outOdds).join("  ")||"",outOdds(r.oneHour),outOdds(r.fiveMinutes)]);
     [labels,values].forEach(row=>row.eachCell({includeEmpty:true},cell=>{cell.border=border;cell.alignment=centered;cell.font={name:"Arial",size:11};cell.fill=fill(matchFill||"FFFFFFFF");}));
     values.getCell(3).alignment={vertical:"middle",horizontal:"center",wrapText:true};
   });
   if(index<groups.length-1){
     const divider=ws.addRow(["","","","",""]);divider.height=12;
     divider.eachCell({includeEmpty:true},cell=>{cell.fill=fill("FF000000");});
   }
 });
 const buf=await wb.xlsx.writeBuffer(),a=document.createElement("a");
 a.href=URL.createObjectURL(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
 a.download="公式D_赔率动态.xlsx";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 statusEl.textContent=rows.some(r=>r.current!=null||r.line)
   ?"已按公式D(赔率动态)区块格式导出。"
   :"已导出公式D追踪表；尚未到 T-12 的赔率栏会保持空白，后续抓取后再导出即可更新。";
}
if($("eAdd"))$("eAdd").addEventListener("click",add);
async function refresh(){
 const btn=$("eRefresh"),statusEl=$("eStatus");
 btn.disabled=true;statusEl.textContent="正在刷新公式D赔率列表…";
 try{
   await load();
   const synced=rows.filter(r=>r.current!=null||r.line);
   statusEl.textContent=synced.length
     ?"刷新完成："+rows.length+" 场中已匹配 "+synced.length+" 场赔率；其余比赛保留在原顺序，等待下一次扫描。"
     :"刷新完成：比赛尚未收到赔率。请先在本页加入比赛，再回 3573217 点黑色 F → 同步当前赔率页，然后回来再刷新。";
 }catch(e){statusEl.textContent="刷新失败："+(e.message||"请重新登录 Formula A 后再试");}
 finally{btn.disabled=false;}
}
async function cloudStatus(){
 const el=$("eCloudStatus"); if(!el)return;
 try{
   const r=await fetch("/api/formula-e-cloud-status",{headers:{"Authorization":"Bearer "+auth()}});
   const j=await r.json().catch(()=>({})); if(!r.ok)throw new Error(j.error||"云端状态读取失败");
   const c=j.cloud||{};
   const audits=Array.isArray(c.recent_audits)?c.recent_audits:[];
   const latestFailed=audits.filter(x=>x.status==="failed").slice(0,3);
   const failText=latestFailed.length
     ?" · 最近失败："+latestFailed.map(x=>x.home+" vs "+x.away+" ["+(x.stage||"UNKNOWN")+"]"+(x.detail?" "+x.detail:"")).join(" | ")
     :"";
   if(c.credential_status==="missing"){
     el.textContent="云端同步：等待配置 3573217 登录信息"+failText;
   }else if(c.last_status==="ok"){
     el.textContent="云端同步：正常 · 上次成功 "+(c.last_success_at?new Date(c.last_success_at).toLocaleString("en-US",{timeZone:"America/New_York",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}):"—")+" · 找到 "+(c.last_found||0)+" 场"+failText;
   }else if(c.last_status==="partial"){
     el.textContent="云端同步：部分匹配 · 找到 "+(c.last_found||0)+" 场 · "+(c.last_message||"仍有比赛未识别")+failText;
   }else if(c.last_status==="match_failed"){
     el.textContent="云端同步：匹配失败 · 找到 "+(c.last_found||0)+" 场 · "+(c.last_message||"未识别到目标比赛")+failText;
   }else if(c.last_status==="error"){
     el.textContent="云端同步：最近失败 · "+(c.last_message||"请检查配置")+failText;
   }else{
     el.textContent="云端同步：已启用，等待首次运行"+failText;
   }
 }catch(e){el.textContent="云端同步状态："+(e.message||"读取失败");}
}
async function cloudRun(){
 const btn=$("eCloudRun"),el=$("eCloudStatus"); if(!btn)return;
 btn.disabled=true; if(el)el.textContent="正在排队云端同步…";
 try{
   const r=await fetch("/api/formula-e-cloud-run",{method:"POST",headers:headers(),body:"{}"});
   const j=await r.json().catch(()=>({})); if(!r.ok)throw new Error(j.error||"启动云端同步失败");
   if(el)el.textContent="云端同步已排队，通常 1 分钟内开始；稍后刷新查看结果。";
   setTimeout(()=>cloudStatus(),65000);
 }catch(e){if(el)el.textContent=e.message||"启动云端同步失败";}
 finally{btn.disabled=false;}
}
if($("eRefresh"))$("eRefresh").addEventListener("click",refresh);
if($("eCloudRun"))$("eCloudRun").addEventListener("click",cloudRun);
function evidenceShot(x){
 if(!x)return '<div class="e-evidence-missing">尚未到抓取时间</div>';
 const when=x.capturedAt?new Date(x.capturedAt).toLocaleString("en-US",{timeZone:"America/New_York",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}):"—";
 const label=esc((x.mode||"")+" · "+when);
 const img=x.url?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener"><img src="'+esc(x.url)+'" loading="lazy" alt="'+label+'"></a>':'<div class="e-evidence-missing">截图暂不可用</div>';
 return '<div class="e-evidence-shot">'+img+'<small>'+label+'</small></div>';
}
async function evidence(){
 const panel=$("eEvidencePanel"),grid=$("eEvidenceGrid"),status=$("eEvidenceStatus");
 if(!panel||!grid)return;
 panel.hidden=false;grid.innerHTML="";status.textContent="正在读取截图证据…";
 try{
   const r=await fetch("/api/formula-e-evidence",{headers:{"Authorization":"Bearer "+auth()}});
   const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"读取失败");
   const matches=j.matches||[],stageOrder=j.stageOrder||["T-12","T-11","T-10","T-9","T-8","T-7","T-6","T-5","T-4","T-3","T-2","T-1","T-5min"];
   status.textContent=matches.length
     ?"点击比赛名称进入查看该场 T-12 → T-1 + 开赛前5分钟的截图证据。"
     :"目前没有追踪比赛。";

   function renderList(){
     grid.innerHTML=matches.map((m,i)=>
       '<button type="button" class="e-evidence-list-item" data-index="'+i+'">'+
         '<strong>'+esc(m.home)+' vs '+esc(m.away)+'</strong>'+
         '<span>'+time(m.kickoff)+'</span>'+
       '</button>'
     ).join("");
     grid.querySelectorAll(".e-evidence-list-item").forEach(btn=>btn.addEventListener("click",()=>{
       const m=matches[Number(btn.dataset.index)];
       if(!m)return;
       const stages=m.stages||{};
       const stageHtml=stageOrder.map(stage=>{
         const arr=stages[stage]||[];
         const get=mode=>arr.find(x=>String(x.mode||"").toLowerCase()===mode);
         const title=stage==="T-5min"?"T-5min · 开赛前5分钟":stage+" · 开赛前"+stage.replace("T-","")+"小时";
         return '<div class="e-evidence-stage"><h3>'+esc(title)+'</h3><div class="e-evidence-pair">'+
           evidenceShot(get("early"))+evidenceShot(get("today"))+
         '</div></div>';
       }).join("");
       grid.innerHTML=
         '<div class="e-evidence-detail-toolbar"><button type="button" id="eEvidenceBack">← 返回比赛列表</button></div>'+
         '<article class="e-evidence-match">'+
           '<div class="e-evidence-match-head"><strong>'+esc(m.home)+' vs '+esc(m.away)+'</strong><span>'+time(m.kickoff)+'</span></div>'+
           stageHtml+
         '</article>';
       const back=$("eEvidenceBack"); if(back)back.addEventListener("click",renderList);
     }));
   }
   renderList();
 }catch(e){status.textContent=e.message||"读取截图证据失败";}
}
if($("eEvidence"))$("eEvidence").addEventListener("click",evidence);
if($("eEvidenceClose"))$("eEvidenceClose").addEventListener("click",()=>{$("eEvidencePanel").hidden=true;});
if($("eExport"))$("eExport").addEventListener("click",exportXlsx);
window.addEventListener("formula-auth-ready",()=>{load().catch(()=>{});cloudStatus();},{once:true});
if(document.body.classList.contains("auth-ok")){load().catch(()=>{});cloudStatus();}
})();