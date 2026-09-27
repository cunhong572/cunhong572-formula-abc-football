// A switch is not ready merely because a fixed delay elapsed. Mark the old
// documents; require a new document or changed odds DOM, then two stable reads.
export async function oddsPageState(page,mark=null) {
  return page.evaluate(token=>{
    const docs=[];
    const visit=win=>{let doc;try{doc=win.document;}catch(_){return;}
      if(!doc||docs.includes(doc))return;docs.push(doc);
      for(const frame of doc.querySelectorAll('iframe,frame'))try{visit(frame.contentWindow);}catch(_){}
    };
    visit(window);
    const odds=docs.filter(doc=>/BetOdds|HdpDouble/i.test(String(doc.location?.href||''))||doc.querySelectorAll('.tableDiv-header-sub__text').length);
    return odds.map(doc=>{
      if(token)doc.__formulaDNavigationToken=token;
      const text=String(doc.body?.innerText||doc.body?.textContent||'');
      const rows=doc.querySelectorAll('.tableDiv-match-info__event,.panel-time').length;
      const signature=[String(doc.location?.href||''),...Array.from(doc.querySelectorAll('.tableDiv-match-info__event,.panel-time,.tableDiv-match-odds,.tableDiv-header-sub__text')).map(el=>String(el.textContent||''))].join('|');
      const loading=Array.from(doc.querySelectorAll('[aria-busy="true"],.loading,.spinner')).some(el=>{
        const r=el.getBoundingClientRect();return r.width>0&&r.height>0;
      });
      return {token:doc.__formulaDNavigationToken||null,signature,rows,
        ready:doc.readyState==='complete'&&!loading,empty:/no (?:events|matches|games)|暂无赛事|没有赛事/i.test(text)};
    });
  },mark);
}
export async function waitForOddsReady(page,before,token,{timeoutMs=6000,checkpoint=async()=>{},now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  const deadline=now()+timeoutMs;let last='',stable=0;
  while(now()<deadline) {
    await checkpoint();
    let states=[];try{states=await oddsPageState(page);}catch(_){}
    const fresh=states.filter(s=>s.ready&&(s.token!==token||!before.some(b=>b.signature===s.signature)));
    const populated=fresh.filter(s=>s.rows>0);
    const signature=JSON.stringify(populated.map(s=>s.signature));
    if(populated.length&&signature===last)stable++;else stable=0;
    if(stable>=1)return true;
    if(fresh.length&&fresh.every(s=>s.empty&&!s.rows))return false;
    last=signature;
    await sleep(200);
  }
  return false;
}
export async function switchAndWait(page,open,{checkpoint=async()=>{}}={}) {
  await checkpoint();
  const token=String(Date.now())+':'+Math.random();
  const before=await oddsPageState(page,token);
  if(!await open())return false;
  return waitForOddsReady(page,before,token,{checkpoint});
}
