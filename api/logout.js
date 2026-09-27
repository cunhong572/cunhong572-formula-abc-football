import {logoutToken,readBearer} from "lib/auth.js";
export const access="public";
export const methods=["POST"];
export default async function(req,res){
  await logoutToken(readBearer(req));
  res.json({ok:true});
}