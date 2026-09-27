import { db } from 'hatchable';

function hex(bytes){return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("")}
async function sha256(s){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(s)));
  return hex(d);
}
function safeEq(a,b){
  a=String(a||"");b=String(b||"");
  if(a.length!==b.length)return false;
  let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);
  return x===0;
}
function readBearer(req){
  const h=req?.headers||{};
  const auth=(typeof h.get==="function"?h.get("authorization"):h.authorization)||"";
  return String(auth).replace(/^Bearer\s+/i,"").trim();
}
async function configRow(){
  const r=await db.query("SELECT * FROM site_access_config WHERE singleton_key = $1 LIMIT 1",["main"]);
  return r.rows?.[0]||null;
}
async function purgeExpired(){
  await db.query("DELETE FROM site_access_tokens WHERE expires_at <= now()");
}
export async function sharedLogin(username,password){
  const cfg=await configRow(); if(!cfg)return {error:"Access configuration missing."};
  if(String(username||"").trim()!==String(cfg.shared_username))return {error:"账号或密码不正确"};
  const p=await sha256(password||"");
  if(!safeEq(p,cfg.shared_password_hash))return {error:"账号或密码不正确"};
  await purgeExpired();
  const count=await db.query("SELECT count(*)::int AS n FROM site_access_tokens WHERE password_version = $1 AND expires_at > now()",[cfg.password_version]);
  const active=Number(count.rows?.[0]?.n||0);
  if(active>=Number(cfg.max_sessions||2))return {error:"已达到同时登录设备上限，请先在其他设备退出，或让管理员清除登录设备。",code:"device_limit"};
  const token=crypto.randomUUID()+crypto.randomUUID().replaceAll("-","");
  const tokenHash=await sha256(token);
  await db.query(
    "INSERT INTO site_access_tokens (token_hash,password_version,expires_at) VALUES ($1,$2,'infinity'::timestamp)",
    [tokenHash,cfg.password_version]
  );
  return {token,username:cfg.shared_username,maxSessions:Number(cfg.max_sessions||2)};
}
export async function verifyToken(token){
  if(!token)return null;
  const tokenHash=await sha256(token);
  const r=await db.query(
    "SELECT t.id,t.password_version,t.expires_at,c.shared_username,c.password_version AS current_version FROM site_access_tokens t CROSS JOIN site_access_config c WHERE c.singleton_key=$1 AND t.token_hash=$2 AND t.expires_at>now() LIMIT 1",
    ["main",tokenHash]
  );
  const row=r.rows?.[0]; if(!row)return null;
  if(Number(row.password_version)!==Number(row.current_version))return null;
  await db.query("UPDATE site_access_tokens SET last_seen_at=now() WHERE id=$1",[row.id]);
  return {username:row.shared_username,role:"viewer",sessionId:row.id};
}
export async function logoutToken(token){
  if(!token)return;
  const tokenHash=await sha256(token);
  await db.query("DELETE FROM site_access_tokens WHERE token_hash=$1",[tokenHash]);
}
export async function requireAuth(req,res){
  const user=await verifyToken(readBearer(req));
  if(!user){res.status(401).json({error:"Login required."});return null;}
  return user;
}
export async function adminLogin(username,password){
  const cfg=await configRow(); if(!cfg)return false;
  if(String(username||"").trim()!==String(cfg.admin_username))return false;
  const p=await sha256(password||"");
  return safeEq(p,cfg.admin_password_hash);
}
export async function getAccessStatus(){
  const cfg=await configRow(); await purgeExpired();
  const r=await db.query("SELECT count(*)::int AS n FROM site_access_tokens WHERE password_version=$1 AND expires_at>now()",[cfg.password_version]);
  return {sharedUsername:cfg.shared_username,maxSessions:Number(cfg.max_sessions),activeSessions:Number(r.rows?.[0]?.n||0),passwordVersion:Number(cfg.password_version)};
}
export async function updateSharedAccess({sharedUsername,newPassword,maxSessions,clearSessions}){
  const cfg=await configRow();
  const name=String(sharedUsername||cfg.shared_username).trim();
  const max=Math.max(1,Math.min(20,Number(maxSessions||cfg.max_sessions)));
  let version=Number(cfg.password_version);
  let hash=cfg.shared_password_hash;
  if(newPassword){
    if(String(newPassword).length<10)throw new Error("新密码至少需要10位");
    hash=await sha256(newPassword); version+=1; clearSessions=true;
  }
  await db.query(
    "UPDATE site_access_config SET shared_username=$1,shared_password_hash=$2,password_version=$3,max_sessions=$4,updated_at=now() WHERE singleton_key=$5",
    [name,hash,version,max,"main"]
  );
  if(clearSessions)await db.query("DELETE FROM site_access_tokens");
  return getAccessStatus();
}
export async function changeAdminPassword(newPassword){
  if(String(newPassword||"").length<12)throw new Error("管理员密码至少需要12位");
  const hash=await sha256(newPassword);
  await db.query("UPDATE site_access_config SET admin_password_hash=$1,updated_at=now() WHERE singleton_key=$2",[hash,"main"]);
}
export { readBearer };