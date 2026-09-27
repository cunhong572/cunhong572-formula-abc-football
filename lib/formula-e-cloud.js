import { browser, db, scheduler, storage } from "hatchable";

const SOURCE = "https://www.3573217.com/";
const HOST = "www.3573217.com";

function norm(value){
  return String(value||"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
}
function isoHour(ms=Date.now()){ return new Date(ms).toISOString().slice(0,13); }
function validOdds(v){ const n=Number(v); return Number.isFinite(n)&&n>1&&n<20?n:null; }
function lineNumber(value){
  const raw=String(value||"").trim();
  if(!raw)return NaN;
  const parts=raw.split("/").map(Number);
  if(parts.some(x=>!Number.isFinite(x)))return NaN;
  return parts.reduce((a,b)=>a+b,0)/parts.length;
}
function sameTrackedLine(a,b){
  const av=lineNumber(a),bv=lineNumber(b);
  if(Number.isFinite(av)&&Number.isFinite(bv))return Math.abs(av-bv)<1e-9;
  return String(a||"").trim()===String(b||"").trim();
}
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
function auditStage(detail){
  const s=String(detail||"").toLowerCase();
  if(s.includes("team row not unique"))return "TEAM_MATCH";
  if(s.includes("first half o/u column missing"))return "FIRST_HALF_OU";
  if(s.includes("fixture container not found"))return "FIXTURE_ROW";
  if(s.includes("kickoff missing"))return "KICKOFF";
  if(s.includes("market missing"))return "MARKET_PARSE";
  if(s.includes("price unresolved"))return "ODDS_PARSE";
  if(s.includes("rollover blocked"))return "LINE_LOCK";
  return s?"UNKNOWN":"SUCCESS";
}
function diagnosticFor(target,diagnostic){
  const prefix=`${target.home} vs ${target.away}:`;
  const parts=String(diagnostic||"").split(";").map(x=>x.trim()).filter(Boolean);
  return parts.filter(x=>x.startsWith(prefix)).join("; ").slice(0,1200);
}
async function writeScanAudit({reason,targets,items,diagnostic,pendingRolloverIds=[]}){
  const byId=new Map((items||[]).map(x=>[Number(x.id),x]));
  const pending=new Set((pendingRolloverIds||[]).map(Number));
  for(const target of targets||[]){
    const item=byId.get(Number(target.id));
    const rawDetail=diagnosticFor(target,diagnostic);
    const status=item?(pending.has(Number(target.id))?"pending_rollover":"success"):"failed";
    const stage=item?(pending.has(Number(target.id))?"LINE_LOCK":"SUCCESS"):auditStage(rawDetail);
    const detail=status==="success"?null:rawDetail||null;
    await db.query(
      "INSERT INTO formula_e_scan_audit(match_id,home,away,reason,status,stage,detail,selected_line,odds,kickoff_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz)",
      [Number(target.id),target.home,target.away,String(reason||""),status,stage,detail,item?.line||null,validOdds(item?.odds),item?.kickoff||target.kickoff||null]
    );
  }
  await db.query("DELETE FROM formula_e_scan_audit WHERE id NOT IN (SELECT id FROM formula_e_scan_audit ORDER BY id DESC LIMIT 500)");
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

async function login(page,username,password){
  await page.goto(SOURCE,{waitUntil:"domcontentloaded"});
  const hasLogin=await page.$("#UserName");
  if(hasLogin){
    await page.type("#UserName",username,{delay:35});
    await page.type("#Password",password,{delay:35});
    try{
      await Promise.all([
        page.waitForNavigation({timeout:15000,waitUntil:"domcontentloaded"}),
        page.click("#sub")
      ]);
    }catch(_){
      try{ await page.click("#sub"); }catch(__){}
      await new Promise(r=>setTimeout(r,2500));
    }
  }
  const stillLogin=await page.$("#UserName");
  if(stillLogin){
    const tip=await page.$eval("#loginTip",el=>String(el.textContent||"")).catch(()=>"");
    throw new Error("SOURCE_LOGIN_FAILED"+(tip?": "+tip:""));
  }
}

async function captureMatchEvidence(page,mode,reason,dueTargets){
  const out=[];
  for(const due of dueTargets||[]){
    try{
      const wanted={home:due.home,away:due.away};

      // Step 1: scroll the exact fixture row into view. Do not calculate the
      // screenshot coordinates yet because scrolling changes page/frame offsets.
      const located=await page.evaluate((wanted)=>{
        const clean=s=>String(s||"").normalize("NFKC").toLowerCase().replace(/[^\\p{L}\\p{N}]/gu,"");
        const visible=e=>{try{const r=e.getBoundingClientRect(),s=e.ownerDocument.defaultView.getComputedStyle(e);return r.width>1&&r.height>1&&s.display!=="none"&&s.visibility!=="hidden";}catch(_){return false;}};
        const teamMatch=(source,target)=>{
          if(!source||!target)return false;
          const variants=s=>{
            const out=new Set([s]);
            const suffixes=["women","woman","w","u23","u21","u20","u19","afc","fc","cf","sc","club"];
            for(const x of suffixes)if(s.length>x.length+3&&s.endsWith(x))out.add(s.slice(0,-x.length));
            for(const x of ["fc","cf","sc"])if(s.length>x.length+3&&s.startsWith(x))out.add(s.slice(x.length));
            return [...out];
          };
          return variants(source).some(x=>variants(target).includes(x));
        };
        const docs=[];
        const visit=win=>{
          let doc;try{doc=win.document;}catch(_){return;}
          if(!doc||docs.includes(doc))return;
          docs.push(doc);
          for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}
        };
        visit(window);
        const h=clean(wanted.home),a=clean(wanted.away);
        for(const doc of docs){
          for(const ev of [...doc.querySelectorAll(".tableDiv-match-info__event")].filter(visible)){
            const names=[...ev.querySelectorAll("span")].map(x=>clean(x.textContent)).filter(n=>n&&n!=="draw");
            let ordered=false;
            for(let i=0;i<names.length&&!ordered;i++)if(teamMatch(names[i],h))for(let j=i+1;j<names.length;j++)if(teamMatch(names[j],a)){ordered=true;break;}
            if(!ordered)continue;
            let root=null;
            for(let p=ev.parentElement;p&&p!==doc.body;p=p.parentElement){
              const events=[...p.querySelectorAll(".tableDiv-match-info__event")];
              const times=[...p.querySelectorAll(".panel-time")];
              const odds=[...p.querySelectorAll(".tableDiv-match-odds")];
              if(events.length!==1)break;
              if(times.length===1&&odds.length){root=p;break;}
            }
            if(!root)root=ev.parentElement?.parentElement||ev;
            try{root.scrollIntoView({block:"center",inline:"nearest"});}catch(_){}
            return true;
          }

          // Same adaptive fallback used by the main odds extractor: 3573217 can
          // render team names without the legacy event wrapper. Require home and
          // away inside one compact ancestor that also owns exactly one kickoff
          // and at least one odds block, preventing a broad league-container match.
          const els=[...doc.querySelectorAll("span,td,div,a")].filter(visible);
          const homes=els.filter(e=>teamMatch(clean(e.textContent),h));
          const aways=els.filter(e=>teamMatch(clean(e.textContent),a));
          for(const he of homes){
            for(const ae of aways){
              let p=he;
              for(let depth=0;p&&p!==doc.body&&depth<9;p=p.parentElement,depth++){
                if(!p.contains(ae))continue;
                const times=[...p.querySelectorAll(".panel-time")].filter(visible);
                const odds=[...p.querySelectorAll(".tableDiv-match-odds")].filter(visible);
                const raw=String(p.innerText||p.textContent||"").replace(/\s+/g," ").trim();
                if(times.length!==1||odds.length<1||odds.length>12||raw.length>900)continue;
                try{p.scrollIntoView({block:"center",inline:"nearest"});}catch(_){}
                return true;
              }
            }
          }
        }
        return false;
      },wanted);
      if(!located){
        console.warn("formula-e evidence row not located",due.matchId,due.home,due.away,due.stage,mode);
        continue;
      }
      await new Promise(r=>setTimeout(r,220));

      // Step 2: after scrolling has settled, rebuild the frame geometry and
      // calculate coordinates in TOP-LEVEL PAGE space. This fixes the previous
      // iframe/scroll offset bug that captured an unrelated match row.
      const box=await page.evaluate((wanted)=>{
        const clean=s=>String(s||"").normalize("NFKC").toLowerCase().replace(/[^\\p{L}\\p{N}]/gu,"");
        const visible=e=>{try{const r=e.getBoundingClientRect(),s=e.ownerDocument.defaultView.getComputedStyle(e);return r.width>1&&r.height>1&&s.display!=="none"&&s.visibility!=="hidden";}catch(_){return false;}};
        const teamMatch=(source,target)=>{
          if(!source||!target)return false;
          const variants=s=>{
            const out=new Set([s]);
            const suffixes=["women","woman","w","u23","u21","u20","u19","afc","fc","cf","sc","club"];
            for(const x of suffixes)if(s.length>x.length+3&&s.endsWith(x))out.add(s.slice(0,-x.length));
            for(const x of ["fc","cf","sc"])if(s.length>x.length+3&&s.startsWith(x))out.add(s.slice(x.length));
            return [...out];
          };
          return variants(source).some(x=>variants(target).includes(x));
        };
        const docs=[];
        const visit=(win,ox,oy)=>{
          let doc;try{doc=win.document;}catch(_){return;}
          if(!doc)return;
          docs.push({doc,ox,oy});
          for(const f of [...doc.querySelectorAll("iframe,frame")]){
            try{
              const r=f.getBoundingClientRect();
              if(f.contentWindow)visit(f.contentWindow,ox+r.left,oy+r.top);
            }catch(_){}
          }
        };
        visit(window,Number(window.scrollX||0),Number(window.scrollY||0));
        const h=clean(wanted.home),a=clean(wanted.away);
        const makeBox=(entry,root)=>{
          const rr=root.getBoundingClientRect();
          return {
            x:Math.max(0,entry.ox+rr.left-8),
            y:Math.max(0,entry.oy+rr.top-8),
            width:Math.max(120,rr.width+16),
            height:Math.max(60,rr.height+16)
          };
        };
        for(const entry of docs){
          for(const ev of [...entry.doc.querySelectorAll(".tableDiv-match-info__event")].filter(visible)){
            const names=[...ev.querySelectorAll("span")].map(x=>clean(x.textContent)).filter(n=>n&&n!=="draw");
            let ordered=false;
            for(let i=0;i<names.length&&!ordered;i++)if(teamMatch(names[i],h))for(let j=i+1;j<names.length;j++)if(teamMatch(names[j],a)){ordered=true;break;}
            if(!ordered)continue;
            let root=null;
            for(let p=ev.parentElement;p&&p!==entry.doc.body;p=p.parentElement){
              const events=[...p.querySelectorAll(".tableDiv-match-info__event")];
              const times=[...p.querySelectorAll(".panel-time")];
              const odds=[...p.querySelectorAll(".tableDiv-match-odds")];
              if(events.length!==1)break;
              if(times.length===1&&odds.length){root=p;break;}
            }
            if(!root)root=ev.parentElement?.parentElement||ev;
            return makeBox(entry,root);
          }

          const els=[...entry.doc.querySelectorAll("span,td,div,a")].filter(visible);
          const homes=els.filter(e=>teamMatch(clean(e.textContent),h));
          const aways=els.filter(e=>teamMatch(clean(e.textContent),a));
          for(const he of homes){
            for(const ae of aways){
              let p=he;
              for(let depth=0;p&&p!==entry.doc.body&&depth<9;p=p.parentElement,depth++){
                if(!p.contains(ae))continue;
                const times=[...p.querySelectorAll(".panel-time")].filter(visible);
                const odds=[...p.querySelectorAll(".tableDiv-match-odds")].filter(visible);
                const raw=String(p.innerText||p.textContent||"").replace(/\s+/g," ").trim();
                if(times.length!==1||odds.length<1||odds.length>12||raw.length>900)continue;
                return makeBox(entry,p);
              }
            }
          }
        }
        return null;
      },wanted);
      if(!box){
        console.warn("formula-e evidence box missing",due.matchId,due.home,due.away,due.stage,mode);
        continue;
      }
      const clip={x:box.x,y:box.y,width:box.width,height:box.height};
      const shot=await page.screenshot({type:"png",clip,captureBeyondViewport:true});
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      const safe=(s)=>String(s||"").replace(/[^a-z0-9_-]/gi,"_").slice(0,60);
      const key=`formula-e/evidence/${stamp}-m${due.matchId}-${safe(due.stage)}-${safe(mode)}.png`;
      await storage.put(key,shot,"image/png");
      const ins=await db.query(
        "INSERT INTO formula_e_capture_evidence(scan_reason,mode,storage_key,found_count,note) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [String(reason||""),String(mode||""),key,1,`${due.home} vs ${due.away} · ${due.stage}`]
      );
      const evidenceId=Number(ins.rows?.[0]?.id);
      await db.query(
        "INSERT INTO formula_e_capture_evidence_matches(evidence_id,match_id,stage) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [evidenceId,Number(due.matchId),String(due.stage)]
      );
      out.push({id:evidenceId,key,matchId:Number(due.matchId),stage:String(due.stage),mode:String(mode)});
    }catch(e){
      console.error("formula-e match evidence capture",String(e?.message||e));
    }
  }
  return out;
}

async function forceOddsMode(page,mode){
  return await page.evaluate((wantedMode)=>{
    const docs=[];
    const visit=win=>{
      let doc;try{doc=win.document;}catch(_){return;}
      if(!doc||docs.includes(doc))return;docs.push(doc);
      for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}
    };
    visit(window);
    const mode=String(wantedMode||"").toLowerCase();
    for(const doc of docs){
      for(const f of [...doc.querySelectorAll("iframe,frame")]){
        try{
          const href=String(f.contentWindow?.location?.href||f.src||"");
          if(/\/Member\/BetOdds\/HdpDouble\.aspx/i.test(href)){
            const u=new URL(href,doc.location.href);
            u.searchParams.set("m1",mode==="today"?"Today":"Early");
            f.contentWindow.location.href=u.toString();
            return u.toString();
          }
        }catch(_){}
      }
    }
    return "";
  },mode);
}

