(()=>{
const $=id=>document.getElementById(id);

async function fileToOptimizedDataUrl(file){
  if(!file)throw new Error("没有选择图片");
  if(!/^image\//i.test(file.type||""))throw new Error("请选择图片文件");
  const raw=await new Promise((resolve,reject)=>{
    const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=()=>reject(new Error("图片读取失败"));fr.readAsDataURL(file);
  });
  try{
    const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=raw;});
    const max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));
    const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    const c=document.createElement("canvas");c.width=w;c.height=h;
    c.getContext("2d",{alpha:false}).drawImage(img,0,0,w,h);
    return c.toDataURL("image/jpeg",0.86);
  }catch(e){
    if(String(raw).length>8_000_000)throw new Error("图片过大或格式暂不支持，请截图后再上传");
    return raw;
  }
}
function fixturesText(arr){return (arr||[]).map(x=>x.home+" vs "+x.away).join("\n");}
function attach(btnId,inputId,targetId,statusId){
  const btn=$(btnId),file=$(inputId),target=$(targetId),status=$(statusId);
  if(!btn||!file||!target)return;
  btn.addEventListener("click",()=>file.click());
  file.addEventListener("change",async()=>{
    const f=file.files?.[0]; if(!f)return;
    btn.disabled=true;
    if(status)status.textContent="正在读取图片并识别球队…";
    try{
      const imageDataUrl=await fileToOptimizedDataUrl(f);
      const r=await fetch("/api/read-team-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageDataUrl})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok){
        if(j.setupRequired)throw new Error("图片识别尚未配置 AI：请先在 Hatchable Setup 中配置 OpenAI API Key。");
        throw new Error(j.error||"图片识别失败");
      }
      if(!j.fixtures?.length)throw new Error("图片里没有识别到可靠的比赛球队");
      target.value=fixturesText(j.fixtures);
      target.dispatchEvent(new Event("input",{bubbles:true}));
      if(status){
        const low=j.fixtures.filter(x=>x.confidence!=null&&x.confidence<0.75).length;
        status.textContent="已识别 "+j.fixtures.length+" 场"+(low?("；其中 "+low+" 场置信度较低，请核对球队名称"):"，请核对后直接生成 Excel");
      }
    }catch(e){
      if(status)status.textContent=e?.message||String(e);
    }finally{
      btn.disabled=false;file.value="";
    }
  });
}
attach("aImageRead","aImageFile","aBatchFixtures","aBatchStatus");
attach("bImageRead","bImageFile","bBatchFixtures","bStatus");
attach("cImageRead","cImageFile","cFixtures","cStatus");
attach("eImageRead","eImageFile","eFixtures","eStatus");
})();