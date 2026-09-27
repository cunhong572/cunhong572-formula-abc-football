(()=>{
const $=id=>document.getElementById(id);
const isEn=()=>window.FormulaLang?.get?.()==="en";
const L=(zh,en)=>isEn()?en:zh;
let lastB=null,lastC=[];

document.querySelectorAll(".formula-tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".formula-tab").forEach(x=>x.classList.toggle("active",x===btn));
    document.querySelectorAll(".formula-module").forEach(x=>x.classList.remove("active"));
    const target=$(btn.dataset.target); if(target) target.classList.add("active");
    const title=btn.textContent.trim();
    document.querySelector("header h1").textContent=title.startsWith("公式 A")?"公式 A":title.replace(/V14/g,"").trim();
  });
});

async function fetchMatch(home,away){
  const r=await fetch("/api/auto-fill",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({home,away})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||"数据获取失败");
  return j;
}
function days(a,b){
  if(!a||!b)return null;
  return Math.max(0,Math.round((new Date(b+"T12:00:00Z")-new Date(a+"T12:00:00Z"))/86400000)-1);
}
function fatigue(data){
  const prev=(data.previous||[]).slice(-1)[0];
  if(!prev)return "—";
  const d=days(prev.date,lastB?.match?.date||"");
  return d==null?"—":(d<=3?"累":"不累");
}
function density(data,matchDate){
  const n=(data.next||[]).slice(0,2);
  if(!n.length)return "—";
  let prev=matchDate, tight=0;
  n.forEach(x=>{const d=days(prev,x.date);if(d!=null&&d<=3)tight++;prev=x.date;});
  return tight>=2?"☑️×2":tight===1?"☑️":"❌";
}
function fullFixture(x,team){
  if(x.display) return x.display.replace(/\s*-\s*/g," vs ");
  return x.ha==="A"?(x.opponent+" vs "+team):(team+" vs "+x.opponent);
}
function currentRank(side){
  return (side.ranking||[]).find(x=>x.focus)?.rank??"—";
}
function miniFixtures(side,count=3){
  const team=side.name||"";
  const arr=(side.next||[]).slice(0,count);
  return arr.length?arr.map(x=>'<div><span>'+esc(x.date)+'</span>'+esc(fullFixture(x,team))+' · '+esc(x.competition||"")+'</div>').join(""):"—";
}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

$("bRun").addEventListener("click",async()=>{
  if(window.runFormulaBBatch){await window.runFormulaBBatch();return;}
  const home=$("bHome").value.trim(),away=$("bAway").value.trim();
  if(!home||!away){$("bStatus").textContent="请输入两队名称";return;}
  $("bRun").disabled=true;$("bStatus").textContent="正在生成公式 B…";
  try{
    const raw=await fetchMatch(home,away);
    const br=await fetch("/api/formula-b",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:raw})});
    const bj=await br.json().catch(()=>({}));
    if(!br.ok)throw new Error(bj.error||"公式 B 服务器分析失败");
    lastB=bj;
    const h=lastB.home,a=lastB.away,m=lastB.match;
    const nations=/nations\s*league|欧国联/i.test(String(m.competition||""));
    const html='<div class="result-grid">'+[h,a].map(s=>{
      const next=(s.next3||[]).map(x=>'<div><span>'+esc(x.date)+'</span>'+esc(x.display)+' · '+esc(x.competition||"")+'</div>').join("")||"—";
      return '<div class="result-card"><h3>'+esc(s.name)+' <small>#'+esc(s.rank)+'</small></h3>'+
      '<div class="kv"><b>Competition</b><span>'+esc(m.competition)+'</span><b>疲劳</b><span>'+esc(s.fatigue)+'</span><b>后两场密度</b><span>'+esc(s.density)+'</span><b>Form</b><span>'+esc(s.form||"")+'</span><b>'+(nations?'下6场欧国联':'下3场')+'</b><div class="fixture-mini">'+next+'</div></div></div>';
    }).join("")+'</div>';
    $("bResult").classList.remove("empty-state");$("bResult").innerHTML=html;
    $("bStatus").textContent="公式 B 已生成";
  }catch(e){$("bStatus").textContent=e.message;}
  finally{$("bRun").disabled=false;}
});

$("bExport").addEventListener("click",async()=>{
  if(!lastB){$("bStatus").textContent="请先生成公式 B";return;}
  if(typeof ExcelJS==="undefined"){$("bStatus").textContent="Excel 组件未加载";return;}
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Formula B");
  ws.columns=[{width:20},{width:24},{width:18},{width:18},{width:42}];
  ws.addRow(["Team","Competition Rank","Fatigue","Density","Next 3"]);
  [lastB.home,lastB.away].forEach(s=>ws.addRow([s.name,s.rank,s.fatigue,s.density,(s.next3||[]).map(x=>x.display).join(" | ")]));
  ws.getRow(1).font={bold:true};
  const buf=await wb.xlsx.writeBuffer(),blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(lastB.match.home+"_vs_"+lastB.match.away+"_公式B.xlsx").replace(/[^a-zA-Z0-9_\-.\u4e00-\u9fff]/g,"_");a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  $("bStatus").textContent="B Excel 已导出";
});

