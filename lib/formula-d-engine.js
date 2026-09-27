function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
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
function dynamicThresholds(minute){
  const m=Number(minute)||0;
  if(m<=30)return {tempoFast:40,tempoExtreme:51,attackStrong:40,attackFierce:60,band:"15-30"};
  if(m<=50)return {tempoFast:47,tempoExtreme:61,attackStrong:52,attackFierce:77,band:"45"};
  if(m<70)return {tempoFast:43,tempoExtreme:54,attackStrong:45,attackFierce:65,band:"60"};
  return {tempoFast:41,tempoExtreme:52,attackStrong:42,attackFierce:62,band:"70-85"};
}
function tempoLevel(ss,minute){
  const x=n(ss);if(x===null)return {code:"—",label:"Insufficient data",zh:"数据不足"};
  const t=dynamicThresholds(minute);
  if(x<27)return {code:"Slow",label:"Slow",zh:"慢"};
  if(x>=t.tempoExtreme)return {code:"Extreme",label:"Extreme",zh:"极快"};
  if(x>=t.tempoFast)return {code:"Fast",label:"Fast",zh:"快"};
  return {code:"Normal",label:"Normal",zh:"正常"};
}
function attackLevel(as,minute){
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
  const w=weightCfg(cfg).window;
  const r5=n(live.recent5ShotsFor)??0,p5=n(live.previous5ShotsFor)??0;
  const r10=n(live.recent10ShotsFor)??(r5+p5),p10=n(live.previous10ShotsFor)??0;
  const rx5=n(live.recent5XgFor)??0,px5=n(live.previous5XgFor)??0;
  const rx10=n(live.recent10XgFor)??(rx5+px5),px10=n(live.previous10XgFor)??0;
  const poss=n(live.possession),box=n(live.boxTouches),att=n(live.attackingSubsFor)??0,def=n(live.defensiveSubsFor)??0,red=n(live.redCards)??0;
  const w5=proxyWindow(r5,rx5,poss,box,att,def,red);
  const w10=proxyWindow(r10/2,rx10/2,poss,box!==null?box*.75:null,att,def,red);
  const p5w=proxyWindow(p5,px5,poss,null,0,0,red);
  const p10w=proxyWindow(p10/2,px10/2,poss,null,0,0,red);
  const cur={SS:z(w5.SS*w.w5+w10.SS*w.w10),AS:z(w5.AS*w.w5+w10.AS*w.w10)};
  const prev={SS:z(p5w.SS*w.w5+p10w.SS*w.w10),AS:z(p5w.AS*w.w5+p10w.AS*w.w10)};
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
  const shotRate=n(match.recent10TotalShots)??0;
  const g=z((ss??50)*.72+Math.min(28,shotRate*4));
  return {mode:"proxy",GTI:Math.round(g)};
}
function classify(scoreFor,scoreAgainst,minute,live,metrics,cfg={}){
  const gd=Number(scoreFor)-Number(scoreAgainst),as=n(metrics.AS)??0,ss=n(metrics.SS)??0;
  const rising=metrics.momentum==="Momentum Up"||metrics.trendAS==="↑"||metrics.trendAS==="↑↑"||metrics.trendSS==="↑↑";
  const falling=metrics.momentum==="Momentum Down"||metrics.trendAS==="↓↓"||metrics.trendSS==="↓↓";
  const r5s=n(live.recent5ShotsFor)??0,r5x=n(live.recent5XgFor)??0,r10s=n(live.recent10ShotsFor)??0,r10x=n(live.recent10XgFor)??0;
  // Backtest-derived execution thresholds.
  // Intent eligibility still comes from score/state/prematch context; these thresholds
  // validate whether the team is actually executing that intent in the last 5 minutes.
  const wantExec=ss>=60&&as>=85&&r5x>=0.30;
  const hopeExec=ss>=45&&as>=55&&r5x>=0.12;
  const equalizeExec=ss>=50&&as>=70&&r5x>=0.20;
  const dontLoseExec=minute>=70&&ss<=41&&as<=42&&r5x<=0.10;
  const strongDontLose=minute>=70&&ss<=33&&as<=30&&r5x<=0.03;
  const dangerous=wantExec||equalizeExec||(as>=68)||(as>=60&&ss>=60)||metrics.quadrant?.code==="Q1"||metrics.quadrant?.code==="Q2";
  const active=hopeExec||(as>=52)||(as>=46&&ss>=58)||rising;
  const passive=dontLoseExec||(as<38&&ss<45)||falling;
  const lowQualityVolume=(r10s>=5&&r10x<0.20)||(r5s>=3&&r5x<0.08);
  const speedThreatConflict=(ss>=62&&as<=46)||metrics.quadrant?.code==="Q4";
  const evidenceConflict=lowQualityVolume||speedThreatConflict;
  const lastSubMin=n(live?.lastSubstitution?.minute);
  const recentSub=lastSubMin!==null&&minute-lastSubMin>=0&&minute-lastSubMin<=5;
  const attSubs=n(live.attackingSubsFor)??0,defSubs=n(live.defensiveSubsFor)??0,reds=n(live.redCards)??0;
  const lastSubType=String(live?.lastSubstitution?.type||"");
  const playerImpact=n(live?.lastSubstitution?.playerImpact)??0;
  let tacticalBoost=0;
  if(recentSub&&playerImpact!==0)tacticalBoost+=Math.max(-3,Math.min(3,playerImpact));
  else if(recentSub&&lastSubType==="Attacking Sub")tacticalBoost+=2;
  else if(recentSub&&lastSubType==="Defensive Sub")tacticalBoost-=2;
  else if(recentSub&&attSubs>defSubs)tacticalBoost+=1;
  else if(recentSub&&defSubs>attSubs)tacticalBoost-=1;
  if(reds>0)tacticalBoost-=2;
  const pre=String(live?.preMatchIntent||"");
  const strength=n(live?.strengthTier),oppStrength=n(live?.opponentStrengthTier);
  let intent="---",conf=40;const reasons=[];

  const wc=weightCfg(cfg).window;
  reasons.push("5分钟"+Math.round(wc.w5*100)+"% + 10分钟"+Math.round(wc.w10*100)+"% 动态窗口");
  reasons.push("Speed Score "+Math.round(ss)+" / Attack Score "+Math.round(as));
  if(pre)reasons.push("赛前意图 "+pre);
  if(strength!==null&&oppStrength!==null)reasons.push("实力等级 "+strength+" vs "+oppStrength);
  if(recentSub&&tacticalBoost>0){
    const on=live?.lastSubstitution?.on,off=live?.lastSubstitution?.off;
    reasons.push("近期进攻型换人增强进攻意图"+(on?.player?("："+(off?.player||"")+" → "+on.player+(on.roleClass?(" ["+on.roleClass+"]"):"")+(on.marketValueText?(" "+on.marketValueText):"")):""));
  }
  if(recentSub&&tacticalBoost<0){
    const on=live?.lastSubstitution?.on,off=live?.lastSubstitution?.off;
    reasons.push("近期防守型换人/减员削弱进攻意图"+(on?.player?("："+(off?.player||"")+" → "+on.player+(on.roleClass?(" ["+on.roleClass+"]"):"")+(on.marketValueText?(" "+on.marketValueText):"")):""));
  }
  if(evidenceConflict)reasons.push("实时信号存在冲突：速度/射门量与有效威胁不一致");

  const boostedDangerous=dangerous||(active&&tacticalBoost>0&&!evidenceConflict);
  const weakenedPassive=passive||tacticalBoost<0;

  if(gd<0){
    if(minute>=55&&weakenedPassive&&as<34){
      intent="Give Up";conf=70;reasons.push("仍然落后，但实时节奏、威胁或战术信号明显下降");
    }else if(equalizeExec&&!evidenceConflict){
      intent="Equalize";conf=86;reasons.push("落后 + SS5≥50 + AS5≥70 + xG5≥0.20，达到回测追平执行门槛");
    }else if(active){
      intent="---";conf=50;reasons.push("虽然存在进攻，但尚未达到 Equalize 的回测执行门槛");
    }else{
      intent="---";conf=42;reasons.push("虽然落后，但实时数据不足以证明正在追平");
    }
  }else if(gd>0){
    if(wantExec&&!evidenceConflict){
      intent="Win Big";conf=86;reasons.push("领先且 SS5≥60 + AS5≥85 + xG5≥0.30，仍在猛烈扩大比分");
    }else if(dontLoseExec||strongDontLose){
      intent="Don't Lose";conf=strongDontLose?88:78;reasons.push(strongDontLose?"后段极低节奏/攻击，强烈保护比分":"70分钟后低节奏、低攻击、低xG，偏向保护比分");
    }else{
      intent="---";conf=evidenceConflict?50:44;reasons.push(evidenceConflict?"领先但进攻质量证据冲突，不强判 Win Big":"已领先，但当前实时证据不足以判断继续扩大还是保护比分");
    }
  }else{
    if(dontLoseExec||strongDontLose){
      intent="Don't Lose";conf=strongDontLose?86:74;reasons.push(strongDontLose?"平局后段极低节奏/攻击，强烈保住结果":"70分钟后低节奏、低攻击、低xG，更偏向保住结果");
    }else if(wantExec&&!evidenceConflict){
      intent="Want Win";conf=86;reasons.push("SS5≥60 + AS5≥85 + xG5≥0.30，达到 Want Win 回测执行门槛");
    }else if(hopeExec){
      intent="Hope Win";conf=evidenceConflict?58:68;reasons.push(evidenceConflict?"达到 Hope Win 强度但存在证据冲突":"SS5≥45 + AS5≥55 + xG5≥0.12，达到 Hope Win 回测执行门槛");
    }else{
      intent="---";conf=42;reasons.push("平局下实时证据不足以形成明确意图");
    }
  }

  if(gd===0&&pre==="Must Win"){
    if(wantExec&&!evidenceConflict){
      intent="Must Win";conf=Math.max(conf,88);reasons.push("赛前必须拿结果，且当前已达到猛烈争胜执行强度");
    }else if(hopeExec){
      intent="Must Win";conf=Math.max(conf,74);reasons.push("赛前必须拿结果；当前至少达到强攻击执行层");
    }
  }else if(gd===0&&pre==="Want Win"&&intent==="Hope Win"&&wantExec&&!evidenceConflict){
    intent="Want Win";conf=Math.max(conf,82);reasons.push("赛前Want Win且实时执行已达到 Want Win 回测门槛");
  }

  return {intent,confidence:Math.min(95,conf),reasons,diagnostics:{evidenceConflict,lowQualityVolume,speedThreatConflict,tacticalBoost,recentSub,playerImpact,wantExec,hopeExec,equalizeExec,dontLoseExec,strongDontLose}};
}
export function evaluateLiveIntent(scoreFor,scoreAgainst,minute,rank,otherRank,live={},cfg={}){
  const m=Number(minute),metrics=computeFormulaDMetrics(live,cfg),c=classify(scoreFor,scoreAgainst,m,live,metrics,cfg);
  const tempoClass=tempoLevel(metrics.SS,m),attackClass=attackLevel(metrics.AS,m),thresholds=dynamicThresholds(m);
  metrics.tempoLevel=tempoClass;
  metrics.attackLevel=attackClass;
  metrics.dynamicThresholds=thresholds;
  return {...c,metrics,signals:{tempo:metrics.SS,attack:metrics.AS,tempoLevel:tempoClass,attackLevel:attackClass,dynamicThresholds:thresholds,dataMode:metrics.mode,quadrant:metrics.quadrant,momentum:metrics.momentum},context:{goalDifference:Number(scoreFor)-Number(scoreAgainst),minute:m}};
}
export const FORMULA_D_INTENTS=["Must Win","Want Win","Hope Win","Don't Lose","Equalize","Win Big","Give Up","---"];