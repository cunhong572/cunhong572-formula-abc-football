import { captureTimeline } from "lib/formula-d-worker/timeline.js";
import { switchAndWait } from "lib/formula-d-worker/navigation.js";
import { saveFormalSnapshot } from "lib/formula-d-worker/snapshot-store.js";
import { withWorkerLease } from "lib/formula-d-worker/lease.js";
import { login, captureMatchEvidence, forceOddsMode, reloadOddsFrame, snapshotStructure, openMyFavorites, listOddsEntries, openOddsEntry, clickOddsTab, discoverOddsPage, extract } from "lib/formula-d-odds/scanner.js";
import { writeScanAudit } from "lib/formula-d-odds/audit.js";
import { validOdds } from "lib/formula-d-odds/odds-selector.js";
import { lineNumber, sameTrackedLine } from "lib/formula-d-odds/line-normalizer.js";
import { captureTargets, targetToleranceMs, inTargetWindow, canWriteSnapshot, evidenceStage } from "lib/formula-d-odds/time-window.js";
import { browser, db, scheduler, storage } from "hatchable";

const HOST = "www.3573217.com";

function norm(value){
  return String(value||"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
}
function isoHour(ms=Date.now()){ return new Date(ms).toISOString().slice(0,13); }
function profileKey(value){
  const s=String(value||""); let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16);
}
async function learnedPreferredMode(){
  try{
    const r=await db.query(`
      SELECT mode,
             SUM(successes)::int AS successes,
             SUM(attempts)::int AS attempts,
             MAX(last_success_at) AS last_success_at
      FROM formula_e_structure_learning
      GROUP BY mode
      ORDER BY (SUM(successes)::numeric/GREATEST(SUM(attempts),1)) DESC,
               SUM(successes) DESC,
               MAX(last_success_at) DESC
      LIMIT 1
    `);
    const mode=String(r.rows?.[0]?.mode||"").toLowerCase();
    return mode==="today"?"today":"early";
  }catch(_){return "early";}
}
async function recordStructure(profile,{success=false}={}){
  if(!profile||!profile.mode)return;
  const raw=JSON.stringify(profile);
  const key=profileKey(raw);
  try{
    await db.query(`
      INSERT INTO formula_e_structure_learning
        (profile_key,mode,frame_count,event_rows,market_blocks,ou_headers,profile,attempts,successes,failures,last_success_at)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,1,$8,$9,CASE WHEN $8=1 THEN NOW() ELSE NULL END)
      ON CONFLICT(profile_key) DO UPDATE SET
        attempts=formula_e_structure_learning.attempts+1,
        successes=formula_e_structure_learning.successes+$8,
        failures=formula_e_structure_learning.failures+$9,
        last_seen_at=NOW(),
        last_success_at=CASE WHEN $8=1 THEN NOW() ELSE formula_e_structure_learning.last_success_at END
    `,[
      key,String(profile.mode),Number(profile.frames||0),Number(profile.eventRows||0),
      Number(profile.marketBlocks||0),Number(profile.ouHeaders||0),raw,success?1:0,success?0:1
    ]);
  }catch(e){console.warn("formula-e structure learning write",String(e?.message||e));}
}

async function setState(patch){
  const keys=Object.keys(patch);
  const cols=["singleton_key",...keys];
  const vals=["main",...keys.map(k=>patch[k])];
  const placeholders=vals.map((_,i)=>"$"+(i+1));
  const updates=keys.map((k,i)=>`${k}=EXCLUDED.${k}`).concat(["updated_at=now()"]);
  await db.query(
    `INSERT INTO formula_e_cloud_state(${cols.join(",")}) VALUES(${placeholders.join(",")})
     ON CONFLICT(singleton_key) DO UPDATE SET ${updates.join(",")}`,
    vals
  );
}
async function targets(){
  const r=await db.query("SELECT id,input_home,input_away,kickoff_at,selected_line FROM formula_e_matches ORDER BY id ASC");
  return (r.rows||[]).map(x=>({
    id:Number(x.id),
    home:x.input_home,
    away:x.input_away,
    kickoff:x.kickoff_at,
    lockedLine:String(x.selected_line||"").trim()
  }));
}

