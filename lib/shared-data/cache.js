import { trackedFetch } from "lib/tracked-fetch.js";
export const STANDINGS_TTL_MS=30000;
export const SCHEDULE_TTL_MS=15000;
function clone(value){return JSON.parse(JSON.stringify(value));}
export function createCache(now=()=>Date.now()){
  const entries=new Map(),pending=new Map();
  return {
    async get(key,loader,{ttlMs=0,forceRefresh=false}={}){
      const hit=entries.get(key);
      if(!forceRefresh&&hit&&now()<hit.expires)return clone(hit.value);
      if(!forceRefresh&&pending.has(key))return clone(await pending.get(key));
      const task=Promise.resolve().then(loader);
      pending.set(key,task);
      try{
        const value=await task;
        if(pending.get(key)===task&&ttlMs>0){
          entries.set(key,{value:clone(value),expires:now()+ttlMs});
          // Bound memory without extending any entry's freshness.
          for(const [k,v] of entries)if(v.expires<=now())entries.delete(k);
          if(entries.size>256)entries.delete(entries.keys().next().value);
        }
        return clone(value);
      }finally{if(pending.get(key)===task)pending.delete(key);}
    },
    invalidate(predicate=()=>true){for(const k of new Set([...entries.keys(),...pending.keys()]))if(predicate(k)){entries.delete(k);pending.delete(k);}},
  };
}
const providerCache=createCache();
export async function getProviderJson(path,{forceRefresh=false}={}){
  const ttlMs=path.startsWith('/leagues?')?STANDINGS_TTL_MS:path.startsWith('/teams?')?SCHEDULE_TTL_MS:0;
  return providerCache.get(path,async()=>{
    const r=await trackedFetch('https://www.fotmob.com/api/data'+path,{timeout_ms:12000,headers:{'user-agent':'Mozilla/5.0','accept':'application/json'}});
    if(!r.ok)throw new Error('FotMob HTTP '+r.status);
    return r.json();
  },{ttlMs,forceRefresh});
}
export function invalidateMatchData(teamIds=[],leagueId){
  const teams=new Set(teamIds.map(String));
  providerCache.invalidate(key=>{
    const id=String(key).match(/[?&]id=([^&]+)/)?.[1];
    return (key.startsWith('/teams?')&&teams.has(id))||(key.startsWith('/leagues?')&&String(leagueId)===id);
  });
}
