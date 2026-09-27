(()=>{
const $=id=>document.getElementById(id);
const safe=s=>String(s||"").trim().replace(/[\\/:*?"<>|]+/g,"_").replace(/\s+/g,"_").slice(0,90);
function parseFixtures(text){
  const raw=String(text||"").trim();
  if(!raw)return [];
  const blocks=raw.split(/\n\s*\n+/).map(x=>x.trim()).filter(Boolean);
  const out=[];
  for(const block of blocks){
    const lines=block.split(/\n+/).map(x=>x.trim()).filter(Boolean);
    // Preferred format: two team names on two lines.
    if(lines.length===2&&!/\s+(?:vs\.?|v)\s+/i.test(block)){
      out.push({home:lines[0],away:lines[1],line:lines[0]+" vs "+lines[1]});
      continue;
    }
    // Backward compatibility: Home vs Away, one fixture per line.
    for(const line of lines){
      const p=line.split(/\s+(?:vs\.?|v)\s+/i);
      out.push(p.length>=2
        ?{home:p[0].trim(),away:p.slice(1).join(" vs ").trim(),line}
        :{error:"格式错误",line});
    }
  }
  return out.slice(0,20);
}
async function fetchRaw(home,away){
  const r=await fetch("/api/auto-fill",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({home,away})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||"数据获取失败");
  return j;
}
function stateFromFormLocal(arr){
  if(!Array.isArray(arr)||!arr.length)return "";
  const pts=arr.reduce((s,r)=>s+(r==="W"?3:r==="D"?1:0),0);
  const ppg=pts/arr.length;
  if(arr.length>=5&&ppg>=2.7)return "很好";
  if(ppg>=2)return "好";
  if(ppg>=1)return "一般";
  if(ppg>=0.4)return "差";
  return "很差";
}
function centeredRankingLocal(rows){
  if(!Array.isArray(rows)||!rows.length)return [];
  const fi=rows.findIndex(x=>x.focus);
  if(fi<0)return [];
  const above=rows.slice(Math.max(0,fi-3),fi);
  const focus=rows[fi];
  const below=rows.slice(fi+1,fi+4);
  return [...Array(3-above.length).fill(null),...above,focus,...below,...Array(3-below.length).fill(null)];
}
function daysBetween(a,b){
  if(!a||!b)return "";
  const da=new Date(a+"T12:00:00Z"),db=new Date(b+"T12:00:00Z");
  const d=Math.round((db-da)/86400000)-1;
  return d>=0?d:"";
}
function exactScheduleFromData(data,side){
  const s=data?.[side]||{},m=data?.match||{},team=s.name||(side==="home"?m.home:m.away)||"";
  const full=x=>{
    if(!x)return "";
    if(x.display)return x.display.replace(/\s*-\s*/g," vs ");
    const o=x.opponent||"";
    return x.ha==="A"?(o+" vs "+team):(team+" vs "+o);
  };
  const prev=(s.previous||[]).slice(-3).map(x=>({...x,display:full(x)}));
  const next=(s.next||[]).slice(0,2).map(x=>({...x,display:full(x)}));
  const current={date:m.date||"",competition:m.competition||"",display:(m.home||"")+" vs "+(m.away||"")};
  const rows=[...prev,current,...next];let prior=s.previousGapBaseDate||"";
  return rows.map(x=>{const d=x?.date||"",days=prior?daysBetween(prior,d):"";prior=d||prior;return {...x,days};});
}
async function formulaAXlsx(data){
  if(typeof JSZip==="undefined")throw new Error("JSZip 未加载");
  if(typeof FORMULA_A_TEMPLATE_B64==="undefined")throw new Error("公式A模板未加载");
  const bin=atob(FORMULA_A_TEMPLATE_B64),bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  const zip=await JSZip.loadAsync(bytes);
  const sheetFile=zip.file("xl/worksheets/sheet1.xml");
  if(!sheetFile)throw new Error("公式A模板工作表缺失");
  const xml=await sheetFile.async("string"),doc=new DOMParser().parseFromString(xml,"application/xml");
  if(doc.querySelector("parsererror"))throw new Error("公式A模板解析失败");
  const ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const sheetData=doc.getElementsByTagNameNS(ns,"sheetData")[0]||doc.querySelector("sheetData");
  function row(r){let x=[...sheetData.children].find(y=>y.getAttribute("r")===String(r));if(!x){x=doc.createElementNS(ns,"row");x.setAttribute("r",String(r));sheetData.appendChild(x)}return x}
  function cell(a){let x=doc.querySelector('c[r="'+a+'"]');if(x)return x;const m=a.match(/^([A-Z]+)(\d+)$/);x=doc.createElementNS(ns,"c");x.setAttribute("r",a);row(Number(m[2])).appendChild(x);return x}
  function wipe(c){[...c.children].forEach(ch=>{if(["v","is","f"].includes(ch.localName))c.removeChild(ch)})}
  function text(a,v){const c=cell(a);wipe(c);c.setAttribute("t","inlineStr");const is=doc.createElementNS(ns,"is"),t=doc.createElementNS(ns,"t");t.textContent=String(v??"");is.appendChild(t);c.appendChild(is)}
  function num(a,v){const c=cell(a);wipe(c);c.removeAttribute("t");const n=doc.createElementNS(ns,"v");n.textContent=String(v??"");c.appendChild(n)}
  function auto(a,v){if(v===null||v===undefined||v==="")text(a,"");else if(typeof v==="number"&&Number.isFinite(v))num(a,v);else text(a,v)}
  function serial(iso){if(!iso)return "";const d=new Date(iso+"T00:00:00Z");return Math.floor((d-Date.UTC(1899,11,30))/86400000)}
  function col(n){let s="";while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
  for(let r=13;r<=19;r++)for(let c=1;c<=7;c++)text(col(c)+r,"");
  for(let r=47;r<=53;r++)for(let c=1;c<=7;c++)text(col(c)+r,"");
  for(let r=23;r<=28;r++)for(let c=1;c<=8;c++)text(col(c)+r,"");
  for(let r=57;r<=62;r++)for(let c=1;c<=8;c++)text(col(c)+r,"");
  ["B30","B31","B34","C34","B35","B64","B65","B68","C68","B69"].forEach(a=>text(a,""));
  const h=data.home?.name||data.match?.home||"Home",a=data.away?.name||data.match?.away||"Away";
  const hr=(data.home?.ranking||[]).find(x=>x.focus)?.rank||"",ar=(data.away?.ranking||[]).find(x=>x.focus)?.rank||"";
  text("A2",h+(hr?(" ("+hr+")"):""));text("C2",a+(ar?(" ("+ar+")"):""));
  text("J7","公式A：排名按请求时最新实际积分榜。");
  text("J8","前3场+本场+后2场按一线队所有比赛，包含欧战/杯赛/友谊赛。");
  text("J9",h+(hr?(" #"+hr):"")+"；"+a+(ar?(" #"+ar):"")+"。");
  function standings(side,start){
    centeredRankingLocal(data?.[side]?.ranking||[]).forEach((x,i)=>{
      if(!x)return;const r=start+i;
      text("A"+r,x.team??"");auto("B"+r,x.rank);auto("C"+r,x.points);auto("D"+r,x.gd);auto("E"+r,x.played);auto("F"+r,x.remaining);auto("G"+r,x.maxPoints);
    });
  }
  function fixtures(side,start){
    exactScheduleFromData(data,side).forEach((x,i)=>{const r=start+i;if(x.date)num("B"+r,serial(x.date));else text("B"+r,"");text("C"+r,x.competition||"");text("D"+r,x.display||x.opponent||"");auto("H"+r,x.days)});
  }
  standings("home",13);standings("away",47);fixtures("home",23);fixtures("away",57);
  auto("B30",data.home?.averages?.gf||"");auto("B31",data.home?.averages?.ga||"");
  text("B34",stateFromFormLocal(data.home?.form||[]));text("C34",(data.home?.form||[]).join(""));text("B35",data.home?.coachStyle||"");
  auto("B64",data.away?.averages?.gf||"");auto("B65",data.away?.averages?.ga||"");
  text("B68",stateFromFormLocal(data.away?.form||[]));text("C68",(data.away?.form||[]).join(""));text("B69",data.away?.coachStyle||"");
  zip.file("xl/worksheets/sheet1.xml",new XMLSerializer().serializeToString(doc));
  return await zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
async function formulaBXlsx(j){
  if(typeof ExcelJS==="undefined")throw new Error("ExcelJS 未加载");
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Formula B");
  ws.columns=[{width:20},{width:24},{width:18},{width:18},{width:42}];
  ws.addRow(["Team","Competition Rank","Fatigue","Density","Next 3"]);
  [j.home,j.away].forEach(s=>ws.addRow([s.name,s.rank,s.fatigue,s.density,(s.next3||[]).map(x=>x.display).join(" | ")]));
  ws.getRow(1).font={bold:true};
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
async function saveZip(zip,name,statusEl){
  const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  if(statusEl)statusEl.textContent="已生成并下载："+name;
}
function isUclData(data){
  const c=String(data?.match?.competition||data?.competition||"");
  return /(?:UEFA\s*)?Champions\s+League/i.test(c);
}
async function runABatch(){
  const input=$("aBatchFixtures"),status=$("aBatchStatus"),btn=$("aBatchRun");
  const list=parseFixtures(input?.value);
  if(list.length>20){status.textContent="最多只能一次生成20场，请删除多出的比赛。";return}
  if(!list.length){status.textContent="请输入至少1场比赛";return}
  if(list.some(x=>x.error)){status.textContent="格式错误：请每行使用 Home vs Away";return}
  btn.disabled=true;const zip=new JSZip(),errors=[];let ok=0;
  try{
    for(let i=0;i<list.length;i++){
      const x=list[i];status.textContent="公式A(资料)处理中 "+(i+1)+"/"+list.length+"："+x.home+" vs "+x.away;
      try{
        const raw=await fetchRaw(x.home,x.away);
        const h=raw.home?.name||x.home,a=raw.away?.name||x.away;
        if(isUclData(raw)){
          status.textContent="公式A(资料) · 已识别欧冠，自动调用欧冠资料引擎 "+(i+1)+"/"+list.length+"："+h+" vs "+a;
          const r=await fetch("/api/formula-b",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:raw})});
          const j=await r.json().catch(()=>({}));
          if(!r.ok)throw new Error(j.error||"欧冠资料分析失败");
          const bytes=await formulaBXlsx(j);
          zip.file(safe(h+"_vs_"+a+"_公式A_欧冠资料")+".xlsx",bytes);
        }else{
          const failed=Object.entries(raw.checks||{}).filter(([,v])=>!v).map(([k])=>k);
          if(failed.length)throw new Error("完整性检查未通过："+failed.join(", "));
          const bytes=await formulaAXlsx(raw);
          zip.file(safe(h+"_vs_"+a+"_公式A_资料")+".xlsx",bytes);
        }
        ok++;
      }catch(e){errors.push((i+1)+". "+x.line+" — "+(e?.message||e))}
    }
    if(errors.length)zip.file("未生成比赛_请复查.txt",errors.join("\n"));
    if(!ok){status.textContent="没有比赛通过完整性检查，请检查球队名称。";return}
    await saveZip(zip,"公式A_资料_批量_"+ok+"场.zip",status);
    if(errors.length)status.textContent+="；另有 "+errors.length+" 场未通过完整性检查，ZIP内有说明。";
  }finally{btn.disabled=false}
}
async function runBBatch(){
  const input=$("bBatchFixtures"),status=$("bStatus"),btn=$("bRun");
  const rawLines=String(input?.value||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);
  if(rawLines.length>20){status.textContent="最多只能一次生成20场，请删除多出的比赛。";return}
  const list=parseFixtures(input?.value);
  if(!list.length){status.textContent="请输入至少1场比赛";return}
  if(list.some(x=>x.error)){status.textContent="格式错误：请每行使用 Home vs Away";return}
  btn.disabled=true;const zip=new JSZip(),errors=[];let ok=0;
  try{
    for(let i=0;i<list.length;i++){
      const x=list[i];status.textContent="公式B处理中 "+(i+1)+"/"+list.length+"："+x.home+" vs "+x.away;
      try{
        const raw=await fetchRaw(x.home,x.away);
        const r=await fetch("/api/formula-b",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:raw})});
        const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"公式B分析失败");
        const bytes=await formulaBXlsx(j),h=j.home?.name||x.home,a=j.away?.name||x.away;
        zip.file(safe(h+"_vs_"+a+"_公式B")+".xlsx",bytes);ok++;
      }catch(e){errors.push((i+1)+". "+x.line+" — "+(e?.message||e))}
    }
    if(errors.length)zip.file("未生成比赛_请复查.txt",errors.join("\n"));
    if(!ok){status.textContent="没有比赛成功生成，请检查球队名称。";return}
    await saveZip(zip,"公式B_批量_"+ok+"场.zip",status);
    if(errors.length)status.textContent+="；另有 "+errors.length+" 场失败，ZIP内有说明。";
  }finally{btn.disabled=false}
}
window.runFormulaBBatch=runBBatch;
if($("aBatchRun"))$("aBatchRun").addEventListener("click",runABatch);
})();