async function reloadOddsFrame(page){
  return await page.evaluate(()=>{
    const docs=[];
    const visit=win=>{
      let doc;try{doc=win.document;}catch(_){return;}
      if(!doc||docs.includes(doc))return;docs.push(doc);
      for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}
    };
    visit(window);
    for(const doc of docs){
      for(const f of [...doc.querySelectorAll("iframe,frame")]){
        try{
          const href=String(f.contentWindow?.location?.href||f.src||"");
          if(/\/Member\/BetOdds\/HdpDouble\.aspx/i.test(href)){
            f.contentWindow.location.reload();
            return href;
          }
        }catch(_){}
      }
    }
    return "";
  });
}

async function snapshotStructure(page,mode){
  try{
    return await page.evaluate((m)=>{
      const docs=[];
      const visit=win=>{
        let doc;try{doc=win.document;}catch(_){return;}
        if(!doc||docs.includes(doc))return;docs.push(doc);
        for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}
      };
      visit(window);
      let eventRows=0,marketBlocks=0,ouHeaders=0;
      const centers=[];
      for(const doc of docs){
        eventRows+=doc.querySelectorAll(".tableDiv-match-info__event").length;
        marketBlocks+=doc.querySelectorAll(".tableDiv-match-odds").length;
        for(const e of [...doc.querySelectorAll(".tableDiv-header-sub__text")]){
          const t=String(e.textContent||"").replace(/\s+/g," ").trim().toUpperCase();
          if(t==="O/U"){
            ouHeaders++;
            try{
              const r=e.getBoundingClientRect();
              if(r.width>1)centers.push(Math.round((r.left+r.right)/2));
            }catch(_){}
          }
        }
      }
      return {mode:String(m||""),frames:docs.length,eventRows,marketBlocks,ouHeaders,ouCenters:centers.slice(0,12)};
    },mode);
  }catch(_){return {mode:String(mode||""),frames:0,eventRows:0,marketBlocks:0,ouHeaders:0,ouCenters:[]};}
}

