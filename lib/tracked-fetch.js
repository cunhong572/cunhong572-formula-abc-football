import { addDailyUsage } from "lib/formula-usage.js";

export async function trackedFetch(url,options={},category="site_external"){
  const r=await fetch(url,options);
  try{
    const clone=r.clone();
    const buf=await clone.arrayBuffer();
    await addDailyUsage(buf.byteLength,category,{includeTotal:true,throwOnCap:false});
  }catch(e){
    try{
      const n=Number(r.headers?.get?.("content-length"));
      if(Number.isFinite(n)&&n>0)await addDailyUsage(n,category,{includeTotal:true,throwOnCap:false});
    }catch(_){}
  }
  return r;
}