function creds(){
  const username=String(process.env.FORMULA_E_ODDS_USERNAME||"").trim();
  const password=String(process.env.FORMULA_E_ODDS_PASSWORD||"");
  if(!username||!password) throw new Error("CLOUD_CREDENTIALS_MISSING");
  return {username,password};
}

async function scheduleEvidenceCleanup(){
  const r=await db.query("SELECT MAX(kickoff_at) AS latest FROM formula_e_matches WHERE kickoff_at IS NOT NULL");
  const latest=Date.parse(r.rows?.[0]?.latest||0);
  if(!Number.isFinite(latest))return null;
  // Safety buffer: delete evidence after the last fixture should certainly be over.
  const when=latest+3*60*60000;
  if(when>Date.now()+15000){
    await scheduler.at(new Date(when),"/api/formula-e-evidence-cleanup",{
      name:"formula-e-evidence-cleanup",
      payload:{kind:"auto"}
    });
  }
  return when;
}

async function scheduleNextTimeline(){
  const r=await db.query("SELECT kickoff_at FROM formula_e_matches WHERE kickoff_at IS NOT NULL ORDER BY kickoff_at");
  const now=Date.now();
  let nextTarget=null;
  for(const row of (r.rows||[])){
    const k=Date.parse(row.kickoff_at); if(!Number.isFinite(k))continue;
    for(const t of captureTargets(k)){
      if(t.at>now+15000 && (!nextTarget||t.at<nextTarget.at))nextTarget=t;
    }
  }
  if(nextTarget){
    // Pre-warm earlier for the strict last-5-minute checkpoint because
    // 3573217/browser startup can occasionally take over 90 seconds.
    // Other checkpoints keep the lighter 90-second pre-warm.
    const leadMs=nextTarget.kind==="last_5min" ? 5*60*1000 : 90*1000;
    const prewarmAt=Math.max(now+15000,nextTarget.at-leadMs);
    await scheduler.at(new Date(prewarmAt),"/api/formula-e-cloud-once",{
      name:"formula-e-timeline-next",
      payload:{kind:"timeline",targetAt:new Date(nextTarget.at).toISOString()}
    });
  }
  return nextTarget?.at??null;
}