async function fetchFormulaC(home,away){
  const r=await fetch("/api/formula-c",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({home,away})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||"公式 C 数据获取失败");
  return j;
}
function cFatigueLabel(v){
  if(v==="很累")return "Very Tired";
  if(v==="累")return "Tired";
  if(v==="不累")return "Not Tired";
  return "—";
}
function cDensityLabel(v){
  if(v==="☑️×2")return "☑ ×2";
  if(v==="☑️")return "☑";
  return "✕";
}
function cEtTime(utc){
  if(!utc)return "";
  try{
    return new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"2-digit",day:"2-digit",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(utc))+" ET";
  }catch(e){return String(utc).slice(0,10);}
}
function cIntentClass(v){
  if(v==="Must Win")return "must";
  if(v==="Want Win")return "want";
  if(v==="Hope Win")return "hope";
  if(v==="Don’t Lose"||v==="Don't Lose")return "dont";
  return "none";
}
function cNextRows(side,count=3){
  const arr=side.next3||[];
  let html="";
  for(let i=0;i<count;i++){
    const x=arr[i];
    html+='<div class="c-next-line">'+(x?esc(cEtTime(x.utcTime))+"  "+esc(x.display)+(x.competition?("  ["+esc(x.competition)+"]"):""):"")+'</div>';
  }
  return html;
}
function cEuropeScheduleHtml(side,label){
  const arr=side.europeSchedule||[];
  if(!arr.length)return "";
  return '<div class="c-europe-schedule"><div class="c-euro-title">'+esc(label)+'</div>'+
    arr.map((x,i)=>'<div class="c-next-line">'+(i+1)+'. '+esc(cEtTime(x.utcTime))+"  "+esc(x.display)+'</div>').join("")+
  '</div>';
}
function cSideSheet(side,competition){
  const nations=/nations\s*league|欧国联/i.test(String(competition||""));
  const count=nations?6:3;
  const label=nations?"Next 6 UEFA Nations League Matches — ET":"Next 3 Matches — All Competitions — ET";
  return '<div class="c-sheet-side">'+
    '<div class="c-team-row"><strong>'+esc(side.name)+(side.rank?(" ["+side.rank+"]"):"")+'</strong><span>'+esc(competition)+'</span></div>'+
    '<div class="c-fatigue-row">'+esc(cFatigueLabel(side.fatigue))+'</div>'+
    '<div class="c-density-row">'+esc(cDensityLabel(side.density))+'</div>'+
    '<div class="c-intent-row '+cIntentClass(side.intent)+'">'+esc(side.intent||"---")+'</div>'+
    '<div class="c-next-header">'+esc(label)+'</div>'+
    '<div class="c-next-lines">'+cNextRows(side,count)+'</div>'+
  '</div>';
}
function cTableHtml(table){
  if(!table?.length)return "";
  return '<div class="c-table-wrap"><table class="c-table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>GD</th><th>Pts</th></tr></thead><tbody>'+
    table.map(x=>'<tr><td>'+esc(x.rank)+'</td><td>'+esc(x.team)+'</td><td>'+esc(x.played)+'</td><td>'+esc(x.gd)+'</td><td>'+esc(x.points)+'</td></tr>').join("")+
    '</tbody></table></div>';
}
function cFormBadges(form){
  const arr=Array.isArray(form)?form:[];
  return arr.map(v=>'<span class="c-form-badge '+(v==="W"?"w":v==="D"?"d":v==="L"?"l":"")+'">'+esc(v)+'</span>').join("");
}
function cNationsGroupTitle(level,groupName){
  const grp=String(groupName||"").match(/(?:Grp\.?|Group)\s*(\d+)/i)?.[1]||"";
  return "欧国联"+(level?(level+"级"):"")+(grp?(" · 第"+grp+"组"):"");
}
function cNationsGroupHtml(table,groupName,level){
  const title=cNationsGroupTitle(level,groupName);
  if(!table?.length)return '<div class="c-nations-group"><div class="c-euro-title">'+esc(title||"欧国联小组")+'</div><div class="c-next-line">暂无可验证小组榜</div></div>';
  const rows=[...table].sort((a,b)=>Number(a.rank||99)-Number(b.rank||99));
  return '<div class="c-nations-group"><div class="c-euro-title">'+esc(title||"欧国联小组")+'</div>'+
    '<div class="c-table-wrap"><table class="c-table c-nations-table"><thead><tr><th>#</th><th>球队</th><th>PL</th><th>+/-</th><th>GD</th><th>PTS</th><th>Form</th></tr></thead><tbody>'+
    rows.map(x=>'<tr><td>'+esc(x.rank)+'</td><td>'+esc(x.team)+'</td><td>'+esc(x.played)+'</td><td>'+esc(x.scores||"")+'</td><td>'+esc(x.gd)+'</td><td><b>'+esc(x.points)+'</b></td><td>'+cFormBadges(x.form)+'</td></tr>').join("")+
    '</tbody></table></div></div>';
}
$("cRun").addEventListener("click",async()=>{
  const raw=String($("cFixtures").value||"").trim();
  const blocks=raw?raw.split(/\n\s*\n+/).map(x=>x.trim()).filter(Boolean):[];
  const fixtures=[];
  for(const block of blocks){
    const ls=block.split(/\n+/).map(x=>x.trim()).filter(Boolean);
    if(ls.length===2&&!/\s+(?:vs\.?|v)\s+/i.test(block)){
      fixtures.push({home:ls[0],away:ls[1],line:ls[0]+" vs "+ls[1]});
    }else{
      for(const line of ls){
        const p=line.split(/\s+(?:vs\.?|v)\s+/i);
        fixtures.push(p.length>=2?{home:p[0].trim(),away:p.slice(1).join(" vs ").trim(),line}:{line,error:"格式错误"});
      }
    }
  }
  const lines=fixtures.slice(0,30);
  if(!lines.length){$("cStatus").textContent="请输入比赛";return;}
  $("cRun").disabled=true;$("cStatus").textContent="正在按锁定公式B逐场分析…";lastC=[];
  const seenIdentity=new Set();let mergedDuplicates=0;
  try{
    for(let i=0;i<lines.length;i++){
      const fixture=lines[i];
      if(fixture.error){lastC.push({line:fixture.line,error:fixture.error});continue;}
      try{
        const j=await fetchFormulaC(fixture.home,fixture.away);
        const identity=j?.match?.identityKey||[j?.home?.teamId,j?.away?.teamId,j?.match?.fixtureId||j?.match?.date].join("|");
        if(identity&&seenIdentity.has(identity)){mergedDuplicates++;continue;}
        if(identity)seenIdentity.add(identity);
        lastC.push({j});
      }catch(e){lastC.push({line:fixture.line,error:e.message});}
      $("cStatus").textContent="处理中 "+(i+1)+"/"+lines.length;
    }

    const blocks=lastC.map((x,i)=>{
      if(x.error)return '<div class="c-sheet-pair"><div class="c-error-row">'+esc(x.line)+" — "+esc(x.error)+'</div></div>';
      const j=x.j;
      const eu=j.european?.isUEL||j.european?.isUECL;
      const nations=!!j.nationsLeague?.isNationsLeague;
      const fullCount=j.european?.expectedGames||0;
      return '<div class="c-sheet-pair">'+
        '<div class="c-sheet-grid '+(nations?'c-sheet-grid-nations':'')+'">'+
          cSideSheet(j.home,j.match.competition)+
          cSideSheet(j.away,j.match.competition)+
          (nations?cNationsGroupHtml(j.competitionTable,j.nationsLeague?.groupName,j.nationsLeague?.leagueLevel):'')+
        '</div>'+
        (eu?'<div class="c-sheet-grid">'+
          cEuropeScheduleHtml(j.home,j.match.competition+" — Full "+fullCount+" Matches")+
          cEuropeScheduleHtml(j.away,j.match.competition+" — Full "+fullCount+" Matches")+
        '</div><div class="c-euro-table"><div class="c-euro-title">'+esc(j.match.competition)+' — Complete Current 36-Team Table</div>'+cTableHtml(j.competitionTable)+'</div>':'')+
      '</div>';
    }).join("");
    $("cResult").classList.remove("empty-state");
    $("cResult").innerHTML='<div class="c-sheet">'+blocks+'</div>';
    const firstOk=lastC.find(x=>x.j)?.j;
    const ver=firstOk?.engineVersion||"Formula C LOCKED";
    const at=firstOk?.analyzedAt?new Date(firstOk.analyzedAt).toLocaleString("en-US",{timeZone:"America/New_York"}):"";
    $("cStatus").textContent=ver+(at?(" · "+at+" ET"):"")+(mergedDuplicates?(" · 已合并 "+mergedDuplicates+" 个同队/同场重复名称"):"");
  }finally{$("cRun").disabled=false;}
});