async function openMyFavorites(page){
  const clicked=await clickOddsTab(page,[
    "my favorites","my favourite","my favourites","favorites","favourites","favorite"
  ]);
  if(clicked){
    await new Promise(r=>setTimeout(r,1500));
    return clicked;
  }
  // Some builds expose Favorites through the odds iframe query instead of a tab.
  return await page.evaluate(()=>{
    const docs=[];
    const visit=win=>{
      let doc;try{doc=win.document;}catch(_){return;}
      if(!doc||docs.includes(doc))return;docs.push(doc);
      for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}
    };
    visit(window);
    for(const doc of docs){
      for(const f of [...doc.querySelectorAll("iframe,frame")]){
        try{
          const href=String(f.contentWindow?.location?.href||f.src||"");
          if(!/\/Member\/BetOdds\/HdpDouble\.aspx/i.test(href))continue;
          const u=new URL(href,doc.location.href);
          // Keep the source's own route; only try common Favorites mode labels.
          for(const val of ["Favorite","Favorites","MyFavorite","MyFavorites"]){
            const c=new URL(u.toString());
            c.searchParams.set("m1",val);
            f.contentWindow.location.href=c.toString();
            return c.toString();
          }
        }catch(_){}
      }
    }
    return "";
  });
}

async function listOddsEntries(page){
  return await page.evaluate(()=>{
    const docs=[];
    const visit=win=>{
      let doc;try{doc=win.document;}catch(_){return;}
      if(!doc||docs.includes(doc))return;docs.push(doc);
      for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}
    };
    visit(window);
    const clean=s=>String(s||"").replace(/\s+/g," ").trim();
    const out=[];
    for(const doc of docs){
      for(const el of [...doc.querySelectorAll("a,button,li,span,td")]){
        let r;try{r=el.getBoundingClientRect();}catch(_){continue;}
        if(r.width<=1||r.height<=1)continue;
        const label=clean(el.innerText||el.textContent);
        if(!label||label.length>45)continue;
        const href=String(el.href||el.getAttribute?.("href")||"");
        const onclick=String(el.getAttribute?.("onclick")||"");
        const blob=(href+" "+onclick).toLowerCase();
        const labelLow=label.toLowerCase();
        const likelyOdds=
          /hdpdouble\.aspx|betodds/.test(blob) ||
          /\b(early|today|favorites?|favourites?|running ball|parlay|mix parlay|all)\b/.test(labelLow);
        if(!likelyOdds)continue;
        out.push({label,href,onclick});
      }
    }
    const seen=new Set();
    return out.filter(x=>{
      const k=x.label.toLowerCase();
      if(seen.has(k))return false;seen.add(k);return true;
    }).slice(0,30);
  });
}

async function openOddsEntry(page,label){
  return await page.evaluate((wanted)=>{
    const docs=[];
    const visit=win=>{
      let doc;try{doc=win.document;}catch(_){return;}
      if(!doc||docs.includes(doc))return;docs.push(doc);
      for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}
    };
    visit(window);
    const clean=s=>String(s||"").replace(/\s+/g," ").trim().toLowerCase();
    const w=clean(wanted);
    for(const doc of docs){
      const els=[...doc.querySelectorAll("a,button,li,span,td")];
      const exact=els.find(e=>clean(e.innerText||e.textContent)===w);
      if(exact){try{exact.click();return wanted;}catch(_){}}
    }
    return "";
  },label);
}

