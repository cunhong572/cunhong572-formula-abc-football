import {sharedLogin} from "lib/auth.js";
export const access="public";
export const methods=["POST"];
export default async function(req,res){
  const body=req.body||{};
  const out=await sharedLogin(body.username,body.password);
  if(!out?.token)return res.status(out?.code==="device_limit"?429:401).json(out||{error:"登录失败"});
  res.json({ok:true,token:out.token,user:{username:out.username,role:"viewer"},maxSessions:out.maxSessions,persistent:true,expiresHours:null});
}