import { db } from "hatchable";

export const DAILY_SCAN_LIMIT_BYTES=300*1024*1024;
export const DAILY_SCAN_LIMIT_MB=300;
export const SCAN_USAGE_CATEGORY="historical_learning";
export const TOTAL_USAGE_CATEGORY="whole_site";
const UNKNOWN_RESPONSE_RESERVE_BYTES=5*1024*1024;

export function nyDateKey(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const m=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return m.year+"-"+m.month+"-"+m.day;
}

export class DailyUsageCapError extends Error{
  constructor(message="Daily historical learning traffic cap reached."){
    super(message);
    this.name="DailyUsageCapError";
    this.code="DAILY_MB_CAP";
  }
}
export function isDailyUsageCapError(e){return e?.code==="DAILY_MB_CAP"||e?.name==="DailyUsageCapError";}

export async function getDailyUsage(category=SCAN_USAGE_CATEGORY){
  const day=nyDateKey();
  const row=(await db.query(
    "SELECT bytes_used,request_count FROM formula_usage_daily WHERE usage_date=$1 AND category=$2",
    [day,category]
  )).rows?.[0]||{};
  const bytes=Number(row.bytes_used)||0;
  const scanMode=category===SCAN_USAGE_CATEGORY;
  return {
    date:day,category,bytes,
    mb:Number((bytes/1024/1024).toFixed(2)),
    requests:Number(row.request_count)||0,
    limitBytes:scanMode?DAILY_SCAN_LIMIT_BYTES:null,
    limitMb:scanMode?DAILY_SCAN_LIMIT_MB:null,
    remainingBytes:scanMode?Math.max(0,DAILY_SCAN_LIMIT_BYTES-bytes):null,
    remainingMb:scanMode?Number((Math.max(0,DAILY_SCAN_LIMIT_BYTES-bytes)/1024/1024).toFixed(2)):null,
    percent:scanMode?Number(Math.min(100,(bytes/DAILY_SCAN_LIMIT_BYTES)*100).toFixed(1)):null,
    capReached:scanMode?bytes>=DAILY_SCAN_LIMIT_BYTES:false
  };
}

export async function assertCanFetch(contentLength=null,category=SCAN_USAGE_CATEGORY){
  const u=await getDailyUsage(category);
  if(category!==SCAN_USAGE_CATEGORY)return u;
  if(u.bytes>=DAILY_SCAN_LIMIT_BYTES)throw new DailyUsageCapError();
  const announced=Number(contentLength);
  if(Number.isFinite(announced)&&announced>0&&u.bytes+announced>DAILY_SCAN_LIMIT_BYTES)throw new DailyUsageCapError("Next response would exceed the 300 MB daily historical learning cap.");
  if((!Number.isFinite(announced)||announced<=0)&&u.remainingBytes<=UNKNOWN_RESPONSE_RESERVE_BYTES)throw new DailyUsageCapError("Daily historical learning traffic is within the 5 MB safety reserve.");
  return u;
}

async function increment(day,category,b){
  const row=(await db.query(
    `INSERT INTO formula_usage_daily(usage_date,category,bytes_used,request_count,updated_at)
     VALUES($1,$2,$3,1,NOW())
     ON CONFLICT(usage_date,category)
     DO UPDATE SET bytes_used=formula_usage_daily.bytes_used+EXCLUDED.bytes_used,
                   request_count=formula_usage_daily.request_count+1,
                   updated_at=NOW()
     RETURNING bytes_used,request_count`,
    [day,category,b]
  )).rows?.[0]||{};
  return Number(row.bytes_used)||0;
}

export async function addDailyUsage(bytes,category=SCAN_USAGE_CATEGORY,opts={}){
  const day=nyDateKey(),b=Math.max(0,Math.floor(Number(bytes)||0));
  const used=await increment(day,category,b);
  if(opts.includeTotal&&category!==TOTAL_USAGE_CATEGORY)await increment(day,TOTAL_USAGE_CATEGORY,b);
  if(category===SCAN_USAGE_CATEGORY&&opts.includeTotal!==false)await increment(day,TOTAL_USAGE_CATEGORY,b);
  if(category===SCAN_USAGE_CATEGORY&&opts.throwOnCap!==false&&used>=DAILY_SCAN_LIMIT_BYTES)throw new DailyUsageCapError();
  return used;
}