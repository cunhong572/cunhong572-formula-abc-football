// DOM helpers are supplied by the scanner; no browser globals at module load.
export function createMarketParser({list,norm,text,rect,canonicalLine}){
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
    const parseMarket=block=>{
      // Accept both Asian decimal-quarter notation (1.25 / 1.75) and
      // split notation (1/1.5 / 1.5/2). They are the same market.
      const lines=list(block,"b").filter(e=>/^\d+(?:\.(?:25|5|50|75))?(?:\/\d+(?:\.5)?)?$/.test(text(e)));
      const marks=list(block,"p").filter(e=>/^o\s+u$/i.test(text(e)));
      const prices=list(block,"a.odds").filter(e=>/^\d+\.\d{2}$/.test(text(e))).sort((a,b)=>rect(a).top-rect(b).top);
      if(lines.length!==1||marks.length!==1||prices.length!==2)return null;
      return {line:canonicalLine(text(lines[0])),rawLine:text(lines[0]),odds:Number(text(prices[0])),top:rect(block).top,left:rect(block).left};
    };

    return {ouColumn,parseMarket};
}