$("cExport").addEventListener("click",async()=>{
  if(!lastC.length){$("cStatus").textContent="请先生成公式 C";return;}
  if(typeof ExcelJS==="undefined"){$("cStatus").textContent="Excel 组件未加载";return;}
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Formula C");
  ws.views=[{showGridLines:false}];
  ws.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.1,right:.1,top:.2,bottom:.2,header:.05,footer:.05}};
  for(let c=1;c<=19;c++)ws.getColumn(c).width=(c===1||c===7||c===14)?22:((c===6||c===12||c===13||c>=15)?14:16);

  const thin={style:"thin",color:{argb:"FFD9D9D9"}};
  const center={horizontal:"center",vertical:"middle",wrapText:true};
  const white={argb:"FFFFFFFF"};
  const colors={team:"FFDDEBF7",next:"FF5B9BD5",must:"FFF4CCCC",hope:"FFFFF2CC",want:"FFE2F0D9",dont:"FFD9EAF7",none:"FFFFFFFF",black:"FF000000"};

  function cell(r,c,v){
    const x=ws.getCell(r,c);x.value=v??"";x.alignment=center;x.border={top:thin,left:thin,bottom:thin,right:thin};x.font={name:"Arial",size:9};return x;
  }
  function fillRange(r,c1,c2,color,fontWhite=false){
    for(let c=c1;c<=c2;c++){const x=ws.getCell(r,c);x.fill={type:"pattern",pattern:"solid",fgColor:{argb:color}};if(fontWhite)x.font={name:"Arial",size:9,bold:true,color:white};}
  }
  function mergeRow(r,c1,c2,v,color,fontWhite=false,bold=true){
    ws.mergeCells(r,c1,r,c2);const x=cell(r,c1,v);x.font={name:"Arial",size:9,bold,color:fontWhite?white:undefined};fillRange(r,c1,c2,color,fontWhite);return x;
  }
  function sideBlock(baseCol,side,comp,startRow){
    const nations=/nations\s*league|欧国联/i.test(String(comp||""));
    const count=nations?6:3;
    const label=nations?"Next 6 UEFA Nations League Matches — ET":"Next 3 Matches — All Competitions — ET";
    mergeRow(startRow,baseCol,baseCol+4,side.name+(side.rank?(" ["+side.rank+"]"):""),colors.team,false,true);
    cell(startRow,baseCol+5,comp).fill={type:"pattern",pattern:"solid",fgColor:{argb:colors.team}};
    mergeRow(startRow+1,baseCol,baseCol+5,cFatigueLabel(side.fatigue),colors.none,false,true);
    mergeRow(startRow+2,baseCol,baseCol+5,cDensityLabel(side.density),colors.none,false,true);
    const ic=side.intent==="Must Win"?colors.must:(side.intent==="Want Win"?colors.want:(side.intent==="Hope Win"?colors.hope:((side.intent==="Don’t Lose"||side.intent==="Don't Lose")?colors.dont:colors.none)));
    mergeRow(startRow+3,baseCol,baseCol+5,side.intent||"---",ic,false,true);
    mergeRow(startRow+4,baseCol,baseCol+5,label,colors.next,true,true);
    const n=side.next3||[];
    for(let i=0;i<count;i++){
      mergeRow(startRow+5+i,baseCol,baseCol+5,n[i]?(cEtTime(n[i].utcTime)+"  "+n[i].display+(n[i].competition?("  ["+n[i].competition+"]"):"")):"",colors.none,false,false);
    }
    return count;
  }

  function euroScheduleBlock(baseCol,side,comp,startRow,count){
    mergeRow(startRow,baseCol,baseCol+5,comp+" — Full "+count+" League-Phase Matches",colors.next,true,true);
    const arr=(side.europeSchedule||[]).slice(0,count);
    for(let i=0;i<count;i++){
      mergeRow(startRow+1+i,baseCol,baseCol+5,arr[i]?(cEtTime(arr[i].utcTime)+"  "+arr[i].display):"",colors.none,false,false);
    }
  }
  function nationsGroupBlock(startRow,table,groupName,level){
    mergeRow(startRow,13,19,cNationsGroupTitle(level,groupName)||"欧国联小组",colors.next,true,true);
    ["#","球队","PL","+/-","GD","PTS","Form"].forEach((v,i)=>cell(startRow+1,13+i,v));
    const rows=[...(table||[])].sort((a,b)=>Number(a.rank||99)-Number(b.rank||99));
    for(let i=0;i<rows.length;i++){
      const x=rows[i];
      [x.rank,x.team,x.played,x.scores||"",x.gd,x.points,(Array.isArray(x.form)?x.form.join(" "):"")].forEach((v,j)=>cell(startRow+2+i,13+j,v));
    }
    return rows.length+2;
  }

  let r=1;
  for(let idx=0;idx<lastC.length;idx++){
    const x=lastC[idx];
    if(x.error){
      mergeRow(r,1,12,(x.line||"")+" — "+x.error,colors.black,true,true);
      r+=2;continue;
    }
    const j=x.j;
    const homeNextCount=sideBlock(1,j.home,j.match.competition,r);
    const awayNextCount=sideBlock(7,j.away,j.match.competition,r);
    const baseNextCount=Math.max(homeNextCount||3,awayNextCount||3);
    const nations=!!j.nationsLeague?.isNationsLeague;

    let groupHeight=0;
    if(nations)groupHeight=nationsGroupBlock(r,j.competitionTable,j.nationsLeague?.groupName,j.nationsLeague?.leagueLevel);

    const isSpecialEuro=j.european?.isUEL||j.european?.isUECL;
    const count=isSpecialEuro?(j.european?.expectedGames||0):0;
    let sepRow=Math.max(r+5+baseNextCount,r+groupHeight);
    if(count){
      euroScheduleBlock(1,j.home,j.match.competition,r+8,count);
      euroScheduleBlock(7,j.away,j.match.competition,r+8,count);
      sepRow=Math.max(sepRow,r+9+count);
    }
    fillRange(sepRow,1,nations?19:12,colors.black,false);
    ws.getRow(sepRow).height=7;
    r=sepRow+1;
  }

  // 欧联/欧协联：同一工作表右侧分别加入每个赛事完整当前36队总榜。
  const euroByCompetition=[];
  for(const x of lastC){
    if(!x.j)continue;
    if(!(x.j.european?.isUEL||x.j.european?.isUECL))continue;
    if(euroByCompetition.some(y=>y.match.competition===x.j.match.competition))continue;
    euroByCompetition.push(x.j);
  }
  euroByCompetition.forEach((j,idx)=>{
    const table=j.competitionTable||[];
    const startCol=14+idx*6;
    mergeRow(1,startCol,startCol+4,j.match.competition+" — Current 36-Team Table",colors.next,true,true);
    ["#","Team","P","GD","Pts"].forEach((v,i)=>cell(2,startCol+i,v).font={name:"Arial",size:9,bold:true});
    table.forEach((x,i)=>{cell(3+i,startCol,x.rank);cell(3+i,startCol+1,x.team);cell(3+i,startCol+2,x.played);cell(3+i,startCol+3,x.gd);cell(3+i,startCol+4,x.points);});
    ws.getColumn(startCol+1).width=24;
  });

  const buf=await wb.xlsx.writeBuffer(),blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="公式B_分析意图.xlsx";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  $("cStatus").textContent="公式B(分析意图) Excel 已按固定规格导出";
});

