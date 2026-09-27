import { db, storage } from "hatchable";
import { createLineNormalizer } from "lib/formula-d-odds/line-normalizer.js";
import { createTeamMatcher } from "lib/formula-d-odds/team-matcher.js";
import { createMarketParser } from "lib/formula-d-odds/market-parser.js";
import { createOddsSelector } from "lib/formula-d-odds/odds-selector.js";

const SOURCE = "https://www.3573217.com/";

export async function login(page,username,password){
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

export async function captureMatchEvidence(page,mode,reason,dueTargets){
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

export async function forceOddsMode(page,mode){
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

export async function reloadOddsFrame(page){
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

export async function snapshotStructure(page,mode){
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

export async function openMyFavorites(page){
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

export async function listOddsEntries(page){
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

export async function openOddsEntry(page,label){
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

export async function clickOddsTab(page,words){
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

export async function discoverOddsPage(page){
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

export async function extract(page,wanted,{fast=false}={}){
  const scan=({targets,fastMode})=>{
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
    const {lineValue,canonicalLine,sameLine}=__lineNormalizer();
    const {ouColumn,parseMarket}=__marketParser({list,norm,text,rect,canonicalLine});

    const items=[];
    const diagnostics=[];
    const {teamMatch}=__teamMatcher();
    const {nearestOver}=__oddsSelector();
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
            selected=nearestOver(candidates);
            rollover=true;
            diagnostics.push(`${target.home} vs ${target.away}: locked line ${locked} absent from raw FIRST HALF O/U and fixture DOM; continuation candidate ${selected.line} @ ${selected.odds}`);
          }
        }
      }else{
        // Before the first line is locked, choose the Over price closest to 1.88.
        selected=nearestOver(candidates);
      }
      items.push({id:target.id,line:selected.line,odds:selected.odds,kickoff,kickoffRaw,rollover});
    }
    return {items,diagnostic:diagnostics.join("; "),frames:docs.length};
  };
  // page.evaluate serializes the function, so imported lexical bindings cannot
  // cross into the browser. Compose self-contained factories on the server;
  // the resulting browser callback contains ordinary code, not browser eval.
  const source=scan.toString()
    .replace("__lineNormalizer()", "("+createLineNormalizer.toString()+")()")
    .replace("__teamMatcher()", "("+createTeamMatcher.toString()+")()")
    .replace("__marketParser", "("+createMarketParser.toString()+")")
    .replace("__oddsSelector()", "("+createOddsSelector.toString()+")()");
  const callback=new Function("return ("+source+")")();
  return await page.evaluate(callback,{targets:wanted,fastMode:!!fast});
}

