import { db } from "hatchable";
import {evaluateLiveIntent} from "lib/formula-d-engine.js";
import {addDailyUsage,assertCanFetch,getDailyUsage,isDailyUsageCapError} from "lib/formula-usage.js";

const BASE="https://www.fotmob.com/api/data";
const SNAP_MINUTES=[15,30,45,60,70,75,80,85];
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function isoDate(d){return new Date(d+"T12:00:00Z").toISOString().slice(0,10)}
function addDays(d,k){const x=new Date(d+"T12:00:00Z");x.setUTCDate(x.getUTCDate()+k);return x.toISOString().slice(0,10)}
function seasonLabel(date){
  if(date<"2023-07-01")return "2022-23";
  if(date<"2025-07-01")return "2024-25";
  return "2025-26";
}
async function getJson(path){
  const before=await getDailyUsage();
  if(before.capReached)throw Object.assign(new Error("Daily historical learning traffic cap reached."),{code:"DAILY_MB_CAP"});
  const r=await fetch(BASE+path,{timeout_ms:12000,headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
  if(!r.ok)throw new Error("Historical provider HTTP "+r.status);
  const announced=Number(r.headers?.get?.("content-length"));
  await assertCanFetch(Number.isFinite(announced)&&announced>0?announced:null);
  const txt=await r.text();
  const bytes=new TextEncoder().encode(txt).byteLength;
  await addDailyUsage(bytes);
  return JSON.parse(txt);
}
function nationsLeague(l){
  const name=String(l?.name||"").trim();
  return /UEFA\s+Nations\s+League/i.test(name);
}
function targetLeague(l){
  const name=String(l?.name||"").trim(),code=String(l?.ccode||l?.countryCode||"").toUpperCase();
  if(/^(UEFA )?Champions League$/i.test(name))return true;
  if(/^(UEFA )?Europa League$/i.test(name))return true;
  if(/^(UEFA )?(Europa )?Conference League$/i.test(name))return true;
  if(/^Premier League$/i.test(name))return !code||["ENG","GBR"].includes(code);
  if(/^(LaLiga|La Liga)( EA Sports)?$/i.test(name))return !code||code==="ESP";
  if(/^Serie A$/i.test(name))return !code||code==="ITA";
  if(/^Bundesliga$/i.test(name))return !code||["GER","DEU"].includes(code);
  if(/^Ligue 1( McDonald'?s)?$/i.test(name))return !code||code==="FRA";
  return false;
}
function firstTeam(m){
  const s=(String(m?.home?.name||"")+" "+String(m?.away?.name||""));
  return !/\b(?:women|ladies|u\s?[-]?\s?(?:17|18|19|20|21|23)|reserves?|academy|youth)\b/i.test(s)&&!/\b(?:ii|iii|b)\b$/i.test(s);
}
function minuteOf(x){
  const v=Number(x?.min??x?.minute??String(x?.timeStr||x?.time||"").match(/\d+/)?.[0]);
  return Number.isFinite(v)?v:null;
}
function shots(detail){
  return Array.isArray(detail?.content?.shotmap?.shots)?detail.content.shotmap.shots:[];
}
function allEvents(detail){
  const out=[],push=a=>{if(Array.isArray(a))out.push(...a)};
  push(detail?.header?.events);
  push(detail?.content?.matchFacts?.events?.events);
  push(detail?.content?.matchFacts?.events);
  push(detail?.content?.liveticker?.events);
  push(detail?.content?.liveTicker?.events);
  return out;
}
function isGoalShot(s){return /goal/i.test(String(s?.eventType||s?.type||s?.result||""))&&!/missed penalty/i.test(String(s?.eventType||s?.type||s?.result||""))}
function scoreAt(detail,homeId,awayId,minute){
  let h=0,a=0;
  for(const s of shots(detail)){
    const m=minuteOf(s);if(m==null||m>minute||!isGoalShot(s))continue;
    if(Number(s?.teamId)===Number(homeId))h++; else if(Number(s?.teamId)===Number(awayId))a++;
  }
  return [h,a];
}
function windowMetrics(detail,teamId,minute){
  const ss=shots(detail).map(s=>({...s,_m:minuteOf(s)})).filter(s=>Number(s?.teamId)===Number(teamId)&&s._m!=null&&s._m<=minute);
  const win=(lo,hi)=>ss.filter(s=>s._m>=lo&&s._m<=hi);
  const xg=a=>a.reduce((z,s)=>z+n(s?.expectedGoals),0);
  const r5=win(Math.max(0,minute-5),minute),p5=win(Math.max(0,minute-10),Math.max(0,minute-5)-0.001);
  const r10=win(Math.max(0,minute-10),minute),p10=win(Math.max(0,minute-20),Math.max(0,minute-10)-0.001);
  let red=0,subs=0,att=0,def=0,lastSub=null;
  for(const e of allEvents(detail)){
    const em=minuteOf(e);if(em==null||em>minute)continue;
    const tid=Number(e?.teamId); if(Number.isFinite(tid)&&tid!==Number(teamId))continue;
    const t=String(e?.type||e?.eventType||e?.event||"").toLowerCase();
    const card=String(e?.card||e?.cardType||"").toLowerCase();
    if(t.includes("red")||card.includes("red"))red++;
    if(t.includes("sub")){
      subs++;lastSub={minute:em,type:"Type unknown"};
      const txt=JSON.stringify(e).toLowerCase();
      if(/attacking|forward|striker|wing/.test(txt)){att++;lastSub.type="Attacking Sub";}
      if(/defensive|defender|centre-back|full-back/.test(txt)){def++;lastSub.type="Defensive Sub";}
    }
  }
  return {
    recent5ShotsFor:r5.length,recent5XgFor:Number(xg(r5).toFixed(3)),
    previous5ShotsFor:p5.length,previous5XgFor:Number(xg(p5).toFixed(3)),
    recent10ShotsFor:r10.length,recent10XgFor:Number(xg(r10).toFixed(3)),
    previous10ShotsFor:p10.length,previous10XgFor:Number(xg(p10).toFixed(3)),
    redCards:red,substitutions:subs,attackingSubsFor:att,defensiveSubsFor:def,lastSubstitution:lastSub,
    possession:null,boxTouches:null
  };
}
function quality(detail){
  const sm=shots(detail).length,ev=allEvents(detail).length;
  if(sm>=12&&ev>=5)return "high";
  if(sm>=6)return "medium";
  return "low";
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function behaviorScore(intent,s,f){
  const goalDelta=Number(f.score_for)-Number(s.score_for),concededDelta=Number(f.score_against)-Number(s.score_against);
  const fas=Number(f.attack_score)||0,fss=Number(f.ss)||0;
  let score=50;
  if(["Must Win","Want Win","Hope Win","Equalize","Win Big"].includes(intent)){
    score=25+Math.max(0,fas-40)*.9+Math.max(0,fss-45)*.35+Math.max(0,goalDelta)*12;
    if(intent==="Equalize"&&goalDelta>0)score+=8;
  }else if(intent==="Don't Lose"){
    score=45+Math.max(0,55-fas)*.7+(concededDelta===0?18:-25);
  }else if(intent==="Give Up"){
    score=45+Math.max(0,42-fas)*1.1+Math.max(0,45-fss)*.35;
  }
  return Math.max(0,Math.min(100,Math.round(score)));
}
async function processMatch(m,competition,date){
  const id=String(m?.id||"");if(!id)return {snapshots:0};
  const detail=await getJson("/matchDetails?matchId="+encodeURIComponent(id));
  if(!detail?.header?.status?.finished)return {snapshots:0,skipped:true};
  const homeId=detail?.general?.homeTeam?.id??m?.home?.id,awayId=detail?.general?.awayTeam?.id??m?.away?.id;
  const home=detail?.general?.homeTeam?.name||m?.home?.name||"",away=detail?.general?.awayTeam?.name||m?.away?.name||"";
  const finalStr=detail?.header?.status?.scoreStr||m?.status?.scoreStr||"0-0";
  const mm=String(finalStr).match(/(\d+)\s*-\s*(\d+)/); const hg=mm?Number(mm[1]):n(m?.home?.score),ag=mm?Number(mm[2]):n(m?.away?.score);
  const q=quality(detail);
  const inserted=await db.query(`INSERT INTO formula_d_historical_matches(match_id,match_date,season_label,competition,home_name,away_name,home_goals,away_goals,data_quality,processed_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT(match_id) DO NOTHING RETURNING match_id`,[id,date,seasonLabel(date),competition,home,away,hg,ag,q]);
  if(!inserted.rows?.length)return {snapshots:0,skipped:true};

  const raw=[];
  for(const minute of SNAP_MINUTES){
    const [sh,sa]=scoreAt(detail,homeId,awayId,minute);
    const hm=windowMetrics(detail,homeId,minute),am=windowMetrics(detail,awayId,minute);
    const ha=evaluateLiveIntent(sh,sa,minute,null,null,hm),aa=evaluateLiveIntent(sa,sh,minute,null,null,am);
    for(const x of [
      {team:home,opp:away,side:"home",sf:sh,sa,an:ha,live:hm},
      {team:away,opp:home,side:"away",sf:sa,sa:sh,an:aa,live:am}
    ]){
      const fm=x.an.metrics;
      raw.push([id,x.team,x.opp,x.side,minute,x.sf,x.sa,x.an.intent,x.an.confidence,fm.SS,fm.AS,fm.window5SS,fm.window5AS,fm.window10SS,fm.window10AS,x.live.recent5ShotsFor,x.live.recent5XgFor,x.live.recent10ShotsFor,x.live.recent10XgFor,x.live.redCards,x.live.substitutions,q]);
    }
  }
  const vals=[];const placeholders=[];let p=1;
  for(const row of raw){
    placeholders.push("(" + row.map(()=>"$"+(p++)).join(",") + ")");
    vals.push(...row);
  }
  const ins=await db.query(`
    INSERT INTO formula_d_historical_snapshots(match_id,team_name,opponent_name,side,minute,score_for,score_against,intent,confidence,ss,attack_score,ss5,as5,ss10,as10,recent5_shots,recent5_xg,recent10_shots,recent10_xg,red_cards,substitutions,data_quality)
    VALUES ${placeholders.join(",")}
    ON CONFLICT(match_id,team_name,minute) DO UPDATE SET intent=EXCLUDED.intent,confidence=EXCLUDED.confidence,ss=EXCLUDED.ss,attack_score=EXCLUDED.attack_score
    RETURNING *
  `,vals);
  const snapRows=ins.rows||[];

  const btRows=[],horizons=[5,10,15];
  for(const s of snapRows){
    const same=snapRows.filter(x=>x.team_name===s.team_name&&Number(x.minute)>Number(s.minute));
    for(const h of horizons){
      const target=Number(s.minute)+h;
      const f=same.find(x=>Number(x.minute)>=target-2&&Number(x.minute)<=target+3);
      if(!f)continue;
      const bs=behaviorScore(s.intent,s,f);
      btRows.push([s.id,id,s.team_name,s.minute,s.intent,h,f.minute,f.ss,f.attack_score,Number(f.score_for)-Number(s.score_for),Number(f.score_against)-Number(s.score_against),bs,bs>=60]);
    }
  }
  if(btRows.length){
    const btVals=[];const btPh=[];let qn=1;
    for(const row of btRows){
      btPh.push("(" + row.map(()=>"$"+(qn++)).join(",") + ")");
      btVals.push(...row);
    }
    await db.query(`
      INSERT INTO formula_d_historical_backtests(snapshot_id,match_id,team_name,minute,intent,horizon_minutes,future_minute,future_ss,future_as,goal_delta,conceded_delta,behavior_score,supported)
      VALUES ${btPh.join(",")}
      ON CONFLICT(snapshot_id,horizon_minutes) DO UPDATE SET future_minute=EXCLUDED.future_minute,future_ss=EXCLUDED.future_ss,future_as=EXCLUDED.future_as,goal_delta=EXCLUDED.goal_delta,conceded_delta=EXCLUDED.conceded_delta,behavior_score=EXCLUDED.behavior_score,supported=EXCLUDED.supported
    `,btVals);
  }
  return {snapshots:snapRows.length};
}
const NATIONS_WINDOWS=[
  {label:"2022-23",start:"2022-06-01",end:"2022-09-30"},
  {label:"2022-23 Finals",start:"2023-06-14",end:"2023-06-18"},
  {label:"2024-25",start:"2024-09-01",end:"2024-11-30"},
  {label:"2024-25 Knockouts/Finals",start:"2025-03-01",end:"2025-06-10"}
];

async function runNationsHistoricalScan(batchDays=5,maxMatches=24){
  const st=(await db.query("SELECT * FROM formula_d_nations_historical_scan_state WHERE id=1")).rows?.[0];
  if(!st)return {scope:"nations",complete:true,error:"nations scan state missing"};
  let phase=Math.max(1,Number(st.phase)||1);
  if(phase>NATIONS_WINDOWS.length)return {scope:"nations",complete:true,nationsComplete:true};

  let cursor=String(st.cursor_date).slice(0,10),days=0,seen=0,processed=0,attempted=0,snaps=0,errors=0;
  while(days<batchDays&&phase<=NATIONS_WINDOWS.length&&attempted<maxMatches){
    const w=NATIONS_WINDOWS[phase-1];
    if(cursor<w.start)cursor=w.start;
    if(cursor>w.end){
      phase++;
      if(phase>NATIONS_WINDOWS.length)break;
      cursor=NATIONS_WINDOWS[phase-1].start;
      continue;
    }

    try{
      const ymd=cursor.replace(/-/g,"");
      const d=await getJson("/matches?date="+ymd+"&ccode3=USA");
      const matches=[];
      for(const l of Array.isArray(d?.leagues)?d.leagues:[]){
        if(!nationsLeague(l))continue;
        for(const m of Array.isArray(l?.matches)?l.matches:[]){
          if(firstTeam(m)&&m?.status?.finished)matches.push({m,competition:l.name||m?.tournament?.name||"UEFA Nations League"});
        }
      }
      seen+=matches.length;
      const existing=await db.query("SELECT match_id FROM formula_d_historical_matches WHERE match_date=$1",[cursor]);
      const doneIds=new Set((existing.rows||[]).map(x=>String(x.match_id)));
      for(const x of matches.filter(x=>!doneIds.has(String(x.m?.id||"")))){
        if(attempted>=maxMatches)break;
        attempted++;
        try{
          const r=await processMatch(x.m,x.competition,cursor);
          if(!r.skipped){processed++;snaps+=r.snapshots||0;}
        }catch(e){
          if(isDailyUsageCapError(e))throw e;
          errors++;
          console.error("nations historical match",x.m?.id,String(e?.message||e));
        }finally{
          await pause(650);
        }
      }
    }catch(e){
      if(isDailyUsageCapError(e))throw e;
      errors++;
      console.error("nations historical date",cursor,String(e?.message||e));
    }

    cursor=addDays(cursor,1);
    days++;
    if(cursor>NATIONS_WINDOWS[phase-1].end){
      phase++;
      if(phase<=NATIONS_WINDOWS.length)cursor=NATIONS_WINDOWS[phase-1].start;
    }
  }

  const complete=phase>NATIONS_WINDOWS.length;
  await db.query(`
    UPDATE formula_d_nations_historical_scan_state
    SET phase=$1,cursor_date=$2,status=$3,
        days_scanned=days_scanned+$4,
        matches_seen=matches_seen+$5,
        matches_processed=matches_processed+$6,
        snapshots_created=snapshots_created+$7,
        errors=errors+$8,
        updated_at=NOW()
    WHERE id=1
  `,[phase,complete?"2025-06-11":cursor,complete?"complete":"running",days,seen,processed,snaps,errors]);

  return {scope:"nations",complete,nationsComplete:complete,phase,cursorDate:cursor,days,seen,attempted,processed,snapshots:snaps,errors,maxMatches};
}

export async function runHistoricalScan(batchDays=5,maxMatches=24){
  const st=(await db.query("SELECT * FROM formula_d_historical_scan_state WHERE id=1")).rows?.[0];
  if(!st)return {error:"scan state missing"};
  if(st.status==="complete"||String(st.cursor_date).slice(0,10)>String(st.end_date).slice(0,10)){
    return await runNationsHistoricalScan(batchDays,maxMatches);
  }
  let cursor=String(st.cursor_date).slice(0,10),days=0,seen=0,processed=0,attempted=0,snaps=0,errors=0,stoppedOnBusyDay=false;
  const end=String(st.end_date).slice(0,10);

  while(days<batchDays&&cursor<=end&&attempted<maxMatches){
    let advanceDay=true;
    try{
      const ymd=cursor.replace(/-/g,"");
      const d=await getJson("/matches?date="+ymd+"&ccode3=USA");
      const matches=[];
      for(const l of Array.isArray(d?.leagues)?d.leagues:[]){
        if(!targetLeague(l))continue;
        for(const m of Array.isArray(l?.matches)?l.matches:[])if(firstTeam(m)&&m?.status?.finished)matches.push({m,competition:l.name||m?.tournament?.name||""});
      }
      seen+=matches.length;

      const existing=await db.query("SELECT match_id FROM formula_d_historical_matches WHERE match_date=$1",[cursor]);
      const doneIds=new Set((existing.rows||[]).map(x=>String(x.match_id)));
      const pending=matches.filter(x=>!doneIds.has(String(x.m?.id||"")));

      for(const x of pending){
        if(attempted>=maxMatches){
          advanceDay=false;
          stoppedOnBusyDay=true;
          break;
        }
        attempted++;
        try{
          const r=await processMatch(x.m,x.competition,cursor);
          if(!r.skipped){processed++;snaps+=r.snapshots||0;}
        }catch(e){
          if(isDailyUsageCapError(e))throw e;
          errors++;
          console.error("historical match",x.m?.id,String(e?.message||e));
        }finally{
          await pause(650);
        }
      }

      if(advanceDay){
        cursor=addDays(cursor,1);
        days++;
      }
    }catch(e){
      if(isDailyUsageCapError(e))throw e;
      errors++;
      console.error("historical date",cursor,String(e?.message||e));
      cursor=addDays(cursor,1);
      days++;
    }
  }

  const complete=cursor>end;
  await db.query(`UPDATE formula_d_historical_scan_state SET cursor_date=$1,status=$2,days_scanned=days_scanned+$3,matches_seen=matches_seen+$4,matches_processed=matches_processed+$5,snapshots_created=snapshots_created+$6,errors=errors+$7,updated_at=NOW() WHERE id=1`,
    [cursor,complete?"complete":"running",days,seen,processed,snaps,errors]);
  return {scope:"main",complete:false,mainComplete:complete,cursorDate:cursor,days,seen,attempted,processed,snapshots:snaps,errors,maxMatches,stoppedOnBusyDay};
}
export async function historicalSummary(){
  const st=(await db.query("SELECT * FROM formula_d_historical_scan_state WHERE id=1")).rows?.[0]||{};
  const nations=(await db.query("SELECT * FROM formula_d_nations_historical_scan_state WHERE id=1")).rows?.[0]||{};
  const q=(await db.query("SELECT data_quality,COUNT(*)::int AS matches FROM formula_d_historical_matches GROUP BY data_quality ORDER BY data_quality")).rows||[];
  const bt=(await db.query(`SELECT intent,horizon_minutes,COUNT(*)::int AS samples,ROUND(100.0*AVG(CASE WHEN supported THEN 1 ELSE 0 END)::numeric,1) AS support_rate,ROUND(AVG(behavior_score)::numeric,1) AS avg_score FROM formula_d_historical_backtests GROUP BY intent,horizon_minutes ORDER BY intent,horizon_minutes`)).rows||[];
  const totals=(await db.query("SELECT COUNT(*)::int AS matches FROM formula_d_historical_matches")).rows?.[0]||{};
  const snaps=(await db.query("SELECT COUNT(*)::int AS snapshots FROM formula_d_historical_snapshots")).rows?.[0]||{};
  const nationsTotals=(await db.query("SELECT COUNT(*)::int AS matches FROM formula_d_historical_matches WHERE competition ILIKE '%Nations League%'")).rows?.[0]||{};
  return {state:st,nationsState:nations,totals:{matches:totals.matches||0,snapshots:snaps.snapshots||0,nationsMatches:nationsTotals.matches||0},quality:q,backtests:bt};
}