let dBoardTimer=null;
let dBoardBusy=false;
let dBoardAnalyses=new Map();
let dOpenMatchId=null;
// Formula C live-board order is sticky for the lifetime of the page.
// Once a match receives a position, score/minute/intent refreshes never move it.
// Newly discovered live matches are appended after the existing matches.
const dBoardOrder=new Map();
let dBoardOrderSeq=0;
const dLightState=new Map();
const dLastFullFetch=new Map();
let dLastLearningRefresh=0;

function dIntentClass(x){
  return x==="Give Up"?"giveup":x==="Win Big"?"winbig":x==="Equalize"?"equalize":x==="Must Win"?"must":x==="Want Win"?"want":x==="Hope Win"?"hope":x==="Don't Lose"?"dont":"none";
}
function dMetric(v,suffix=""){return v===null||v===undefined||v===""?"—":esc(v)+suffix;}
function dSubRole(p){
  const role=String(p?.roleClass||"").toLowerCase();
  const group=String(p?.positionGroup||"").toLowerCase();
  if(role.includes("attack")||group.includes("attack"))return L("进攻","Attacking");
  if(role.includes("defen")||role.includes("goal")||group.includes("defen")||group.includes("goal"))return L("防守","Defensive");
  return L("平衡","Balanced");
}
function dSubPlayer(p,action){
  if(!p)return "";
  const name=esc(p.player||L("未知球员","Unknown player"));
  const role=esc(dSubRole(p));
  return name+"「"+role+"」"+action;
}
function dSubText(s){
  if(!s)return "—";
  const off=dSubPlayer(s.off,L("换下","OFF"));
  const on=dSubPlayer(s.on,L("换上","ON"));
  const pair=[off,on].filter(Boolean).join(" --- ");
  return esc(s.minute)+"' "+(pair||L("换人资料不完整","Substitution details incomplete"));
}
function dIntensity(side){
  return dIntensityFlags(side)[0]||"BALANCED";
}
function dIntensityFlags(side){
  const fm=side?.formulaDMetrics||{},as=Number(fm.AS),ss=Number(fm.SS),out=[];
  if(Number.isFinite(as)&&as>=72)out.push("DANGEROUS");
  if(Number.isFinite(ss)&&ss>=65)out.push("FAST");
  if(out.length)return out;
  if(Number.isFinite(as)&&as<=35&&Number.isFinite(ss)&&ss<=42)return ["PASSIVE"];
  return ["BALANCED"];
}
function dStatusClass(x){
  return x==="DANGEROUS"?"dangerous":x==="FAST"?"fast":x==="PASSIVE"?"passive":"balanced";
}
function dSignalBadges(side){
  const flags=dIntensityFlags(side);
  const triple=side?.intent==="Want Win"&&flags.includes("DANGEROUS")&&flags.includes("FAST");
  return flags.map(x=>'<i class="d-signal '+dStatusClass(x)+(triple?' triple-flash':'')+'">'+esc(x)+'</i>').join("");
}
function dDetailTeam(name,side){
  const m=(side&&side.metrics)||{},fm=(side&&side.formulaDMetrics)||{};
  return '<div class="result-card"><h3>'+esc(name)+'</h3><div class="kv">'+
    '<b>'+L("实时意图","Live Intent")+'</b><span><span class="intent-pill '+dIntentClass(side&&side.intent)+(side?.intent==="Want Win"&&dIntensityFlags(side).includes("DANGEROUS")&&dIntensityFlags(side).includes("FAST")?' triple-flash':'')+'">'+esc((side&&side.intent)||"---")+'</span></span>'+
    '<b>'+L("置信度","Confidence")+'</b><span>'+dMetric(side&&side.confidence,"%")+'</span>'+
    '<b>'+L("状态","Status")+'</b><span class="d-signal-wrap">'+dSignalBadges(side)+'</span>'+
    '<b>Speed Score</b><span>'+dMetric(fm.SS)+' '+esc(fm.trendSS||"")+' <small>(Δ '+dMetric(fm.deltaSS)+')</small> · <strong>'+esc(isEn()?(fm.tempoLevel?.label||"—"):(fm.tempoLevel?.zh||"—"))+'</strong></span>'+
    '<b>Attack Score</b><span>'+dMetric(fm.AS)+' '+esc(fm.trendAS||"")+' <small>(Δ '+dMetric(fm.deltaAS)+')</small> · <strong>'+esc(isEn()?(fm.attackLevel?.label||"—"):(fm.attackLevel?.zh||"—"))+'</strong></span>'+
    '<b>'+L("5分钟 SS / AS","5-min SS / AS")+'</b><span>'+dMetric(fm.window5SS)+' / '+dMetric(fm.window5AS)+' <small>'+L("权重60%","60% weight")+'</small></span>'+
    '<b>'+L("10分钟 SS / AS","10-min SS / AS")+'</b><span>'+dMetric(fm.window10SS)+' / '+dMetric(fm.window10AS)+' <small>'+L("权重40%","40% weight")+'</small></span>'+
    '<b>'+L("5分钟象限","5-min Quadrant")+'</b><span>'+esc((fm.quadrant&&fm.quadrant.code)||"—")+' · '+esc((fm.quadrant&&fm.quadrant.label)||"—")+' · '+esc((fm.quadrant&&fm.quadrant.meaning)||"")+'</span>'+
    '<b>Momentum</b><span>'+esc(fm.momentum||"Stable")+'</span>'+
    '<b>'+L("指标模式","Metric Mode")+'</b><span>'+esc(String(fm.mode||"proxy").toUpperCase())+'</span>'+
    '<b>xG</b><span>'+dMetric(m.xg)+'</span>'+
    '<b>'+L("最近5分钟 xG","Last 5 min xG")+'</b><span>'+dMetric(m.recent5XgFor)+'</span>'+
    '<b>'+L("前5分钟 xG","Previous 5 min xG")+'</b><span>'+dMetric(m.previous5XgFor)+'</span>'+
    '<b>'+L("最近10分钟 xG","Last 10 min xG")+'</b><span>'+dMetric(m.recent10XgFor)+'</span>'+
    '<b>'+L("前10分钟 xG","Previous 10 min xG")+'</b><span>'+dMetric(m.previous10XgFor)+'</span>'+
    '<b>'+L("射门 / 射正","Shots / Shots on Target")+'</b><span>'+dMetric(m.totalShots)+' / '+dMetric(m.shotsOnTarget)+'</span>'+
    '<b>'+L("最近5分钟射门","Last 5 min Shots")+'</b><span>'+dMetric(m.recent5ShotsFor)+'</span>'+
    '<b>'+L("前5分钟射门","Previous 5 min Shots")+'</b><span>'+dMetric(m.previous5ShotsFor)+'</span>'+
    '<b>'+L("最近10分钟射门","Last 10 min Shots")+'</b><span>'+dMetric(m.recent10ShotsFor)+'</span>'+
    '<b>'+L("前10分钟射门","Previous 10 min Shots")+'</b><span>'+dMetric(m.previous10ShotsFor)+'</span>'+
    '<b>'+L("控球","Possession")+'</b><span>'+dMetric(m.possession,"%")+'</span>'+
    '<b>'+L("角球","Corners")+'</b><span>'+dMetric(m.corners)+'</span>'+
    '<b>'+L("红牌 / 换人","Red Cards / Subs")+'</b><span>'+dMetric(m.redCards)+' / '+dMetric(m.substitutions)+'</span>'+
    '<b>'+L("最近换人","Latest Substitution")+'</b><span>'+dSubText(m.lastSubstitution)+'</span>'+
    '<b>'+L("实时依据","Live Evidence")+'</b><span>'+esc(((side&&side.reasons)||[]).join(isEn()?"; ":"；")||"—")+'</span>'+
  '</div></div>';
}
function dBoardRow(j){
  const m=j.match||{},h=j.home||{},a=j.away||{};
  const id="dDetail_"+String(m.matchId||"").replace(/[^a-zA-Z0-9_-]/g,"");
  return '<article class="d-live-row">'+
    '<button type="button" class="d-live-main" data-detail="'+id+'" data-matchid="'+esc(m.matchId||"")+'">'+
      '<span class="d-minute">'+esc(m.minute||"")+"' <small>LIVE</small></span>"+
      '<span class="d-team d-home"><em class="intent-pill '+dIntentClass(h.intent)+(h.intent==="Want Win"&&dIntensityFlags(h).includes("DANGEROUS")&&dIntensityFlags(h).includes("FAST")?' triple-flash':'')+'">'+esc(h.intent||"---")+'</em><strong class="d-team-name">'+esc(m.home||"")+'</strong><span class="d-signal-wrap">'+dSignalBadges(h)+'</span></span>'+
      '<strong class="d-score">'+esc(m.homeGoals)+' - '+esc(m.awayGoals)+'</strong>'+
      '<span class="d-team d-away"><em class="intent-pill '+dIntentClass(a.intent)+(a.intent==="Want Win"&&dIntensityFlags(a).includes("DANGEROUS")&&dIntensityFlags(a).includes("FAST")?' triple-flash':'')+'">'+esc(a.intent||"---")+'</em><strong class="d-team-name">'+esc(m.away||"")+'</strong><span class="d-signal-wrap">'+dSignalBadges(a)+'</span></span>'+
      '<span class="d-comp">GTI '+esc((j.gti&&j.gti.GTI)!=null?j.gti.GTI:"—")+' · '+esc(m.competition||"")+' ›</span>'+
    '</button>'+
    '<div id="'+id+'" class="d-live-detail" hidden>'+
      '<div class="d-detail-toolbar"><button type="button" class="d-back-btn" data-back-match="'+esc(m.matchId||"")+'">← '+L("返回比赛列表","Back to match list")+'</button></div>'+
      '<div class="result-grid">'+dDetailTeam(m.home,h)+dDetailTeam(m.away,a)+'</div>'+
    '</div>'+
  '</article>';
}
async function dAnalyzeOne(match){
  const r=await fetch("/api/formula-d-live",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    home:match.home,away:match.away,matchId:match.matchId,
    liveMinute:match.minute,liveHomeGoals:match.homeGoals,liveAwayGoals:match.awayGoals
  })});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||"实时数据获取失败");
  return j;
}
function dLightKey(match){return String(match?.matchId||"");}
function dNeedsFullAnalysis(match){
  const id=dLightKey(match),prev=dLightState.get(id),last=dLastFullFetch.get(id)||0;
  if(!id||!dBoardAnalyses.has(id))return true;
  if(!prev)return true;
  if(Number(prev.homeGoals)!==Number(match.homeGoals)||Number(prev.awayGoals)!==Number(match.awayGoals))return true;
  if(Number(prev.minute)!==Number(match.minute))return true;
  return Date.now()-last>=45000;
}
function dRememberLight(match){
  const id=dLightKey(match);if(!id)return;
  dLightState.set(id,{homeGoals:match.homeGoals,awayGoals:match.awayGoals,minute:match.minute,started:match.started,finished:match.finished});
}
function dReuseAnalysis(match){
  const cached=dBoardAnalyses.get(dLightKey(match));
  if(!cached)return null;
  return {...cached,match:{...(cached.match||{}),...match}};
}
async function dMapLimit(items,limit,fn){
  const out=new Array(items.length);let next=0;
  async function worker(){
    while(true){
      const i=next++;if(i>=items.length)return;
      try{out[i]=await fn(items[i],i);}catch(e){out[i]={error:e.message,match:items[i]};}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker()));
  return out;
}
function dBindRows(){
  document.querySelectorAll("#dBoard .d-live-main").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const el=document.getElementById(btn.dataset.detail);
      if(!el)return;
      dOpenMatchId=btn.dataset.matchid||null;
      document.querySelectorAll("#dBoard .d-live-detail").forEach(x=>x.hidden=true);
      el.hidden=false;
    });
  });
  document.querySelectorAll("#dBoard .d-back-btn").forEach(btn=>{
    btn.addEventListener("click",e=>{
      e.stopPropagation();
      dOpenMatchId=null;
      const detail=btn.closest(".d-live-detail");
      if(detail)detail.hidden=true;
    });
  });
  if(dOpenMatchId){
    const active=document.querySelector('#dBoard .d-live-main[data-matchid="'+CSS.escape(String(dOpenMatchId))+'"]');
    if(active){
      const el=document.getElementById(active.dataset.detail);
      if(el)el.hidden=false;
    }else{
      dOpenMatchId=null;
    }
  }
}
async function dPlayerRefresh(){
  const el=$("dPlayerSummary");if(!el)return;
  try{
    const r=await fetch("/api/formula-d-player-summary");
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||L("球员知识库读取失败","Player registry unavailable"));
    const c=j.counts||{};
    el.innerHTML=isEn()
      ? "Player registry: <b>"+esc(c.teams||0)+"</b> teams covered · <b>"+esc(c.players||0)+"</b> players · market values available for <b>"+esc(c.values||0)+"</b><br>Role classification: Attacking "+esc(c.attacking||0)+" · Balanced "+esc(c.balanced||0)+" · Defensive "+esc(c.defensive||0)
      : "球员知识库：已覆盖 <b>"+esc(c.teams||0)+"</b> 支球队 · <b>"+esc(c.players||0)+"</b> 名球员 · 已取得身价 <b>"+esc(c.values||0)+"</b> 人<br>角色分类：进攻 "+esc(c.attacking||0)+" · 平衡 "+esc(c.balanced||0)+" · 防守 "+esc(c.defensive||0);
  }catch(e){el.textContent=L("球员知识库暂不可用：","Player registry unavailable: ")+e.message;}
}
async function dHistoricalRefresh(){
  const el=$("dHistoricalSummary"),st=$("dHistoricalStatus");if(!el)return;
  try{
    const r=await fetch("/api/formula-d-historical-summary");
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||L("历史统计读取失败","Historical statistics unavailable"));
    const s=j.state||{},ns=j.nationsState||{},t=j.totals||{},q=Array.isArray(j.quality)?j.quality:[];
    const qtxt=q.map(x=>esc(x.data_quality)+": "+esc(x.matches)+(isEn()?" matches":"场")).join(" / ");
    const active=Boolean(s.manual_enabled),runButton=$("dHistoricalRun");
    if(runButton){
      runButton.dataset.active=active?"1":"0";
      runButton.textContent=active?L("停止历史扫描","Stop Historical Scan"):L("开始历史扫描","Start Historical Scan");
    }
    el.innerHTML=isEn()
      ? "Scanning range: 2024-25 + 2025-26 · Big Five + UCL + UEL + UECL · UEFA Nations League 2022-23 + 2024-25<br>Main progress: <b>"+esc(String(s.cursor_date||"").slice(0,10))+"</b> · Nations League: phase "+esc(ns.phase||1)+" / 4 · cursor <b>"+esc(String(ns.cursor_date||"").slice(0,10))+"</b> · <b>"+esc(t.nationsMatches||0)+"</b> Nations League matches processed<br>Total: <b>"+esc(t.matches||0)+"</b> matches · <b>"+esc(t.snapshots||0)+"</b> historical snapshots"+(qtxt?("<br>Data quality: "+qtxt):"")
      : "扫描范围：2024-25 + 2025-26 · 五大联赛 + UCL + UEL + UECL · 欧国联前两届（2022-23、2024-25）<br>主扫描进度：<b>"+esc(String(s.cursor_date||"").slice(0,10))+"</b> · 欧国联：第 "+esc(ns.phase||1)+" / 4 阶段 · 当前日期 <b>"+esc(String(ns.cursor_date||"").slice(0,10))+"</b> · 已处理欧国联 <b>"+esc(t.nationsMatches||0)+"</b> 场<br>总计：<b>"+esc(t.matches||0)+"</b> 场 · 历史快照 <b>"+esc(t.snapshots||0)+"</b> 条"+(qtxt?("<br>数据质量："+qtxt):"");
    if(st)st.textContent=isEn()
      ? (s.status==="complete"?"Historical scan complete":active?"Continuous manual scan is running: a new batch starts about every 10 minutes until you stop it.":"Historical scan stopped. Future matches still learn automatically.")+(s.errors?(" · Errors "+s.errors):"")
      : (s.status==="complete"?"历史扫描已完成":active?"24小时连续历史扫描正在运行：约每10分钟自动接续一批，直到你点击停止。":"历史扫描已停止；未来比赛仍会自动学习与回测。")+(s.errors?(" · 错误 "+s.errors):"");
  }catch(e){el.textContent=L("历史扫描统计暂不可用：","Historical scan statistics unavailable: ")+e.message;}
}
async function dLearningRefresh(){
  dLastLearningRefresh=Date.now();
  const el=$("dLearningSummary");if(!el)return;
  try{
    const r=await fetch("/api/formula-d-learning-summary");
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||L("学习统计读取失败","Learning statistics unavailable"));
    const t=j.totals||{},rows=Array.isArray(j.byIntent)?j.byIntent:[];
    const top=rows.filter(x=>Number(x.samples)>0).slice(0,12).map(x=>esc(x.intent)+" · "+esc(x.horizon_minutes)+"min: "+esc(x.samples)+(isEn()?" samples / support rate ":"样本 / 支持率 ")+esc(x.support_rate)+"%").join(isEn()?" | ":" ｜ ");
    el.innerHTML=isEn()
      ? "Recorded <b>"+esc(t.matches||0)+"</b> matches and <b>"+esc(t.snapshots||0)+"</b> minute snapshots."+(top?("<br>"+top):" Automatic 5/10/15-minute backtests run after matches finish.")
      : "已记录 <b>"+esc(t.matches||0)+"</b> 场比赛、<b>"+esc(t.snapshots||0)+"</b> 个分钟快照。"+(top?("<br>"+top):" 比赛结束后会自动进行5/10/15分钟回测。");
  }catch(e){el.textContent=L("学习统计暂不可用：","Learning statistics unavailable: ")+e.message;}
}
async function dBoardRefresh(){
  if(dBoardBusy)return;
  dBoardBusy=true;
  const status=$("dBoardStatus"),board=$("dBoard");
  status.textContent=L("正在读取今天全部目标赛事…","Loading all target competitions today…");
  try{
    const r=await fetch("/api/live-board-today");
    const today=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(today.error||"今日比赛读取失败");
    const live=Array.isArray(today.live)?today.live:[];
    if(!live.length){
      board.classList.add("empty-state");
      board.innerHTML=L("目前没有已经开赛且尚未结束的目标赛事。","No target matches are currently live.");
      status.textContent=isEn()
        ? "Today's target matches: "+(today.total||0)+" · LIVE: 0 · Auto-check every 3s"
        : "今日目标赛事 "+(today.total||0)+" 场 · 当前 LIVE 0 场 · 每3秒自动检查";
      return;
    }
    for(const m of live){
      const id=dLightKey(m);
      if(id&&!dBoardOrder.has(id))dBoardOrder.set(id,dBoardOrderSeq++);
    }
    const toAnalyze=live.filter(dNeedsFullAnalysis);
    status.textContent=isEn()
      ? "Found "+live.length+" LIVE matches · full refresh "+toAnalyze.length+" · smart 3s polling"
      : "发现 "+live.length+" 场 LIVE · 本轮完整刷新 "+toAnalyze.length+" 场 · 智能3秒轮询";

    const fresh=toAnalyze.length?await dMapLimit(toAnalyze,3,dAnalyzeOne):[];
    const freshById=new Map();
    for(const x of fresh){
      const id=String(x?.match?.matchId||x?.matchId||"");
      if(id)freshById.set(id,x);
      if(x&&!x.error&&id){
        dBoardAnalyses.set(id,x);
        dLastFullFetch.set(id,Date.now());
      }
    }

    const results=live.map(m=>{
      const id=dLightKey(m),f=freshById.get(id);
      if(f)return f;
      const reused=dReuseAnalysis(m);
      return reused||{error:L("等待首次完整数据","Waiting for first full data"),match:m};
    });
    live.forEach(dRememberLight);

    const liveIds=new Set(live.map(dLightKey));
    for(const id of [...dBoardAnalyses.keys()])if(!liveIds.has(id)){dBoardAnalyses.delete(id);dLightState.delete(id);dLastFullFetch.delete(id);}

    const ok=results.filter(x=>x&&!x.error);
    const bad=results.filter(x=>x?.error);
    board.classList.remove("empty-state");
    board.innerHTML='<div class="d-board-head"><strong>'+L("正在直播","LIVE NOW")+'</strong><span>'+ok.length+L(" 场正在监控"," matches monitored")+'</span></div>'+
      ok.sort((x,y)=>{
        const ax=dBoardOrder.get(dLightKey(x.match))??Number.MAX_SAFE_INTEGER;
        const ay=dBoardOrder.get(dLightKey(y.match))??Number.MAX_SAFE_INTEGER;
        return ax-ay;
      }).map(dBoardRow).join("")+
      (bad.length?'<div class="d-board-errors">'+bad.length+L(" 场实时数据暂不可用，3秒后自动重试。"," matches temporarily unavailable; retrying in 3 seconds.")+'</div>':"");
    dBindRows();
    const now=new Date().toLocaleTimeString("en-US",{timeZone:"America/New_York",hour:"numeric",minute:"2-digit",second:"2-digit"});
    status.textContent=isEn()
      ? "Formula C (Live Intent) · Monitoring "+ok.length+"/"+live.length+" LIVE matches · "+now+" ET · Smart checks every 3s · full detail only on change"
      : "公式C(分析实时意图) · 正在监控 "+ok.length+"/"+live.length+" 场 LIVE · "+now+" ET · 每3秒智能检查 · 有变化才拉完整详情";
    if(Date.now()-dLastLearningRefresh>=60000)dLearningRefresh();
  }catch(e){
    status.textContent=e.message+L(" · 3秒后自动重试"," · Retrying in 3 seconds");
  }finally{
    dBoardBusy=false;
  }
}
$("dBoardRefresh").addEventListener("click",dBoardRefresh);
if($("dHistoricalRun"))$("dHistoricalRun").addEventListener("click",async()=>{
  const b=$("dHistoricalRun"),st=$("dHistoricalStatus"),wasActive=b.dataset.active==="1";
  b.disabled=true;
  try{
    if(wasActive){
      if(st)st.textContent=L("正在停止历史扫描…","Stopping historical scan…");
      const r=await fetch("/api/formula-d-historical-control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:false})});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||L("停止失败","Stop failed"));
    }else{
      if(st)st.textContent=L("正在开始历史扫描…","Starting historical scan…");
      const control=await fetch("/api/formula-d-historical-control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:true})});
      const cj=await control.json().catch(()=>({}));if(!control.ok)throw new Error(cj.error||L("启动失败","Start failed"));
      if(st)st.textContent=L("24小时连续历史扫描已启动，首批正在后台处理。","Continuous historical scan started; the first batch is processing in the background.");
    }
    await dHistoricalRefresh();
  }catch(e){if(st)st.textContent=e.message;}finally{b.disabled=false;}
});
let dBackgroundStarted=false;
function startDBackground(){
  if(dBackgroundStarted)return;
  dBackgroundStarted=true;
  setTimeout(dLearningRefresh,200);
  setTimeout(dHistoricalRefresh,400);
  setTimeout(dPlayerRefresh,600);
  setTimeout(dBoardRefresh,800);
  dBoardTimer=setInterval(dBoardRefresh,3000);
}
window.addEventListener("formula-auth-ready",startDBackground,{once:true});
if(document.body.classList.contains("auth-ok"))startDBackground();
})();