async function clickOddsTab(page,words){
  return await page.evaluate((wanted)=>{
    const docs=[];
    const visit=win=>{
      let doc;try{doc=win.document;}catch(_){return;}
      if(!doc||docs.includes(doc))return;docs.push(doc);
      for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}
    };
    visit(window);
    const clean=s=>String(s||"").replace(/\s+/g," ").trim().toLowerCase();
    const visible=el=>{try{const r=el.getBoundingClientRect(),s=el.ownerDocument.defaultView.getComputedStyle(el);return r.width>1&&r.height>1&&s.display!=="none"&&s.visibility!=="hidden";}catch(_){return false;}};
    for(const word of wanted){
      for(const doc of docs){
        const els=[...doc.querySelectorAll("a,button,li,span,div,td")];
        const el=els.find(e=>{const t=clean(e.textContent);return visible(e)&&(t===word||t.startsWith(word+" ")||t.endsWith(" "+word));});
        if(el){try{el.click();return word;}catch(_){}}
      }
    }
    return "";
  },words);
}

async function discoverOddsPage(page){
  const startUrl=await page.url();
  await new Promise(r=>setTimeout(r,1200));

  const inspectAndClick=async(stageWords)=>{
    return await page.evaluate((words)=>{
      const docs=[];
      const visit=win=>{
        let doc;
        try{doc=win.document;}catch(_){return;}
        if(!doc||docs.includes(doc))return;
        docs.push(doc);
        for(const f of [...doc.querySelectorAll("iframe,frame")]){
          try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}
        }
      };
      visit(window);
      const visible=el=>{
        try{
          const r=el.getBoundingClientRect();
          const s=el.ownerDocument.defaultView.getComputedStyle(el);
          return r.width>1&&r.height>1&&s.display!=="none"&&s.visibility!=="hidden";
        }catch(_){return false;}
      };
      const hasOdds=docs.some(doc=>doc.querySelector(".tableDiv-match-info__event")&&doc.querySelector(".tableDiv-header-sub__text"));
      if(hasOdds)return {found:true,clicked:"",frames:docs.length};
      const clean=s=>String(s||"").replace(/\s+/g," ").trim().toLowerCase();
      for(const word of words){
        for(const doc of docs){
          const els=[...doc.querySelectorAll("a,button,li,span,div,td")];
          const el=els.find(e=>{
            const t=clean(e.textContent);
            return visible(e)&&(t===word||t.startsWith(word+" ")||t.endsWith(" "+word));
          });
          if(el){try{el.click();return {found:false,clicked:word,frames:docs.length};}catch(_){}}
        }
      }
      return {found:false,clicked:"",frames:docs.length};
    },stageWords);
  };

  const stages=[
    ["sports","sport","sportsbook"],
    ["football"],
    ["early"]
  ];
  for(const words of stages){
    for(let attempt=0;attempt<4;attempt++){
      const r=await inspectAndClick(words);
      if(r.found)return startUrl;
      if(r.clicked){await new Promise(res=>setTimeout(res,1100));break;}
      await new Promise(res=>setTimeout(res,500));
    }
  }

  for(let i=0;i<12;i++){
    const r=await inspectAndClick([]);
    if(r.found)return startUrl;
    await new Promise(res=>setTimeout(res,750));
  }

  const diag=await page.evaluate(()=>{
    const out=[];
    const visit=(win,depth=0)=>{
      let doc;
      try{doc=win.document;}catch(_){return;}
      const href=(()=>{try{return String(win.location.href||"");}catch(_){return "";}})();
      const body=String(doc.body?.innerText||"").replace(/\s+/g," ").slice(0,700);
      out.push({depth,href,body});
      if(depth<3)for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow,depth+1);}catch(_){}}
    };
    visit(window);
    return out.slice(0,20);
  }).catch(()=>[]);
  throw new Error("SOURCE_ODDS_PAGE_NOT_FOUND start="+startUrl+" frames="+JSON.stringify(diag).slice(0,5000));
}

