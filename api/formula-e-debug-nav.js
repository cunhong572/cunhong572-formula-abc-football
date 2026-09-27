import { withWorkerLease } from "lib/formula-d-worker/lease.js";
import { browser } from "hatchable";

const SOURCE="https://www.3573217.com/";
function creds(){
  const username=String(process.env.FORMULA_E_ODDS_USERNAME||"").trim();
  const password=String(process.env.FORMULA_E_ODDS_PASSWORD||"");
  if(!username||!password)throw new Error("CLOUD_CREDENTIALS_MISSING");
  return {username,password};
}
async function login(page,username,password){
  await page.goto(SOURCE,{waitUntil:"domcontentloaded"});
  if(await page.$("#UserName")){
    await page.type("#UserName",username,{delay:20});
    await page.type("#Password",password,{delay:20});
    try{await Promise.all([page.waitForNavigation({timeout:15000,waitUntil:"domcontentloaded"}),page.click("#sub")]);}catch(_){try{await page.click("#sub");}catch(__){}}
  }
  await new Promise(r=>setTimeout(r,1500));
}
export const access="scheduler";
export const methods=["POST"];
export default async function(req,res){
  const {username,password}=creds();
  const result=await withWorkerLease({reason:"debug-nav",resume:false},async checkpoint=>browser.session(async page=>{
    await checkpoint();
    await page.setViewport({width:1440,height:1100});
    await login(page,username,password);
    const before=await page.evaluate(()=>{
      const docs=[];const visit=win=>{let doc;try{doc=win.document;}catch(_){return;}if(!doc||docs.some(x=>x.doc===doc))return;docs.push({doc,href:String(win.location.href||"")});for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}};visit(window);
      const entries=[];
      for(const x of docs){
        for(const el of [...x.doc.querySelectorAll("a,button,li,span,td")]){
          const txt=String(el.innerText||el.textContent||"").replace(/\s+/g," ").trim();
          if(!/favorite/i.test(txt))continue;
          entries.push({text:txt.slice(0,80),href:String(el.href||el.getAttribute?.("href")||""),onclick:String(el.getAttribute?.("onclick")||""),frame:x.href});
        }
      }
      return {frames:docs.map(x=>x.href),entries};
    });
    await checkpoint();
    const clicked=await page.evaluate(()=>{
      const docs=[];const visit=win=>{let doc;try{doc=win.document;}catch(_){return;}if(!doc||docs.includes(doc))return;docs.push(doc);for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}};visit(window);
      for(const doc of docs){for(const el of [...doc.querySelectorAll("a,button,li,span,td")]){const t=String(el.innerText||el.textContent||"").replace(/\s+/g," ").trim().toLowerCase();if(t==="my favorites"||t==="my favourites"){try{el.click();return t;}catch(_){}}}}return "";
    });
    await new Promise(r=>setTimeout(r,1800));
    await checkpoint();
    const after=await page.evaluate(()=>{
      const out=[];const visit=win=>{let doc;try{doc=win.document;}catch(_){return;}const href=String(win.location.href||"");const body=String(doc.body?.innerText||"").replace(/\s+/g," ").slice(0,500);out.push({href,body});for(const f of [...doc.querySelectorAll("iframe,frame")]){try{if(f.contentWindow)visit(f.contentWindow);}catch(_){}}};visit(window);return out;
    });
    return {before,clicked,after};
  }));
  return res.json(result);
}