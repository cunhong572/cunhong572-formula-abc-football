import {requireAuth} from "lib/auth.js";
export const access="public";
export const methods=["GET","POST"];
export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  res.json({ok:true,user:{username:user.username,role:user.role}});
}