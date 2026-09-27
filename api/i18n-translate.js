import { ai } from "hatchable";
import { requireAuth } from "lib/auth.js";

export const access="public";
export const methods=["POST"];

function clean(s){return String(s??"").replace(/\s+/g," ").trim();}
function cleanJson(s){return String(s||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();}

export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  try{
    const target=req.body?.target==="zh"?"zh":"en";
    const raw=Array.isArray(req.body?.texts)?req.body.texts:[];
    const texts=raw.map(clean).filter(Boolean).slice(0,40);
    if(!texts.length)return res.json({translations:[]});
    if(texts.join("").length>7000)return res.status(413).json({error:"Translation batch too large."});

    const prompt=[
      "Translate UI text for a professional football analytics web app.",
      target==="en"?"Target language: English. Remove all Chinese from normal UI prose.":"Target language: Simplified Chinese. Translate normal English UI prose into natural Simplified Chinese.",
      "Preserve exactly: team/player proper names when uncertain; xG, SS, AS, GTI, W/D/L, ET, UCL, UEL, UECL, Formula A, Formula B, Formula C, Formula D; numbers, scores, percentages, arrows, emoji and ---.",
      "Do not change football intent labels when they are standalone canonical values: Must Win, Want Win, Hope Win, Don't Lose, Equalize, Win Big, Give Up.",
      "Keep each output concise and suitable for UI.",
      "Return STRICT JSON only: {\"translations\":[\"...\"]}.",
      "The translations array MUST have exactly the same number of items and same order as the input.",
      "Input:",
      JSON.stringify(texts)
    ].join("\n");

    const r=await ai.fetch({
      provider:"openai",
      path:"/v1/chat/completions",
      body:{
        model:"gpt-4o-mini",
        temperature:0,
        max_tokens:1800,
        messages:[{role:"user",content:prompt}]
      },
      purpose:"formula-ui-i18n-fallback",
      timeoutMs:30000
    });
    if(!r.ok){
      let detail="";try{detail=await r.text()}catch(e){}
      return res.status(r.status===412?412:502).json({error:"Automatic translation unavailable.",detail});
    }
    const out=await r.json();
    const txt=out?.choices?.[0]?.message?.content||"";
    let parsed=null;
    try{parsed=JSON.parse(cleanJson(txt));}catch(e){
      const m=String(txt).match(/\{[\s\S]*\}/);if(m)try{parsed=JSON.parse(m[0])}catch(_){}
    }
    const tr=Array.isArray(parsed?.translations)?parsed.translations.map(x=>String(x??"")):[];
    if(tr.length!==texts.length)return res.status(502).json({error:"Translation response length mismatch."});
    return res.json({translations:tr});
  }catch(e){
    console.error("i18n-translate",String(e?.stack||e));
    return res.status(500).json({error:"Automatic translation failed."});
  }
}