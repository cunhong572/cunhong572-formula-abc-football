const $ = id => document.getElementById(id);
const sides = ["home","away"];
let lastAutoData = null;
const FORMULA_A_TEMPLATE_B64 = "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";

function rankRows(side){
  const box=$(side+"Ranks");
  box.innerHTML="";
  for(let i=0;i<7;i++){
    const row=document.createElement("div");
    row.className="rank-row"+(i===3?" focus":"");
    row.innerHTML='<input class="rank-pos" placeholder="Rank"><input class="rank-team" placeholder="'+(i===3?(side==="home"?"Home team":"Away team"):"Team")+'">';
    box.appendChild(row);
  }
}
function scheduleRows(side){
  const box=$(side+"Schedule");
  box.innerHTML='<div class="schedule-head"><span>Date</span><span>Competition</span><span>Opponent</span><span>H/A</span><span>Result</span></div>';
  const labels=["Prev 3","Prev 2","Prev 1","Current","Next 1","Next 2"];
  labels.forEach((lab,i)=>{
    const row=document.createElement("div");
    row.className="schedule-row"+(i===3?" current":"");
    row.dataset.index=i;
    row.innerHTML='<input class="s-date" type="date" title="'+lab+'"><input class="s-comp" placeholder="'+lab+'"><input class="s-opp" placeholder="Opponent"><select class="s-ha"><option></option><option>H</option><option>A</option></select><input class="result" placeholder="'+(i<3?"W/D/L":"—")+'" '+(i>=3?'disabled':'')+'>';
    box.appendChild(row);
  });
}
function formInputs(side){
  const box=$(side+"FormInputs");
  box.innerHTML="";
  for(let i=0;i<5;i++){
    const sel=document.createElement("select");
    sel.className="form-result";
    sel.innerHTML='<option value=""></option><option>W</option><option>D</option><option>L</option>';
    sel.addEventListener("change", calculateAll);
    box.appendChild(sel);
  }
}
async function calculateSide(side){
  const rows=[...$(side+"Schedule").querySelectorAll(".schedule-row")];
  const previousDate=rows[2]?.querySelector(".s-date")?.value||"";
  const form=[...$(side+"FormInputs").querySelectorAll(".form-result")].map(x=>x.value).filter(Boolean);
  try{
    const r=await fetch("/api/formula-a-evaluate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      previousDate,matchDate:$("matchDate").value,form
    })});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||"Formula A calculation failed");
    $(side+"Days").textContent=j.days||"—";
    $(side+"Form").textContent=j.formText||"—";
    $(side+"State").textContent=j.state||"—";
  }catch(e){
    $(side+"Days").textContent="—";
    $(side+"Form").textContent=form.length?form.join(" / "):"—";
    $(side+"State").textContent="—";
  }
}
async function calculateAll(){await Promise.all(sides.map(calculateSide));save();}
function syncNames(){
  const h=$("home").value||"HOME", a=$("away").value||"AWAY";
  document.querySelector('[data-side="home"]>h2').textContent=h;
  document.querySelector('[data-side="away"]>h2').textContent=a;
  const hf=$("homeRanks").querySelectorAll(".rank-team")[3];
  const af=$("awayRanks").querySelectorAll(".rank-team")[3];
  if(hf && (!hf.value || hf.dataset.auto==="1")){hf.value=$("home").value;hf.dataset.auto="1";}
  if(af && (!af.value || af.dataset.auto==="1")){af.value=$("away").value;af.dataset.auto="1";}
  const hcur=$("homeSchedule").querySelectorAll(".schedule-row")[3];
  const acur=$("awaySchedule").querySelectorAll(".schedule-row")[3];
  if(hcur){hcur.querySelector(".s-date").value=$("matchDate").value;hcur.querySelector(".s-comp").value=$("competition").value;hcur.querySelector(".s-opp").value=$("away").value;hcur.querySelector(".s-ha").value="H";}
  if(acur){acur.querySelector(".s-date").value=$("matchDate").value;acur.querySelector(".s-comp").value=$("competition").value;acur.querySelector(".s-opp").value=$("home").value;acur.querySelector(".s-ha").value="A";}
}
function serialize(){
  const data={};
  document.querySelectorAll("input,select").forEach((el,i)=>{if(!el.disabled)data[el.id||("field_"+i)]=el.value});
  return data;
}
function save(){try{localStorage.setItem("formulaA",JSON.stringify(serialize()))}catch(e){}}
function restore(){
  try{
    const data=JSON.parse(localStorage.getItem("formulaA")||"{}");
    document.querySelectorAll("input,select").forEach((el,i)=>{
      const k=el.id||("field_"+i); if(data[k]!==undefined && !el.disabled) el.value=data[k];
    });
  }catch(e){}
}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function scheduleData(side){
  return [...$(side+"Schedule").querySelectorAll(".schedule-row")].map((sr,i)=>{
    const q=sr.querySelectorAll("input,select");
    return {date:q[0].value,competition:q[1].value,opponent:q[2].value,ha:q[3].value,result:i<3?q[4].value:""};
  });
}
function rankData(side){
  return [...$(side+"Ranks").querySelectorAll(".rank-row")].map(r=>({rank:r.children[0].value,team:r.children[1].value}));
}
function centeredRanking(rows){
  const out=Array(7).fill(null);
  const list=Array.isArray(rows)?rows:[];
  const fi=list.findIndex(x=>x&&x.focus);
  if(fi<0)return out;
  const above=list.slice(0,fi).slice(-3);
  const below=list.slice(fi+1,fi+4);
  above.forEach((x,i)=>{out[3-above.length+i]=x;});
  out[3]=list[fi];
  below.forEach((x,i)=>{out[4+i]=x;});
  return out;
}
function stateFromForm(arr){
  if(!Array.isArray(arr)||!arr.length)return "—";
  const pts=arr.reduce((s,r)=>s+(r==="W"?3:r==="D"?1:0),0);
  const ppg=pts/arr.length;
  if(arr.length>=5&&ppg>=2.7)return "很好";
  if(ppg>=2)return "好";
  if(ppg>=1)return "一般";
  if(ppg>=0.4)return "差";
  return "很差";
}
function daysBetween(a,b){
  if(!a||!b)return "";
  const da=new Date(a+"T12:00:00Z"), db=new Date(b+"T12:00:00Z");
  const d=Math.round((db-da)/86400000)-1;
  return d>=0?d:"";
}
function exactSchedule(side){
  const data=lastAutoData?.[side]||{};
  const current=lastAutoData?.match||{};
  const teamName=data.name || (side==="home"?current.home:current.away) || "";
  const fullDisplay=x=>{
    if(!x)return "";
    if(x.display)return x.display.replace(/\s*-\s*/g," vs ");
    const opp=x.opponent||"";
    if(!opp)return "";
    return x.ha==="A" ? (opp+" vs "+teamName) : (teamName+" vs "+opp);
  };
  const prev=(data.previous||[]).slice(-3).map(x=>({...x,display:fullDisplay(x)}));
  const next=(data.next||[]).slice(0,2).map(x=>({...x,display:fullDisplay(x)}));
  const currentRow={
    date:current.date||"",
    competition:current.competition||"",
    display:(current.home||"")+" vs "+(current.away||"")
  };
  const rows=[...prev,currentRow,...next];
  let prior=data.previousGapBaseDate||"";
  return rows.map((x,i)=>{
    const d=x?.date||"";
    const days=prior?daysBetween(prior,d):"";
    prior=d||prior;
    return {...x,days};
  });
}
async function exportExcelLegacy(){
  calculateAll();
  if(typeof ExcelJS==="undefined"){
    $("status").textContent="Excel 组件加载失败，请刷新页面重试";
    return;
  }
  if(!lastAutoData){
    $("status").textContent="请先点击“一键自动生成 Excel”获取完整资料";
    return;
  }

  const h=lastAutoData.home?.name||$("home").value||"Home";
  const a=lastAutoData.away?.name||$("away").value||"Away";
  const hrank=(lastAutoData.home?.ranking||[]).find(x=>x.focus)?.rank||"";
  const arank=(lastAutoData.away?.ranking||[]).find(x=>x.focus)?.rank||"";

  const wb=new ExcelJS.Workbook();
  wb.creator="Formula A Football Analyzer";
  wb.created=new Date();
  const ws=wb.addWorksheet("Sheet1",{pageSetup:{paperSize:9,orientation:"portrait",fitToPage:true,fitToWidth:1,fitToHeight:1,margins:{left:0.15,right:0.15,top:0.2,bottom:0.2,header:0.05,footer:0.05}}});
  ws.views=[{showGridLines:false}];

  const widths=[24,14,17,30,12,12,14,12,3,24,20];
  widths.forEach((w,i)=>ws.getColumn(i+1).width=w);
  const thin={style:"thin",color:{argb:"FFB8BDC6"}};
  for(let r=1;r<=84;r++){
    ws.getRow(r).height=18;
    for(let c=1;c<=11;c++){
      const cell=ws.getCell(r,c);
      cell.alignment={horizontal:"center",vertical:"middle",wrapText:true};
      cell.font={name:"Arial",size:9};
      if(c<=8)cell.border={top:thin,left:thin,bottom:thin,right:thin};
    }
  }

  function set(r,c,v){ws.getCell(r,c).value=v??""}
  function bold(r,c1=1,c2=8){
    for(let c=c1;c<=c2;c++)ws.getCell(r,c).font={name:"Arial",size:9,bold:true};
  }
  function fill(r,c1,c2,color){
    for(let c=c1;c<=c2;c++)ws.getCell(r,c).fill={type:"pattern",pattern:"solid",fgColor:{argb:color}};
  }
  function fillRange(r1,r2,c1,c2,color){
    for(let r=r1;r<=r2;r++)fill(r,c1,c2,color);
  }

  // Formula A 原模板不是纯白底：先铺整张浅底，再按区域分色。
  fillRange(1,84,1,8,"FFF3F6FA");
  fillRange(1,84,10,11,"FFF7F4FA");

  // 顶部主客队区域
  fillRange(1,2,1,8,"FFE2F0D9");

  // Home 区域
  fillRange(5,9,1,8,"FFFFF2CC");
  fillRange(11,18,1,8,"FFD9EAF7");
  fillRange(22,28,1,8,"FFE2F0D9");
  fillRange(30,35,1,8,"FFFCE4D6");

  // Away 区域
  fillRange(39,43,1,8,"FFFFF2CC");
  fillRange(45,52,1,8,"FFD9EAF7");
  fillRange(55,61,1,8,"FFE2F0D9");
  fillRange(63,68,1,8,"FFFCE4D6");

  // Summary 区域
  fillRange(71,84,1,8,"FFDDEBF7");

  function standingBlock(side,startRow,focusRow){
    const rows=centeredRanking(lastAutoData?.[side]?.ranking||[]);
    rows.forEach((x,i)=>{
      const r=startRow+i;
      if(!x)return;
      set(r,1,x.team); set(r,2,x.rank); set(r,3,x.points); set(r,4,x.gd);
      set(r,5,x.played); set(r,6,x.remaining); set(r,7,x.maxPoints);
    });
    fill(focusRow,1,7,"FFFFE66B");
    bold(focusRow,1,7);
  }
  function fixtureBlock(side,startRow){
    exactSchedule(side).forEach((x,i)=>{
      const r=startRow+i;
      set(r,2,x.date||"");
      set(r,3,x.competition||"");
      set(r,4,x.display||x.opponent||"");
      set(r,8,x.days);
    });
  }

  set(1,1,"Home (主队）"); set(1,3,"Away  （ 客队）"); bold(1,1,3);
  set(2,1,h+(hrank?(" ("+hrank+")"):""));
  set(2,3,a+(arank?(" ("+arank+")"):""));
  bold(2,1,3);

  set(5,1,"Odds （ 大小球）");
  set(6,1,"Odds movement （赔率）");
  set(8,1,"Intention （ 动机）");
  set(9,1,"Notes");

  set(11,1,"Current Standing "); bold(11);
  ["Team  (球队）","Pllacement （ 排名）","Points （分）","GD （球数）","GP （场数）","Balance matches （剩余场数）","Max Point （ 最大得分）"].forEach((v,i)=>set(12,i+1,v));
  bold(12,1,7); fill(12,1,7,"FFE9EDF2");
  standingBlock("home",13,16);

  set(22,1,"Next 6 fixture （ 前后3场赛事 ）");
  set(22,2,"Date （日期）"); set(22,3,"League （联赛）"); set(22,4,"Teams （ 球队 ）"); set(22,8,"Days （天）");
  bold(22,1,8); fill(22,1,8,"FFE9EDF2");
  fixtureBlock("home",23);

  set(30,1,"Avg goal Scored （ 场均进球）"); set(30,2,lastAutoData.home?.averages?.gf||"");
  set(31,1,"Avg goal Concede （ 场均失球）"); set(31,2,lastAutoData.home?.averages?.ga||"");
  set(32,1,"Advantage （ 优势） ");
  set(33,1,"Squad strenght （阵容实力）");
  set(34,1,"Form  （状态）"); set(34,2,$("homeState").textContent==="—"?"":$("homeState").textContent); set(34,3,(lastAutoData.home?.form||[]).join(""));
  set(34,4,"V Good （ 很好）"); set(34,5,"Good （好）"); set(34,6,"Avg （一般）"); set(34,7,"Poor （ 差）"); set(34,8,"V Poor （很差）");
  set(35,1,"Style （风格）"); set(35,2,lastAutoData.home?.coachStyle||$("homeStyle").value||"");
  set(35,4,"Attack （进攻）"); set(35,5,"Slight attack （微攻）"); set(35,6,"Slight defend （微防）"); set(35,7,"Defend  （防守）");

  fill(37,1,8,"FF000000");
  ws.getRow(37).height=10;

  set(39,1,"Odds （赔率）");
  set(40,1,"Odds movement （赔率变动）");
  set(42,1,"Intention （ 目的）");
  set(43,1,"Notes ");

  set(45,1,"Current Standing "); bold(45);
  ["Team  (球队）","Pllacement （ 排名）","Points （分）","GD （球数）","GP （场数）","Balance matches （剩余场数）","Max Point （ 最大得分）"].forEach((v,i)=>set(46,i+1,v));
  bold(46,1,7); fill(46,1,7,"FFE9EDF2");
  standingBlock("away",47,50);

  set(55,1,"Next 6 fixture （ 前后3场赛事 ）");
  set(55,2,"Date （日期）"); set(55,3,"League （联赛）"); set(55,4,"Teams （ 球队 ）"); set(55,8,"Days （天）");
  bold(55,1,8); fill(55,1,8,"FFE9EDF2");
  fixtureBlock("away",56);

  set(63,1,"Avg goal Scored （ 场均进球）"); set(63,2,lastAutoData.away?.averages?.gf||"");
  set(64,1,"Avg goal Concede （ 场均失球）"); set(64,2,lastAutoData.away?.averages?.ga||"");
  set(65,1,"Advantage （ 优势） ");
  set(66,1,"Squad strenght （阵容实力）");
  set(67,1,"Form  （状态）"); set(67,2,$("awayState").textContent==="—"?"":$("awayState").textContent); set(67,3,(lastAutoData.away?.form||[]).join(""));
  set(67,4,"V Good （ 很好）"); set(67,5,"Good （好）"); set(67,6,"Avg （一般）"); set(67,7,"Poor （ 差）"); set(67,8,"V Poor （很差）");
  set(68,1,"Style （风格）"); set(68,2,lastAutoData.away?.coachStyle||$("awayStyle").value||"");
  set(68,4,"Attack （进攻）"); set(68,5,"Slight attack （微攻）"); set(68,6,"Slight defend （微防）"); set(68,7,"Defend  （防守）");

  set(71,1,"Summery"); bold(71);
  set(73,1,"Odds（ 赔率）");
  set(74,1,"Odds movement （ 赔率变动）");
  set(75,1,"Intention （动机）");
  set(76,1,"Tempo （节奏）");
  set(77,1,"Odds advantage （赔率优势）");
  set(79,2,"Home (主队）"); set(79,3,"Away  （ 客队）"); set(79,6,"Home (主队）"); set(79,7,"Away （ 客队）"); bold(79,1,8);
  set(80,1,"Prediction （与估）");
  set(83,1,"HT Score （上半场）比分");
  set(84,1,"FT Score （下半场）比分");

  const legend=[
    ["Trophee des Champions",""],["Cypriot cup","塞浦路斯"],["CL","欧冠"],["EPL","英超"],["Bundesliga","德甲"],["LaLiga","西甲"],["Serie A","意甲"],["Ligue 1","法甲"],["Liga 1","甲级联赛"],["Club friendies","友谊赛"],["Conference League Qualification",""],["EL","英联"],["EFL Cup ","英联杯"],["Europa League ","欧罗巴联赛"],["Eredivisie","荷甲"],["Eliteserien","挪超"],["Copa del Rey","国王杯"],["Conference League","欧协联"],["Club Friendlies","俱乐部友谊赛"],["Coppa Italia","意大利杯"],["Coupe de France","法国杯"],["Supe Lig","土超"],["Superliga","丹超"],["Swiss Super League","瑞士超"],["Super Cup","意大利超级杯"],["Super League","超级联赛"],["Premiership","爱尔兰足球超级联赛"],["Primeira Liga","葡超"],["Portugal Cup","葡萄牙杯"],["Belgian Pro League",""],["Belgian Cup ","比利时杯"],["U19 Naational 25/26",""],["NBl","匈牙利足球甲级联赛"],["Allsvenskan","瑞典足球超级联赛"],["KNVB Beker",""],["Romanian Cup",""],["1st League",""],["1st Division","塞浦路斯足球甲级联赛"],["DFB Cup","德国杯"],["DBU Pokal","丹麦杯"],["DFB Pokal",""],["Turkiye cup:Group A","土耳其小组赛"],["Premier League 25/26",""]
  ];
  legend.forEach((x,i)=>{const r=14+i;if(r<=84){set(r,10,x[0]);set(r,11,x[1]);}});

  // 强调分区标题与固定黄色排名行
  [11,22,45,55,71,79].forEach(r=>bold(r,1,8));
  [12,46].forEach(r=>fill(r,1,7,"FFD9E1F2"));
  [22,55].forEach(r=>fill(r,1,8,"FFC6E0B4"));
  [34,35,67,68].forEach(r=>fill(r,1,8,"FFF4B183"));
  [71,79].forEach(r=>fill(r,1,8,"FFBDD7EE"));
  [16,50].forEach(r=>{fill(r,1,7,"FFFFE66B");bold(r,1,7);});
  ws.pageSetup.printArea="A1:K84";
  ws.headerFooter.oddFooter="Formula A";
  ws.properties.defaultRowHeight=18;

  const buffer=await wb.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;
  link.download=((h+"_vs_"+a+"_Formula_A.xlsx").replace(/[^a-zA-Z0-9_\-.]/g,"_"));
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $("status").textContent="公式 A .xlsx 已生成";
}
async function exportExcel(){
  calculateAll();
  if(!lastAutoData){
    $("status").textContent="请先点击“一键自动生成 Excel”获取完整资料";
    return;
  }
  if(typeof JSZip==="undefined"){
    $("status").textContent="Excel 压缩组件加载失败，请刷新页面";
    return;
  }

  try{
    $("status").textContent="正在按原版模板生成 Excel…";

    const h=lastAutoData.home?.name||$("home").value||"Home";
    const a=lastAutoData.away?.name||$("away").value||"Away";
    const hrank=(lastAutoData.home?.ranking||[]).find(x=>x.focus)?.rank||"";
    const arank=(lastAutoData.away?.ranking||[]).find(x=>x.focus)?.rank||"";

    const b64=FORMULA_A_TEMPLATE_B64;
    if(!b64 || !b64.startsWith("UEsDB")) throw new Error("原版模板数据无效");
    const bin=atob(b64);
    const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);

    const zip=await JSZip.loadAsync(bytes);
    const sheetFile=zip.file("xl/worksheets/sheet1.xml");
    if(!sheetFile) throw new Error("找不到原模板工作表");
    const xml=await sheetFile.async("string");
    const parser=new DOMParser();
    const doc=parser.parseFromString(xml,"application/xml");
    const parseErr=doc.querySelector("parsererror");
    if(parseErr) throw new Error("原模板工作表解析失败");

    const ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const sheetData=doc.getElementsByTagNameNS(ns,"sheetData")[0]||doc.querySelector("sheetData");
    if(!sheetData) throw new Error("原模板 sheetData 缺失");

    function colNumToLetters(n){
      let s="";
      while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}
      return s;
    }
    function getRow(rowNum){
      let row=[...sheetData.children].find(x=>x.getAttribute("r")===String(rowNum));
      if(!row){
        row=doc.createElementNS(ns,"row");
        row.setAttribute("r",String(rowNum));
        sheetData.appendChild(row);
      }
      return row;
    }
    function getCell(addr){
      let cell=doc.querySelector('c[r="'+addr+'"]');
      if(cell) return cell;
      const m=addr.match(/^([A-Z]+)(\d+)$/);
      if(!m) throw new Error("无效单元格 "+addr);
      const row=getRow(Number(m[2]));
      cell=doc.createElementNS(ns,"c");
      cell.setAttribute("r",addr);
      row.appendChild(cell);
      return cell;
    }
    function wipeValueNodes(cell){
      [...cell.children].forEach(ch=>{
        const n=ch.localName;
        if(n==="v"||n==="is"||n==="f") cell.removeChild(ch);
      });
    }
    function setText(addr,val){
      const cell=getCell(addr);
      wipeValueNodes(cell);
      cell.setAttribute("t","inlineStr");
      const is=doc.createElementNS(ns,"is");
      const t=doc.createElementNS(ns,"t");
      const str=String(val??"");
      if(/^\s|\s$/.test(str)) t.setAttributeNS("http://www.w3.org/XML/1998/namespace","xml:space","preserve");
      t.textContent=str;
      is.appendChild(t);
      cell.appendChild(is);
    }
    function setNumber(addr,val){
      const cell=getCell(addr);
      wipeValueNodes(cell);
      cell.removeAttribute("t");
      const v=doc.createElementNS(ns,"v");
      v.textContent=String(val??"");
      cell.appendChild(v);
    }
    function clearCell(addr){setText(addr,"");}
    function setAuto(addr,val){
      if(val===null||val===undefined||val===""){clearCell(addr);return;}
      if(typeof val==="number" && Number.isFinite(val)) setNumber(addr,val);
      else setText(addr,val);
    }
    function excelDateSerial(iso){
      if(!iso)return "";
      const d=new Date(iso+"T00:00:00Z");
      return Math.floor((d-Date.UTC(1899,11,30))/86400000);
    }

    // 只改数据，不改任何样式属性 s、行高、列宽、填色、边框或合并关系。
    for(let r=13;r<=19;r++) for(let c=1;c<=7;c++) clearCell(colNumToLetters(c)+r);
    for(let r=47;r<=53;r++) for(let c=1;c<=7;c++) clearCell(colNumToLetters(c)+r);
    for(let r=23;r<=28;r++){for(let c=1;c<=8;c++)clearCell(colNumToLetters(c)+r);}
    for(let r=57;r<=62;r++){for(let c=1;c<=8;c++)clearCell(colNumToLetters(c)+r);}
    ["B30","B31","B34","C34","B35","B64","B65","B68","C68","B69"].forEach(clearCell);

    setText("A2",h+(hrank?(" ("+hrank+")"):""));
    setText("C2",a+(arank?(" ("+arank+")"):""));

    setText("J7","公式A：排名按请求时最新实际积分榜。");
    setText("J8","前3场+本场+后2场按一线队所有比赛，包含欧战/杯赛/友谊赛。");
    setText("J9",h+(hrank?(" #"+hrank):"")+"；"+a+(arank?(" #"+arank):"")+"。");

    function writeStanding(side,startRow){
      const rows=centeredRanking(lastAutoData?.[side]?.ranking||[]);
      rows.forEach((x,i)=>{
        if(!x)return;
        const r=startRow+i;
        setText("A"+r,x.team??"");
        setAuto("B"+r,x.rank);
        setAuto("C"+r,x.points);
        setAuto("D"+r,x.gd);
        setAuto("E"+r,x.played);
        setAuto("F"+r,x.remaining);
        setAuto("G"+r,x.maxPoints);
      });
    }

    function writeFixtures(side,startRow){
      const rows=exactSchedule(side);
      rows.forEach((x,i)=>{
        const r=startRow+i;
        if(x.date) setNumber("B"+r,excelDateSerial(x.date)); else clearCell("B"+r);
        setText("C"+r,x.competition||"");
        setText("D"+r,x.display||x.opponent||"");
        setAuto("H"+r,x.days===""?"":x.days);
      });
    }

    writeStanding("home",13);
    writeStanding("away",47);
    writeFixtures("home",23);
    writeFixtures("away",57);

    setAuto("B30",lastAutoData.home?.averages?.gf||"");
    setAuto("B31",lastAutoData.home?.averages?.ga||"");
    setText("B34",stateFromForm(lastAutoData.home?.form||[])==="—"?"":stateFromForm(lastAutoData.home?.form||[]));
    setText("C34",(lastAutoData.home?.form||[]).join(""));
    setText("B35",lastAutoData.home?.coachStyle||"");

    setAuto("B64",lastAutoData.away?.averages?.gf||"");
    setAuto("B65",lastAutoData.away?.averages?.ga||"");
    setText("B68",stateFromForm(lastAutoData.away?.form||[])==="—"?"":stateFromForm(lastAutoData.away?.form||[]));
    setText("C68",(lastAutoData.away?.form||[]).join(""));
    setText("B69",lastAutoData.away?.coachStyle||"");

    const serializer=new XMLSerializer();
    zip.file("xl/worksheets/sheet1.xml",serializer.serializeToString(doc));

    const blob=await zip.generateAsync({
      type:"blob",
      mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      compression:"DEFLATE"
    });

    if(!blob || blob.size<1000) throw new Error("Excel 文件生成失败");

    const url=URL.createObjectURL(blob);
    const fileName=((h+"_vs_"+a+"_公式A.xlsx").replace(/[^a-zA-Z0-9_\-.\u4e00-\u9fff]/g,"_"));
    let link=document.getElementById("formulaADownloadLink");
    if(link){try{URL.revokeObjectURL(link.dataset.objectUrl||"")}catch(e){} link.remove();}
    link=document.createElement("a");
    link.id="formulaADownloadLink";
    link.href=url;
    link.dataset.objectUrl=url;
    link.download=fileName;
    link.textContent="下载 Formula A Excel";
    link.className="formula-a-download-link";
    link.setAttribute("role","button");
    const status=$("status");
    status.textContent="Excel 已生成。如果没有自动下载，请点这里：";
    status.appendChild(document.createTextNode(" "));
    status.appendChild(link);

    // Try automatic download first. Keep the visible link as an iOS/Safari fallback.
    try{ link.click(); }catch(e){}
    setTimeout(()=>{
      if(document.body.contains(link)){
        // Keep link alive for manual tap; URL is revoked only on next export/page unload.
      }else{
        try{URL.revokeObjectURL(url)}catch(e){}
      }
    },2000);
  }catch(err){
    console.error("Formula A XML export error",err);
    $("status").textContent="导出失败："+(err?.message||String(err))+"。请刷新页面后重试；若仍失败，请把这条错误信息截图发给我。";
  }
}