async function saveItems(items,{targetAt=null,owner=null}={}){
  const nowMs=Date.now();
  const targetAnchorMs=Date.parse(String(targetAt||""));
  let saved=0;
  const pendingRolloverIds=[];
  const formalOutcomes=[];
  for(const item of items){
    const id=Number(item.id), odds=validOdds(item.odds), line=String(item.line||"").trim().slice(0,20);
    const scrapedKickoffMs=Date.parse(String(item.kickoff||""));
    const rollover=Boolean(item.rollover);
    if(!Number.isInteger(id)||!odds||!line)continue;

    const state=(await db.query("SELECT selected_line,current_odds,rollover_candidate_line,rollover_candidate_odds,rollover_candidate_target_at,rollover_candidate_count,kickoff_at FROM formula_e_matches WHERE id=$1",[id])).rows?.[0]||{};
    // V275: use the same canonical database kickoff as the scheduler, even
    // when the source page renders a different timezone/date.
    const storedKickoffMs=Date.parse(String(state.kickoff_at||""));
    const kickoffMs=Number.isFinite(storedKickoffMs)?storedKickoffMs:scrapedKickoffMs;
    if(!Number.isFinite(kickoffMs))continue;
    const canonicalKickoff=new Date(kickoffMs).toISOString();
    if(kickoffMs<nowMs-60000)continue;
    if(Number.isFinite(targetAnchorMs)&&(nowMs<targetAnchorMs||nowMs>=kickoffMs))continue;
    const previousLine=String(state.selected_line||"").trim();
    const previousOdds=validOdds(state.current_odds);

    // Hard safety gate: once a line is locked, a different line must NEVER be
    // written unless extract explicitly marked it as a verified rollover.
    // This also prevents stray baseline rows from being created by a transient
    // parser mismatch while the original locked line is still active.
    if(previousLine && previousLine!==line && !rollover){
      continue;
    }

    // A same-session parser miss is not enough to prove disappearance.
    // Require TWO independent cloud scans, separated by at least 45 seconds,
    // to agree that the old locked line is absent before a continuation row
    // may be created. This prevents page repaint / narrow fixture-root misses
    // from opening false extra rows.
    if(rollover && previousLine && previousLine!==line){
      const prevCandidate=String(state.rollover_candidate_line||"").trim();
      const prevAt=Date.parse(String(state.rollover_candidate_target_at||""));
      const elapsed=Number.isFinite(prevAt)?nowMs-prevAt:NaN;
      const sameCandidate=prevCandidate&&sameTrackedLine(prevCandidate,line);
      const independent=Number.isFinite(elapsed)&&elapsed>=45000&&elapsed<=10*60*1000;
      const count=(sameCandidate&&independent)?Number(state.rollover_candidate_count||1)+1:1;
      await db.query(
        `UPDATE formula_e_matches
         SET rollover_candidate_line=$1,rollover_candidate_odds=$2,
             rollover_candidate_target_at=now(),
             rollover_candidate_count=$3,updated_at=now()
         WHERE id=$4`,
        [line,odds,count,id]
      );
      if(count<2){
        pendingRolloverIds.push(id);
        continue;
      }
    }else if(previousLine){
      await db.query(
        "UPDATE formula_e_matches SET rollover_candidate_line=NULL,rollover_candidate_odds=NULL,rollover_candidate_target_at=NULL,rollover_candidate_count=0 WHERE id=$1",
        [id]
      );
    }

    // Before switching away from a disappeared line, make sure its original
    // baseline is permanently stored. The old row is never deleted or rewritten.
    if(rollover && previousLine && previousLine!==line && previousOdds){
      await db.query(
        "INSERT INTO formula_e_odds_snapshots(match_id,sample_kind,selected_line,odds,observed_at) VALUES($1,'baseline',$2,$3,now()) ON CONFLICT DO NOTHING",
        [id,previousLine,previousOdds]
      );
    }

    // Start rule:
    // - If a fixture is added more than 12h before kickoff, wait for T-12.
    // - If it is already within 12h of kickoff, capture immediately.
    // - If the locked line later disappears, roll forward to a fresh line
    //   closest to 1.88 while preserving the previous line as history.
    const t12At=kickoffMs-12*60*60000;
    const inT12Window=nowMs>=t12At && nowMs<=t12At+10*60*1000;
    const within12Hours=nowMs>=t12At && nowMs<kickoffMs;
    const baselineNow=within12Hours;
    await db.query(
      `UPDATE formula_e_matches
       SET kickoff_at=$1::timestamptz,
           selected_line=CASE
             WHEN $7 THEN $2
             WHEN $5 AND selected_line IS NULL THEN $2
             ELSE selected_line
           END,
           current_odds=CASE
             WHEN $7 THEN $3
             WHEN $5 AND current_odds IS NULL THEN $3
             ELSE current_odds
           END,
           status='active',
           source_detail=CASE
             WHEN $7 THEN 'Locked line disappeared; continued on a new closest-to-1.88 line.'
             WHEN $6 THEN 'T-12 baseline captured and locked.'
             WHEN $5 THEN 'Within 12h: immediate baseline captured and locked.'
             ELSE 'Kickoff found; waiting for T-12 capture.'
           END,
           updated_at=now()
       WHERE id=$4`,
      [canonicalKickoff,line,odds,id,baselineNow,inT12Window,rollover]
    );
    if(rollover){
      await db.query(
        "UPDATE formula_e_matches SET rollover_candidate_line=NULL,rollover_candidate_odds=NULL,rollover_candidate_target_at=NULL,rollover_candidate_count=0 WHERE id=$1",
        [id]
      );
    }

    if((baselineNow || rollover) && (!previousLine || previousLine!==line || !previousOdds)){
      await db.query(
        "INSERT INTO formula_e_odds_snapshots(match_id,sample_kind,selected_line,odds,observed_at) VALUES($1,'baseline',$2,$3,now()) ON CONFLICT DO NOTHING",
        [id,line,odds]
      );
    }

    for(const target of captureTargets(kickoffMs)){
      if(Number.isFinite(targetAnchorMs)&&target.at!==targetAnchorMs)continue;
      // Normal runs use the real scan time. Retry-chain runs keep the original
      // checkpoint anchor so a temporarily missing fixture can still be saved
      // into its intended T-1/T-5/hourly slot when it is finally recovered.
      // Never let a future targetAt timestamp back-date an early scan into a
      // checkpoint. targetAt may anchor delayed recovery AFTER the target, but if
      // the actual scan is still before targetAt, use the real scan time.
      const compareMs=Number.isFinite(targetAnchorMs)&&nowMs>=targetAnchorMs?targetAnchorMs:nowMs;
      if(canWriteSnapshot(compareMs,Date.now(),target)){
        const snapshotItem={...item,id,line,odds,kickoff:canonicalKickoff};
        let outcome=await saveFormalSnapshot(snapshotItem,target,{owner});
        // V275: a successful formal scrape must have a persisted snapshot.
        // Retain the release's slot identity, immutable successful values,
        // lease fencing and exact write-time gates for the recovery attempt.
        if(Number.isFinite(targetAnchorMs)){
          const verify=()=>db.query("SELECT capture_status FROM formula_e_odds_snapshots WHERE match_id=$1 AND target_at=$2::timestamptz AND sample_kind=$3",[id,new Date(target.at).toISOString(),target.kind]);
          let persisted=(await verify()).rows?.[0];
          if(!/^captured_(exact|retry|fallback)$/.test(persisted?.capture_status||"")){
            outcome=await saveFormalSnapshot(snapshotItem,target,{owner});
            persisted=(await verify()).rows?.[0];
          }
          if(/^captured_(exact|retry|fallback)$/.test(persisted?.capture_status||"")){
            outcome={saved:true,status:persisted.capture_status};
          }else if(canWriteSnapshot(targetAnchorMs,Date.now(),target)&&Date.now()<kickoffMs){
            throw new Error(`FORMULA_D_SNAPSHOT_PERSIST_FAILED match=${id} kind=${target.kind}`);
          }
        }
        formalOutcomes.push({id,...outcome});
      }
    }
    saved++;
  }

  // Only one future timeline task is armed at a time, regardless of how many
  // fixtures or kickoff times are in the batch. After each run it schedules
  // the next earliest T-12/T-11/.../T-1/T-5 target.
  await scheduleNextTimeline();
  return {saved,pendingRolloverIds,formalOutcomes};
}