async function extract(page,wanted,{fast=false}={}){
  return await page.evaluate(({targets,fastMode})=>{
    const docs=[];
    const visit=win=>{
      let doc;
      try{doc=win.document;}catch(_){return;}
      if(!doc||docs.includes(doc))return;
      docs.push(doc);
      for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}
    };
    visit(window);

    const text=e=>String(e?.innerText||e?.textContent||"").replace(/\s+/g," ").trim();
    const norm=s=>String(s||"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
    const visible=e=>{
      try{
        const r=e.getBoundingClientRect(),s=e.ownerDocument.defaultView.getComputedStyle(e);
        return r.width>1&&r.height>1&&s.display!=="none"&&s.visibility!=="hidden";
      }catch(_){return false;}
    };
    const list=(root,sel)=>[...root.querySelectorAll(sel)].filter(visible);
    const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
    const parseKickoff=raw=>{
      const s=String(raw||"").trim();
      const full=s.match(/(\d{1,2})[\/-](\d{1,2})\s+(\d{1,2}):(\d{2})/);
      const pad=n=>String(n).padStart(2,"0");
      if(full){
        const parts=full.slice(1).map(Number),mo=parts[0],da=parts[1],hh=parts[2],mm=parts[3];
        const year=Number(new Intl.DateTimeFormat("en",{timeZone:"Asia/Shanghai",year:"numeric"}).format(new Date()));
        return [year-1,year,year+1]
          .map(y=>`${y}-${pad(mo)}-${pad(da)}T${pad(hh)}:${pad(mm)}:00+08:00`)
          .filter(x=>Number.isFinite(Date.parse(x)))
          .sort((a,b)=>Math.abs(Date.parse(a)-Date.now())-Math.abs(Date.parse(b)-Date.now()))[0]||"";
      }

      // 3573217 sometimes renders only "HH:mm Live" with no date.
      // Treat that clock as Asia/Shanghai and infer the nearest date among
      // yesterday/today/tomorrow in Shanghai time.
      const short=s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/);
      if(!short)return "";
      const hh=Number(short[1]),mm=Number(short[2]);
      if(hh>23||mm>59)return "";
      const fmt=new Intl.DateTimeFormat("en-CA",{
        timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"
      });
      const candidates=[-1,0,1].map(d=>{
        const probe=new Date(Date.now()+d*86400000);
        const parts=Object.fromEntries(fmt.formatToParts(probe).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
        return `${parts.year}-${parts.month}-${parts.day}T${pad(hh)}:${pad(mm)}:00+08:00`;
      }).filter(x=>Number.isFinite(Date.parse(x)));
      return candidates.sort((a,b)=>Math.abs(Date.parse(a)-Date.now())-Math.abs(Date.parse(b)-Date.now()))[0]||"";
    };
    const ouColumn=doc=>{
      const labelled=[];
      const positional=[];
      const subs=list(doc,".tableDiv-header-sub__text").filter(e=>norm(text(e))==="ou");
      for(const sub of subs){
        // First try the original strict semantic path.
        let group=sub.parentElement;
        while(group&&group!==doc.body&&!/first\s*half|half\s*time/i.test(text(group)))group=group.parentElement;
        if(group&&group!==doc.body&&!/full\s*time/i.test(text(group))){
          for(let cell=sub.parentElement;cell&&cell!==group;cell=cell.parentElement){
            if(list(cell,".tableDiv-header-sub__text").length===1){
              const r=rect(cell); if(r.right-r.left>40){labelled.push({cell,rect:r});break;}
            }
          }
        }
        // Cloud iframe fallback: identify the physical O/U header cell even
        // when the parent Full Time / Half Time label lives in another frame.
        for(let cell=sub.parentElement;cell&&cell!==doc.body;cell=cell.parentElement){
          if(list(cell,".tableDiv-header-sub__text").length===1){
            const r=rect(cell);
            if(r.right-r.left>40){positional.push({cell,rect:r});break;}
          }
        }
      }
      const dedupe=arr=>[...new Map(arr.map(x=>[`${Math.round(x.rect.left)}:${Math.round(x.rect.right)}`,x])).values()]
        .sort((a,b)=>a.rect.left-b.rect.left);
      const semantic=dedupe(labelled);
      if(semantic.length===1)return semantic[0];
      const physical=dedupe(positional);
      // The 3573217 desktop table is Full Time on the left and Half Time /
      // First Half on the right. Only use this fallback when exactly two O/U
      // columns are present, preventing accidental cross-market selection.
      if(physical.length===2)return physical[1];
      return null;
    };
    const lineValue=value=>{
      const raw=String(value||"").trim();
      if(!raw)return NaN;
      const parts=raw.split("/").map(Number);
      if(parts.some(x=>!Number.isFinite(x)))return NaN;
      return parts.reduce((a,b)=>a+b,0)/parts.length;
    };
    const canonicalLine=value=>{
      const n=lineValue(value);
      if(!Number.isFinite(n))return String(value||"").trim();
      const q=Math.round(n*4)/4;
      const whole=Math.floor(q);
      const frac=Math.round((q-whole)*100)/100;
      if(Math.abs(frac-0.25)<1e-9)return `${whole}/${whole+0.5}`;
      if(Math.abs(frac-0.75)<1e-9)return `${whole+0.5}/${whole+1}`;
      if(Math.abs(frac-0.5)<1e-9)return String(whole+0.5);
      return String(whole);
    };
    const parseMarket=block=>{
      // Accept both Asian decimal-quarter notation (1.25 / 1.75) and
      // split notation (1/1.5 / 1.5/2). They are the same market.
      const lines=list(block,"b").filter(e=>/^\d+(?:\.(?:25|5|50|75))?(?:\/\d+(?:\.5)?)?$/.test(text(e)));
      const marks=list(block,"p").filter(e=>/^o\s+u$/i.test(text(e)));
      const prices=list(block,"a.odds").filter(e=>/^\d+\.\d{2}$/.test(text(e))).sort((a,b)=>rect(a).top-rect(b).top);
      if(lines.length!==1||marks.length!==1||prices.length!==2)return null;
      return {line:canonicalLine(text(lines[0])),rawLine:text(lines[0]),odds:Number(text(prices[0])),top:rect(block).top,left:rect(block).left};
    };

    const items=[];
    const diagnostics=[];
    const sameLine=(a,b)=>{
      const av=lineValue(a),bv=lineValue(b);
      if(Number.isFinite(av)&&Number.isFinite(bv))return Math.abs(av-bv)<1e-9;
      return String(a||"").trim()===String(b||"").trim();
    };
    const teamMatch=(source,target)=>{
      if(!source||!target)return false;
      const variants=s=>{
        const out=new Set([s]);
        // Gender and age-group markers are part of team identity. Only
        // ordinary club affixes may be removed, never Women/W/U21/etc.
        const suffixes=["afc","fc","cf","sc","club"];
        for(const x of suffixes)if(s.length>x.length+3&&s.endsWith(x))out.add(s.slice(0,-x.length));
        for(const x of ["afc","fc","cf","sc"])if(s.length>x.length+3&&s.startsWith(x))out.add(s.slice(x.length));
        return [...out];
      };
      const sv=variants(source),tv=variants(target);
      return sv.some(x=>tv.includes(x));
    };
    for(const target of targets){
      const h=norm(target.home),a=norm(target.away);
      const rowCandidates=[];
      for(const doc of docs){
        for(const event of list(doc,".tableDiv-match-info__event")){
          const eventRaw=text(event);
          // Only the canonical match row is eligible for Formula D. 3573217
          // repeats the same team names in derivative markets (corners, bookings,
          // 15-minute segments, team over/under, etc.). Those rows must never be
          // allowed to update or roll over the main FIRST HALF O/U tracker.
          if(/no\.of corners|total bookings|1st booking|1st corner|\(\d{2}:\d{2}-\d{2}:\d{2}\)|\s-\s*(?:over|under)\b|corners?\b/i.test(eventRaw))continue;
          const names=list(event,"span").map(e=>norm(text(e))).filter(n=>n&&n!=="draw");
          let best=null;
          for(let i=0;i<names.length;i++){
            if(!teamMatch(names[i],h))continue;
            for(let j=i+1;j<names.length;j++){
              if(!teamMatch(names[j],a))continue;
              const exact=(names[i]===h?2:1)+(names[j]===a?2:1);
              const spanGap=j-i;
              const score=exact*100-spanGap;
              if(!best||score>best.score)best={score,i,j,names};
            }
          }
          if(best)rowCandidates.push({event,doc,score:best.score,names:best.names});
        }
      }
      // Fallback for 3573217 layouts where team names are visible but the
      // legacy .tableDiv-match-info__event wrapper is absent or temporarily changed.
      // Find visible home/away text elements, require both teams inside the SAME
      // ancestor that also owns a kickoff and odds blocks, then use that ancestor
      // as the fixture anchor. This is stricter than a page-wide text match.
      if(!rowCandidates.length){
        for(const doc of docs){
          // Some 3573217 fixtures render team names only inside DIV-based
          // match containers. Fast scans must include DIVs too, but cap the search
          // so we do not recreate the previous browser-farm timeout.
          const els=list(doc,"span,td,div,a").slice(0,6000);
          const homes=els.filter(e=>teamMatch(norm(text(e)),h)).slice(0,40);
          const aways=els.filter(e=>teamMatch(norm(text(e)),a)).slice(0,40);
          for(const he of homes){
            for(const ae of aways){
              let p=he;
              for(let depth=0;p&&p!==doc.body&&depth<9;p=p.parentElement,depth++){
                if(!p.contains(ae))continue;
                const timeCount=list(p,".panel-time").length;
                const oddsCount=list(p,".tableDiv-match-odds").length;
                const rawText=text(p);
                // Reject derivative markets that reuse the same team names.
                if(/no\.of corners|total bookings|1st booking|1st corner|\(\d{2}:\d{2}-\d{2}:\d{2}\)|\s-\s*(?:over|under)\b|corners?\b/i.test(rawText))continue;
                // Never accept a broad page/league container: it can contain home
                // in one fixture and away in another, creating a false match.
                if(timeCount!==1||oddsCount<1||oddsCount>12||rawText.length>900)continue;
                const names=[norm(text(he)),norm(text(ae))];
                const exact=(names[0]===h?2:1)+(names[1]===a?2:1);
                rowCandidates.push({event:p,doc,score:exact*100-1,names,fallback:true,rootHint:p});
                break;
              }
            }
          }
        }
      }
      rowCandidates.sort((x,y)=>y.score-x.score);
      const topScore=rowCandidates[0]?.score;
      const top=(topScore==null?[]:rowCandidates.filter(x=>x.score===topScore));
      const uniqueByText=[...new Map(top.map(x=>[norm(text(x.event)),x])).values()];
      if(uniqueByText.length!==1){
        diagnostics.push(`${target.home} vs ${target.away}: team row not unique (${uniqueByText.length}) candidates=${rowCandidates.length}`);
        continue;
      }
      const {event,doc,rootHint}=uniqueByText[0];
      const column=ouColumn(doc);
      if(!column){
        const hdr=list(doc,".tableDiv-header-sub__text").map(e=>({
          text:text(e),
          left:Math.round(rect(e).left),
          right:Math.round(rect(e).right),
          p1:text(e.parentElement).slice(0,80),
          p2:text(e.parentElement?.parentElement).slice(0,140)
        })).slice(0,20);
        diagnostics.push(`${target.home} vs ${target.away}: FIRST HALF O/U column missing headers=${JSON.stringify(hdr)}`);
        continue;
      }
      let root=rootHint||null;
      // Adaptive fallback rows already carry their verified minimal shared
      // home+away+odds container. Legacy rows still use the original climb.
      if(!root && list(event,".panel-time").length>=1&&list(event,".tableDiv-match-odds").length){
        root=event;
      }else if(!root){
        for(let p=event.parentElement;p&&p!==doc.body;p=p.parentElement){
          const legacyEvents=list(p,".tableDiv-match-info__event").length;
          if(legacyEvents>1)break;
          if(list(p,".panel-time").length===1&&list(p,".tableDiv-match-odds").length){root=p;break;}
        }
      }
      if(!root){diagnostics.push(`${target.home} vs ${target.away}: fixture container not found`);continue;}
      const kickoffRaw=text(list(root,".panel-time")[0]);
      // Formula D already owns the verified fixture date. 3573217 often renders
      // only HH:mm; never infer a new calendar date from that short clock.
      // Use source date only when MM/DD or MM-DD is explicitly present.
      const parsedKickoff=parseKickoff(kickoffRaw);
      // The tracked fixture kickoff is authoritative once resolved/confirmed.
      // 3573217 is an odds source, not allowed to shift a fixture to another
      // calendar day. Only use its parsed clock/date when the fixture has no
      // stored kickoff yet.
      const kickoff=String(target.kickoff||"")||parsedKickoff;
      const candidates=[];
      const allParsed=[];

      // IMPORTANT: 3573217 can show multiple alternate FIRST HALF O/U lines for
      // the SAME fixture (usually up to four). Their vertical order changes as
      // prices move. The locked line must be followed anywhere inside this group;
      // never treat only the first/main visual row as authoritative.
      // Expand from the team-name row to the largest DOM container that still
      // belongs to exactly ONE fixture. 3573217 visually paints each fixture as
      // one alternating background-colour block (blue/white in the desktop UI).
      // The extra O/U rows live inside that same fixture container even when they
      // sit below the first visible team row.
      let fixtureRoot=root;
      for(let p=root.parentElement;p&&p!==doc.body;p=p.parentElement){
        const visibleTimes=list(p,".panel-time");
        if(visibleTimes.length!==1)break;
        const raw=text(p);
        // Stop before a league/page wrapper. A single fixture including its
        // alternate prices is compact; broad containers become very large.
        if(raw.length>2400)break;
        fixtureRoot=p;
      }

      const rr=rect(fixtureRoot);
      // Never treat this fixture's own time cell as the next fixture.
      // The old boundary calculation could close the band above row 2/3/4 and
      // make a valid fixture look like it had no FIRST HALF O/U markets.
      const currentTimes=list(fixtureRoot,".panel-time");
      const currentTimeTop=currentTimes.length?Math.min(...currentTimes.map(e=>rect(e).top)):rr.top;
      const timeEls=list(doc,".panel-time")
        .filter(e=>!fixtureRoot.contains(e))
        .map(e=>({e,r:rect(e)}))
        .filter(x=>x.r.top>currentTimeTop+8)
        .sort((a,b)=>a.r.top-b.r.top);
      const nextFixtureTop=timeEls[0]?.r.top;
      const bandBottom=Number.isFinite(nextFixtureTop)?nextFixtureTop-2:rr.bottom+260;

      // Visual background helper: alternate fixture colours are used as a
      // secondary boundary check. Transparent descendants inherit their nearest
      // painted ancestor, which corresponds to the fixture's blue/white block.
      const bgKey=e=>{
        for(let p=e;p&&p!==doc.body;p=p.parentElement){
          try{
            const c=p.ownerDocument.defaultView.getComputedStyle(p).backgroundColor;
            if(c&&c!=="transparent"&&c!=="rgba(0, 0, 0, 0)")return c;
          }catch(_){}
        }
        return "";
      };
      const fixtureBg=bgKey(event)||bgKey(root)||bgKey(fixtureRoot);

      const fixtureBlocks=list(doc,".tableDiv-match-odds").filter(block=>{
        const br=rect(block),cy=(br.top+br.bottom)/2;
        const horizontal=Math.max(0,Math.min(br.right,column.rect.right)-Math.max(br.left,column.rect.left));
        if(!(cy>=rr.top-8&&cy<=bandBottom&&horizontal/Math.max(1,br.right-br.left)>=0.35))return false;
        // Prefer blocks from the same painted fixture group. If the site renders
        // transparent backgrounds, containment/vertical boundaries remain the fallback.
        const bbg=bgKey(block);
        return !fixtureBg||!bbg||bbg===fixtureBg||fixtureRoot.contains(block);
      });

      for(const block of fixtureBlocks){
        const r=rect(block);
        const center=(r.left+r.right)/2;
        const overlap=Math.max(0,Math.min(r.right,column.rect.right)-Math.max(r.left,column.rect.left));
        const width=Math.max(1,r.right-r.left);
        const c=parseMarket(block);
        if(c)allParsed.push({...c,center,width});
        // 3573217 shifts column widths slightly between Early/Today and during
        // live repaint. Accept a market block when its center lies in the FIRST
        // HALF O/U column, or when at least half of the block overlaps that column.
        if(!(center>=column.rect.left-4&&center<=column.rect.right+4) && overlap/width<0.5)continue;
        if(c)candidates.push(c);
      }
      candidates.sort((a,b)=>a.top-b.top||a.left-b.left);
      if(!kickoff||!candidates.length){
        diagnostics.push(`${target.home} vs ${target.away}: ${!kickoff?`kickoff missing raw=${kickoffRaw||"(empty)"}`:"market missing"}`);
        continue;
      }
      let selected=null;
      let rollover=false;
      const locked=String(target.lockedLine||"").trim();
      if(locked){
        // Keep following the exact locked line while it is still offered.
        selected=candidates.find(c=>sameLine(c.line,locked))||null;
        if(!selected){
          // Rescue the locked line from transient column-geometry drift near kickoff.
          // Search every parsed market block and accept the same locked line only when
          // it still sits close to the detected FIRST HALF O/U column.
          const colCenter=(column.rect.left+column.rect.right)/2;
          const colWidth=Math.max(1,column.rect.right-column.rect.left);
          const rescue=allParsed
            .filter(c=>sameLine(c.line,locked)&&Math.abs(c.center-colCenter)<=Math.max(36,colWidth*0.7))
            .sort((a,b)=>Math.abs(a.center-colCenter)-Math.abs(b.center-colCenter))[0]||null;
          if(rescue){
            selected={line:rescue.line,odds:rescue.odds,top:rescue.top,left:rescue.left};
            diagnostics.push(`${target.home} vs ${target.away}: locked line ${locked} rescued from FIRST HALF O/U column drift`);
          }
        }
        if(!selected){
          // 3573217 can repaint a market block so parseMarket() temporarily fails
          // even though the original locked line and its price are still visible.
          // Search ALL market blocks in the same fixture's vertical band that overlap
          // the detected FIRST HALF O/U column, including sibling blocks outside root.
          const rawColumnBlocks=fixtureBlocks;
          const lockedBlock=rawColumnBlocks.find(block=>list(block,"b").some(e=>sameLine(text(e),locked)))||null;
          if(lockedBlock){
            const prices=list(lockedBlock,"a.odds")
              .filter(e=>/^\d+\.\d{2}$/.test(text(e)))
              .sort((a,b)=>rect(a).top-rect(b).top);
            if(prices.length){
              const br=rect(lockedBlock);
              selected={line:locked,odds:Number(text(prices[0])),top:br.top,left:br.left};
              diagnostics.push(`${target.home} vs ${target.away}: locked line ${locked} rescued from raw FIRST HALF O/U block @ ${selected.odds}`);
            }else{
              diagnostics.push(`${target.home} vs ${target.away}: locked line ${locked} visible in raw FIRST HALF O/U block but price unresolved; rollover blocked`);
              continue;
            }
          }
          if(!selected){
            const rawLockedLabels=list(root,"b").filter(e=>sameLine(text(e),locked));
            const lockedStillVisible=allParsed.some(c=>sameLine(c.line,locked))||rawLockedLabels.length>0;
            if(lockedStillVisible){
              diagnostics.push(`${target.home} vs ${target.away}: locked line ${locked} still visible in raw fixture DOM; rollover blocked`);
              continue;
            }
            selected=candidates[0];
            for(const c of candidates)if(Math.abs(c.odds-1.88)<Math.abs(selected.odds-1.88)-1e-9)selected=c;
            rollover=true;
            diagnostics.push(`${target.home} vs ${target.away}: locked line ${locked} absent from raw FIRST HALF O/U and fixture DOM; continuation candidate ${selected.line} @ ${selected.odds}`);
          }
        }
      }else{
        // Before the first line is locked, choose the Over price closest to 1.88.
        selected=candidates[0];
        for(const c of candidates)if(Math.abs(c.odds-1.88)<Math.abs(selected.odds-1.88)-1e-9)selected=c;
      }
      items.push({id:target.id,line:selected.line,odds:selected.odds,kickoff,kickoffRaw,rollover});
    }
    return {items,diagnostic:diagnostics.join("; "),frames:docs.length};
  },{targets:wanted,fastMode:!!fast});
}

