import {adminLogin,getAccessStatus,updateSharedAccess,changeAdminPassword} from "lib/auth.js";
import {getFormulaDWeights,saveFormulaDWeights,resetFormulaDWeights} from "lib/formula-d-config.js";
import {getFormulaABCWeights,saveFormulaCWeights,resetFormulaCWeights} from "lib/formula-abc-config.js";
export const access="public";
export const methods=["POST"];
export default async function(req,res){
  const b=req.body||{};
  const ok=await adminLogin(b.adminUsername,b.adminPassword);
  if(!ok)return res.status(401).json({error:"管理员账号或密码不正确"});
  try{
    if(b.action==="status")return res.json({ok:true,status:await getAccessStatus()});
    if(b.action==="update"){
      const status=await updateSharedAccess({
        sharedUsername:b.sharedUsername,
        newPassword:b.newPassword,
        maxSessions:b.maxSessions,
        clearSessions:!!b.clearSessions
      });
      return res.json({ok:true,status});
    }
    if(b.action==="change_admin_password"){
      await changeAdminPassword(b.newAdminPassword);
      return res.json({ok:true});
    }
    if(b.action==="formula_d_weights_get"){
      return res.json({ok:true,weights:await getFormulaDWeights()});
    }
    if(b.action==="formula_d_weights_update"){
      return res.json({ok:true,weights:await saveFormulaDWeights(b.weights||{})});
    }
    if(b.action==="formula_d_weights_reset"){
      return res.json({ok:true,weights:await resetFormulaDWeights()});
    }
    if(b.action==="formula_abc_weights_get"){
      return res.json({ok:true,weights:await getFormulaABCWeights()});
    }
    if(b.action==="formula_c_weights_update"){
      return res.json({ok:true,weights:await saveFormulaCWeights(b.weights||{})});
    }
    if(b.action==="formula_c_weights_reset"){
      return res.json({ok:true,weights:await resetFormulaCWeights()});
    }
    return res.status(400).json({error:"Unknown action"});
  }catch(e){
    return res.status(400).json({error:String(e?.message||e)});
  }
}