sides.forEach(s=>{rankRows(s);scheduleRows(s);formInputs(s)});
restore();syncNames();calculateAll();
["home","away","matchDate","competition"].forEach(id=>$(id).addEventListener("input",()=>{syncNames();calculateAll()}));
document.addEventListener("input",e=>{if(e.target.matches("input,select")) calculateAll()});
function fillRanking(side, rows){
  const boxes=[...$(side+"Ranks").querySelectorAll(".rank-row")];
  boxes.forEach(r=>{r.children[0].value="";r.children[1].value="";r.children[1].dataset.auto="";});
  if(!rows?.length) return;
  const focusIndex=rows.findIndex(x=>x.focus);
  if(focusIndex<0) return;
  const above=rows.slice(0,focusIndex).slice(-3);
  const focus=rows[focusIndex];
  const below=rows.slice(focusIndex+1,focusIndex+4);

  above.forEach((x,i)=>{
    const target=boxes[3-above.length+i];
    target.children[0].value=x.rank??"";
    target.children[1].value=x.team??"";
  });
  boxes[3].children[0].value=focus.rank??"";
  boxes[3].children[1].value=focus.team??"";
  below.forEach((x,i)=>{
    const target=boxes[4+i];
    target.children[0].value=x.rank??"";
    target.children[1].value=x.team??"";
  });
}
function fillFixtureRow(row,data){
  if(!row||!data) return;
  row.querySelector(".s-date").value=data.date||"";
  row.querySelector(".s-comp").value=data.competition||"";
  row.querySelector(".s-opp").value=data.opponent||"";
  row.querySelector(".s-ha").value=data.ha||"";
  const res=row.querySelector(".result"); if(res&&!res.disabled) res.value=data.result||"";
}
function fillSide(side,data){
  if(!data) return;
  if(data.averages){$(side+"GF").value=data.averages.gf||"";$(side+"GA").value=data.averages.ga||"";}
  if(data.coachStyle) $(side+"Style").value=data.coachStyle;
  fillRanking(side,data.ranking||[]);
  const rows=[...$(side+"Schedule").querySelectorAll(".schedule-row")];
  (data.previous||[]).slice(-3).forEach((x,i)=>fillFixtureRow(rows[i],x));
  (data.next||[]).slice(0,2).forEach((x,i)=>fillFixtureRow(rows[i+4],x));
  const formBoxes=[...$(side+"FormInputs").querySelectorAll(".form-result")];
  formBoxes.forEach(x=>x.value="");
  (data.form||[]).slice(-5).forEach((x,i)=>{if(formBoxes[i]) formBoxes[i].value=x;});
}
async function autoFetch(){
  const home=$("home").value.trim(),away=$("away").value.trim();
  if(!home||!away){$("status").textContent="只需要填写 Home 和 Away 两个球队名";return;}
  $("auto").disabled=true;$("status").textContent="正在识别球队、寻找下一场交手并生成公式A…";
  try{
    const r=await fetch("/api/auto-fill",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({home,away})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){
      if(j.setupRequired) $("status").textContent="需要先配置 API-Football Key";
      else $("status").textContent=j.error||"自动获取失败";
      return;
    }
    lastAutoData=j;
    if(j.home?.name) $("home").value=j.home.name;
    if(j.away?.name) $("away").value=j.away.name;
    if(j.match?.date) $("matchDate").value=j.match.date;
    if(j.match?.competition) $("competition").value=j.match.competition;
    syncNames();
    fillSide("home",j.home);fillSide("away",j.away);
    syncNames();calculateAll();

    const failed=Object.entries(j.checks||{}).filter(([,v])=>!v).map(([k])=>k);
    const checkLabels={
      previous3Home:"主队前3场比赛",
      previous3Away:"客队前3场比赛",
      next2Home:"主队后2场比赛",
      next2Away:"客队后2场比赛",
      standingsHome:"主队官方排名",
      standingsAway:"客队官方排名",
      averagesHome:"主队场均进球/失球",
      averagesAway:"客队场均进球/失球",
      exactMatch:"比赛识别"
    };
    const warn=(j.warnings||[]).join(" ");
    if(failed.length){
      const names=failed.map(k=>checkLabels[k]||k).join("、");
      $("status").textContent="自动复查未通过：缺少 "+names+"。暂不生成残缺 Excel。"+(warn?(" "+warn):"");
      return;
    }
    $("status").textContent="资料完整，正在按原公式 A 模板生成 Excel…";
    setTimeout(exportExcel,150);
  }catch(e){
    $("status").textContent="网络或数据接口暂时不可用";
  }finally{$("auto").disabled=false;}
}
$("auto").addEventListener("click",autoFetch);
$("calc").addEventListener("click",()=>{syncNames();calculateAll();$("status").textContent="已重新计算"});
$("export").addEventListener("click",exportExcel);
$("reset").addEventListener("click",()=>{localStorage.removeItem("formulaA");location.reload()});