function captureTargets(kickoffMs){
  const out=[];
  for(let h=12;h>=2;h--)out.push({kind:`t${h}h`,at:kickoffMs-h*60*60000});
  out.push({kind:"last_1hr",at:kickoffMs-60*60000});
  out.push({kind:"last_5min",at:kickoffMs-5*60000});
  return out;
}
function targetToleranceMs(kind){
  // Hourly checkpoints use a one-way +10 minute backfill window.
  // Last 5min retries retain a one-minute scheduling tolerance.
  return kind==="last_5min" ? 60*1000 : 10*60*1000;
}
function inTargetWindow(ms,target){
  if(target.kind==="last_5min")return ms>=target.at && ms<target.at+5*60*1000;
  return ms>=target.at && ms<=target.at+10*60*1000;
}
function canWriteSnapshot(sampleMs,writeMs,target){
  // An old retry anchor must never authorize an early write or a T-5 write
  // after kickoff. Keep millisecond precision; no rounded scheduler time.
  if(writeMs<target.at)return false;
  if(target.kind==="last_5min" && writeMs>=target.at+5*60*1000)return false;
  return inTargetWindow(sampleMs,target);
}
function evidenceStage(kind){
  if(kind==="last_1hr")return "T-1";
  if(kind==="last_5min")return "T-5min";
  const m=String(kind||"").match(/^t(\d+)h$/);
  return m?"T-"+m[1]:String(kind||"");
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

async function saveItems(items,{targetAt=null}={}){
  const nowMs=Date.now();
  const targetAnchorMs=Date.parse(String(targetAt||""));
  let saved=0;
  const pendingRolloverIds=[];
  for(const item of items){
    const id=Number(item.id), odds=validOdds(item.odds), line=String(item.line||"").trim().slice(0,20);
    const kickoffMs=Date.parse(String(item.kickoff||""));
    const rollover=Boolean(item.rollover);
    if(!Number.isInteger(id)||!odds||!line||!Number.isFinite(kickoffMs))continue;
    if(kickoffMs<nowMs-60000)continue;

    const state=(await db.query("SELECT selected_line,current_odds,rollover_candidate_line,rollover_candidate_odds,rollover_candidate_target_at,rollover_candidate_count FROM formula_e_matches WHERE id=$1",[id])).rows?.[0]||{};
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
      [item.kickoff,line,odds,id,baselineNow,inT12Window,rollover]
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

    const prior=await db.query(
      "SELECT sample_kind FROM formula_e_odds_snapshots WHERE match_id=$1 AND selected_line=$2",
      [id,line]
    );
    const kinds=new Set((prior.rows||[]).map(r=>String(r.sample_kind||"")));

    for(const target of captureTargets(kickoffMs)){
      if(kinds.has(target.kind))continue;
      // Normal runs use the real scan time. Retry-chain runs keep the original
      // checkpoint anchor so a temporarily missing fixture can still be saved
      // into its intended T-1/T-5/hourly slot when it is finally recovered.
      // Never let a future targetAt timestamp back-date an early scan into a
      // checkpoint. targetAt may anchor delayed recovery AFTER the target, but if
      // the actual scan is still before targetAt, use the real scan time.
      const compareMs=Number.isFinite(targetAnchorMs)&&nowMs>=targetAnchorMs?targetAnchorMs:nowMs;
      if(canWriteSnapshot(compareMs,Date.now(),target)){
        await db.query(
          "INSERT INTO formula_e_odds_snapshots(match_id,sample_kind,selected_line,odds,observed_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING",
          [id,target.kind,line,odds]
        );
      }
    }
    saved++;
  }

  // Only one future timeline task is armed at a time, regardless of how many
  // fixtures or kickoff times are in the batch. After each run it schedules
  // the next earliest T-12/T-11/.../T-1/T-5 target.
  await scheduleNextTimeline();
  return {saved,pendingRolloverIds};
}

export async function cloudScan({reason="scheduled",matchId=null,targetAt=null}={}){
  let all=(await targets()).filter(x=>!matchId||x.id===Number(matchId));

  // HARD PRIORITY RULE: official timeline captures own the browser around every
  // T checkpoint. All other Formula D cloud work (manual, rollover, retries,
  // one-shot helpers) must stop BEFORE opening a browser so the official odds
  // pull has uncontested capacity.
  if(reason!=="timeline"){
    const now=Date.now();
    const active=(await targets());
    let protectedTarget=null;
    for(const t of active){
      const k=Date.parse(String(t.kickoff||""));
      if(!Number.isFinite(k))continue;
      for(const cp of captureTargets(k)){
        // Reserve a wide window so a long manual scan cannot overlap the
        // scheduled prewarm/capture. Official pull is the only allowed job.
        if(now>=cp.at-10*60*1000 && now<=cp.at+10*60*1000){
          protectedTarget=cp;
          break;
        }
      }
      if(protectedTarget)break;
    }
    if(protectedTarget){
      await setState({
        credential_status:"configured",
        last_status:"paused",
        last_message:`Formula D non-timeline work paused for official ${protectedTarget.kind} capture priority.`,
        last_run_at:new Date().toISOString(),
        last_found:0,last_saved:0
      });
      return {
        ok:true,pausedForTimeline:true,found:0,saved:0,
        message:`Paused for official Formula D ${protectedTarget.kind} capture priority.`
      };
    }
  }

  // On kickoff-anchored timeline runs, only touch fixtures that are actually
  // due at this target. This avoids re-reading every tracked match from
  // 3573217 when only one kickoff group needs a sample.
  if(reason==="timeline" && targetAt){
    const anchor=Date.parse(String(targetAt));
    if(Number.isFinite(anchor)){
      all=all.filter(t=>{
        const k=Date.parse(String(t.kickoff||""));
        if(!Number.isFinite(k))return false;
        return captureTargets(k).some(cp=>inTargetWindow(anchor,cp));
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
      await page.setViewport({width:1440,height:1100});
      await login(page,username,password);
      const sourceUrl=await discoverOddsPage(page);

      // Timeline jobs start early to absorb login/navigation latency, then wait
      // inside the already-open browser session until the exact target timestamp.
      const targetMs=Date.parse(String(targetAt||""));
      if(reason==="timeline"&&Number.isFinite(targetMs)){
        const waitMs=targetMs-Date.now();
        // T-5 prewarms five minutes early. Keep the browser session alive and
        // wait until the exact checkpoint instead of scanning immediately.
        const maxWaitMs=6*60*1000;
        if(waitMs>0&&waitMs<=maxWaitMs)await new Promise(r=>setTimeout(r,waitMs));
      }

      const scanMs=Date.now();
      const isFormalCheckpoint=reason==="timeline" && Number.isFinite(targetMs);
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
        const reloaded=await reloadOddsFrame(page);
        if(reloaded){
          await new Promise(r=>setTimeout(r,1800));
          for(let i=0;i<6;i++){
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
          await page.reload({waitUntil:"domcontentloaded",timeout:20000});
          await new Promise(r=>setTimeout(r,1500));
          await discoverOddsPage(page);
          await forceOddsMode(page,preferredMode);
          await new Promise(r=>setTimeout(r,1800));
          for(let i=0;i<6;i++){
            const probe=await extract(page,all);
            data=mergeProbe(data,probe);
            if((data.items||[]).length===all.length)break;
            await new Promise(r=>setTimeout(r,900));
          }
        }catch(_){}
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
    const saveResult=await saveItems(result.items||[],{targetAt});
    const saved=Number(saveResult?.saved||0);
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
    await writeScanAudit({reason,targets:all,items:result.items||[],diagnostic:result.diagnostic||"",pendingRolloverIds});
    const foundIds=new Set((result.items||[]).map(x=>Number(x.id)));
    const missingMatchIds=all.map(x=>Number(x.id)).filter(id=>!foundIds.has(id));
    return {
      ok:true,found,expected:all.length,saved,missingMatchIds,pendingRolloverIds,
      sourceUrl:result.sourceUrl,diagnostic:complete?"":statusMessage,
      matchedItems:(result.items||[]).map(x=>({
        id:Number(x.id),line:String(x.line||""),odds:Number(x.odds),kickoff:String(x.kickoff||""),rollover:Boolean(x.rollover)
      }))
    };
  }catch(e){
    await setState({credential_status:"configured",last_status:"error",last_message:String(e?.message||e).slice(0,1500),last_run_at:started,last_found:0,last_saved:0});
    throw e;
  }
}

export async function debugTeamSearch({home,away}={}){
  const {username,password}=creds();
  return await browser.session(async page=>{
    await page.setViewport({width:1440,height:1100});
    await login(page,username,password);
    await discoverOddsPage(page);
    const wanted={home:String(home||""),away:String(away||"")};
    const scanMode=async mode=>{
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
    SELECT match_id,home,away,reason,status,stage,detail,selected_line,odds,kickoff_at,created_at
    FROM formula_e_scan_audit
    ORDER BY id DESC
    LIMIT 20
  `);
  return {...state,recent_audits:a.rows||[]};
}
