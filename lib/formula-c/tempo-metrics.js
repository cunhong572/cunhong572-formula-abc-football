import { liveTactics } from "lib/formula-c/lineup-state.js";
export function n(v){if(v==null||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function z(v,a=0,b=100){return Math.max(a,Math.min(b,v))}
function avg(xs){const a=xs.filter(x=>x!==null);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function hasAll(o,ks){return ks.every(k=>n(o[k])!==null)}
function pct(v,d){const x=n(v);return (x===null?d:x)/100}
function weightCfg(cfg={}){
  return {
    window:{w5:pct(cfg?.window?.w5,60),w10:pct(cfg?.window?.w10,40)},
    PT:{ri:pct(cfg?.PT?.ri,55),psl:pct(cfg?.PT?.psl,45)},
    PI:{dar:pct(cfg?.PI?.dar,50),tg:pct(cfg?.PI?.tg,50)},
    SS:{rsi:pct(cfg?.SS?.rsi,50),pt:pct(cfg?.SS?.pt,20),pi:pct(cfg?.SS?.pi,18),tct:pct(cfg?.SS?.tct,8),ia:pct(cfg?.SS?.ia,4)},
    AS:{scr:pct(cfg?.AS?.scr,35),bpr:pct(cfg?.AS?.bpr,25),ri:pct(cfg?.AS?.ri,20),tcr:pct(cfg?.AS?.tcr,12),ia:pct(cfg?.AS?.ia,8)},
    GTI:{tr:pct(cfg?.GTI?.tr,30),cii:pct(cfg?.GTI?.cii,30),ss:pct(cfg?.GTI?.ss,40)}
  };
}
function arrow(delta){return delta>=15?"↑↑":delta>=5?"↑":delta<=-15?"↓↓":delta<=-5?"↓":"→"}
function quadrant(ss,as){
  if(ss===null||as===null)return {code:"—",label:"Insufficient data",meaning:"数据不足"};
  if(ss>60&&as>60)return {code:"Q1",label:"Dominant",meaning:"快且有威胁，持续强压"};
  if(ss<=60&&as>60)return {code:"Q2",label:"Dangerous",meaning:"节奏不快但威胁高"};
  if(ss<=60&&as<=60)return {code:"Q3",label:"Passive",meaning:"低活动、低威胁"};
  return {code:"Q4",label:"Wasteful",meaning:"速度快但有效威胁不足"};
}
export function dynamicThresholds(minute){
  const m=Number(minute)||0;
  if(m<=30)return {tempoFast:40,tempoExtreme:51,attackStrong:40,attackFierce:60,band:"15-30"};
  if(m<=50)return {tempoFast:47,tempoExtreme:61,attackStrong:52,attackFierce:77,band:"45"};
  if(m<70)return {tempoFast:43,tempoExtreme:54,attackStrong:45,attackFierce:65,band:"60"};
  return {tempoFast:41,tempoExtreme:52,attackStrong:42,attackFierce:62,band:"70-85"};
}
export function tempoLevel(ss,minute){
  const x=n(ss);if(x===null)return {code:"—",label:"Insufficient data",zh:"数据不足"};
  const t=dynamicThresholds(minute);
  if(x<27)return {code:"Slow",label:"Slow",zh:"慢"};
  if(x>=t.tempoExtreme)return {code:"Extreme",label:"Extreme",zh:"极快"};
  if(x>=t.tempoFast)return {code:"Fast",label:"Fast",zh:"快"};
  return {code:"Normal",label:"Normal",zh:"正常"};
}
export function attackLevel(as,minute){
  const x=n(as);if(x===null)return {code:"—",label:"Insufficient data",zh:"数据不足"};
  const t=dynamicThresholds(minute);
  if(x<18)return {code:"Weak",label:"Weak",zh:"弱"};
  if(x>=t.attackFierce)return {code:"Fierce",label:"Fierce",zh:"猛烈"};
  if(x>=t.attackStrong)return {code:"Strong",label:"Strong",zh:"强"};
  return {code:"Normal",label:"Normal",zh:"一般"};
}
function proxyWindow(shots,xg,poss,box,att,def,red){
  const AS=z(18+shots*12+xg*95+(box!==null?Math.min(10,box*.25):0)+att*4-red*10);
  const SS=z(38+shots*7+xg*55+(poss!==null?(poss-50)*.22:0)+att*4-def*3-red*8);
  return {SS,AS};
}
function proxyScores(live={},cfg={}){
    const r5=n(live.recent5ShotsFor)??0,p5=n(live.previous5ShotsFor)??0;
  const r10=n(live.recent10ShotsFor)??(r5+p5),p10=n(live.previous10ShotsFor)??0;
  const rx5=n(live.recent5XgFor)??0,px5=n(live.previous5XgFor)??0;
  const rx10=n(live.recent10XgFor)??(rx5+px5),px10=n(live.previous10XgFor)??0;
  const tactics=liveTactics(live);
  const poss=n(live.recent5Possession),box=n(live.recent5BoxTouches),att=tactics.attacking,def=tactics.defensive,red=tactics.redCards;
  const w5=proxyWindow(r5,rx5,poss,box,att,def,red);
  const w10=proxyWindow(r10/2,rx10/2,poss,box!==null?box*.75:null,att,def,red);
  const p5w=proxyWindow(p5,px5,poss,null,0,0,red);
  const p10w=proxyWindow(p10/2,px10/2,poss,null,0,0,red);
  const cur={SS:w5.SS,AS:w5.AS};
  const prev={SS:p5w.SS,AS:p5w.AS};
  const dSS=cur.SS-prev.SS,dAS=cur.AS-prev.AS;
  const momentum=(dSS>=15||dAS>=15)?"Momentum Up":(dSS<=-15||dAS<=-15)?"Momentum Down":"Stable";
  return {
    SS:Math.round(cur.SS),AS:Math.round(cur.AS),
    window5SS:Math.round(w5.SS),window5AS:Math.round(w5.AS),
    window10SS:Math.round(w10.SS),window10AS:Math.round(w10.AS),
    previousSS:Math.round(prev.SS),previousAS:Math.round(prev.AS),
    deltaSS:Math.round(dSS),deltaAS:Math.round(dAS),
    trendSS:arrow(dSS),trendAS:arrow(dAS),momentum
  };
}
export function computeFormulaDMetrics(live={},cfg={}){
  const w=weightCfg(cfg);
  const m=live.metricsNormalized||live.normalized||{};
  const poss=n(live.possession)??n(m.possession);
  const PT=hasAll(m,["riNorm","pslInvNorm"])?z(n(m.riNorm)*w.PT.ri+n(m.pslInvNorm)*w.PT.psl):null;
  const PI=hasAll(m,["darHighNorm","tgRateNorm"])?z(n(m.darHighNorm)*w.PI.dar+n(m.tgRateNorm)*w.PI.tg):null;
  const RSI=(hasAll(m,["pslInvNorm","opslInvNorm"])&&poss!==null)?z(n(m.pslInvNorm)*(poss/100)+n(m.opslInvNorm)*(1-poss/100)):null;
  const SS=(RSI!==null&&PT!==null&&PI!==null&&n(m.tctInvNorm)!==null&&n(m.iaNorm)!==null)?z(RSI*w.SS.rsi+PT*w.SS.pt+PI*w.SS.pi+n(m.tctInvNorm)*w.SS.tct+n(m.iaNorm)*w.SS.ia):null;
  const AS=hasAll(m,["scrNorm","bprNorm","riNorm","tcrNorm","iaNorm"])?z(n(m.scrNorm)*w.AS.scr+n(m.bprNorm)*w.AS.bpr+n(m.riNorm)*w.AS.ri+n(m.tcrNorm)*w.AS.tcr+n(m.iaNorm)*w.AS.ia):null;
  const p=proxyScores(live,cfg);
  const finalSS=SS??p.SS,finalAS=AS??p.AS;
  return {
    mode:(SS!==null&&AS!==null)?"official":"proxy",
    PT,PI,RSI,SS:finalSS,AS:finalAS,
    proxySS:p.SS,proxyAS:p.AS,
    window5SS:p.window5SS,window5AS:p.window5AS,
    window10SS:p.window10SS,window10AS:p.window10AS,
    previousSS:p.previousSS,previousAS:p.previousAS,
    deltaSS:p.deltaSS,deltaAS:p.deltaAS,
    trendSS:p.trendSS,trendAS:p.trendAS,
    momentum:p.momentum,
    quadrant:quadrant(finalSS,finalAS)
  };
}
export function computeGTI(home,away,match={},cfg={}){
  const w=weightCfg(cfg).GTI;
  const tr=n(match.trNorm),cii=n(match.ciiNorm),ss=avg([n(home?.SS),n(away?.SS)]);
  const official=(tr!==null&&cii!==null&&ss!==null&&home?.mode==="official"&&away?.mode==="official");
  if(official)return {mode:"official",GTI:Math.round(z(tr*w.tr+cii*w.cii+ss*w.ss))};
  const shotRate=n(match.recent5TotalShots)??0;
  const g=z((ss??50)*.72+Math.min(28,shotRate*4));
  return {mode:"proxy",GTI:Math.round(g)};
}