export async function cloudScan(options={}){
  const active=await targets();
  return withWorkerLease({...options,targets:active},checkpoint=>scanCloud({...options,checkpoint}));
}
async function scanCloud({reason="scheduled",matchId=null,targetAt=null,retryAttempt=0,checkpoint=async()=>{}}={}){
  let all=(await targets()).filter(x=>!matchId||x.id===Number(matchId));

  // On kickoff-anchored timeline runs, only touch fixtures that are actually
  // due at this target. This avoids re-reading every tracked match from
  // 3573217 when only one kickoff group needs a sample.
  // Legacy T-1/T-5 entry points use the same anchored recovery framework.
  if(!targetAt&&(reason==='t60'||reason==='t5')){
    const kind=reason==='t5'?'last_5min':'last_1hr';
    const due=all.map(t=>captureTargets(Date.parse(t.kickoff)).find(cp=>cp.kind===kind))
      .filter(cp=>cp&&inTargetWindow(Date.now(),cp)).sort((a,b)=>a.at-b.at);
    targetAt=due.length?new Date(due[0].at).toISOString():null;
    if(!targetAt)return {ok:true,found:0,saved:0,message:'Outside checkpoint window'};
  }
  const formal=["timeline","t60","t5"].includes(reason);
  if(formal && targetAt){
    const anchor=Date.parse(String(targetAt));
    if(Number.isFinite(anchor)){
      all=all.filter(t=>{
        const k=Date.parse(String(t.kickoff||""));
        if(!Number.isFinite(k))return false;
        return captureTargets(k).some(cp=>cp.at===anchor);
      });
    }
  }

  if(!all.length){
    await setState({credential_status:"unknown",last_status:"idle",last_message:"No Formula E fixtures.",last_run_at:new Date().toISOString(),last_found:0,last_saved:0});
    return {ok:true,found:0,saved:0,message:"No Formula E fixtures."};
  }
  let username,password;
  try{({username,password}=creds());}
  catch(e){
    await setState({credential_status:"missing",last_status:"needs_setup",last_message:"3573217 cloud credentials are not configured.",last_run_at:new Date().toISOString(),last_found:0,last_saved:0});
    throw e;
  }
  const started=new Date().toISOString();
  const preferredMode=await learnedPreferredMode();
  try{
    const result=await browser.session(async page=>{
      await checkpoint();
      await page.setViewport({width:1440,height:1100});
      await login(page,username,password);
      const sourceUrl=await discoverOddsPage(page);

      // Timeline jobs start early to absorb login/navigation latency, then wait
      // inside the already-open browser session until the exact target timestamp.
      const targetMs=Date.parse(String(targetAt||""));
      if(formal&&Number.isFinite(targetMs)){
        const waitMs=targetMs-Date.now();
        // T-5 prewarms five minutes early. Keep the browser session alive and
        // wait until the exact checkpoint instead of scanning immediately.
        const maxWaitMs=6*60*1000;
        if(waitMs>0&&waitMs<=maxWaitMs){
          if(checkpoint.wait)await checkpoint.wait(waitMs);
          else await new Promise(r=>setTimeout(r,waitMs));
        }
      }

      const scanMs=Date.now();
      const isFormalCheckpoint=formal && Number.isFinite(targetMs);
      if(isFormalCheckpoint){
        await checkpoint();
        const navigate=source=>switchAndWait(page,async()=>{
          if(source==='early')return forceOddsMode(page,'early');
          if(source==='today')return await forceOddsMode(page,'today')||clickOddsTab(page,["today","today's","todays"]);
          if(source==='favorites')return openMyFavorites(page);
          if(source.startsWith('date:'))return openOddsEntry(page,source.slice(5));
          return openOddsEntry(page,source.slice(6));
        },{checkpoint});
        const data=await captureTimeline({targets:all,targetAt,retryAttempt,checkpoint,navigate,
          read:(wanted,options)=>extract(page,wanted,options),entries:()=>listOddsEntries(page)});
        return {sourceUrl,learnedStructures:[],...data};
      }
      const isFastScan=isFormalCheckpoint || reason==="manual";
      const isLast5Checkpoint=isFormalCheckpoint && all.some(t=>{
        const k=Date.parse(String(t.kickoff||""));
        return Number.isFinite(k) && Math.abs(targetMs-(k-5*60000))<=60000;
      });
      // Formal T checkpoints must finish well before the browser-farm timeout.
      // Use one read per view first; deeper recovery is reserved for non-timeline jobs.
      const formalDeadline=isFormalCheckpoint?Date.now()+30000:Infinity;
      const learnedStructures=[];
      let data={items:[],diagnostic:"",frames:0,rolloverCounts:{},rolloverCandidates:{}};
      const mergeProbe=(base,probe)=>{
        const map=new Map((base.items||[]).map(x=>[Number(x.id),x]));
        const rolloverCounts={...(base.rolloverCounts||{})};
        const rolloverCandidates={...(base.rolloverCandidates||{})};
        for(const x of (probe.items||[])){
          const id=Number(x.id),key=String(id);
          const existing=map.get(id);
          if(!x.rollover){
            // Any successful sighting of the ORIGINAL locked line anywhere in
            // Early/Today/Favorites/other football entries wins immediately.
            map.set(id,x);
            delete rolloverCounts[key];
            delete rolloverCandidates[key];
            continue;
          }
          // Never replace a confirmed locked-line sighting with a transient miss.
          if(existing && !existing.rollover)continue;
          rolloverCounts[key]=Number(rolloverCounts[key]||0)+1;
          rolloverCandidates[key]=x;
          // IMPORTANT: a rollover candidate must NOT count as a completed match
          // while scanning one page. Otherwise the crawler stops before Today /
          // My Favorites / other football entries where the original line may
          // still exist. Promotion happens only after the full scan order ends.
        }
        return {
          items:[...map.values()],
          rolloverCounts,
          rolloverCandidates,
          diagnostic:[base.diagnostic,probe.diagnostic].filter(Boolean).join("; "),
          frames:Math.max(Number(base.frames)||0,Number(probe.frames)||0)
        };
      };

      const scanCurrentView=async(modeLabel,{attempts=isFormalCheckpoint?1:6}={})=>{
        const before=(data.items||[]).length;
        for(let i=0;i<attempts;i++){
          if(Date.now()>formalDeadline)break;
          await checkpoint();
          const probe=await extract(page,all,{fast:isFastScan});
          data=mergeProbe(data,probe);
          if((data.items||[]).length===all.length)break;
          if(i+1<attempts)await new Promise(r=>setTimeout(r,isFormalCheckpoint?200:900));
        }
        // Never spend official checkpoint time on structure-learning snapshots.
        if(!isFastScan){
          learnedStructures.push({
            profile:await snapshotStructure(page,modeLabel),
            success:(data.items||[]).length>before
          });
        }
      };

      // Locked scan order: Early -> Today -> My Favorites -> every other
      // football odds entry currently exposed by 3573217.
      await forceOddsMode(page,"early");
      await new Promise(r=>setTimeout(r,900));
      await scanCurrentView("early");

      // Early has its own date filters (e.g. 09/26, 09/27). Scan the exact
      // Shanghai-calendar dates of tracked fixtures before leaving Early.
      if(!isFormalCheckpoint && (data.items||[]).length<all.length){
        const dateLabels=[...new Set(all.map(t=>{
          const d=new Date(String(t.kickoff||""));
          if(!Number.isFinite(d.getTime()))return "";
          const parts=new Intl.DateTimeFormat("en-US",{
            timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit"
          }).formatToParts(d);
          const get=x=>parts.find(p=>p.type===x)?.value||"";
          return get("month")+"/"+get("day");
        }).filter(Boolean))];
        for(const label of dateLabels){
          if((data.items||[]).length===all.length)break;
          const opened=await openOddsEntry(page,label);
          if(!opened)continue;
          await new Promise(r=>setTimeout(r,1100));
          await scanCurrentView("early-date:"+label);
        }
      }

      if((data.items||[]).length<all.length){
        const switched=await forceOddsMode(page,"today");
        if(!switched)await clickOddsTab(page,["today","today's","todays"]);
        await new Promise(r=>setTimeout(r,900));
        await scanCurrentView("today");
      }

      if(!isFastScan && (data.items||[]).length<all.length){
        const favOpened=await openMyFavorites(page);
        if(favOpened){
          await new Promise(r=>setTimeout(r,900));
          await scanCurrentView("favorites");
        }
      }

      if(!isFastScan && (data.items||[]).length<all.length && Date.now()<=formalDeadline){
        const entries=await listOddsEntries(page);
        const priority=["live","soccer","all","1x2","main markets","special markets","parlay","mix parlay","correct score","odd/even","total goal","fg/lg","ht/ft","outright"];
        entries.sort((a,b)=>{
          const ai=priority.indexOf(String(a.label||"").trim().toLowerCase());
          const bi=priority.indexOf(String(b.label||"").trim().toLowerCase());
          return (ai<0?999:ai)-(bi<0?999:bi);
        });
        const skip=/^(early|today|today's|todays|my favorites?|my favourites?|favorites?|favourites?)$/i;
        for(const entry of entries){
          if((data.items||[]).length===all.length)break;
          const label=String(entry.label||"").trim();
          if(!label||skip.test(label))continue;
          const opened=await openOddsEntry(page,label);
          if(!opened)continue;
          await new Promise(r=>setTimeout(r,isFormalCheckpoint?250:1100));
          await scanCurrentView("entry:"+label,{attempts:isFormalCheckpoint?1:2});
          if(Date.now()>formalDeadline)break;
        }
      }

      // If Today did not contain all targets, explicitly return to Early and
      // poll once more. This covers pre-match fixtures that stay in Early.
      if(!isFormalCheckpoint && (data.items||[]).length<all.length){
        await forceOddsMode(page,"early");
        await new Promise(r=>setTimeout(r,900));
        for(let i=0;i<4;i++){
          await checkpoint();
          const probe=await extract(page,all);
          data=mergeProbe(data,probe);
          if((data.items||[]).length===all.length)break;
          await new Promise(r=>setTimeout(r,900));
        }
      }

      // Root-cause repair for transient candidates=0:
      // 3573217 can leave the HdpDouble iframe shell visible while its event rows
      // are still stale/empty after an Early/Today switch. Re-reading the same DOM
      // cannot recover it. If targets are still missing, actively reload that odds
      // iframe, wait for the event list to repaint, then scan again.
      if(!isFormalCheckpoint && (data.items||[]).length<all.length){
        await checkpoint();
        const reloaded=await reloadOddsFrame(page);
        if(reloaded){
          await new Promise(r=>setTimeout(r,1800));
          for(let i=0;i<6;i++){
            await checkpoint();
            const probe=await extract(page,all);
            data=mergeProbe(data,probe);
            if((data.items||[]).length===all.length)break;
            await new Promise(r=>setTimeout(r,900));
          }
        }
      }

      // Some 3573217 sessions keep an entire stale event-list state even after the
      // child odds iframe reloads. If a target is still candidates=0, refresh the
      // main page, rediscover Football/Early, and perform one final fresh scan.
      if(!isFormalCheckpoint && (data.items||[]).length<all.length){
        try{
          await checkpoint();
          await page.reload({waitUntil:"domcontentloaded",timeout:20000});
          await new Promise(r=>setTimeout(r,1500));
          await discoverOddsPage(page);
          await forceOddsMode(page,preferredMode);
          await new Promise(r=>setTimeout(r,1800));
          for(let i=0;i<6;i++){
            await checkpoint();
            const probe=await extract(page,all);
            data=mergeProbe(data,probe);
            if((data.items||[]).length===all.length)break;
            await new Promise(r=>setTimeout(r,900));
          }
        }catch(e){if(e?.code==="WORKER_YIELD")throw e;}
      }
      // Only after the COMPLETE scan order has finished may a replacement
      // candidate be promoted. If the original locked line was found anywhere,
      // it is already in data.items and the candidate was cleared.
      const finalMap=new Map((data.items||[]).map(x=>[Number(x.id),x]));
      for(const t of all){
        const key=String(Number(t.id));
        if(finalMap.has(Number(t.id)))continue;
        if(Number(data.rolloverCounts?.[key]||0)>=5 && data.rolloverCandidates?.[key]){
          finalMap.set(Number(t.id),data.rolloverCandidates[key]);
        }
      }
      data.items=[...finalMap.values()];
      learnedStructures.push({
        profile:await snapshotStructure(page,preferredMode),
        success:(data.items||[]).length===all.length
      });
      return {sourceUrl,learnedStructures,...data};
    });
    for(const learned of (result.learnedStructures||[])){
      await recordStructure(learned.profile,{success:Boolean(learned.success)});
    }
    await checkpoint();
    const saveResult=await saveItems(result.items||[],{targetAt,owner:checkpoint.owner||null});
    if(formal&&targetAt&&Array.isArray(saveResult.formalOutcomes)){
      const persisted=new Map(saveResult.formalOutcomes.filter(x=>x.saved).map(x=>[x.id,x.status]));
      result.items=(result.items||[]).filter(x=>persisted.has(Number(x.id)));
      result.captureStates=all.map(t=>({id:Number(t.id),targetAt,status:persisted.get(Number(t.id))||'failed_source_not_found'}));
    }
    const saved=formal&&targetAt?(result.items||[]).length:Number(saveResult?.saved||0);
    const pendingRolloverIds=Array.isArray(saveResult?.pendingRolloverIds)?saveResult.pendingRolloverIds:[];
    const found=(result.items||[]).length;
    const complete=found===all.length && pendingRolloverIds.length===0;
    const statusMessage=complete
      ?`Cloud scan ${reason} completed: ${found}/${all.length} fixtures matched.`
      :pendingRolloverIds.length
        ?`Rollover confirmation pending for ${pendingRolloverIds.length} fixture(s); next minute check required.`
        :(result.diagnostic||`Cloud scan ${reason} completed: ${found}/${all.length} fixtures matched.`);
    const stateStatus=complete?"ok":found>0?"partial":"match_failed";
    await setState({credential_status:"configured",last_status:stateStatus,last_message:statusMessage.slice(0,1500),last_run_at:started,last_success_at:found>0?new Date().toISOString():null,last_found:found,last_saved:saved,last_source_url:result.sourceUrl||null});
    await writeScanAudit({reason,targets:all,items:result.items||[],diagnostic:result.diagnostic||"",pendingRolloverIds,targetAt,captureStates:result.captureStates});
    const foundIds=new Set((result.items||[]).map(x=>Number(x.id)));
    const missingMatchIds=all.map(x=>Number(x.id)).filter(id=>!foundIds.has(id));
    return {
      ok:true,found,expected:all.length,saved,missingMatchIds,pendingRolloverIds,targetAt,
      captureStates:result.captureStates||[],attempts:result.attempts||[],
      sourceUrl:result.sourceUrl,diagnostic:complete?"":statusMessage,
      matchedItems:(result.items||[]).map(x=>({
        id:Number(x.id),line:String(x.line||""),odds:Number(x.odds),kickoff:String(x.kickoff||""),rollover:Boolean(x.rollover)
      }))
    };
  }catch(e){
    if(e?.code==="WORKER_YIELD")throw e;
    await setState({credential_status:"configured",last_status:"error",last_message:String(e?.message||e).slice(0,1500),last_run_at:started,last_found:0,last_saved:0});
    throw e;
  }
}

export async function debugTeamSearch(options={}){
  return withWorkerLease({reason:'debug',targets:await targets(),resume:false},checkpoint=>scanDebugTeam(options,checkpoint));
}
async function scanDebugTeam({home,away}={},checkpoint=async()=>{}){
  const {username,password}=creds();
  return await browser.session(async page=>{
    await page.setViewport({width:1440,height:1100});
    await login(page,username,password);
    await discoverOddsPage(page);
    const wanted={home:String(home||""),away:String(away||"")};
    const scanMode=async mode=>{
      await checkpoint();
      await forceOddsMode(page,mode);
      await new Promise(r=>setTimeout(r,1400));
      return await page.evaluate((w)=>{
        const docs=[];
        const visit=win=>{
          let doc;try{doc=win.document;}catch(_){return;}
          if(!doc||docs.includes(doc))return;docs.push(doc);
          for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}
        };
        visit(window);
        const norm=s=>String(s||"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
        const h=norm(w.home),a=norm(w.away);
        const rows=[];
        for(const doc of docs){
          const els=[...doc.querySelectorAll("span,td,div,a")];
          for(const el of els){
            const t=norm(el.textContent);
            if(!t||(!t.includes(h)&&!t.includes(a)))continue;
            let p=el;
            for(let depth=0;p&&p!==doc.body&&depth<8;p=p.parentElement,depth++){
              const raw=String(p.innerText||p.textContent||"").replace(/\s+/g," ").trim();
              const n=norm(raw);
              if(!(n.includes(h)||n.includes(a)))continue;
              const times=[...p.querySelectorAll(".panel-time")].map(x=>String(x.innerText||x.textContent||"").trim()).filter(Boolean);
              const odds=p.querySelectorAll(".tableDiv-match-odds").length;
              if(times.length||odds){
                const blocks=[...p.querySelectorAll(".tableDiv-match-odds")].slice(0,20).map(b=>({
                  text:String(b.innerText||b.textContent||"").replace(/\s+/g," ").trim().slice(0,220),
                  lines:[...b.querySelectorAll("b")].map(x=>String(x.innerText||x.textContent||"").trim()),
                  marks:[...b.querySelectorAll("p")].map(x=>String(x.innerText||x.textContent||"").trim()),
                  prices:[...b.querySelectorAll("a.odds")].map(x=>String(x.innerText||x.textContent||"").trim())
                }));
                rows.push({text:raw.slice(0,500),times:times.slice(0,5),odds,home:n.includes(h),away:n.includes(a),blocks});
                break;
              }
            }
          }
        }
        const uniq=[...new Map(rows.map(x=>[x.text,x])).values()];
        return {frames:docs.length,rows:uniq.slice(0,40)};
      },wanted);
    };
    return {early:await scanMode("early"),today:await scanMode("today")};
  });
}

export async function cloudStatus(){
  const r=await db.query("SELECT * FROM formula_e_cloud_state WHERE singleton_key='main'");
  const state=r.rows?.[0]||{singleton_key:"main",enabled:true,credential_status:"unknown",last_status:"never_run"};
  const a=await db.query(`
    SELECT match_id,home,away,reason,status,stage,detail,selected_line,odds,kickoff_at,created_at,target_at,capture_status
    FROM formula_e_scan_audit
    ORDER BY id DESC
    LIMIT 20
  `);
  return {...state,recent_audits:a.rows||[]};
}
